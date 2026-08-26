/**
 * Server lobby facade — Feature 010 (T-007)
 *
 * Implements the `LobbyService` contract
 * (`src/contracts/lobby-api.ts`) on top of the T-005 identity
 * registry and feature 006's real matchmaker: identity setup
 * (claim/restore/rename), subscription with revisioned snapshot
 * delivery, the privacy-safe public projection, create/join/spectate/
 * leave orchestration, and recoverable error mapping.
 *
 * DELEGATION BOUNDARY (lobby-api.md; task T-007): settings validation,
 * capacity limits, auto-start, and cleanup are feature-006 behavior —
 * this facade calls `matchmaker.createMatch` / `joinMatch` /
 * `leaveMatch` / `listPublicMatches` and never re-implements them.
 * The facade owns exactly three things the matchmaker does not:
 * connection→identity binding, handle uniqueness (via the registry),
 * and the public projection ledger.
 *
 * Projection ledger: feature 006's `listPublicMatches` projects only
 * `'filling'` public matches, while FR-007 requires the lobby to also
 * show `'in_progress'` matches (Spectate). The facade therefore keeps
 * a small in-memory ledger of every match IT issued (public matches
 * enter the world only through this facade) seeded from the submitted
 * settings, refreshed for waiting rows from the delegated listing, and
 * flipped to `'in_progress'` by fill detection: matchmaking auto-starts
 * deterministically when the last seat is taken (FR-011), so a seat
 * assignment at index `capacity - 1` IS a started match. Rows die on
 * the terminal bridge event or when an action proves them dead.
 *
 * Lifecycle events: if the injected matchmaker exposes
 * `registerLifecycleListener` (the same structural seam
 * `matchmaker.ts` uses for servers exposing `bindMatchmaker`), the
 * facade registers handlers that keep identity state aligned with the
 * reconnect grace window (`onSeatDisconnected` / `onSeatReconnected`
 * / `onSeatExpired`) and drop finished matches from the projection
 * (`onMatchTerminal`, FR-014: no history). Revision publication for
 * create/fill/start/collect transitions arriving from OTHER paths is
 * T-008's publication module; this facade broadcasts after its own
 * mutations.
 *
 * ERROR-MAPPING TABLE (recoverable failures are values, FR-018;
 * mirrors upstream's "surfaced to clients as 'internal_error'"
 * convention for unmappable codes):
 *
 *   Condition                                   | LobbyErrorCode
 *   --------------------------------------------+---------------------
 *   Action before `establishIdentity`           | `identity_invalid`
 *   Create/join without an accepted handle      | `identity_invalid`
 *   Identity already seated/spectating          | `identity_in_match`
 *   Handle fails FR-004 validation              | `handle_invalid`
 *   Normalized handle owned by another identity | `handle_taken`
 *   Match id unknown to the ledger (or proven
 *   dead by an upstream `match_not_found`)      | `match_not_found`
 *   Joining a non-waiting tracked match         | `match_not_joinable`
 *   Spectating a non-in-progress tracked match  | `match_not_joinable`
 *   Upstream `match_full`                       | `match_full`
 *   Upstream `seat_taken` (final-seat race)     | `match_full`
 *   Upstream `session_invalid`/`session_expired`| `identity_expired`
 *   Upstream `match_not_found`                  | `match_not_found`
 *   Upstream `match_not_joinable`               | `match_not_joinable`
 *   Any other upstream code (`invalid_request`,
 *   `rate_limited`, rematch family, …)          | `internal_error`
 *   (message preserved verbatim; `detail` gains
 *   `upstreamCode` so nothing is lost)
 *
 * The closed ten-code union has no settings/capacity code, so
 * US3 AC-4's field-specific feedback for rejected create settings
 * rides on the v1.3 `detail` record (clients render from code PLUS
 * detail); `internal_error` + preserved message + `upstreamCode`
 * detail is the lossless fallback for those client-bug shapes.
 *
 * Throwing policy (same split as the registry and matchmaker):
 * expected failures return `Result` err values; only invariant
 * breaches throw — calling any method after `close()`.
 *
 * Concurrency model (plan.md §2): every method runs synchronously
 * through its critical section on the Node event loop and rechecks
 * current state immediately before assignment; no locks, no timers.
 *
 * Privacy envelope (NFR-003, FR-024): nothing projected through
 * `IdentityState`, `PublicLobbyEntry`, or `LobbySnapshot` contains the
 * opaque guest id, session tokens, seats, or participant names — the
 * compile-time witnesses in `tests/lobby-conformance.test.ts` pin the
 * shapes and this module never widens them.
 *
 * Pure apart from injected dependencies: clock and randomness arrive
 * via `deps.now` / the registry's `randomId` (constitution Principle II).
 */

import type { ConnectionId, Logger, MatchId, MatchmakerBridge, SessionToken } from '@europa/networking';
import type { MatchmakerError, MatchSettings, SeatAssignment } from '../../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import type { Matchmaker } from '../../contracts/matchmaking-api';
import type { LobbyService, MatchJoinTarget, Result, SpectatorTarget } from '../contracts/lobby-api';
import type {
    GuestIdentityClaim,
    GuestPlayerId,
    IdentityState,
    LobbyError,
    LobbyEvent,
    LobbyRevision,
    LobbySnapshot,
    LobbyStatus,
    PublicLobbyEntry,
} from '../contracts/lobby-types';
import { makeLobbyError } from './handleValidation';
import type { IdentityRegistry } from './identityRegistry';
import { createIdentityRegistry } from './identityRegistry';

// ----------------------------------------------------------------------------
// Tunables & local defaults
// ----------------------------------------------------------------------------

/** Local no-op logger — networking's `NULL_LOGGER` is a runtime value. */
const NULL_LOGGER: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

// ----------------------------------------------------------------------------
// Internal record shapes
// ----------------------------------------------------------------------------

/**
 * One identity's single active-match association (data-model §2
 * `currentMatchId`; US4 AC-4 second-seat prevention). Spectators get a
 * presence too — spectating counts as match presence per the contract —
 * with a `null` seat assignment because spectators hold no seat/token.
 */
interface MatchPresence {
    /** The match this identity is committed to. */
    readonly matchId: MatchId;
    /** How the identity is attached (seat holder vs read-only viewer). */
    readonly role: 'player' | 'spectator';
    /**
     * Server-issued credentials for players (needed to delegate a later
     * `leaveMatch`); always `null` for spectators.
     */
    readonly seatAssignment: SeatAssignment | null;
}

/**
 * Facade-side projection ledger row for one issued match. Feature-006
 * records stay authoritative for lifecycle/cleanup; this row holds ONLY
 * what the public projection needs and the delegated listing cannot
 * fully express (`status`, `tickIntervalMs`).
 */
interface TrackedMatch {
    /** Total seats (from the submitted, matchmaker-validated settings). */
    capacity: 2 | 3 | 4;
    /** Square board dimension (refreshed from the delegated listing). */
    boardSize: number;
    /** Tick interval in ms (submitted value or the shipped default). */
    tickIntervalMs: number;
    /** Occupied seats, refreshed from the listing plus local deltas. */
    seatsFilled: number;
    /** `'waiting'` until fill detection flips it to `'in_progress'`. */
    status: LobbyStatus;
}

/** Internal guard outcome: a resolved value or a recoverable error. */
type Guard<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LobbyError };

// ----------------------------------------------------------------------------
// Dependencies & factory
// ----------------------------------------------------------------------------

/**
 * Injectable dependencies for {@linkcode createLobbyService}. Only the
 * matchmaker is required; everything else defaults so production callers
 * pass a single object while tests inject deterministic fakes.
 */
export interface LobbyServiceDeps {
    /**
     * The feature-006 matchmaker this facade delegates to (settings
     * validation, capacity, auto-start, cleanup). Required.
     */
    readonly matchmaker: Matchmaker;
    /**
     * The guest-identity registry (T-005). Defaults to a fresh
     * `createIdentityRegistry()` sharing this facade's `now` / `graceMs`.
     */
    readonly registry?: IdentityRegistry;
    /** Injected wall-clock provider in epoch ms (default `Date.now`). */
    readonly now?: () => number;
    /** Reconnect grace window passed to the default registry (ms). */
    readonly graceMs?: number;
    /**
     * Outbound event sink — the transport seam (T-010 wires the real
     * WebSocket dispatcher). Called synchronously for every lobby event
     * this facade pushes (snapshot broadcasts, identity updates). A sink
     * that throws is logged and skipped: a faulty transport must never
     * corrupt lobby state or starve other subscribers' delivery.
     */
    readonly deliver?: (connectionId: ConnectionId, event: LobbyEvent) => void;
    /** Logger; default is a local no-op. */
    readonly logger?: Logger;
}

/**
 * Build the server lobby facade (one instance per process; plan.md §1).
 * State is process memory only (FR-015): connection bindings,
 * subscriptions, active-match associations, the projection ledger, and
 * the registry all die with {@linkcode LobbyService.close}.
 *
 * @param deps - Required matchmaker; optional registry/clock/sink/logger
 *   overrides (see {@linkcode LobbyServiceDeps}).
 * @returns The frozen-shape `LobbyService` ready for transport wiring.
 */
export function createLobbyService(deps: LobbyServiceDeps): LobbyService {
    const { matchmaker } = deps;
    const now = deps.now ?? Date.now;
    const logger = deps.logger ?? NULL_LOGGER;
    const deliver = deps.deliver ?? null;
    const registry =
        deps.registry ??
        createIdentityRegistry({ now, ...(deps.graceMs === undefined ? {} : { graceMs: deps.graceMs }) });

    /** Connection → established guest identity (lobby presence). */
    const connections = new Map<ConnectionId, GuestPlayerId>();
    /** Connections receiving pushed snapshot events. */
    const subscriptions = new Set<ConnectionId>();
    /** Guest identity → its single active-match association. */
    const presence = new Map<GuestPlayerId, MatchPresence>();
    /** Projection ledger of matches this facade issued, in creation order. */
    const ledger = new Map<MatchId, TrackedMatch>();

    /**
     * Current list revision. Starts at 1 (lobby-types.md: "Starts at 1")
     * and is incremented by every entry-changing mutation before the
     * resulting snapshots are delivered.
     */
    let revisionCounter = 1;

    let closed = false;

    // -- Invariant guards -------------------------------------------------------

    /** Invariant guard: the facade is unusable after `close()`. */
    function assertOpen(): void {
        if (closed) {
            throw new Error('lobbyService: instance is closed');
        }
    }

    // -- Small helpers ----------------------------------------------------------

    /**
     * Deliver one event through the sink, isolating sink faults: a
     * throwing transport is logged and skipped so broadcast loops cannot
     * be corrupted mid-flight by one bad receiver.
     */
    function deliverEvent(connectionId: ConnectionId, event: LobbyEvent): void {
        if (deliver === null) {
            return;
        }
        try {
            deliver(connectionId, event);
        } catch (error) {
            logger.warn('lobbyService: event sink threw; delivery skipped', { error: String(error) });
        }
    }

    /**
     * Bind a connection to an identity, enforcing data-model §2's "at
     * most one lobby connection" per identity: any OTHER connection
     * currently bound to the same guest is evicted (mapping + subscription),
     * so a restored session supersedes its stale predecessor.
     */
    function bindConnection(connectionId: ConnectionId, guestId: GuestPlayerId): void {
        for (const [boundId, boundGuest] of connections) {
            if (boundGuest === guestId && boundId !== connectionId) {
                connections.delete(boundId);
                subscriptions.delete(boundId);
            }
        }
        connections.set(connectionId, guestId);
    }

    /** Resolve the connection's established identity, if any. */
    function guestOf(connectionId: ConnectionId): GuestPlayerId | undefined {
        return connections.get(connectionId);
    }

    /** Recoverable guard: the connection must have established an identity. */
    function guardGuest(connectionId: ConnectionId): Guard<GuestPlayerId> {
        const guestId = connections.get(connectionId);
        if (guestId === undefined) {
            return {
                ok: false,
                error: makeLobbyError(
                    'identity_invalid',
                    'No guest identity is established on this connection yet. Reload the lobby to connect.',
                ),
            };
        }
        return { ok: true, value: guestId };
    }

    /**
     * Recoverable guard: create/join need an ACCEPTED handle (US1 AC-5:
     * matches identify players by handle; FR-019 propagates it). An
     * established-but-unnamed identity must finish identity setup first.
     */
    function guardNamed(guestId: GuestPlayerId): Guard<string> {
        const handle = registry.projectIdentity(guestId)?.handle ?? null;
        if (handle === null) {
            return {
                ok: false,
                error: makeLobbyError('identity_invalid', 'Choose a handle before creating or joining a match.'),
            };
        }
        return { ok: true, value: handle };
    }

    /** Recoverable guard: the identity must not already hold match presence. */
    function guardFree(guestId: GuestPlayerId): Guard<null> {
        if (presence.has(guestId)) {
            return {
                ok: false,
                error: makeLobbyError(
                    'identity_in_match',
                    'You are already committed to a match. Leave it before starting another.',
                ),
            };
        }
        return { ok: true, value: null };
    }

    // -- Projection -------------------------------------------------------------

    /** Freeze one ledger row into its safe public shape (six fields, no more). */
    function projectRow(matchId: MatchId, tracked: TrackedMatch): PublicLobbyEntry {
        return Object.freeze({
            matchId,
            seatsFilled: tracked.seatsFilled,
            capacity: tracked.capacity,
            status: tracked.status,
            boardSize: tracked.boardSize,
            tickIntervalMs: tracked.tickIntervalMs,
        });
    }

    /** All entries in stable creation order (constitution Principle II). */
    function publicEntries(): PublicLobbyEntry[] {
        const entries: PublicLobbyEntry[] = [];
        for (const [matchId, tracked] of ledger) {
            entries.push(projectRow(matchId, tracked));
        }
        return entries;
    }

    /**
     * Build the complete snapshot for one receiving identity. Entries are
     * shared knowledge; `activeMatchId` is personal (US4 AC-4), so
     * broadcasts build one snapshot per subscriber.
     */
    function snapshotFor(guestId: GuestPlayerId | undefined): LobbySnapshot {
        return Object.freeze({
            revision: revisionCounter as LobbyRevision,
            entries: publicEntries(),
            activeMatchId: guestId === undefined ? null : (presence.get(guestId)?.matchId ?? null),
        });
    }

    /** Push a personalized snapshot event to every subscribed connection. */
    function broadcastSnapshots(): void {
        if (deliver === null || subscriptions.size === 0) {
            return;
        }
        for (const connectionId of subscriptions) {
            const guestId = connections.get(connectionId);
            if (guestId !== undefined) {
                deliverEvent(connectionId, { kind: 'snapshot', snapshot: snapshotFor(guestId) });
            }
        }
    }

    /**
     * Refresh waiting ledger rows from the delegated feature-006 listing
     * (authoritative `seatsFilled` / clamped `boardSize`). In-progress
     * rows are never listed upstream (feature 006 lists filling matches
     * only), so they are left untouched. A waiting row that vanished is
     * deliberately KEPT until an action proves it dead: an absent listing
     * cannot distinguish auto-start (keep — spectatable) from collection
     * (dead), and FR-013's staleness bound is enforced lazily when the
     * next join against the dead row returns `match_not_found` (US4 AC-3).
     */
    function reconcileFromMatchmaker(): void {
        const listed = matchmaker.listPublicMatches();
        if (!listed.ok) {
            // A failed delegated read leaves last-known values in place;
            // the next mutation retries. Never fabricate entries from here.
            logger.warn('lobbyService: delegated lobby listing failed; keeping last-known projection', {
                code: listed.error.code,
            });
            return;
        }
        for (const entry of listed.matches) {
            const tracked = ledger.get(entry.matchId);
            if (tracked !== undefined) {
                tracked.seatsFilled = entry.seatsFilled;
                tracked.boardSize = entry.boardSize;
                tracked.status = 'waiting';
                if (entry.playerCount === 2 || entry.playerCount === 3 || entry.playerCount === 4) {
                    tracked.capacity = entry.playerCount;
                }
            }
        }
    }

    /**
     * Seed a ledger row from the settings the facade is about to submit.
     * Values reflect the matchmaker's resolution rules (missing fields
     * fall back to `DEFAULT_MATCH_SETTINGS`); `boardSize` may still be
     * unclamped until the first delegated-listing refresh replaces it
     * with the authoritative clamped value.
     */
    function seedTracked(settings: Partial<MatchSettings> | undefined): TrackedMatch {
        return {
            capacity: settings?.playerCount ?? DEFAULT_MATCH_SETTINGS.playerCount,
            boardSize: settings?.boardSize ?? DEFAULT_MATCH_SETTINGS.boardSize,
            tickIntervalMs: settings?.tickIntervalMs ?? DEFAULT_MATCH_SETTINGS.tickIntervalMs,
            seatsFilled: 1,
            status: 'waiting',
        };
    }

    // -- Error mapping ----------------------------------------------------------

    /**
     * Translate a feature-006 failure into the lobby error union (table
     * in the module header). Direct semantic matches keep the upstream
     * message and detail verbatim; codes with no faithful lobby meaning
     * collapse to `internal_error` with the original message preserved
     * and `detail.upstreamCode` recording the truth.
     */
    function mapUpstreamError(error: MatchmakerError): LobbyError {
        switch (error.code) {
            case 'match_not_found':
                return makeLobbyError('match_not_found', error.message, error.detail);
            case 'match_full':
                return makeLobbyError('match_full', error.message, error.detail);
            case 'match_not_joinable':
                return makeLobbyError('match_not_joinable', error.message, error.detail);
            case 'seat_taken':
                // Final-seat race lost (US4 AC-3): from the lobby's point of
                // view the match simply filled first.
                return makeLobbyError(
                    'match_full',
                    'The final open seat was just claimed. Try another match.',
                    error.detail,
                );
            case 'session_invalid':
            case 'session_expired':
                return makeLobbyError('identity_expired', error.message, error.detail);
            default:
                return makeLobbyError('internal_error', error.message, { ...error.detail, upstreamCode: error.code });
        }
    }

    // -- Lifecycle bridge (identity grace + terminal drops) ----------------------

    /**
     * Drop every identity's association with a match (terminal/expiry
     * fan-out) and return how many were cleared.
     */
    function clearPresenceForMatch(matchId: MatchId): number {
        let cleared = 0;
        for (const [guestId, attached] of presence) {
            if (attached.matchId === matchId) {
                presence.delete(guestId);
                cleared += 1;
            }
        }
        return cleared;
    }

    /**
     * Handlers the facade contributes to the matchmaking lifecycle seam.
     * Registered below when the injected matchmaker supports listener
     * registration; the host can also compose this object into networking's
     * `ServerDeps.matchmaker` chain manually (T-008's publication module
     * layers alongside these — multiple listeners are supported).
     */
    const bridgeHandlers: MatchmakerBridge = {
        /**
         * No lobby state change on a seat claim: the facade recorded the
         * association itself at create/join time, and out-of-band claims
         * (private links) involve no lobby-projected state.
         */
        onSeatClaimed: () => {},
        /**
         * A match-bound connection dropped: start the identity's reconnect
         * grace window (handle stays reserved, spec Clarifications v1.0).
         * Registry release happens later — either the claimant restores
         * via `establishIdentity`, or the registry's lazy expiry sweep
         * frees the identity and handle.
         */
        onSeatDisconnected: (event) => {
            const guestId = guestOf(event.connectionId);
            if (guestId !== undefined) {
                registry.disconnect(guestId);
            }
        },
        /**
         * The same claimant reclaimed its seat within grace: reactivate the
         * identity immediately so the registry's expiry sweep cannot free a
         * live player's handle mid-match.
         */
        onSeatReconnected: (event) => {
            const guestId = guestOf(event.connectionId);
            if (guestId !== undefined) {
                registry.restoreIdentity({ guestPlayerId: guestId });
            }
        },
        /**
         * Networking's reconnect grace lapsed: the seat is forfeited
         * upstream. Clear the identity's match presence and forget the
         * dead connection (its subscription included). The IDENTITY itself
         * stays under the REGISTRY's own grace window — releasing it here
         * would free the handle on a different clock than the registry's.
         */
        onSeatExpired: (event) => {
            for (const [connectionId, guestId] of connections) {
                const attached = presence.get(guestId);
                if (
                    attached !== undefined &&
                    attached.matchId === event.matchId &&
                    attached.seatAssignment?.sessionToken === (event.sessionToken as SessionToken)
                ) {
                    presence.delete(guestId);
                    connections.delete(connectionId);
                    subscriptions.delete(connectionId);
                }
            }
        },
        /**
         * The engine reported a terminal result: finished matches are never
         * displayed (FR-014 no history) and every participant's association
         * ends so they can browse/create again. Entry removal bumps the
         * revision and refreshes subscribers.
         */
        onMatchTerminal: (event) => {
            const tracked = ledger.get(event.matchId);
            clearPresenceForMatch(event.matchId);
            if (tracked !== undefined) {
                ledger.delete(event.matchId);
                revisionCounter += 1;
                broadcastSnapshots();
            }
        },
    };

    /**
     * Servers/matchmakers that optionally accept direct lifecycle-listener
     * registration (structural intersection — same pattern as
     * `matchmaker.ts`'s `BindableServer`; no cast beyond the narrowing
     * intersection, and the check keeps non-binding implementations safe).
     */
    interface LifecycleBindable {
        registerLifecycleListener?(listener: MatchmakerBridge): void;
    }
    const bindable = matchmaker as Matchmaker & LifecycleBindable;
    if (typeof bindable.registerLifecycleListener === 'function') {
        bindable.registerLifecycleListener(bridgeHandlers);
    }

    // -- Public surface -----------------------------------------------------------

    const service: LobbyService = {
        establishIdentity(claim: GuestIdentityClaim | undefined, connectionId: ConnectionId): IdentityState {
            assertOpen();
            const { identity } = registry.restoreIdentity(claim);
            bindConnection(connectionId, identity.id);
            const projected = registry.projectIdentity(identity.id);
            const state: IdentityState = projected ?? Object.freeze({ handle: null, hasIdentity: true });
            deliverEvent(connectionId, { kind: 'identity', identity: state });
            return state;
        },

        setHandle(connectionId: ConnectionId, handle: string): Result<IdentityState, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            const reserved = registry.setHandle(guest.value, handle);
            if (!reserved.ok) {
                return reserved;
            }
            const projected = registry.projectIdentity(guest.value);
            if (projected === undefined) {
                // Unreachable: the id was resolved through the registry one
                // statement ago; crash loudly rather than invent state.
                return {
                    ok: false,
                    error: makeLobbyError('internal_error', 'Identity vanished during handle reservation.'),
                };
            }
            deliverEvent(connectionId, { kind: 'identity', identity: projected });
            return { ok: true, data: projected };
        },

        subscribe(connectionId: ConnectionId): Result<LobbySnapshot, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            subscriptions.add(connectionId);
            reconcileFromMatchmaker();
            return { ok: true, data: snapshotFor(guest.value) };
        },

        create(connectionId: ConnectionId, settings?: Partial<MatchSettings>): Result<MatchJoinTarget, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            const named = guardNamed(guest.value);
            if (!named.ok) {
                return named;
            }
            const free = guardFree(guest.value);
            if (!free.ok) {
                return free;
            }
            const result = matchmaker.createMatch({
                visibility: 'public',
                displayName: named.value,
                ...(settings === undefined ? {} : { settings }),
            });
            if (!result.ok) {
                return { ok: false, error: mapUpstreamError(result.error) };
            }
            const target: MatchJoinTarget = Object.freeze({
                matchId: result.data.matchId,
                seatAssignment: result.data.seatAssignment,
            });
            ledger.set(result.data.matchId, seedTracked(settings));
            reconcileFromMatchmaker();
            presence.set(guest.value, {
                matchId: result.data.matchId,
                role: 'player',
                seatAssignment: result.data.seatAssignment,
            });
            revisionCounter += 1;
            broadcastSnapshots();
            return { ok: true, data: target };
        },

        join(connectionId: ConnectionId, matchId: MatchId): Result<MatchJoinTarget, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            const named = guardNamed(guest.value);
            if (!named.ok) {
                return named;
            }
            const free = guardFree(guest.value);
            if (!free.ok) {
                return free;
            }
            const tracked = ledger.get(matchId);
            if (tracked === undefined) {
                // Public matches exist only through this facade, so a ledger
                // miss is authoritative: the match was never issued here or
                // already died. No delegation needed (and none attempted).
                return {
                    ok: false,
                    error: makeLobbyError('match_not_found', 'That match is no longer available.'),
                };
            }
            if (tracked.status !== 'waiting') {
                return {
                    ok: false,
                    error: makeLobbyError('match_not_joinable', 'That match is already in progress. Spectate instead.'),
                };
            }
            const result = matchmaker.joinMatch({ matchId, displayName: named.value });
            if (!result.ok) {
                if (result.error.code === 'match_not_found') {
                    // Proven-dead stale row (collected upstream between
                    // listing and action): drop it so the next revision
                    // stops offering Join (US4 AC-3 / FR-013).
                    ledger.delete(matchId);
                    revisionCounter += 1;
                    broadcastSnapshots();
                }
                return { ok: false, error: mapUpstreamError(result.error) };
            }
            // Reconcile BEFORE applying the local delta so the delegated
            // listing's authoritative occupancy lands first and the delta
            // (this seat) can only raise it.
            reconcileFromMatchmaker();
            const seat = result.data.seatAssignment;
            tracked.seatsFilled = Math.max(tracked.seatsFilled, seat.seatIndex + 1);
            if (tracked.seatsFilled >= tracked.capacity) {
                // Deterministic feature-006 auto-start (FR-011): taking the
                // last seat starts the match inside the delegated call.
                tracked.status = 'in_progress';
            }
            presence.set(guest.value, { matchId: result.data.matchId, role: 'player', seatAssignment: seat });
            revisionCounter += 1;
            broadcastSnapshots();
            return { ok: true, data: Object.freeze({ matchId: result.data.matchId, seatAssignment: seat }) };
        },

        spectate(connectionId: ConnectionId, matchId: MatchId): Result<SpectatorTarget, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            const free = guardFree(guest.value);
            if (!free.ok) {
                return free;
            }
            const tracked = ledger.get(matchId);
            if (tracked === undefined) {
                return {
                    ok: false,
                    error: makeLobbyError('match_not_found', 'That match is no longer available.'),
                };
            }
            if (tracked.status !== 'in_progress') {
                return {
                    ok: false,
                    error: makeLobbyError(
                        'match_not_joinable',
                        'That match is still filling. Join instead of spectating.',
                    ),
                };
            }
            presence.set(guest.value, { matchId, role: 'spectator', seatAssignment: null });
            // No revision bump: entries are unchanged and other subscribers'
            // snapshots are unaffected; the actor's own association is
            // conveyed by the returned target and every later snapshot.
            return { ok: true, data: Object.freeze({ matchId }) };
        },

        leave(connectionId: ConnectionId): Result<void, LobbyError> {
            assertOpen();
            const guest = guardGuest(connectionId);
            if (!guest.ok) {
                return guest;
            }
            const attached = presence.get(guest.value);
            if (attached === undefined) {
                // Already lobby-bound: returning to the lobby you are in is
                // trivially successful (idempotent return-to-lobby).
                return { ok: true };
            }
            if (attached.role === 'player' && attached.seatAssignment !== null) {
                const result = matchmaker.leaveMatch({
                    matchId: attached.matchId,
                    sessionToken: attached.seatAssignment.sessionToken,
                });
                // Local presence dies regardless of the upstream answer: the
                // facade must not pin an association the matchmaker may have
                // already released (e.g., inline filling-phase releases).
                presence.delete(guest.value);
                if (!result.ok) {
                    return { ok: false, error: mapUpstreamError(result.error) };
                }
                reconcileFromMatchmaker();
                revisionCounter += 1;
                broadcastSnapshots();
                return { ok: true };
            }
            // Spectator detach: no seat exists upstream (the read-only view
            // detaches at the transport layer); presence-only cleanup here.
            presence.delete(guest.value);
            return { ok: true };
        },

        close(): Promise<void> {
            if (closed) {
                return Promise.resolve();
            }
            closed = true;
            connections.clear();
            subscriptions.clear();
            presence.clear();
            ledger.clear();
            registry.close();
            return matchmaker.close();
        },
    };

    return service;
}
