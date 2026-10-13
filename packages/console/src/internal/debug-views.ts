/**
 * Credential-free debug views for the console's test-only window
 * handles (005 FR-037, 015 FR-019 — PR #189 review remediation).
 *
 * The E2E handles (`window.__europaLobby`, `window.__europaLive`) are
 * assertion surfaces for test suites, not application APIs. Publishing
 * the RAW store or the RAW network adapter publishes bearer
 * credentials alongside them: the lobby state carries
 * `seatSessionToken` (the matchmaking-issued seat bearer), the console
 * state carries `session.sessionToken`, and the adapter answers
 * `sessionToken()` directly. Both FRs forbid test handles from
 * exposing bearer credentials (session, reconnect, seat, or resume
 * secrets), so these builders project each surface down to exactly
 * what the dependent suites read.
 *
 * The projections are ALLOWLISTS: a field a suite needs must be added
 * here deliberately, never inherited by default — a future
 * credential-bearing state field stays invisible until someone names
 * it. Each view reads the live store per call, so polls keep seeing
 * fresh state.
 *
 * Determinism: pure projection — no clocks, no randomness, no I/O.
 */

import type { LobbyConnectionState } from '../net/ws-lobby-client';
import type { LobbyIdentityStatus, LobbyState, LobbyViewMode } from '../state/lobby-state';
import type { ConsoleStore } from '../state/store';
import type {
    ConnectionState,
    ConsoleAction,
    ConsoleClient,
    ConsoleState,
    MatchId,
    PlayerId,
    PlayerView,
} from '../state/types';

// ----------------------------------------------------------------------------
// Lobby handle (`window.__europaLobby`, sentinel-gated production bootstrap)
// ----------------------------------------------------------------------------

/** One match-summary row as the lobby suites read it. */
export interface LobbyMatchDebugView {
    readonly matchId: MatchId;
    readonly status: string;
    readonly seatsFilled: number;
    readonly capacity: number;
}

/**
 * Lobby state projection: the fields the dependent E2E suites
 * (`lobby`, `identity-migration`, `shareable-links`,
 * `spectator-sidebar` + the shared `lobby-page` helper) read through
 * the handle. `seatSessionToken` is deliberately absent.
 */
export interface LobbyStateDebugView {
    readonly viewMode: LobbyViewMode;
    readonly handle: string | null;
    readonly activeMatchId: MatchId | null;
    readonly identityStatus: LobbyIdentityStatus;
    readonly connection: LobbyConnectionState;
    readonly matchVisibility: 'public' | 'private' | null;
    readonly snapshot: { readonly entries: ReadonlyArray<LobbyMatchDebugView> } | null;
}

/** Store surface the lobby suites consume: read-only state. */
export interface LobbyStoreDebugView {
    getState(): LobbyStateDebugView;
}

/** The `window.__europaLobby` handle shape. */
export interface LobbyDebugHandle {
    readonly store: LobbyStoreDebugView;
}

/**
 * Build the credential-free lobby debug handle over a lobby store.
 *
 * @param store The page-lifetime lobby store (read through, never published).
 * @returns The handle safe to install on `window`.
 */
export function lobbyDebugHandle(store: { getState(): LobbyState }): LobbyDebugHandle {
    return {
        store: {
            getState(): LobbyStateDebugView {
                const state = store.getState();
                return {
                    viewMode: state.viewMode,
                    handle: state.handle,
                    activeMatchId: state.activeMatchId,
                    identityStatus: state.identityStatus,
                    connection: state.connection,
                    matchVisibility: state.matchVisibility,
                    snapshot:
                        state.snapshot === null
                            ? null
                            : {
                                  entries: state.snapshot.entries.map((entry) => ({
                                      matchId: entry.matchId,
                                      status: entry.status,
                                      seatsFilled: entry.seatsFilled,
                                      capacity: entry.capacity,
                                  })),
                              },
                };
            },
        },
    };
}

// ----------------------------------------------------------------------------
// Live handle (`window.__europaLive`, direct-match seam)
// ----------------------------------------------------------------------------

/**
 * Console state projection: the fields the direct-match E2E suites
 * (`full-stack`, `full-stack-n-players`, `surrender-game-over`,
 * `waiting-overlay`, `help-overlay`, `zoom-shortcuts`) read through
 * the handle. `session.sessionToken` is deliberately absent;
 * `latestView` and `matchResult` pass through as pure game data.
 */
export interface ConsoleStateDebugView {
    readonly status: ConsoleState['status'];
    readonly latestView: PlayerView | null;
    readonly session: {
        readonly matchId: MatchId | null;
        readonly playerId: PlayerId | null;
        readonly displayName: string;
        readonly playerNames: ReadonlyMap<PlayerId, string>;
    };
    readonly feedback: ReadonlyArray<{ readonly kind: string; readonly text: string }>;
    readonly matchResult: ConsoleState['matchResult'];
}

/** Store surface the live suites consume: state reads + action dispatch. */
export interface ConsoleStoreDebugView {
    getState(): ConsoleStateDebugView;
    dispatch(action: ConsoleAction): void;
}

/** Network surface the live suites consume: the connection status only. */
export interface ConsoleClientDebugView {
    state(): { readonly connection: ConnectionState };
}

/**
 * The `window.__europaLive` handle shape. `bootError` stays mutable —
 * the runtime records boot failures there.
 */
export interface LiveDebugHandle {
    readonly store: ConsoleStoreDebugView;
    readonly client: ConsoleClientDebugView;
    bootError: string | null;
}

/**
 * Build the credential-free live debug handle over a console store +
 * network adapter. Reads both LIVE per call; forwards only the
 * dispatch path the suites drive (reducer actions) and the connection
 * status they poll — never the adapter's bearer accessors.
 *
 * @param store The runtime's console store (read/dispatch through, never published).
 * @param client The runtime's network adapter (connection status only).
 * @returns The handle safe to install on `window`.
 */
export function liveDebugHandle(store: ConsoleStore, client: ConsoleClient): LiveDebugHandle {
    return {
        store: {
            getState(): ConsoleStateDebugView {
                const state = store.getState();
                return {
                    status: state.status,
                    latestView: state.latestView,
                    session: {
                        matchId: state.session.matchId,
                        playerId: state.session.playerId,
                        displayName: state.session.displayName,
                        playerNames: state.session.playerNames,
                    },
                    feedback: state.feedback.map((entry) => ({ kind: entry.kind, text: entry.text })),
                    matchResult: state.matchResult,
                };
            },
            dispatch: (action: ConsoleAction): void => {
                store.dispatch(action);
            },
        },
        client: {
            state: () => ({ connection: client.state().connection }),
        },
        bootError: null,
    };
}
