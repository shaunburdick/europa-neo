/**
 * Lobby controller — feature 010 (T-014).
 *
 * The effects layer between the browser lobby transport
 * (`../net/ws-lobby-client` — T-012) and the lobby application state
 * (`./lobby-state`). Structural sibling of the match side's order
 * bridge (`./order-actions.ts`), running BESIDE the match store without
 * touching it. Two directions:
 *
 *   1. Inbound: subscribes to the transport's state/identity/snapshot/
 *      error streams and dispatches {@link LobbyAction}s into the bound
 *      {@link LobbyStore}.
 *   2. Outbound: exposes promise-based commands (`setHandle`,
 *      `createMatch`, `joinMatch`, `spectateMatch`, `leaveMatch`,
 *      `connect`, `retry`, …) that mark the per-action slot `'loading'`,
 *      await the transport's correlated promise, and translate the
 *      outcome into settled events. Commands NEVER throw — they resolve
 *      to a {@link LobbyCommandResult}; the authoritative loading/error
 *      state lives in the store (FR-018: recoverable failures are
 *      values), so UI can render purely from state while callers that
 *      want the outcome synchronously can read it from the result.
 *
 * Why commands instead of reducer-emitted effects: lobby actions need
 * per-action correlation (WHICH action's promise settled) that promise
 * settlement models naturally; an effect-sink round-trip would add a
 * correlation table without adding capability. The reducer stays pure;
 * this module is the sanctioned side-effect boundary.
 *
 * Identity projection: the directed `identity` event carries the
 * server-resolved player ID for correlation and the display handle. This
 * controller currently dispatches only the handle because that is all the
 * lobby state projection requires; IDs are non-secret and may be carried or
 * displayed where useful. Bearer resume credentials remain protected, and
 * the server remains authoritative for identity and seat resolution.
 */

import type { LobbySnapshot } from '@europa/matchmaking';
import type { LobbyMatchSettings } from '@europa/networking';

import { LobbyActionRejectedError, type LobbyErrorReport, type WsLobbyClient } from '../net/ws-lobby-client';
import type { LobbyAction, LobbyActionError, LobbyActionKind } from './lobby-state';
import { createLobbyStore, type LobbyStore } from './lobby-store';
import type { MatchId } from './types';

// ----------------------------------------------------------------------------
// Transport surface (consume the typed client — never re-project wire shapes)
// ----------------------------------------------------------------------------

/**
 * The transport surface the controller needs: a structural subset of
 * the shipped {@link WsLobbyClient}. Production passes a real
 * `createWsLobbyClient(...)` result; tests inject fakes implementing
 * exactly these members (and nothing more).
 */
export type LobbyTransport = Pick<
    WsLobbyClient,
    | 'connect'
    | 'disconnect'
    | 'forgetIdentity'
    | 'setHandle'
    | 'createMatch'
    | 'joinMatch'
    | 'spectateMatch'
    | 'leaveMatch'
    | 'state'
    | 'onStateChange'
    | 'onIdentity'
    | 'onSnapshot'
    | 'onError'
>;

/** Arguments for {@link createLobbyController}. */
export interface LobbyControllerArgs {
    /** The lobby transport (see {@link LobbyTransport}). */
    readonly transport: LobbyTransport;
    /** WebSocket URL of the lobby-enabled server (never contains secrets). */
    readonly url: string;
}

// ----------------------------------------------------------------------------
// Command results
// ----------------------------------------------------------------------------

/**
 * Successful command outcome. `transition` carries the server's
 * seat-grant classification for seat-granting commands
 * (`createMatch`/`joinMatch`/`spectateMatch`) and `null` for every
 * other command.
 */
export interface LobbyCommandSuccess {
    readonly ok: true;
    readonly transition: 'waiting' | 'match' | null;
}

/** Failed command outcome; the full error is already recorded in the store's per-action slot. */
export interface LobbyCommandFailure {
    readonly ok: false;
    readonly error: LobbyActionError;
}

/** Result envelope for every controller command (never throws). */
export type LobbyCommandResult = LobbyCommandSuccess | LobbyCommandFailure;

// ----------------------------------------------------------------------------
// Controller handle
// ----------------------------------------------------------------------------

/**
 * The headless lobby API T-015's landing UI consumes. Render from
 * `store` (e.g. `useSyncExternalStore(store.subscribe, store.getState)`),
 * act through the commands.
 */
export interface LobbyController {
    /** The bound lobby store (single source of rendered truth). */
    readonly store: LobbyStore;
    /**
     * Open the lobby connection (full establish cycle: hello → identity
     * claim → subscribe → baseline). No-op while already
     * connecting/reconnecting/ready. A dead FIRST attempt resolves to
     * `{ ok: false }`; with auto-retry enabled the transport keeps its
     * own backoff loop going — connection truth is always in the store.
     */
    connect(): Promise<LobbyCommandResult>;
    /** Close explicitly (cancels retry loops; the persisted claim survives). */
    disconnect(): void;
    /** Forget the persisted identity claim; the next connect mints fresh. */
    forgetIdentity(): void;
    /** Claim or rename the display handle (FR-004/FR-005). */
    setHandle(handle: string): Promise<LobbyCommandResult>;
    /** Create a public match; the creator's seat is reserved (FR-008/FR-009). */
    createMatch(settings?: Partial<LobbyMatchSettings>): Promise<LobbyCommandResult>;
    /** Join a listed waiting match by id (atomic, FR-010). */
    joinMatch(matchId: MatchId): Promise<LobbyCommandResult>;
    /** Attach read-only to a running public match (FR-012). */
    spectateMatch(matchId: MatchId): Promise<LobbyCommandResult>;
    /** Release the match association and return to the lobby view (identity intact). */
    leaveMatch(): Promise<LobbyCommandResult>;
    /**
     * Explicit user retry after a failed/disconnected terminal state:
     * clears the failure banner optimistically and re-runs the establish
     * cycle against the original URL. No-op while connected/connecting.
     */
    retry(): Promise<LobbyCommandResult>;
    /** Acknowledge the superseded-session notice (clears the flag). */
    acknowledgeSuperseded(): void;
    /** Unsubscribe all transport bindings. Idempotent; the store survives. */
    dispose(): void;
}

// ----------------------------------------------------------------------------
// Implementation
// ----------------------------------------------------------------------------

/**
 * Normalize any thrown command error into a {@link LobbyActionError}.
 * Server rejections carry their wire code + sanitized message + detail;
 * correlation timeouts map to `'timeout'`; everything else (socket died
 * mid-request, send threw) maps to `'transport'`.
 *
 * @param error The thrown value (unknown — promise rejections are untyped).
 */
function toActionError(error: unknown): LobbyActionError {
    if (error instanceof LobbyActionRejectedError) {
        return { code: error.code, message: error.message, detail: error.detail };
    }
    const message = error instanceof Error ? error.message : 'Unknown lobby transport failure';
    // Narrow the timeout class structurally (its `name` is stable) rather
    // than importing the class for instanceof — keeps this helper light.
    if (error instanceof Error && error.name === 'LobbyTimeoutError') {
        return { code: 'timeout', message, detail: null };
    }
    return { code: 'transport', message, detail: null };
}

/** Build the success envelope for a non-seat-granting command. */
const NO_TRANSITION_SUCCESS: LobbyCommandSuccess = { ok: true, transition: null };

/**
 * Create the lobby controller: bind the transport's streams to a fresh
 * {@link LobbyStore} and return the command surface.
 *
 * @param args See {@link LobbyControllerArgs}.
 */
export function createLobbyController(args: LobbyControllerArgs): LobbyController {
    const { transport, url } = args;
    const store: LobbyStore = createLobbyStore();

    const unsubscribers: Array<() => void> = [];
    let disposed = false;

    /** Record one unsubscriber — or run it immediately when already disposed. */
    function track(unsubscribe: () => void): void {
        if (disposed) {
            unsubscribe();
            return;
        }
        unsubscribers.push(unsubscribe);
    }

    // -- Inbound: transport → store ----------------------------------------------

    track(
        transport.onStateChange((connection) => {
            store.dispatch({ kind: 'lobbyConnectionChanged', connection });
        }),
    );

    track(
        transport.onIdentity((identity) => {
            // The server-resolved ID is correlation data. This projection
            // currently needs only the display handle; bearer credentials
            // remain confined to the transport/storage boundary.
            store.dispatch({ kind: 'lobbyIdentityResolved', handle: identity.handle });
        }),
    );

    track(
        transport.onSnapshot((snapshot: LobbySnapshot) => {
            store.dispatch({ kind: 'lobbySnapshotApplied', snapshot });
        }),
    );

    track(
        transport.onError((report: LobbyErrorReport) => {
            // Uncorrelated server error (no actionId echo): session-level
            // failure. Correlated ones settle their command below instead.
            store.dispatch({
                kind: 'lobbyFailureReported',
                failure: { source: 'server', code: report.code, message: report.message, detail: report.detail },
            });
        }),
    );

    // Sync the store with the transport's current lifecycle (usually
    // 'idle'; a no-op publish when it already matches).
    store.dispatch({ kind: 'lobbyConnectionChanged', connection: transport.state().connection });

    // -- Outbound: shared command runners -----------------------------------------

    /** Whether an establish cycle is currently owned by the transport. */
    function establishInFlight(): boolean {
        const current = transport.state().connection;
        return current === 'connecting' || current === 'reconnecting' || current === 'ready';
    }

    /**
     * Shared establish runner for `connect`/`retry`. Resolves
     * `{ ok: false }` when THIS attempt died; the transport's own retry
     * loop (if enabled) keeps running independently — the store's
     * connection/failure fields remain the rendered truth.
     *
     * @param clearBanner Dispatch the optimistic failure-banner clear
     *   first (user-actuated retry), vs a programmatic initial connect.
     */
    async function establish(clearBanner: boolean): Promise<LobbyCommandResult> {
        if (establishInFlight()) {
            return NO_TRANSITION_SUCCESS;
        }
        if (clearBanner) {
            store.dispatch({ kind: 'lobbyRetryRequested' });
        }
        try {
            await transport.connect(url);
            return NO_TRANSITION_SUCCESS;
        } catch (error: unknown) {
            return { ok: false, error: toActionError(error) };
        }
    }

    /**
     * Run one mutating command end-to-end: mark the slot `'loading'`,
     * await the correlated transport promise, settle the slot. Never
     * throws — failures land in both the result and the store slot.
     *
     * @param kind Store slot of the action.
     * @param run The transport call (already bound to its arguments).
     * @param onSettled Extra transition dispatched after the success
     *   settlement (`null` for none).
     */
    async function runCommand(
        kind: LobbyActionKind,
        run: () => Promise<void>,
        onSettled: LobbyAction | null,
    ): Promise<LobbyCommandResult> {
        store.dispatch({ kind: 'lobbyActionStarted', action: kind });
        try {
            await run();
            store.dispatch({ kind: 'lobbyActionSucceeded', action: kind });
            if (onSettled !== null) {
                store.dispatch(onSettled);
            }
            return NO_TRANSITION_SUCCESS;
        } catch (error: unknown) {
            const actionError = toActionError(error);
            store.dispatch({ kind: 'lobbyActionFailed', action: kind, error: actionError });
            return { ok: false, error: actionError };
        }
    }

    /**
     * Run one seat-granting command (create/join/spectate): like
     * {@link runCommand}, but the success dispatch carries the server's
     * `waiting`/`match` transition classification — which flips the view
     * into the match context — and an eagerly-known match id is pinned
     * via `lobbyEnteredMatch` (the next snapshot re-confirms it).
     *
     * @param kind Store slot of the action.
     * @param run The transport call.
     * @param knownMatchId Match id to pin eagerly; `null` when unknown
     *   (create flow — the snapshot supplies it).
     */
    async function runSeatCommand(
        kind: Extract<LobbyActionKind, 'createMatch' | 'joinMatch' | 'spectateMatch'>,
        run: () => Promise<'waiting' | 'match'>,
        knownMatchId: MatchId | null,
    ): Promise<LobbyCommandResult> {
        store.dispatch({ kind: 'lobbyActionStarted', action: kind });
        try {
            const transition = await run();
            store.dispatch({ kind: 'lobbyActionSucceeded', action: kind, transition });
            if (knownMatchId !== null) {
                store.dispatch({ kind: 'lobbyEnteredMatch', matchId: knownMatchId });
            }
            return { ok: true, transition };
        } catch (error: unknown) {
            const actionError = toActionError(error);
            store.dispatch({ kind: 'lobbyActionFailed', action: kind, error: actionError });
            return { ok: false, error: actionError };
        }
    }

    const controller: LobbyController = {
        store,

        connect(): Promise<LobbyCommandResult> {
            return establish(false);
        },

        disconnect(): void {
            transport.disconnect();
        },

        forgetIdentity(): void {
            transport.forgetIdentity();
        },

        setHandle(handle: string): Promise<LobbyCommandResult> {
            // The transport settles renames on the DIRECTED identity event
            // alone (T-012 ruling), so by the time this resolves the
            // controller's identity binding has already updated `handle`
            // in the store. No view transition follows a rename.
            return runCommand(
                'setHandle',
                async () => {
                    await transport.setHandle(handle);
                },
                null,
            );
        },

        createMatch(settings?: Partial<LobbyMatchSettings>): Promise<LobbyCommandResult> {
            // Creator's match id is unknown until the next snapshot pins
            // `activeMatchId` — no eager id to record here.
            return runSeatCommand('createMatch', () => transport.createMatch(settings), null);
        },

        joinMatch(matchId: MatchId): Promise<LobbyCommandResult> {
            return runSeatCommand('joinMatch', () => transport.joinMatch(matchId), matchId);
        },

        spectateMatch(matchId: MatchId): Promise<LobbyCommandResult> {
            return runSeatCommand('spectateMatch', () => transport.spectateMatch(matchId), matchId);
        },

        leaveMatch(): Promise<LobbyCommandResult> {
            // Success dispatches `lobbyReturned` INSTEAD of the plain
            // succeeded event: the reducer's returned-arm implies the
            // leave slot's success while also flipping the view back to
            // the lobby with the identity intact.
            return runCommand(
                'leaveMatch',
                async () => {
                    await transport.leaveMatch();
                },
                { kind: 'lobbyReturned' },
            );
        },

        retry(): Promise<LobbyCommandResult> {
            return establish(true);
        },

        acknowledgeSuperseded(): void {
            store.dispatch({ kind: 'lobbySupersededAcknowledged' });
        },

        dispose(): void {
            disposed = true;
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
            unsubscribers.length = 0;
        },
    };

    return controller;
}
