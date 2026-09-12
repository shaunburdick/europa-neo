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
 * Privacy envelope (NFR-003, FR-024): public projections contain discovery
 * data only. Non-secret IDs may be included on safe correlation surfaces;
 * accepted handles are preferred for labels, and session/reconnect tokens
 * remain protected bearer credentials. Client-provided identity claims are
 * advisory only; the registry and matchmaker remain the authority for identity,
 * sessions, and seats. The directed `identity` event still carries the owning
 * ID for resume correlation, while public entries contain no seat tokens or
 * private-match data.
 *
 * Pure apart from injected dependencies: clock and randomness arrive
 * via `deps.now` / the registry's `randomId` (constitution Principle II).
 */

import { compareUtf16 } from '@europa/engine';
import { NULL_LOGGER, sanitizeLogText } from '@europa/logging';
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
    RosterChange,
    RosterEntry,
    RosterRevision,
    RosterSnapshot,
    RosterStatus,
} from '../contracts/lobby-types';
import type { MatchStatusChangedEvent } from '../eventBus';
import type { MatchmakerCompositionSeam } from '../matchmaker';
import { makeLobbyError } from './handleValidation';
import type { IdentityRegistry } from './identityRegistry';
import { createIdentityRegistry } from './identityRegistry';

// ----------------------------------------------------------------------------
// Tunables & local defaults
// ----------------------------------------------------------------------------

/**
 * Anti-flap grace window (ms) for roster status transitions (feature 023
 * FR-011). When a status change arrives within this window of a prior
 * change for the same player, the timer is reset and only the final
 * stable state is broadcast when the timer fires.
 */
const ANTI_FLAP_GRACE_MS = 500;

/**
 * Maximum number of unsent roster deltas before a full snapshot is
 * sent instead (feature 023 FR-005).
 */
const ROSTER_DELTA_THRESHOLD = 20;

/**
 * Maximum elapsed time (ms) between full roster snapshots (feature 023
 * FR-005). A full snapshot is sent if this duration has elapsed since
 * the last one.
 */
const ROSTER_SNAPSHOT_INTERVAL_MS = 60_000;

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

    // -- Roster state (feature 023) ---------------------------------------------

    /**
     * The authoritative in-memory roster. GuestPlayerId → RosterEntry
     * (feature 023 FR-008). Entries are derived from the `presence` map
     * and added/removed alongside identity lifecycle events.
     */
    const roster = new Map<GuestPlayerId, RosterEntry>();

    /**
     * Monotonic roster revision counter (feature 023 FR-004). Starts at
     * 1; increments by 1 for every roster mutation (player added,
     * removed, or status changed). NEVER resets.
     */
    let rosterRevision: RosterRevision = 1 as RosterRevision;

    /**
     * Per-player anti-flap debounce timers (feature 023 FR-011). When a
     * status change arrives within the grace window, the timer is reset.
     * Only the final stable state is broadcast when the timer fires.
     */
    const rosterDebounceTimers = new Map<GuestPlayerId, ReturnType<typeof setTimeout>>();

    /**
     * Pending roster changes during debounce windows. When a timer fires,
     * the pending entry is broadcast and removed from this map.
     */
    const rosterPendingChanges = new Map<GuestPlayerId, RosterEntry>();

    /**
     * Count of unsent roster deltas (for periodic full snapshot gating,
     * feature 023 FR-005). Reset to 0 when a full snapshot is sent.
     */
    let rosterUnsentDeltaCount = 0;

    /**
     * Timestamp (epoch ms) of the last full roster snapshot sent (for
     * periodic full snapshot gating, feature 023 FR-005). Reset when a
     * full snapshot is sent.
     */
    let rosterLastSnapshotTime = now();

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

    // -- Roster helpers (feature 023) -------------------------------------------

    /**
     * Derive a player's roster status from the existing `presence` map
     * (feature 023 FR-009). Priority: `in_game` (seated player) >
     * `spectating` > `in_lobby` (no match association).
     */
    function deriveRosterStatus(guestId: GuestPlayerId): RosterStatus {
        const attached = presence.get(guestId);
        if (attached === undefined) {
            return 'in_lobby';
        }
        if (attached.role === 'player') {
            return 'in_game';
        }
        return 'spectating';
    }

    /**
     * Add or update a roster entry with the derived status, applying
     * anti-flap grace period (feature 023 FR-011). If a change arrives
     * within the grace window, the debounce timer is reset — only the
     * final stable state is broadcast when the timer fires.
     *
     * @param guestId - The player's guest identity.
     * @param handle - The player's accepted display handle.
     */
    function updateRosterEntry(guestId: GuestPlayerId, handle: string): void {
        // Feature 023 FR-008 (v1.1): players who have not completed
        // onboarding (no handle set) are excluded from the roster entirely.
        if (handle === 'Anonymous') {
            // If the player is already in the roster, remove them — their
            // onboarding state was cleared.
            if (roster.has(guestId)) {
                removeRosterEntry(guestId);
            }
            return;
        }
        const status = deriveRosterStatus(guestId);
        const entry: RosterEntry = Object.freeze({ handle, status });

        roster.set(guestId, entry);
        rosterRevision = (rosterRevision + 1) as RosterRevision;

        // Anti-flap: if a debounce timer is already running, reset it
        // and update the pending entry to the latest state.
        const existingTimer = rosterDebounceTimers.get(guestId);
        if (existingTimer !== undefined) {
            clearTimeout(existingTimer);
        }

        rosterPendingChanges.set(guestId, entry);

        const timer = setTimeout(() => {
            rosterDebounceTimers.delete(guestId);
            const pending = rosterPendingChanges.get(guestId);
            if (pending !== undefined) {
                rosterPendingChanges.delete(guestId);
                broadcastRosterDelta([pending]);
            }
        }, ANTI_FLAP_GRACE_MS);
        rosterDebounceTimers.set(guestId, timer);
    }

    /**
     * Remove a roster entry and clear its debounce timer (feature 023).
     * Deltas do NOT carry explicit removals (FR-003) — the next full
     * snapshot confirms the removal. The revision is still incremented
     * so clients can detect that something changed.
     */
    function removeRosterEntry(guestId: GuestPlayerId): void {
        const existingTimer = rosterDebounceTimers.get(guestId);
        if (existingTimer !== undefined) {
            clearTimeout(existingTimer);
            rosterDebounceTimers.delete(guestId);
        }
        rosterPendingChanges.delete(guestId);
        roster.delete(guestId);
        rosterRevision = (rosterRevision + 1) as RosterRevision;
    }

    /**
     * Build a deterministic snapshot from the current roster state
     * (feature 023 FR-006: ordered lexicographically by handle,
     * case-insensitive). Frozen and returned.
     */
    function buildSortedRosterEntries(): ReadonlyArray<RosterEntry> {
        const entries = [...roster.values()];
        // Explicit UTF-16 code-unit ordering (issue #74 T027): host locale
        // must never change authoritative output. This is presentation-only
        // (roster display), but the shared comparator keeps it deterministic.
        entries.sort((a, b) => compareUtf16(a.handle.toLowerCase(), b.handle.toLowerCase()));
        return Object.freeze(entries);
    }

    /**
     * Send a full roster snapshot to all subscribed connections
     * (feature 023 FR-005/FR-007). Resets the unsent-delta counter
     * and updates the last-snapshot timestamp.
     */
    function broadcastRosterSnapshot(): void {
        if (deliver === null || subscriptions.size === 0) {
            return;
        }
        const sorted = buildSortedRosterEntries().filter((e) => e.handle !== 'Anonymous');
        const snapshot: RosterSnapshot = Object.freeze({
            revision: rosterRevision,
            players: sorted,
        });
        const event: LobbyEvent = Object.freeze({ kind: 'roster', roster: snapshot });
        for (const connectionId of subscriptions) {
            deliverEvent(connectionId, event);
        }
        rosterUnsentDeltaCount = 0;
        rosterLastSnapshotTime = now();
    }

    /**
     * Send a roster delta to all subscribed connections (feature 023
     * FR-003/FR-007). Increments the unsent-delta counter for
     * periodic full-snapshot gating.
     *
     * @param entries - The roster entries that changed (additions or
     *   status updates). Deltas do NOT carry removals.
     */
    function broadcastRosterDelta(entries: ReadonlyArray<RosterEntry>): void {
        if (deliver === null || subscriptions.size === 0) {
            return;
        }
        if (entries.length === 0) {
            return;
        }
        const changes: ReadonlyArray<RosterChange> = entries.map(
            (e): RosterChange => Object.freeze({ handle: e.handle, status: e.status }),
        );
        const delta = Object.freeze({ revision: rosterRevision, changes });
        const event: LobbyEvent = Object.freeze({ kind: 'rosterDelta', delta });
        for (const connectionId of subscriptions) {
            deliverEvent(connectionId, event);
        }
        rosterUnsentDeltaCount += 1;
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
        // Feature 023: remove the roster entry on disconnect. If the
        // player reconnects within grace, establishIdentity re-adds them.
        removeRosterEntry(guestId);
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

    /**
     * Attach the owning identity's non-secret ID to a safe registry projection
     * for resume correlation. The ID is not a bearer credential. Restoring it
     * may associate this connection with its ephemeral lobby identity, but
     * server validation still controls match seats, orders, reconnect tokens,
     * and fog views. Handles are preferred for labels, and bearer tokens remain
     * protected.
     */
    function withOwnerId(safe: IdentityState, owner: GuestPlayerId): IdentityState {
        return Object.freeze({ handle: safe.handle, hasIdentity: true, guestPlayerId: owner });
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
        // Feature 023 FR-005: periodic full roster snapshot when the
        // accumulated unsent delta set exceeds the threshold or the
        // snapshot interval has elapsed.
        if (
            rosterUnsentDeltaCount >= ROSTER_DELTA_THRESHOLD ||
            now() - rosterLastSnapshotTime >= ROSTER_SNAPSHOT_INTERVAL_MS
        ) {
            broadcastRosterSnapshot();
        }
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
     * fan-out) and return the affected guest IDs (for roster updates).
     */
    function clearPresenceForMatch(matchId: MatchId): GuestPlayerId[] {
        const affected: GuestPlayerId[] = [];
        for (const [guestId, attached] of presence) {
            if (attached.matchId === matchId) {
                presence.delete(guestId);
                affected.push(guestId);
            }
        }
        return affected;
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
            const affected = clearPresenceForMatch(event.matchId);
            ledger.delete(event.matchId);
            // Feature 023: re-derive roster status for affected players
            // (in_game/spectating → in_lobby). Players still connected
            // re-establish via establishIdentity; disconnected players
            // were already removed by releaseConnection.
            for (const guestId of affected) {
                if (roster.has(guestId)) {
                    const handle = registry.projectIdentity(guestId)?.handle;
                    if (handle !== undefined && handle !== null) {
                        updateRosterEntry(guestId, handle);
                    }
                }
            }
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
            // Only a grace-window identity needs reactivating; an already
            // active identity must not be re-minted (issue #74 T026).
            if (guestId !== undefined && registry.isInGrace(guestId)) {
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
                    // Feature 023: remove the roster entry — the seat
                    // expired and the connection is gone.
                    removeRosterEntry(guestId);
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
            const affected = clearPresenceForMatch(event.matchId);
            ledger.delete(event.matchId);
            // Feature 023: re-derive roster status for affected players.
            for (const guestId of affected) {
                if (roster.has(guestId)) {
                    const handle = registry.projectIdentity(guestId)?.handle;
                    if (handle !== undefined && handle !== null) {
                        updateRosterEntry(guestId, handle);
                    }
                }
            }
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
            const previous = connections.get(connectionId);
            const claimed = claim?.guestPlayerId;
            let activeId: GuestPlayerId;
            if (
                previous !== undefined &&
                claimed !== undefined &&
                claimed === previous &&
                !registry.isInGrace(previous)
            ) {
                // Same-connection refresh of an already-ACTIVE identity
                // (review F-8): keep it in place. A bare claim must never
                // mint a replacement or start a spurious grace window.
                activeId = previous;
            } else {
                // Grace-only restore: a bare id for an ACTIVE identity mints
                // a fresh identity instead of evicting the incumbent (spec
                // 006 FR-016 / spec 010 v1.11 credential separation).
                const identityRestore = registry.restoreIdentity(claim);
                // Re-establishment overwrite (review F-8): a connection bound
                // to a DIFFERENT guest releases that guest exactly as a
                // transport close would (grace + immediate spectator release)
                // instead of orphaning it active forever.
                if (previous !== undefined && previous !== identityRestore.identity.id) {
                    releaseConnection(connectionId);
                }
                bindConnection(connectionId, identityRestore.identity.id);
                activeId = identityRestore.identity.id;
            }
            const projected = registry.projectIdentity(activeId);
            const state: IdentityState = projected ?? Object.freeze({ handle: null, hasIdentity: true });
            logger.info('lobbyService: player joined lobby', {
                handle: projected !== undefined && projected.handle !== null ? sanitizeLogText(projected.handle) : null,
                connectionId,
            });
            deliverEvent(connectionId, {
                kind: 'identity',
                // FR-003 delivery channel (spec Clarifications v1.6): the
                // directed event carries the owner's non-secret ID for
                // correlation, and the sink routes it to THIS connection.
                // The return value above remains the facade's safe projection.
                identity: projected === undefined ? state : withOwnerId(projected, activeId),
            });
            // Feature 023 FR-008/FR-009: add or update the roster entry.
            // Players without a handle (not yet onboarded) are excluded
            // from the roster entirely (v1.1).
            if (projected?.handle !== undefined && projected.handle !== null) {
                updateRosterEntry(activeId, projected.handle);
            }
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
            const previousHandle = registry.projectIdentity(guest.value)?.handle ?? null;
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
            logger.info('lobbyService: handle changed', {
                handle: sanitizeLogText(handle),
                previousHandle: previousHandle !== null ? sanitizeLogText(previousHandle) : null,
                connectionId,
            });
            deliverEvent(connectionId, {
                kind: 'identity',
                // Same FR-003 channel as `establishIdentity` (spec
                // Clarifications v1.6): owner's id, directed delivery only.
                identity: withOwnerId(projected, guest.value),
            });
            // Feature 023: update the roster entry's handle (preserve
            // status). Use the normalized handle from the projection for
            // consistency with establishIdentity. After a successful
            // setHandle the handle is always non-null, but the type is
            // string | null — guard for TypeScript.
            if (projected.handle !== null) {
                updateRosterEntry(guest.value, projected.handle);
                // Handle renames require a full roster snapshot: deltas
                // match by handle, so a rename adds the new handle but
                // cannot express removal of the old handle. A full
                // snapshot replaces the entire roster, eliminating the
                // stale entry. (Related: issue #112 for proper
                // roster-by-player-ID tracking.)
                if (previousHandle !== null && previousHandle !== projected.handle) {
                    broadcastRosterSnapshot();
                }
            }
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
            // Feature 023 FR-005: send a complete roster snapshot as the
            // first roster event for this connection.
            broadcastRosterSnapshot();
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
            // Feature 023: re-derive and broadcast roster status (in_lobby → in_game).
            updateRosterEntry(guest.value, named.value);
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
            // Feature 023: re-derive and broadcast roster status (in_lobby → in_game).
            updateRosterEntry(guest.value, named.value);
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
            const spectatorHandle = registry.projectIdentity(guest.value)?.handle ?? null;
            logger.info('lobbyService: spectator joined match', {
                matchId,
                handle: spectatorHandle !== null ? sanitizeLogText(spectatorHandle) : null,
            });
            // Feature 023: re-derive and broadcast roster status (in_lobby → spectating).
            if (spectatorHandle !== null) {
                updateRosterEntry(guest.value, spectatorHandle);
            }
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
                // Feature 023: re-derive and broadcast roster status (in_game → in_lobby).
                const leaveHandle = registry.projectIdentity(guest.value)?.handle;
                if (leaveHandle !== undefined && leaveHandle !== null) {
                    updateRosterEntry(guest.value, leaveHandle);
                }
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
            // Feature 023: re-derive and broadcast roster status (spectating → in_lobby).
            const spectateLeaveHandle = registry.projectIdentity(guest.value)?.handle;
            if (spectateLeaveHandle !== undefined && spectateLeaveHandle !== null) {
                updateRosterEntry(guest.value, spectateLeaveHandle);
            }
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
            // Feature 023: clear all roster debounce timers and maps.
            for (const timer of rosterDebounceTimers.values()) {
                clearTimeout(timer);
            }
            rosterDebounceTimers.clear();
            rosterPendingChanges.clear();
            roster.clear();
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
