/**
 * Tick Broadcast — Feature 004 US1 (T028)
 *
 * Pure functions producing and delivering the per-tick fog-filtered
 * broadcast (FR-005) with server-side skip-send deltas (FR-006):
 *
 *   - `buildTickBroadcast` — computes each live connection's view via
 *     the injected fog factory and marks entries `'skip'` when the
 *     view is structurally identical to what that connection already
 *     received (plan.md "Key design decisions" §"Delta encoding").
 *     Returns a per-tick view cache so the resync path can reuse
 *     computed views instead of recomputing them (FR-018, FR-019).
 *
 *   - `sendTickBroadcast` — puts non-skip entries on the wire as
 *     `tick` envelopes and refreshes the channel's last-sent cache.
 *
 * **View identity note**: a `PlayerView` embeds `tick`, which advances
 * by definition every tick. Structural equality therefore compares the
 * view CONTENT (`player`, `visibleCells`, `events`, `config`) — the
 * wire payload's authoritative tick stamp is `payload.tick` (the channel
 * counter), not the embedded field.
 *
 * **FR-020 (zero allocation)**: `viewsEqual` performs field-by-field
 * comparison with short-circuit on the first difference, allocating
 * no intermediate strings or arrays.
 *
 * SC-004 (zero fog violations): this module never inspects or alters
 * `view.visibleCells`; it trusts fog's output verbatim.
 */

import type { Connection } from './connection';
import { NETWORK_API_VERSION } from './constants';
import type { FogFactory } from './contracts/network-api';
import type {
    CellView,
    ConnectionId,
    Direction,
    NetworkPayload,
    PlayerId,
    PlayerView,
    ProtocolEnvelope,
    TickBroadcastPayload,
} from './contracts/network-types';
import type { MatchChannel } from './match-channel';
import { SPECTATOR_VIEW_PLAYER_ID } from './spectator';

// ----------------------------------------------------------------------------
// viewsEqual (FR-020: zero-allocation structural comparison)
// ----------------------------------------------------------------------------

/**
 * Set-aware structural equality for `ReadonlySet<Direction>`. Compares
 * by size first (O(1) rejection), then by membership. The `pipes`
 * field on `CellView` is a `ReadonlySet<Direction>` — `JSON.stringify`
 * would flatten Sets to `{}`, so this function provides the correct
 * Set-aware comparison that `stableStringify` previously achieved via
 * the `Set → sorted-array` transform.
 *
 * @param a First set.
 * @param b Second set.
 * @returns `true` when both sets contain the same members.
 */
function setsEqual(a: ReadonlySet<Direction>, b: ReadonlySet<Direction>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }
    return true;
}

/**
 * Field-by-field equality for `CellView`. Compares `coord`, `cell`
 * (x, y, elevation, terrain), `troopCount`, `troopOwner`, `pipes`
 * (Set-aware), `reservesPercent`, and `cityOwner` — short-circuiting
 * on the first difference.
 *
 * @param a First cell view.
 * @param b Second cell view.
 * @returns `true` when all fields are structurally equal.
 */
function cellViewsEqual(a: CellView, b: CellView): boolean {
    return (
        a.coord.x === b.coord.x &&
        a.coord.y === b.coord.y &&
        a.cell.x === b.cell.x &&
        a.cell.y === b.cell.y &&
        a.cell.elevation === b.cell.elevation &&
        a.cell.terrain === b.cell.terrain &&
        a.troopCount === b.troopCount &&
        a.troopOwner === b.troopOwner &&
        setsEqual(a.pipes, b.pipes) &&
        a.reservesPercent === b.reservesPercent &&
        a.cityOwner === b.cityOwner
    );
}

/**
 * Element-wise equality for two readonly string arrays (here: the
 * match's ordered canonical `playerIds`). Length first, then
 * short-circuiting comparison. Zero allocation.
 *
 * @param a First array.
 * @param b Second array.
 * @returns `true` when both arrays carry the same values in the same order.
 */
function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Structural equality check for `PlayerView` (FR-020: zero allocation).
 *
 * Compares `player`, `config` (including the ordered `playerIds` list),
 * `events` (length of each array), and `visibleCells` (length + per-cell
 * field-by-field equality with Set-aware pipe comparison). Short-circuits
 * on the first difference. Omits the embedded `tick` field — the wire
 * payload's tick stamp is `payload.tick` (the channel counter), not the
 * view's own tick.
 *
 * @param a First player view.
 * @param b Second player view.
 * @returns `true` when all comparable fields are structurally equal.
 */
export function viewsEqual(a: PlayerView, b: PlayerView): boolean {
    if (a.player !== b.player) return false;

    // Config comparison: numbers/strings plus the ordered `playerIds`
    // identity list (the engine derives player count from its length).
    // Defensive: some test stubs may omit `config`; treat both-missing
    // as equal and one-missing as unequal (matches the fingerprint
    // behavior where both produced identical JSON for the same shape).
    const ac = a.config;
    const bc = b.config;
    if (ac && bc) {
        if (
            ac.boardSize !== bc.boardSize ||
            ac.tickIntervalMs !== bc.tickIntervalMs ||
            ac.seed !== bc.seed ||
            ac.visibilityRadius !== bc.visibilityRadius ||
            !stringArraysEqual(ac.playerIds, bc.playerIds)
        ) {
            return false;
        }
    } else if (ac !== bc) {
        return false;
    }

    // Events comparison: compare array lengths (empty vs non-empty)
    // and element counts per category. Defensive against missing events
    // (same rationale as config above).
    const ae = a.events;
    const be = b.events;
    if (ae && be) {
        if (
            ae.combat.length !== be.combat.length ||
            ae.captures.length !== be.captures.length ||
            ae.eliminations.length !== be.eliminations.length ||
            ae.appliedOrders.length !== be.appliedOrders.length ||
            ae.errors.length !== be.errors.length
        ) {
            return false;
        }
    } else if (ae !== be) {
        return false;
    }

    // VisibleCells: length + per-cell field-by-field equality.
    const acells = a.visibleCells;
    const bcells = b.visibleCells;
    if (acells.length !== bcells.length) return false;
    for (let i = 0; i < acells.length; i++) {
        if (!cellViewsEqual(acells[i] as CellView, bcells[i] as CellView)) {
            return false;
        }
    }

    return true;
}

// ----------------------------------------------------------------------------
// Per-tick view cache (FR-018: avoid redundant fog computation)
// ----------------------------------------------------------------------------

/**
 * Per-tick view cache returned by {@link buildTickBroadcast}. Keys are
 * the canonical `PlayerId` string for seated players, `'spectator'` for
 * spectators. The cache is valid only for the tick during which it was
 * built — callers MUST NOT retain it across tick boundaries.
 *
 * Consumers:
 *   - `sendTickBroadcast` (for skip-send delta detection)
 *   - The resync path in `server.ts` (FR-019: reuse cached view
 *     instead of recomputing for reconnecting clients)
 */
export interface BroadcastViewCache {
    [key: string]: PlayerView;
}

// ----------------------------------------------------------------------------
// buildTickBroadcast
// ----------------------------------------------------------------------------

/** Dependencies for {@link buildTickBroadcast}. */
export interface BroadcastDeps {
    /** Fog factory (real `@europa/fog` in production; stub in tests). */
    readonly fog: FogFactory;
}

/** Return type for {@link buildTickBroadcast}. */
export interface BroadcastResult {
    /** Per-connection tick payload map (non-skip entries + `'skip'`). */
    readonly broadcast: Map<ConnectionId, TickBroadcastPayload | 'skip'>;
    /** Per-tick view cache keyed by player id or `'spectator'`. */
    readonly viewCache: BroadcastViewCache;
}

/**
 * Compute the per-connection tick payload map. Every live connection
 * (seated players, then spectators — see `MatchChannel.connections`)
 * gets its fog-computed view, or `'skip'` when structurally identical
 * to the last sent one (FR-006 delta encoding via `viewsEqual`).
 *
 * Also builds a per-tick view cache (FR-018) so the resync path
 * (FR-019) can reuse computed views for reconnecting clients instead
 * of recomputing them via the fog factory.
 *
 * @param channel The match channel (post-advance world + tick counter).
 * @param deps    Injected fog factory.
 * @param _nowMs  Reserved for future heartbeat stamping (keeps the
 *                pure signature symmetric with `sendTickBroadcast`).
 * @returns The broadcast map and per-tick view cache.
 */
export function buildTickBroadcast(channel: MatchChannel, deps: BroadcastDeps, _nowMs?: number): BroadcastResult {
    const world = channel.engineSession.world();
    const broadcast = new Map<ConnectionId, TickBroadcastPayload | 'skip'>();
    const viewCache: BroadcastViewCache = {};

    for (const connection of channel.connections()) {
        const spectator = connection.role === 'spectator';
        // Null seat ⇒ spectator: stamp the reserved spectator correlation
        // id so the view can never be misread as a real player's — same
        // target the join-time snapshot carries (`SPECTATOR_VIEW_PLAYER_ID`).
        // Fog's spectator branch ignores the target either way.
        const playerId: PlayerId = connection.playerId ?? SPECTATOR_VIEW_PLAYER_ID;
        const view = deps.fog.computePlayerView({ world, playerId, spectator });

        // Cache by player id or 'spectator' (FR-018/FR-019).
        const cacheKey = spectator ? 'spectator' : playerId;
        viewCache[cacheKey] = view;

        const previous = channel.lastSentView.get(connection.id);
        if (previous !== undefined && viewsEqual(previous, view)) {
            broadcast.set(connection.id, 'skip');
            continue;
        }
        broadcast.set(connection.id, { tick: channel.tickCounter, view });
    }

    return { broadcast, viewCache };
}

// ----------------------------------------------------------------------------
// sendTickBroadcast
// ----------------------------------------------------------------------------

/**
 * Deliver the built broadcast: one `tick` envelope per non-skip entry,
 * then refresh `lastSentView` for exactly those entries (skipped
 * connections keep their previous cache entry).
 *
 * @param channel     The match channel (cache owner).
 * @param connections The live connections considered by `build`.
 * @param broadcast   The map produced by {@link buildTickBroadcast}.
 * @param nowMs       Wall-clock ms stamped on each send.
 * @returns Number of envelopes actually sent (for stats).
 */
export function sendTickBroadcast(
    channel: MatchChannel,
    connections: Iterable<Connection>,
    broadcast: Map<ConnectionId, TickBroadcastPayload | 'skip'>,
    nowMs?: number,
): number {
    let sent = 0;
    for (const connection of connections) {
        const payload = broadcast.get(connection.id);
        if (payload === undefined || payload === 'skip') {
            continue;
        }
        const envelope: ProtocolEnvelope<NetworkPayload> = {
            type: 'tick',
            version: NETWORK_API_VERSION,
            seq: 0 as never,
            payload,
        };
        connection.send(envelope, nowMs);
        channel.lastSentView.set(connection.id, payload.view);
        sent += 1;
    }
    return sent;
}
