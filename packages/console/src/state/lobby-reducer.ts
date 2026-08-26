/**
 * The pure lobby reducer — feature 010 (T-014).
 *
 * Single source of state transitions for the lobby layer: folds
 * {@link LobbyAction}s (transport events + UI transitions) into the
 * next immutable {@link LobbyState}. Pure — no I/O, no clocks, no
 * randomness; command orchestration lives in the controller
 * (`./lobby-controller.ts`), which translates promise outcomes into
 * these actions. Same discipline as the match reducer (`./reducer.ts`),
 * beside which this layer runs.
 *
 * Transition rules with product weight:
 *
 *   - View mode moves ONLY on explicit events: a seat-granting action
 *     success (create/join/spectate → `'match'`, honoring the server's
 *     own `waiting`/`match` classification) and `lobbyReturned`
 *     (→ `'lobby'`). Snapshots never move the view — US4 AC-4 wants an
 *     active match SHOWN on the landing page, not a silent teleport.
 *   - Supersession gate (security-audit invariant): `identity_invalid`
 *     flips `superseded` ONLY when this session had previously held a
 *     server-confirmed handle ({@link LobbyState.everNamed}). The facade's
 *     documented pre-condition rejections ("action before
 *     establishIdentity", "create/join without an accepted handle") use
 *     the same wire code but are ordinary recoverable errors — mislabeling
 *     them "session moved elsewhere" would corrupt US3 AC-4 feedback.
 *   - Identity-death codes (`identity_expired`/`server_restarted`) reset
 *     the identity posture to `'restoring'` and drop the stale handle,
 *     mirroring the transport client's claim invalidation (fresh session
 *     on next establish — spec edge case).
 */

import type {
    LobbyAction,
    LobbyActionKind,
    LobbyActionStatus,
    LobbyFailure,
    LobbyIdentityStatus,
    LobbyState,
} from './lobby-state';

// ----------------------------------------------------------------------------
// Initial state + constants
// ----------------------------------------------------------------------------

/** Build the idle per-action slot. */
function idleActionStatus(): LobbyActionStatus {
    return { phase: 'idle', error: null };
}

/** Build the loading per-action slot. */
function loadingActionStatus(): LobbyActionStatus {
    return { phase: 'loading', error: null };
}

/** All per-action slots at their idle phase, keyed by kind. */
function allActionsIdle(): Readonly<Record<LobbyActionKind, LobbyActionStatus>> {
    return {
        createMatch: idleActionStatus(),
        joinMatch: idleActionStatus(),
        leaveMatch: idleActionStatus(),
        setHandle: idleActionStatus(),
        spectateMatch: idleActionStatus(),
    };
}

/**
 * The initial lobby state (pre-connect). Used by the runtime before the
 * first dispatch; exposed so tests can compare. Starts in the lobby
 * view with identity status `'restoring'` — whether a persisted claim
 * will restore a named session is only known once the directed identity
 * event arrives.
 */
export const INITIAL_LOBBY_STATE: LobbyState = {
    viewMode: 'lobby',
    connection: 'idle',
    identityStatus: 'restoring',
    handle: null,
    everNamed: false,
    snapshot: null,
    activeMatchId: null,
    actions: allActionsIdle(),
    superseded: false,
    failure: null,
};

/** Session-level failure payload for the terminal `'failed'` connection state. */
const CONNECTION_FAILED_FAILURE: LobbyFailure = {
    source: 'connection',
    code: 'connection_failed',
    message: 'Lobby connection failed.',
    detail: null,
};

/** Session-level failure payload for retry-disabled transport loss. */
const CONNECTION_LOST_FAILURE: LobbyFailure = {
    source: 'connection',
    code: 'connection_lost',
    message: 'Lobby connection lost.',
    detail: null,
};

/**
 * Wire codes meaning the server no longer knows this identity AT ALL
 * (grace window expired / process restart). Mirrors the transport
 * client's own invalidation set.
 */
const IDENTITY_RESET_CODES: ReadonlySet<string> = new Set(['identity_expired', 'server_restarted']);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Replace one per-action slot immutably. */
function withActionStatus(state: LobbyState, kind: LobbyActionKind, status: LobbyActionStatus): LobbyState {
    return { ...state, actions: { ...state.actions, [kind]: status } };
}

/**
 * Apply the supersession gate to a partially-updated state: flip
 * `superseded` when the failure is `identity_invalid` AND this session
 * had ever held a confirmed handle (see module note — distinguishes
 * takeover/eviction from the facade's recoverable pre-condition
 * rejections that share the code).
 */
function applySupersessionGate(next: LobbyState, code: string): LobbyState {
    if (code !== 'identity_invalid' || !next.everNamed) {
        return next;
    }
    return { ...next, superseded: true };
}

/**
 * Reset the identity posture after the server forgot us entirely:
 * back to `'restoring'`, handle dropped, naming history cleared. The
 * next establish cycle presents a fresh claim (client-side mint) and
 * the directed identity event re-confirms from scratch.
 */
function resetIdentityPosture(next: LobbyState): LobbyState {
    return { ...next, identityStatus: 'restoring' as LobbyIdentityStatus, handle: null, everNamed: false };
}

// ----------------------------------------------------------------------------
// The reducer
// ----------------------------------------------------------------------------

/**
 * Advance the lobby state by one action. Pure (see module JSDoc). The
 * switch is exhaustive over the closed {@link LobbyAction} union — no
 * default arm, so adding a variant without handling it is a compile
 * error (same exhaustiveness discipline as the match reducer's
 * NetEvent discrimination).
 *
 * @param state Current state (seed from {@link INITIAL_LOBBY_STATE}).
 * @param action A transport event or UI transition.
 * @returns The next state.
 */
export function reduceLobby(state: LobbyState, action: LobbyAction): LobbyState {
    switch (action.kind) {
        // -- Transport events -------------------------------------------------
        case 'lobbyConnectionChanged': {
            if (action.connection === 'ready') {
                // Established again: any prior connection failure resolved.
                return { ...state, connection: action.connection, failure: null };
            }
            if (action.connection === 'failed') {
                return { ...state, connection: action.connection, failure: CONNECTION_FAILED_FAILURE };
            }
            if (action.connection === 'disconnected') {
                return { ...state, connection: action.connection, failure: CONNECTION_LOST_FAILURE };
            }
            // idle/connecting/reconnecting/closed: transient or explicit;
            // neither sets nor clears a failure banner.
            return { ...state, connection: action.connection };
        }

        case 'lobbyIdentityResolved': {
            const named = action.handle !== null;
            return {
                ...state,
                handle: action.handle,
                identityStatus: named ? 'named' : 'unnamed',
                ...(named ? { everNamed: true } : {}),
            };
        }

        case 'lobbySnapshotApplied':
            return { ...state, snapshot: action.snapshot, activeMatchId: action.snapshot.activeMatchId };

        case 'lobbyFailureReported': {
            const next: LobbyState = { ...state, failure: action.failure };
            if (IDENTITY_RESET_CODES.has(action.failure.code)) {
                return resetIdentityPosture(applySupersessionGate(next, action.failure.code));
            }
            return applySupersessionGate(next, action.failure.code);
        }

        // -- Per-action lifecycle --------------------------------------------
        case 'lobbyActionStarted':
            return withActionStatus(state, action.action, loadingActionStatus());

        case 'lobbyActionSucceeded': {
            const next = withActionStatus(state, action.action, idleActionStatus());
            // Seat-granting actions carry the server's transition class;
            // both classifications leave the lobby browser behind.
            if (action.transition !== undefined) {
                return { ...next, viewMode: 'match' };
            }
            return next;
        }

        case 'lobbyActionFailed': {
            const next = withActionStatus(state, action.action, { phase: 'error', error: action.error });
            return applySupersessionGate(next, action.error.code);
        }

        // -- Explicit view transitions -----------------------------------------
        case 'lobbyEnteredMatch':
            return {
                ...state,
                viewMode: 'match',
                ...(action.matchId !== null ? { activeMatchId: action.matchId } : {}),
            };

        case 'lobbyReturned':
            return {
                ...state,
                viewMode: 'lobby',
                activeMatchId: null,
                actions: { ...state.actions, leaveMatch: idleActionStatus() },
            };

        // -- User acknowledgements ---------------------------------------------
        case 'lobbySupersededAcknowledged':
            return { ...state, superseded: false };

        case 'lobbyRetryRequested':
            return { ...state, failure: null };
    }
}
