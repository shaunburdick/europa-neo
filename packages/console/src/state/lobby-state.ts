/**
 * Lobby state-layer types — feature 010 (T-014).
 *
 * The application-state contract for the public lobby, sitting BESIDE
 * the match console state (`./types.ts` → `ConsoleState`) without
 * touching it. Everything here is console-owned UI state: the wire
 * shapes are consumed through the typed transport surface
 * ({@link ../net/ws-lobby-client} and `@europa/matchmaking`'s exported
 * lobby contracts) and are deliberately NOT re-projected — per the
 * feature rule, new IdentityState projection sites would need new
 * compile-time witnesses, so this layer only READS the client's types.
 *
 * Identity projection: the directed `identity` event carries a server-
 * resolved player ID for correlation and an optional display handle. This
 * state currently retains the handle only because that is the lobby view's
 * projection; the ID is not secret and may be carried or displayed where
 * useful. Resume credentials remain protected at the transport/storage
 * boundary. Handles are stored verbatim as opaque strings: validation,
 * bidi isolation, and rendering concerns belong to the server and UI.
 *
 * Purity: no clocks, no randomness — every field is derived from
 * dispatched {@link LobbyAction}s, so tests are fully deterministic
 * without fake timers.
 */

import type { LobbyErrorCode, LobbySnapshot } from '@europa/matchmaking';
import type { LobbyConnectionState } from '../net/ws-lobby-client';
import type { MatchId } from './types';

// ----------------------------------------------------------------------------
// View mode + identity status
// ----------------------------------------------------------------------------

/**
 * Coarse screen the shell should render (T-015 consumes this):
 *
 *   - `'lobby'` — the landing/browser view (identity form, match list).
 *   - `'match'` — a match context (waiting room or live board); the
 *     existing match console owns rendering there.
 *
 * Transitions are EXPLICIT reducer events only — snapshots never move
 * the view on their own (US4 AC-4 wants the landing page to SHOW an
 * active match, not silently teleport the player into it).
 */
export type LobbyViewMode = 'lobby' | 'match';

/**
 * Guest-identity lifecycle as the landing UI should present it:
 *
 *   - `'restoring'` — between identities: pre-establish, mid-reconnect,
 *     or after the server forgot us (claim expired/restart). A persisted
 *     claim may still restore the previous handle.
 *   - `'unnamed'`   — identity confirmed server-side, no handle chosen
 *     yet (US1 AC-1 before AC-2).
 *   - `'named'`     — identity confirmed WITH an accepted handle.
 */
export type LobbyIdentityStatus = 'unnamed' | 'named' | 'restoring';

// ----------------------------------------------------------------------------
// Per-action loading/error tracking
// ----------------------------------------------------------------------------

/**
 * The mutating lobby actions whose request/response lifecycle the
 * store tracks individually ("loading/error states per action").
 * Correlates one-to-one with the transport client's command methods.
 */
export type LobbyActionKind = 'setHandle' | 'createMatch' | 'joinMatch' | 'spectateMatch' | 'leaveMatch';

/**
 * Error codes carried by {@link LobbyActionError}: the wire's closed
 * `LobbyErrorCode` union plus two CLIENT-SYNTHESIZED codes for local
 * outcomes the wire never names — a correlation timeout and any other
 * transport-level failure (socket died mid-request, send threw).
 */
export type LobbyActionErrorCode = LobbyErrorCode | 'timeout' | 'transport';

/**
 * One failed lobby action, normalized for rendering (FR-018:
 * recoverable failures are values). `message` comes from the server
 * (already sanitized against secret leakage by the transport client)
 * or from the client itself; `detail` mirrors the wire's optional
 * machine-readable record (US3 AC-4 field-specific feedback) and is
 * `null` when absent.
 */
export interface LobbyActionError {
    readonly code: LobbyActionErrorCode;
    readonly message: string;
    readonly detail: Readonly<Record<string, string | number | boolean>> | null;
}

/**
 * Lifecycle of one mutating action kind. `error` is non-null exactly
 * when `phase === 'error'`; retrying simply starts the action again
 * (`lobbyActionStarted` overwrites the error with `'loading'`).
 */
export interface LobbyActionStatus {
    readonly phase: 'idle' | 'loading' | 'error';
    readonly error: LobbyActionError | null;
}

// ----------------------------------------------------------------------------
// Session-level failure + supersession
// ----------------------------------------------------------------------------

/**
 * Failure codes for SESSION-level reports (as opposed to the per-action
 * codes above): the wire's union plus two client-synthesized connection
 * outcomes — auto-retry disabled after transport loss
 * (`'connection_lost'`, retryable) and terminal retry-budget/protocol
 * exhaustion (`'connection_failed'`, recovery requires an explicit
 * reconnect).
 */
export type LobbyFailureCode = LobbyErrorCode | 'connection_lost' | 'connection_failed';

/**
 * An actionable session-level failure (FR-018): lost connection, retry
 * budget exhausted, or an UNSOLICITED server error (no actionId echo —
 * e.g. `server_restarted` mid-session). Rendered as a banner/status by
 * T-015; cleared by recovery ('ready') or an explicit user retry.
 */
export interface LobbyFailure {
    /** Where the failure originated (drives icon/copy choices later). */
    readonly source: 'connection' | 'server';
    readonly code: LobbyFailureCode;
    readonly message: string;
    readonly detail: Readonly<Record<string, string | number | boolean>> | null;
}

// ----------------------------------------------------------------------------
// The state value
// ----------------------------------------------------------------------------

/**
 * The complete lobby application state (feature 010 plan §3). Immutable;
 * advanced ONLY by {@link reduceLobby} over {@link LobbyAction}s.
 *
 * Deliberately absent from this projection: the player ID, any URL/query
 * material, and any transformed handle text. Player IDs are correlation
 * data rather than secrets; this omission is a shape choice, not a privacy
 * boundary.
 */
export interface LobbyState {
    /** Which coarse screen the shell should render. */
    readonly viewMode: LobbyViewMode;

    /**
     * Connection lifecycle, projected verbatim from the transport
     * client's own union (consuming > re-projecting): `idle`,
     * `connecting`, `ready`, `disconnected`, `reconnecting`, `failed`,
     * `closed`.
     */
    readonly connection: LobbyConnectionState;

    /** Guest-identity presentation status (see {@link LobbyIdentityStatus}). */
    readonly identityStatus: LobbyIdentityStatus;

    /**
     * Server-confirmed display handle, verbatim; `null` until the
     * visitor picks a valid one. The preferred user-facing identity label;
     * correlation IDs may be retained by other state projections when useful.
     */
    readonly handle: string | null;

    /**
     * Sticky: a directed identity event confirmed a NON-NULL handle at
     * least once in this app session. Internal gate for the supersession
     * ruling below — kept visible so the derivation stays inspectable
     * and testable.
     */
    readonly everNamed: boolean;

    /** Latest APPLIED snapshot (revision-gated upstream), `null` pre-baseline. */
    readonly snapshot: LobbySnapshot | null;

    /**
     * The identity's active match per the SERVER (snapshot
     * `activeMatchId`); `null` when lobby-bound. Data only — entering
     * the match VIEW remains an explicit event (US4 AC-4 shows status;
     * it does not teleport).
     */
    readonly activeMatchId: MatchId | null;

    /**
     * The matchmaking-issued session token for the current seat, or
     * `null` when lobby-bound. Passed to the match leg so it can join
     * the wire server with `reconnectToken` and claim the CORRECT seat
     * (the one the lobby assigned), rather than racing for the first
     * open seat.
     */
    readonly seatSessionToken: string | null;

    /** Per-action loading/error tracking, one slot per {@link LobbyActionKind}. */
    readonly actions: Readonly<Record<LobbyActionKind, LobbyActionStatus>>;

    /**
     * SUPERSESSION (security-audit invariant): an ESTABLISHED, previously
     * NAMED session was rejected with `identity_invalid` — the claim was
     * taken over elsewhere or evicted. Distinct from ordinary recoverable
     * errors so T-015 can render a dedicated "session moved elsewhere"
     * notice. Cleared by explicit acknowledgement only.
     */
    readonly superseded: boolean;

    /** Current session-level failure banner payload, `null` when healthy. */
    readonly failure: LobbyFailure | null;
}

// ----------------------------------------------------------------------------
// Actions (the reducer's input union)
// ----------------------------------------------------------------------------

/**
 * Every state transition the lobby layer accepts. Two families:
 *
 *   - EVENTS (from the transport via the controller): connection
 *     changes, directed identity resolutions, applied snapshots,
 *     uncorrelated failure reports, and per-action settle outcomes.
 *   - INTENTS/UI transitions: optimistic retry acknowledgement, the
 *     explicit enter-match pin, return-to-lobby, and supersession
 *     acknowledgement.
 *
 * Commands do NOT travel through this union — they are promise-based
 * controller methods ({@link ../state/lobby-controller}) because lobby
 * actions need per-action correlation that promise settlement models
 * naturally; the controller translates outcomes into these events.
 */
export type LobbyAction =
    /** Transport connection lifecycle changed (includes the initial sync). */
    | { readonly kind: 'lobbyConnectionChanged'; readonly connection: LobbyConnectionState }
    /**
     * The DIRECTED identity event resolved for our connection. Carries
     * the display handle. The controller currently omits the non-secret
     * correlation ID because this state projection does not need it.
     */
    | { readonly kind: 'lobbyIdentityResolved'; readonly handle: string | null }
    /** A revision-gated snapshot was applied upstream; adopt it wholesale. */
    | { readonly kind: 'lobbySnapshotApplied'; readonly snapshot: LobbySnapshot }
    /** A mutating action began (per-kind slot → `'loading'`). */
    | { readonly kind: 'lobbyActionStarted'; readonly action: LobbyActionKind }
    /**
     * A mutating action succeeded. `transition` is present only for the
     * seat-granting actions (create/join/spectate) and flips the view
     * into the match context per the server's own classification.
     */
    | {
          readonly kind: 'lobbyActionSucceeded';
          readonly action: LobbyActionKind;
          readonly transition?: 'waiting' | 'match';
      }
    /** A mutating action failed; the per-kind slot records the error. */
    | { readonly kind: 'lobbyActionFailed'; readonly action: LobbyActionKind; readonly error: LobbyActionError }
    /** An unsolicited (uncorrelated) server error or connection-terminal outcome. */
    | { readonly kind: 'lobbyFailureReported'; readonly failure: LobbyFailure }
    /**
     * Explicit enter-match pin (used by the controller on seat-grant
     * success and available to later match-handoff wiring). `matchId`
     * may be `null` when the caller has no id yet (create flow — the
     * next snapshot supplies it). `seatSessionToken` is the
     * matchmaking-issued bearer token for this seat, passed through to
     * the match leg so the wire join claims the correct seat.
     */
    | {
          readonly kind: 'lobbyEnteredMatch';
          readonly matchId: MatchId | null;
          readonly seatSessionToken?: string;
      }
    /**
     * Return-to-lobby: leave succeeded (or a terminal result offers the
     * way back). Clears the active match and the leave-action slot while
     * keeping the identity (handle) intact.
     */
    | { readonly kind: 'lobbyReturned' }
    /** The user acknowledged the "session moved elsewhere" notice. */
    | { readonly kind: 'lobbySupersededAcknowledged' }
    /** The user actuated retry; optimistically clear the failure banner. */
    | { readonly kind: 'lobbyRetryRequested' };
