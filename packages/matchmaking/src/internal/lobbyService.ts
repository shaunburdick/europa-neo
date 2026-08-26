/**
 * Server lobby facade — Feature 010 (T-007; recomposed by remediation R-006)
 *
 * Implements the `LobbyService` contract
 * (`src/contracts/lobby-api.ts`) on top of the T-005 identity
 * registry and feature 006's real matchmaker: identity setup
 * (claim/restore/rename), subscription with revisioned snapshot
 * delivery, the privacy-safe public projection, create/join/spectate/
 * leave orchestration, recoverable error mapping, and the transport
 * teardown hook (`connectionClosed`).
 *
 * DELEGATION BOUNDARY (lobby-api.md; task T-007): settings validation,
 * capacity limits, auto-start, and cleanup are feature-006 behavior —
 * this facade calls `matchmaker.createMatch` / `joinMatch` /
 * `leaveMatch` / `listPublicMatches` and never re-implements them.
 * The facade owns exactly three things the matchmaker does not:
 * connection→identity binding, handle uniqueness (via the registry),
 * and the public projection ledger.
 *
 * SINGLE PROJECTION PATH (remediation R-006, resolving review F-3):
 * there is exactly ONE revision counter and ONE projection ledger in
 * this process, and both live here. Every trigger funnels into
 * {@linkcode recomputeAndPublish} — facade mutations (create / join /
 * leave / proven-dead drops), the matchmaking lifecycle bridge events
 * (registered via the structural listener seam when the matchmaker
 * supports it), and — when the R-005 composition seam exposes it — the
 * matchmaker's FR-012 status bus (`null → filling`, `filling →
 * running`, `running → finished`, `* → collected`). The pass rebuilds
 * the entry list from the ledger (after refreshing waiting rows from
 * the delegated listing) and publishes IF AND ONLY IF the rebuilt list
 * differs from the last published one, so:
 *
 *   - revisions are strictly monotonic and bump EXACTLY ONCE per
 *     visible change, no matter how many triggers report the same
 *     transition or in which order they arrive (the real matchmaker
 *     fires BOTH a status-bus event and a bridge event for a terminal;
 *     the second is a diff no-op);
 *   - subscribers never receive no-op snapshot storms;
 *   - ghost waiting rows die PROMPTLY: collection sweeps upstream emit
 *     `* → collected` status events, which drop the row (and every
 *     participant's association) without waiting for an action to
 *     prove the row dead — the delegated listing itself drives those
 *     sweeps lazily, so every recompute doubles as a reap pass.
 *
 * This module ABSORBED the T-008 `lobbyPublication` algorithm (its
 * diff-gated rebuild and exactly-once revision discipline); that
 * standalone module was removed in the same change set so exactly one
 * implementation of the discipline exists. Hosts wire the facade, not
 * a publication sidecar: `registerLifecycleListener` + `subscribeStatus`
 * feed this module directly (see `tests/unit/lobby.integration.test.ts`
 * for the proven recipe over the REAL matchmaker).
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
 * terminal/collect events (both seams), when an action proves them
 * dead, or on the next recompute after an upstream sweep collected
 * them.
 *
 * Connection teardown (`connectionClosed`, remediation R-006 resolving
 * review F-7 / security HIGH-2): the transport dispatcher MUST call it
 * when a socket closes. It unbinds the connection, drops its
 * subscription, starts the identity's reconnect grace window in the
 * registry (handle stays reserved; expiry frees it lazily), and —
 * because spectators hold no seat to reclaim — releases SPECTATOR
 * match presence immediately. PLAYER presence survives grace (FR-022:
 * the same identity may reclaim its seat); it dies later via the
 * expiry/terminal funnels. The hook is self-sufficient regardless of
 * ordering against the bridge's `onSeatDisconnected` (the registry's
 * disconnect restarts the anchor idempotently), tolerates unknown
 * connection ids, and is idempotent.
 *
 * Identity overwrite (review F-8): establishing identity B on a
 * connection already bound to A first releases A exactly as
 * {@linkcode LobbyConnectionTeardown.connectionClosed} would — A never
 * lingers active-and-squatting forever. Re-establishing A itself (the
 * refresh-with-claim flow) does NOT start a spurious grace window.
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
 * detail is the lossless fallback for those client-bug shapes. The
 * R-005 `{field, reason}` rejection detail flows through this mapping
 * verbatim inside `detail`.
 *
 * Rename propagation limit (R-006 item 4, documented honestly):
 * feature-006's `propagateHandleRename` sweep needs the matchmaker
 * STORE, which no exposed seam reaches (R-005 exposes only per-id
 * `getMatch`). Accepted renames therefore reach FUTURE matches through
 * delegation pass-through — create/join always submit the fresh
 * accepted handle (FR-019) — while in-flight session/seat display
 * snapshots keep the handle captured at join time until matchmaking
 * core grows a store-level rename seam. This facade deliberately does
 * NOT hack around the ownership boundary.
 *
 * Throwing policy (same split as the registry and matchmaker):
 * expected failures return `Result` err values; only invariant
 * breaches throw — calling any method after `close()`.
 *
 * Concurrency model (plan.md §2): every method runs synchronously
 * through its critical section on the Node event loop and rechecks
 * current state immediately before assignment; no locks, no timers.
 * The publish pass is reentrancy-safe by construction: a nested
 * trigger (e.g., the delegated listing driving an upstream GC sweep
 * whose status event re-enters this module) completes its own diff
 * pass first, and the outer pass then finds nothing changed to publish.
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

import type { ConnectionId, Logger, MatchId, MatchmakerBridge } from '@europa/networking';
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
import type { MatchStatusChangedEvent } from '../eventBus';
import type { MatchmakerCompositionSeam } from '../matchmaker';
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
 * fully express (`status`, `tickIntervalMs`). THE ledger of the single
 * projection path — see the module header.
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
// Teardown surface (feature 010 remediation R-006)
// ----------------------------------------------------------------------------

/**
 * Transport-facing connection teardown, returned alongside
 * {@linkcode LobbyService} by {@linkcode createLobbyService} (additive
 * to the mirrored contract — same evolution ruling as R-005's
 * `MatchmakerCompositionSeam`; the contract file gains the method when
 * feature 010's wire wave lands).
 *
 * The networking dispatcher MUST call {@linkcode connectionClosed} for
 * every socket close (Wave-3 dispatch invariant #1): without it a lost
 * connection would keep its identity active forever, squatting the
 * reserved handle (security HIGH-2).
 */
export interface LobbyConnectionTeardown {
    /**
     * Tear down everything this facade holds for one transport
     * connection: the connection→identity binding, the snapshot
     * subscription, and — via the registry — the identity's ACTIVE
     * status (the reconnect grace window starts; the handle stays
     * reserved until the same claimant returns or grace expires).
     * Spectator match presence is released IMMEDIATELY (no seat exists
     * to reclaim); player presence intentionally SURVIVES grace so a
     * valid reconnect credential restores the seated identity (FR-022),
     * dying later via the expiry/terminal funnels.
     *
     * Tolerant by design: an unknown (never-established) connection id
     * is a no-op, and a double call is idempotent — transports race
     * their own close paths. Expected-failure-free (returns `void`);
     * only the house invariant throws (calling after `close()`).
     *
     * @param connectionId - The transport connection that closed.
     */
    connectionClosed(connectionId: ConnectionId): void;
}

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
 * @returns The frozen-shape facade: the mirrored `LobbyService` plus
 *   the transport teardown hook ({@linkcode LobbyConnectionTeardown}).
 */
export function createLobbyService(deps: LobbyServiceDeps): LobbyService & LobbyConnectionTeardown {
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
    /** THE projection ledger of matches this facade issued, in creation order. */
    const ledger = new Map<MatchId, TrackedMatch>();

    /**
     * THE list revision (single projection path — module header). Starts
     * at 1 (lobby-types.md: "Starts at 1"); every PUBLISHED change adds
     * exactly 1. Diff-gated mutations never touch it directly — they
     * funnel through {@linkcode recomputeAndPublish}.
     */
    let revisionCounter = 1;

    /**
     * Entries of the last published snapshot (frozen). Both the pull
     * baseline and every pushed event read THIS list, so a missed
     * recompute could only ever show staled-by-one-step data — never a
     * revision/content mismatch.
     */
    let publishedEntries: readonly PublicLobbyEntry[] = Object.freeze([]);

    /** Unsubscribe for the status-bus seam, when the matchmaker exposes it. */
    let unsubscribeStatus: (() => void) | null = null;

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

    /**
     * Release EVERYTHING the facade holds for one connection (shared by
     * {@linkcode LobbyConnectionTeardown.connectionClosed} and the
     * re-establishment-overwrite path, review F-8): unbind, unsubscribe,
     * start the identity's registry grace window, and release spectator
     * presence immediately (players keep theirs through grace — see the
     * teardown interface docs). Idempotent; unknown ids are a no-op.
     */
    function releaseConnection(connectionId: ConnectionId): void {
        const guestId = connections.get(connectionId);
        connections.delete(connectionId);
        subscriptions.delete(connectionId);
        if (guestId === undefined) {
            return;
        }
        const attached = presence.get(guestId);
        if (attached !== undefined && attached.role === 'spectator') {
            // Spectators hold no seat: there is nothing to reconnect to,
            // so their match presence ends with the connection.
            presence.delete(guestId);
        }
        // Players AND lobby visitors: the identity drops to grace (handle
        // reserved until reclaim or lazy expiry). Safe to repeat — the
        // registry restarts the anchor (documented idempotent semantics).
        registry.disconnect(guestId);
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

    // -- Projection (THE single path — see module header) ------------------------

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
     * Field-wise comparison of two projections (absorbed from the T-008
     * publication module). Structural equality — fresh object identity
     * must not defeat the no-op detection.
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
     * Build the complete snapshot for one receiving identity from the
     * LAST PUBLISHED state. Entries are shared knowledge;
     * `activeMatchId` is personal (US4 AC-4), so broadcasts build one
     * snapshot per subscriber.
     */
    function snapshotFor(guestId: GuestPlayerId | undefined): LobbySnapshot {
        return Object.freeze({
            revision: revisionCounter as LobbyRevision,
            entries: publishedEntries,
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
     * deliberately KEPT here — an absent listing cannot distinguish
     * auto-start (keep — spectatable) from collection (dead); prompt
     * death comes from the EVENT funnels instead (status `* → collected`,
     * terminal reports, proven-dead actions), which is precisely what
     * makes ghost rows impossible on the composed stack. FR-013's
     * staleness bound stays enforced by those events plus the lazy
     * join-time proof (US4 AC-3).
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

    /**
     * THE mutation path of the single projection pipeline: refresh
     * waiting rows from the delegated listing, rebuild the entry list
     * from the ledger, and — only when the rebuilt list differs from the
     * last published one — bump THE revision counter and broadcast
     * personalized snapshots. Every trigger funnel ends here, which is
     * what makes bumps exactly-once, composition-order independent, and
     * duplicate-event proof (review F-3 / MEDIUM-4). Reentrancy-safe:
     * nested triggers complete their own pass first and the outer pass
     * then diffs clean (module header).
     */
    function recomputeAndPublish(): void {
        if (closed) {
            // Stray lifecycle events during teardown are absorbed quietly —
            // a passive observer must never corrupt the shutdown sweep.
            return;
        }
        reconcileFromMatchmaker();
        const nextEntries = publicEntries();
        if (entriesEqual(nextEntries, publishedEntries)) {
            return;
        }
        publishedEntries = Object.freeze(nextEntries);
        revisionCounter += 1;
        broadcastSnapshots();
    }

    // -- Error mapping ----------------------------------------------------------

    /**
     * Translate a feature-006 failure into the lobby error union (table
     * in the module header). Direct semantic matches keep the upstream
     * message and detail verbatim; codes with no faithful lobby meaning
     * collapse to `internal_error` with the original message preserved
     * and `detail.upstreamCode` recording the truth. The R-005 settings
     * rejection detail (`{field, reason}`) rides along verbatim.
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

    // -- Lifecycle funnels (identity grace + terminal/collect drops) --------------

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
     * Status-bus listener (subscribed below when the R-005 seam exists).
     * Terminal/collect transitions drop the row AND every participant's
     * association immediately — this is the prompt ghost-row reap
     * (review MEDIUM-5): upstream GC collections always emit these
     * events, so a dead match cannot linger as a Joinable row. Start/
     * create transitions merely funnel into the shared pass (the diff
     * gate makes a no-op free). Duplicate delivery across BOTH seams
     * (the real matchmaker emits `running → finished` on the bus AND
     * fans `onMatchTerminal` out to listeners) collapses to one bump.
     */
    const onStatusChanged = (event: MatchStatusChangedEvent): void => {
        if (closed) {
            return;
        }
        if (event.to === 'finished' || event.to === 'collected') {
            clearPresenceForMatch(event.matchId);
            ledger.delete(event.matchId);
        }
        recomputeAndPublish();
    };

    /**
     * Handlers the facade contributes to the matchmaking lifecycle seam.
     * Registered below when the injected matchmaker supports listener
     * registration; every handler funnels into the shared publish pass
     * (single projection path — module header).
     */
    const bridgeHandlers: MatchmakerBridge = {
        /**
         * Seat fills normally arrive through the facade's own `join`
         * (which recomputes); out-of-band claims on facade-issued public
         * matches do not exist in v1. Funnelled anyway as a uniform
         * safety net — the diff gate makes a redundant pass free.
         */
        onSeatClaimed: () => {
            if (closed) {
                return;
            }
            recomputeAndPublish();
        },
        /**
         * A match-bound connection dropped: start the identity's reconnect
         * grace window (handle stays reserved, spec Clarifications v1.0).
         * Registry release happens later — either the claimant restores
         * via `establishIdentity`, or the registry's lazy expiry sweep
         * frees the identity and handle. Projection unchanged (grace
         * keeps the row); funnelled for uniformity.
         */
        onSeatDisconnected: (event) => {
            if (closed) {
                return;
            }
            const guestId = guestOf(event.connectionId);
            if (guestId !== undefined) {
                registry.disconnect(guestId);
            }
            recomputeAndPublish();
        },
        /**
         * The same claimant reclaimed its seat within grace: reactivate the
         * identity immediately so the registry's expiry sweep cannot free a
         * live player's handle mid-match.
         */
        onSeatReconnected: (event) => {
            if (closed) {
                return;
            }
            const guestId = guestOf(event.connectionId);
            if (guestId !== undefined) {
                registry.restoreIdentity({ guestPlayerId: guestId });
            }
            recomputeAndPublish();
        },
        /**
         * Networking's reconnect grace lapsed: the seat is forfeited
         * upstream. Clear the identity's match presence and forget the
         * dead connection (its subscription included). The IDENTITY itself
         * stays under the REGISTRY's own grace window — releasing it here
         * would free the handle on a different clock than the registry's.
         */
        onSeatExpired: (event) => {
            if (closed) {
                return;
            }
            for (const [connectionId, guestId] of connections) {
                const attached = presence.get(guestId);
                if (
                    attached !== undefined &&
                    attached.matchId === event.matchId &&
                    attached.seatAssignment?.sessionToken === event.sessionToken
                ) {
                    presence.delete(guestId);
                    connections.delete(connectionId);
                    subscriptions.delete(connectionId);
                }
            }
            recomputeAndPublish();
        },
        /**
         * The engine reported a terminal result: finished matches are never
         * displayed (FR-014 no history) and every participant's association
         * ends so they can browse/create again. Row removal flows through
         * the diff gate, so a terminal for an already-dropped row (e.g.,
         * the status funnel got there first) bumps nothing.
         */
        onMatchTerminal: (event) => {
            if (closed) {
                return;
            }
            clearPresenceForMatch(event.matchId);
            ledger.delete(event.matchId);
            recomputeAndPublish();
        },
    };

    /**
     * Composition seams on the injected matchmaker, discovered
     * STRUCTURALLY (same pattern as R-005's `BindableServer`; the real
     * matchmaker carries all three, the test fakes carry only the
     * lifecycle listener — the optional checks keep both safe):
     *
     *   - `registerLifecycleListener` feeds bridge events into the
     *     funnels above;
     *   - `subscribeStatus` feeds FR-012 transitions (create/start/
     *     finish/collect) into {@linkcode onStatusChanged}, which is
     *     what reaps ghost rows promptly on the real stack.
     */
    const bindable = matchmaker as Matchmaker & Partial<MatchmakerCompositionSeam>;
    if (bindable.registerLifecycleListener !== undefined) {
        bindable.registerLifecycleListener(bridgeHandlers);
    }
    if (bindable.subscribeStatus !== undefined) {
        unsubscribeStatus = bindable.subscribeStatus(onStatusChanged);
    }

    // -- Public surface -----------------------------------------------------------

    const service: LobbyService & LobbyConnectionTeardown = {
        establishIdentity(claim: GuestIdentityClaim | undefined, connectionId: ConnectionId): IdentityState {
            assertOpen();
            const { identity } = registry.restoreIdentity(claim);
            // Re-establishment overwrite (review F-8): a connection bound to
            // a DIFFERENT guest releases that guest exactly as a transport
            // close would (grace + immediate spectator release) instead of
            // orphaning it active forever. Restoring the SAME identity is
            // the ordinary refresh flow and starts no spurious grace.
            const previous = connections.get(connectionId);
            if (previous !== undefined && previous !== identity.id) {
                releaseConnection(connectionId);
            }
            bindConnection(connectionId, identity.id);
            const projected = registry.projectIdentity(identity.id);
            const state: IdentityState = projected ?? Object.freeze({ handle: null, hasIdentity: true });
            deliverEvent(connectionId, { kind: 'identity', identity: state });
            return state;
        },

        /**
         * Reserve a handle (FR-004/FR-005). Rename propagation note (R-006
         * item 4): the accepted handle reaches FUTURE matches through the
         * create/join pass-through below; sweeping in-flight session/seat
         * display snapshots needs feature-006's store-level
         * `propagateHandleRename`, unreachable from this facade (no seam
         * exposes the store). Documented limitation — not hacked around.
         */
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
            // The shared pass (not a bare reconcile): if upstream drifted
            // since the last publish, subscribers learn NOW at a bumped
            // revision instead of receiving a mis-versioned baseline.
            recomputeAndPublish();
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
                // FR-019 identity pass-through (R-005 request fields): the
                // server-resolved guest reference and ACCEPTED handle ride
                // into the session/seat records.
                guestPlayerId: guest.value,
                acceptedHandle: named.value,
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
            presence.set(guest.value, {
                matchId: result.data.matchId,
                role: 'player',
                seatAssignment: result.data.seatAssignment,
            });
            recomputeAndPublish();
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
            const result = matchmaker.joinMatch({
                matchId,
                displayName: named.value,
                // FR-019 identity pass-through, same as `create`.
                guestPlayerId: guest.value,
                acceptedHandle: named.value,
            });
            if (!result.ok) {
                if (result.error.code === 'match_not_found') {
                    // Proven-dead stale row (collected upstream between
                    // listing and action): drop it so the next revision
                    // stops offering Join (US4 AC-3 / FR-013).
                    ledger.delete(matchId);
                    recomputeAndPublish();
                }
                return { ok: false, error: mapUpstreamError(result.error) };
            }
            // The shared pass reconciles BEFORE rebuilding, so the delegated
            // listing's authoritative occupancy lands first and the local
            // delta below can only raise it.
            const seat = result.data.seatAssignment;
            tracked.seatsFilled = Math.max(tracked.seatsFilled, seat.seatIndex + 1);
            if (tracked.seatsFilled >= tracked.capacity) {
                // Deterministic feature-006 auto-start (FR-011): taking the
                // last seat started the match inside the delegated call.
                tracked.status = 'in_progress';
            }
            presence.set(guest.value, { matchId: result.data.matchId, role: 'player', seatAssignment: seat });
            recomputeAndPublish();
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
            // Ledger trust is ACCEPTED here (security review LOW-9): the
            // status/terminal funnels drop rows synchronously in the same
            // stack that collects a match upstream, so by the time this
            // runs, a stale row is already gone. Spectators detach at the
            // transport layer anyway — worst case, the read-only attach
            // fails safely there and costs nobody a seat.
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
                // Shared pass: the delegated listing reflects the released
                // seat (and, when the leaver was the final seat, the upstream
                // collection has already emitted the status event that
                // dropped the row — the diff gate dedups either way).
                recomputeAndPublish();
                return { ok: true };
            }
            // Spectator detach: no seat exists upstream (the read-only view
            // detaches at the transport layer); presence-only cleanup here.
            presence.delete(guest.value);
            return { ok: true };
        },

        connectionClosed(connectionId: ConnectionId): void {
            assertOpen();
            releaseConnection(connectionId);
            // No publish: entries are unchanged (rows belong to matches, not
            // connections) and the closing viewer's stream ends with its
            // subscription. Player presence intentionally survives grace.
        },

        close(): Promise<void> {
            if (closed) {
                return Promise.resolve();
            }
            closed = true;
            if (unsubscribeStatus !== null) {
                unsubscribeStatus();
                unsubscribeStatus = null;
            }
            connections.clear();
            subscriptions.clear();
            presence.clear();
            ledger.clear();
            publishedEntries = Object.freeze([]);
            registry.close();
            return matchmaker.close();
        },
    };

    return service;
}
