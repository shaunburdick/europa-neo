/**
 * Lobby Server API Contract — Feature 010 (Public Lobby & Match Browser)
 *
 * The server-side lobby facade interface that the identity registry
 * (plan.md §1) implements and the lobby transport (§2) exposes. The
 * facade owns: identity create/restore, handle validation with atomic
 * uniqueness, public-match projection, and the single active-match
 * association per identity. Match settings/capacity/start/cleanup are
 * DELEGATED to feature 006's matchmaker; gameplay continues through
 * the existing networking contracts unchanged.
 *
 * Source of truth:
 * `specs/010-public-lobby-match-browser/contracts/lobby-api.md` (the
 * `LobbyService` block is mirrored verbatim). `Result`,
 * `MatchJoinTarget`, and `SpectatorTarget` are referenced-but-undefined
 * in that document; they are declared here per its prose constraints
 * and the repository's explicit success/error union convention.
 *
 * Rules for this file:
 *   - Types only — no runtime logic, no values (zero runtime deps).
 *   - All methods are synchronous at the state mutation boundary except
 *     shutdown (`close`), per lobby-api.md.
 *   - Every mutation rechecks current state immediately before
 *     assignment; actions are serialized by the Node event loop
 *     (plan.md §2) — the signatures take no locks/callbacks.
 *
 * This is intentionally NOT a persistence interface, account interface,
 * or private-match interface (lobby-api.md closing note).
 */

// ----------------------------------------------------------------------------
// Imports
// ----------------------------------------------------------------------------

// Networking-owned brands (feature 004), re-used single-sourced exactly
// like `contracts/match-types.ts`. Type-only: erased at compile time.
import type { ConnectionId, MatchId } from '@europa/networking';
// Feature-006 canonical shapes: the settings the matchmaker accepts and
// the server-issued seat credential a successful create/join yields.
import type { MatchSettings, SeatAssignment } from '../../contracts/match-types';
// Feature-010 type contracts (same contracts directory).
import type { GuestIdentityClaim, IdentityState, LobbyError, LobbySnapshot } from './lobby-types';

// ----------------------------------------------------------------------------
// Result (the repository's explicit success/error union)
// ----------------------------------------------------------------------------

/**
 * Explicit success/error union used by every fallible lobby method —
 * expected failures are VALUES, never thrown exceptions (FR-018;
 * same discipline as feature 006's `CreateMatchResult` family,
 * generalized over success/error payloads).
 *
 * The success arm carries `data: TSuccess`; for `Result<void, E>`
 * (`leave`) the arm collapses to `{ ok: true }` alone, matching the
 * shipped `LeaveMatchResult` precedent (a required `data: void` field
 * would force meaningless `{ ok: true, data: undefined }` literals).
 *
 * Bare-arm detection is spelled `[undefined] extends [TSuccess]`
 * rather than naming `void` because the linter forbids confusing
 * non-return-position void tokens; `undefined` extends `void`, so
 * `Result<void, E>` resolves to the bare arm exactly as intended.
 * (A success payload that itself includes `undefined` is not modeled
 * by this API — such a payload would be `void`.)
 */
export type Result<TSuccess, TError> = [undefined] extends [TSuccess]
    ? { readonly ok: true } | { readonly ok: false; readonly error: TError }
    : { readonly ok: true; readonly data: TSuccess } | { readonly ok: false; readonly error: TError };

// ----------------------------------------------------------------------------
// Action targets (server-issued hand-offs)
// ----------------------------------------------------------------------------

/**
 * What a successful `create`/`join` returns: ONLY the existing
 * server-issued match/session assignment needed to enter networking
 * (lobby-api.md prose). `seatAssignment` is matchmaking's canonical
 * credential bundle (`SeatAssignment`: session token for reconnect,
 * seat/player ids, display name) — it is produced by the server, never
 * accepted from the client: no client-selected seat or identity can
 * appear here (spec v1.1 amendment; FR-021 keeps order authority with
 * the server-resolved seat).
 *
 * The connection transitions into the existing networking handshake/session
 * path with these values. IDs may be visible for safe correlation, but handles
 * are preferred labels and the lobby association remains server-authoritative.
 * The session token is a protected bearer credential and must not be confused
 * with an identity or match ID.
 */
export interface MatchJoinTarget {
    /** The match entered (also reflected in later snapshots' `activeMatchId`). */
    readonly matchId: MatchId;
    /** Server-issued seat/session credentials (feature 006 canonical shape). */
    readonly seatAssignment: SeatAssignment;
}

/**
 * What a successful `spectate` returns: identification of the match
 * the connection is now attached to via the EXISTING read-only
 * spectator path (FR-012). Contains NO player seat and NO token —
 * spectators hold no seat, issue no orders, and receive full-board
 * fog views through the unchanged spectator pipeline (US4 AC-2).
 */
export interface SpectatorTarget {
    /** The match being spectated. */
    readonly matchId: MatchId;
}

// ----------------------------------------------------------------------------
// LobbyService
// ----------------------------------------------------------------------------

/**
 * The server-owned lobby facade (plan.md §1). One instance per process;
 * state is process memory only (FR-015) and `close()` clears it all
 * (plan.md §4). Identity is resolved from SERVER session state keyed
 * by `connectionId` — never from client-supplied seat/guest-id fields.
 *
 * Concurrency model: every method runs synchronously through its
 * critical section on the Node event loop and rechecks current state
 * immediately before assignment (handle races, final-seat races).
 * Matchmaker bridge callbacks publish snapshot revisions after
 * create/fill/start/collect; reconnect/grace callbacks update identity
 * state (lobby-api.md prose).
 */
export interface LobbyService {
    /**
     * Resolve or mint the caller's ephemeral guest identity (FR-002).
     *
     * A present `claim` is honored ONLY when it matches the registry
     * (within the reconnect grace window); any stale/forged/unknown
     * claim silently yields a FRESH identity — establishment cannot
     * fail, so the return is bare `IdentityState` rather than a
     * `Result`. Registers the connection's lobby presence.
     */
    establishIdentity(claim: GuestIdentityClaim | undefined, connectionId: ConnectionId): IdentityState;

    /**
     * Validate and atomically reserve a handle for the connection's
     * identity (FR-004/FR-005). Validation: 1–24 Unicode characters
     * after trimming, at least one non-whitespace character, no control
     * characters. Uniqueness compares trimmed + case-insensitively among
     * ACTIVE identities; the accepted casing is preserved for display.
     * Renames update future projections without changing the identity
     * reference (FR-019).
     */
    setHandle(connectionId: ConnectionId, handle: string): Result<IdentityState, LobbyError>;

    /**
     * Subscribe the connection to lobby revisions and return the
     * current complete snapshot as the baseline. Re-subscribing is
     * idempotent per connection.
     */
    subscribe(connectionId: ConnectionId): Result<LobbySnapshot, LobbyError>;

    /**
     * Create a PUBLIC match via the existing matchmaker (FR-008),
     * reserving the creator's seat (FR-009). Missing settings fields
     * are filled from feature 006 defaults; unsupported values are
     * rejected by the delegated validation (US3 AC-4 field-specific
     * feedback). Auto-start when seats fill is matchmaking behavior
     * (FR-011) — no manual start exists on this surface.
     */
    create(connectionId: ConnectionId, settings?: Partial<MatchSettings>): Result<MatchJoinTarget, LobbyError>;

    /**
     * Atomically assign at most one seat in the listed public match to
     * the connection's identity (FR-010). Full/unavailable/no-longer-
     * listed matches fail with the matching `LobbyErrorCode` and the
     * next revision refreshes the entry (US4 AC-3).
     */
    join(connectionId: ConnectionId, matchId: MatchId): Result<MatchJoinTarget, LobbyError>;

    /**
     * Attach the connection to an in-progress public match through the
     * existing read-only spectator path (FR-012): no seat, no token,
     * no order rights. Spectating counts as match presence — the
     * identity cannot simultaneously join another match (US4 AC-4).
     */
    spectate(connectionId: ConnectionId, matchId: MatchId): Result<SpectatorTarget, LobbyError>;

    /**
     * Release the connection's lobby/match presence (return to lobby).
     * Seat/handle release honors the existing reconnect grace window —
     * the association is removed only once grace expires (plan.md §4);
     * within grace the same identity reclaims everything (FR-022).
     */
    leave(connectionId: ConnectionId): Result<void, LobbyError>;

    /**
     * Shut down the facade: clears identities, handles, associations,
     * subscriptions, and projections (plan.md §4). Idempotent; resolves
     * once all lobby state is dropped. Browser session assumptions do
     * not survive restart (edge case: fresh session afterwards).
     */
    close(): Promise<void>;
}
