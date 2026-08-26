/**
 * Matchmaker lifecycle → lobby publication bridge — Feature 010 (T-008)
 *
 * The publication half of the lobby facade (plan.md §2): translates
 * matchmaker lifecycle transitions into `LobbyEvent` publications and
 * refreshed `LobbySnapshot`s with a strictly monotonic `LobbyRevision`
 * (spec FR-013). One instance per process, owned by the facade
 * (T-007) and wired to the two EXISTING feature-006/004 event seams —
 * this module consumes them; it never modifies the producers:
 *
 *   1. **Status bus** (`createStatusBus()` from `matchLifecycle.ts`) —
 *      the matchmaker emits a `MatchStatusChangedEvent` on every
 *      lifecycle transition. Subscribing {@linkcode LobbyPublication.onStatusChanged}
 *      covers three of the seven triggers:
 *        - **create**  (`null → 'filling'`)
 *        - **start**   (`'filling' → 'running'`)
 *        - **collect** (`* → 'collected'`, incl. `'finished'` teardown
 *          via the rematch/results-TTL/empty-match sweeps)
 *      plus the `running → finished` transition that strips finished
 *      matches from the projection (FR-014: no history).
 *   2. **Networking's bridge dispatch** (`MatchmakerBridge` from
 *      `@europa/networking`) — the host composes ONE bridge object in
 *      `ServerDeps.matchmaker` that fans every seat/connection event
 *      out to BOTH the matchmaker's handlers and
 *      {@linkcode LobbyPublication.bridge}. That covers the other
 *      triggers: **fill** (`onSeatClaimed`), **disconnect**
 *      (`onSeatDisconnected`), **reconnect** (`onSeatReconnected`),
 *      **expiry** (`onSeatExpired`), and terminal results
 *      (`onMatchTerminal`). Composition order is irrelevant: every
 *      handler funnels into one recompute-and-diff pass, so an event
 *      whose state change was already published by a prior event is a
 *      no-op (exactly-once revision bumps).
 *
 * Revision discipline (FR-013): there is exactly ONE revision counter
 * in the process — here. It starts pre-publication at 0; the first
 * visible change publishes revision 1; every subsequent publication
 * increments by exactly 1. A publication happens if and only if the
 * recomputed public projection differs from the last published one,
 * so subscribers never receive no-op snapshots and revisions are
 * monotonic across arbitrarily interleaved lifecycles.
 *
 * No-staleness guarantee ("no stale/finished lobby entries", FR-013/
 * FR-014): entries are never cached per match — every refresh REBUILDS
 * the whole list fresh from the authoritative records reachable through
 * {@linkcode LobbyPublicationDeps.getMatch} (typically the matchmaker
 * store). A started match flips `'waiting' → 'in_progress'`; a
 * finished or collected match drops out on the very next event; a
 * record that vanished from the store cannot linger in a snapshot.
 *
 * Projection filter (FR-006/FR-007 + v1.0 clarification): PUBLIC
 * matches only; `'filling'` projects as `'waiting'` (Join),
 * `'running'` as `'in_progress'` (Spectate); `'finished'`/
 * `'collected'` project as nothing. Private matches are never
 * projected even though the underlying matchmaker supports them.
 *
 * Privacy envelope (NFR-003, FR-024): entries carry discovery data
 * only — match id, occupancy/capacity, settings summary numbers,
 * lifecycle status. Handles, display names, session tokens, seat
 * credentials, and the opaque `GuestPlayerId` are structurally
 * unreachable from this module's output (the entry literal names six
 * fields, none of them private).
 *
 * Disconnect/reconnect semantics: a disconnected seat does NOT change
 * the projection — the match keeps its status (and its Spectate row)
 * while the reconnect grace window runs; expiry matters only through
 * the policy outcome the matchmaker applies (forfeit/collection),
 * which arrives as ordinary status events. Raw disconnect/reconnect/
 * expiry events therefore usually publish nothing — handled, observed,
 * and provably non-duplicating.
 *
 * Determinism (constitution Principle II): no clock reads, no
 * randomness, no timers. Entry order is stable insertion (= creation)
 * order; everything time-shaped arrives inside caller-supplied events
 * and is ignored here because projections carry no timestamps.
 *
 * @internal Exported for testability and facade composition; not part
 * of the package barrel until T-007 wires the facade surface.
 */

import type { MatchId, MatchmakerBridge } from '@europa/networking';

import type { LobbyEvent, LobbyRevision, LobbySnapshot, PublicLobbyEntry } from '../contracts/lobby-types';
import type { MatchStatusChangedEvent } from '../eventBus';
import type { MatchRecord } from './matchRecord';

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

/**
 * Injectable dependencies. The publication owns NO authoritative
 * state — it re-reads the truth through {@linkcode getMatch} on every
 * refresh, so the matchmaker store remains the single source of truth
 * (constitution Principle V).
 */
export interface LobbyPublicationDeps {
    /**
     * Resolve the current authoritative record for one match id.
     * Typically `(matchId) => store.getMatch(matchId)`. Returning
     * `undefined` (unknown/vanished match) makes the match unprojectable.
     */
    readonly getMatch: (matchId: MatchId) => MatchRecord | undefined;
}

/** One subscriber of published lobby events (a connection sink). */
export type LobbyPublicationSink = (event: LobbyEvent) => void;

/** Per-subscription options. */
export interface LobbySubscriptionOptions {
    /**
     * Resolve the subscribing identity's active match id at PUBLISH
     * time (spec US4 AC-4: each viewer's snapshot carries their own
     * active-match pointer). Called once per published snapshot; the
     * shared revision and entries stay single-sourced. Omit for sinks
     * that are always lobby-bound (`activeMatchId: null`).
     */
    readonly activeMatchId?: () => MatchId | null;
}

/**
 * Frozen facade-facing handle returned by {@linkcode createLobbyPublication}.
 *
 * Wiring recipe (production, no producer edits required):
 *
 * ```ts
 * const store = /* …matchmaker's store… *​/;
 * const publication = createLobbyPublication({ getMatch: (id) => store.getMatch(id) });
 * // Status seam — the matchmaker's own bus:
 * statusBus.subscribe(publication.onStatusChanged);
 * // Bridge seam — compose at ServerDeps.matchmaker:
 * serverDeps.matchmaker = {
 *     onSeatClaimed: (e) => { matchmakerBridge.onSeatClaimed?.(e); publication.bridge.onSeatClaimed?.(e); },
 *     // …same fan-out for the remaining four handlers…
 * };
 * ```
 */
export interface LobbyPublication {
    /**
     * `MatchmakerBridge`-compatible handlers for the composite fan-out
     * described in the module doc. Covers the fill/disconnect/
     * reconnect/expiry/terminal triggers; every handler recomputes the
     * projection for the affected match and publishes only on change.
     */
    readonly bridge: MatchmakerBridge;

    /**
     * Listener for the matchmaker's `StatusEventBus` (subscribe it via
     * `statusBus.subscribe(publication.onStatusChanged)`). Covers the
     * create/start/finish/collect triggers.
     */
    readonly onStatusChanged: (event: MatchStatusChangedEvent) => void;

    /**
     * Current revision without publishing. `0` before the first
     * visible change; otherwise the revision of the last published
     * snapshot. Diagnostics only — build client payloads via
     * {@linkcode snapshotFor}.
     */
    readonly currentRevision: () => LobbyRevision;

    /**
     * Pull-based current snapshot (the subscribe-time baseline the
     * facade sends before the first push). Does NOT bump the revision.
     *
     * @param activeMatchId - The requesting identity's active match,
     *   or `null`/omitted when lobby-bound.
     */
    readonly snapshotFor: (activeMatchId?: MatchId | null) => LobbySnapshot;

    /**
     * Subscribe a sink to future publications. Each visible change
     * delivers one frozen `snapshot` `LobbyEvent` to every active
     * sink, in subscription order. Sinks run inline on the caller's
     * stack with NO error isolation — mirroring the house event-bus
     * convention (`createStatusBus`): a throwing sink is a programming
     * error, not a recoverable failure.
     *
     * @param sink - Receiver of published events.
     * @param options - Optional per-sink behavior (see
     *   {@linkcode LobbySubscriptionOptions}).
     * @returns Idempotent unsubscribe function.
     * @throws When the instance is closed (loud invariant failure,
     *   mirroring `createMatchmaker`).
     */
    readonly subscribe: (sink: LobbyPublicationSink, options?: LobbySubscriptionOptions) => () => void;

    /**
     * Tear down: detach every sink, drop the projection, ignore all
     * further events. Shutdown is not a lobby mutation, so nothing is
     * published and the revision counter is NOT reset (monotonic for
     * the instance's lifetime). Idempotent; `subscribe` throws after
     * close while stray lifecycle events during teardown are absorbed
     * quietly — a passive observer must never corrupt the primary
     * lifecycle sweep that outlives it.
     */
    readonly close: () => void;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Create a lobby publication bridge over the given authoritative
 * lookup. See the module doc for the trigger map, revision discipline,
 * and wiring recipe.
 *
 * @param deps - The authoritative match lookup (typically bound to the
 *   matchmaker store).
 * @returns A frozen {@linkcode LobbyPublication}.
 */
export function createLobbyPublication(deps: LobbyPublicationDeps): LobbyPublication {
    /** Loud-failure flag; see {@linkcode LobbyPublication.close}. */
    let closed = false;

    /**
     * THE revision counter (FR-013). Pre-publication 0; first visible
     * change publishes 1; every publication adds exactly 1. Branded at
     * the two assignment sites — nowhere else may touch it.
     */
    let revision = 0 as LobbyRevision;

    /**
     * Currently projected match ids in stable insertion (= creation)
     * order (constitution Principle II: stable server order). Pruned
     * by the rebuild pass whenever a match stops projecting.
     */
    const projectedIds: MatchId[] = [];

    /** Entries of the last published snapshot (frozen). */
    let publishedEntries: readonly PublicLobbyEntry[] = Object.freeze([]);

    /** Active sinks in subscription order, with normalized options. */
    const sinks = new Map<LobbyPublicationSink, LobbySubscriptionOptions>();

    /**
     * Project one authoritative record into its safe public entry, or
     * `null` when the match must not appear: private visibility, a
     * terminal status, or an unknown record. The literal below is the
     * privacy envelope — exactly the six contract fields, nothing else
     * (NFR-003/FR-024).
     */
    function projectEntry(record: MatchRecord): PublicLobbyEntry | null {
        if (record.visibility !== 'public') {
            return null;
        }
        if (record.status !== 'filling' && record.status !== 'running') {
            return null;
        }
        return Object.freeze({
            matchId: record.matchId,
            seatsFilled: record.seats.size,
            capacity: record.settings.playerCount,
            status: record.status === 'filling' ? 'waiting' : 'in_progress',
            boardSize: record.settings.boardSize,
            tickIntervalMs: record.settings.tickIntervalMs,
        });
    }

    /**
     * Field-wise comparison of two projections. Structural equality —
     * fresh object identity must not defeat the no-op detection.
     */
    function entriesEqual(a: readonly PublicLobbyEntry[], b: readonly PublicLobbyEntry[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        for (let index = 0; index < a.length; index++) {
            const x = a[index];
            const y = b[index];
            if (
                x === undefined ||
                y === undefined ||
                x.matchId !== y.matchId ||
                x.seatsFilled !== y.seatsFilled ||
                x.capacity !== y.capacity ||
                x.status !== y.status ||
                x.boardSize !== y.boardSize ||
                x.tickIntervalMs !== y.tickIntervalMs
            ) {
                return false;
            }
        }
        return true;
    }

    /**
     * Build a complete snapshot at the CURRENT revision (no bump).
     * Shared by the pull baseline and every pushed event; only the
     * per-sink `activeMatchId` varies.
     */
    function snapshotFor(activeMatchId?: MatchId | null): LobbySnapshot {
        return Object.freeze({
            revision,
            entries: publishedEntries,
            activeMatchId: activeMatchId ?? null,
        });
    }

    /** Deliver one frozen snapshot event to every active sink, in order. */
    function publish(): void {
        for (const [sink, options] of sinks) {
            const event: LobbyEvent = Object.freeze({
                kind: 'snapshot',
                snapshot: snapshotFor(options.activeMatchId === undefined ? null : options.activeMatchId()),
            });
            sink(event);
        }
    }

    /**
     * The single mutation path: rebuild the projection fresh from the
     * authoritative records, prune ids that stopped projecting, and —
     * only when the rebuilt list differs from the last published one —
     * bump the revision and publish. Every trigger funnel ends here,
     * which is what makes bumps exactly-once and composition-order
     * independent.
     */
    function rebuildAndPublish(): void {
        const nextEntries: PublicLobbyEntry[] = [];
        for (const id of [...projectedIds]) {
            const record = deps.getMatch(id);
            const entry = record === undefined ? null : projectEntry(record);
            if (entry === null) {
                // Defensive prune: a projected match lost its record or
                // became terminal/private between events. Cannot linger.
                const index = projectedIds.indexOf(id);
                if (index >= 0) {
                    projectedIds.splice(index, 1);
                }
                continue;
            }
            nextEntries.push(entry);
        }

        if (entriesEqual(nextEntries, publishedEntries)) {
            return;
        }
        publishedEntries = Object.freeze(nextEntries);
        revision = (revision + 1) as LobbyRevision;
        publish();
    }

    /**
     * Observe one lifecycle event for `matchId`: register interest when
     * the match currently projects, then run the shared rebuild. Safe
     * for unknown ids (no crash, no change, no bump).
     */
    function refresh(matchId: MatchId): void {
        if (closed) {
            return;
        }
        const record = deps.getMatch(matchId);
        if (record !== undefined && projectEntry(record) !== null && !projectedIds.includes(matchId)) {
            projectedIds.push(matchId);
        }
        rebuildAndPublish();
    }

    // -- Trigger funnels -------------------------------------------------------

    /**
     * Status-bus listener: create (`null → filling`), start
     * (`filling → running`), finish (`running → finished`), collect
     * (`* → collected`). The from/to metadata needs no branching here —
     * every transition resolves to "recompute this match" — but the
     * mapping is pinned one-to-one by the suite.
     */
    const onStatusChanged = (event: MatchStatusChangedEvent): void => {
        refresh(event.matchId);
    };

    /**
     * Bridge handlers for networking's dispatch (or any test double
     * mirroring it, e.g. `FakeMatchmakerBridge.fireOn*`). Uniform
     * recompute-and-diff: fill updates occupancy, disconnect/reconnect
     * normally change nothing (grace keeps the row), expiry matters
     * only through the policy outcome arriving as status events, and a
     * terminal report lands after the finished transition has already
     * stripped the row (no-op).
     */
    const bridge: MatchmakerBridge = {
        onSeatClaimed: (event) => {
            refresh(event.matchId);
        },
        onSeatDisconnected: (event) => {
            refresh(event.matchId);
        },
        onSeatReconnected: (event) => {
            refresh(event.matchId);
        },
        onSeatExpired: (event) => {
            refresh(event.matchId);
        },
        onMatchTerminal: (event) => {
            refresh(event.matchId);
        },
    };

    // -- Facade surface ----------------------------------------------------------

    function subscribe(sink: LobbyPublicationSink, options?: LobbySubscriptionOptions): () => void {
        if (closed) {
            throw new Error('lobbyPublication: instance is closed');
        }
        sinks.set(sink, options ?? {});
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            sinks.delete(sink);
        };
    }

    function close(): void {
        if (closed) {
            return;
        }
        closed = true;
        sinks.clear();
        projectedIds.length = 0;
        publishedEntries = Object.freeze([]);
    }

    return Object.freeze({
        bridge,
        onStatusChanged,
        currentRevision: () => revision,
        snapshotFor,
        subscribe,
        close,
    });
}
