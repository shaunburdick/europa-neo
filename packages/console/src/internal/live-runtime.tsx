/**
 * Live full-stack runtime — Integration wave harness.
 *
 * @internal Package-internal integration scaffolding for the legacy full-stack
 * test seam. It is not mounted by the production bootstrap; semantic routing
 * owns production entry, while `?e2e` remains the separate demo harness.
 * Unlike {@link ./demo-runtime} (which injects a recording fake), this
 * boots the REAL production path end-to-end:
 *
 *   store → order bridge → ConsoleClient adapter →
 *   WsMatchClient (native WebSocket, networking's wire codec) →
 *   live createMatchServer → matchmaking-bound engine/terrain/fog
 *
 * The direct-match seam (`window.__europaTestMatch`, set by test
 * infrastructure before load) is the ONLY input: wsUrl, matchId,
 * displayName, and optional reconnectToken all come from the seam
 * object. The former query seam (the `live`, `match`, `name`, and
 * `token` parameters) is retired (013 FR-025/FR-035): a bearer token
 * in a URL is prohibited (013 FR-016), and a query-driven boot without
 * the seam fails loudly instead of mounting.
 *
 * Playwright specs drive orders and read state through the
 * `window.__europaLive` handle exposed here.
 *
 * Deterministic: no randomness; clocks only at sanctioned UI
 * boundaries (store dispatch defaults).
 */

import type { JSX } from 'react';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createConsoleClient } from '../net/client';
import { createWsMatchClient } from '../net/ws-match-client';
import { App } from '../render/App';
import { LobbyServerUrlError, resolveLobbyServerUrl } from '../state/lobby-view';
import { createOrderBridge } from '../state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import { type ConsoleStore, createConsoleStore } from '../state/store';
import type { ConsoleClient, MatchId, ReducerEffect, SessionToken } from '../state/types';

/** The window-global handle Playwright full-stack specs read. */
export interface EuropaLiveHandle {
    /** The live store (state assertions + programmatic order dispatch). */
    readonly store: ConsoleStore;
    /** The network adapter (transport diagnostics). */
    readonly client: ConsoleClient;
    /** Set when boot failed (bad params / connect / join rejection). */
    bootError: string | null;
}

declare global {
    interface Window {
        __europaLive?: EuropaLiveHandle;
        __europaTestMatch?: {
            readonly wsUrl: string;
            readonly matchId: string;
            readonly displayName: string;
            readonly reconnectToken?: string;
        };
    }
}

/**
 * Root component binding the live store to {@link App}.
 *
 * The `onReturnToLobby` stub enables the GameOverModal to render in
 * E2E tests (the modal requires a non-undefined callback). The stub
 * is never invoked — tests assert the modal's presence via the store
 * state, not the navigation.
 */
function StoreApp({ store }: { readonly store: ConsoleStore }): JSX.Element {
    const state = useSyncExternalStore(store.subscribe, store.getState);
    return <App store={store} state={state} onReturnToLobby={noopReturnToLobby} />;
}

/** No-op return-to-lobby callback for E2E test harness. */
function noopReturnToLobby(): void {
    // Intentional no-op: tests assert modal presence via store state.
}

/**
 * Mount the live full-stack console into `root`.
 *
 * Boot is async internally (connect → join) but mounting is sync: the
 * UI renders immediately in `connecting` status while the handshake
 * completes; failures land in {@link EuropaLiveHandle.bootError}.
 *
 * @param root The DOM mount node (index.html's `#root`).
 */
export function mountLiveRuntime(root: HTMLElement): void {
    const seam = window.__europaTestMatch;
    if (seam === undefined) {
        // The seam object is the only supported input (013 FR-025:
        // query consumption retired). A query-driven boot without the
        // seam fails loudly on the handle instead of mounting.
        window.__europaLive = {
            store: undefined as unknown as ConsoleStore,
            client: undefined as unknown as ConsoleClient,
            bootError: 'live runtime requires the window.__europaTestMatch seam',
        };
        return;
    }
    const matchId = seam.matchId;
    const displayName = seam.displayName;
    const token = seam.reconnectToken;

    if (matchId === '') {
        // No store to surface feedback through yet; expose the reason on
        // the handle so drivers fail with a diagnostic instead of hanging.
        window.__europaLive = {
            store: undefined as unknown as ConsoleStore,
            client: undefined as unknown as ConsoleClient,
            bootError: 'live runtime requires a match identifier',
        };
        return;
    }

    let safeUrl: string;
    try {
        // Single-port (011): the seam carries the transport; an empty
        // wsUrl falls back to the same-origin default. The legacy query
        // parameters are retired (013 FR-025) — this entry reads NO
        // query, so no token-bearing query can reach it (FR-016).
        safeUrl = seam.wsUrl !== '' ? seam.wsUrl : resolveLobbyServerUrl('', window.location);
    } catch (error: unknown) {
        const message = error instanceof LobbyServerUrlError ? error.message : 'The WebSocket server URL is invalid.';
        window.__europaLive = {
            store: undefined as unknown as ConsoleStore,
            client: undefined as unknown as ConsoleClient,
            bootError: message,
        };
        return;
    }

    // Circular wiring (store ↔ bridge) resolved with a forwarding slot,
    // same pattern as demo-runtime: effects cannot fire before the first
    // dispatch, which happens after both exist.
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(INITIAL_CONSOLE_STATE, (effect) => {
        forward?.(effect);
    });
    store.dispatch({ kind: 'connecting', matchId: matchId as MatchId });

    // Build the real browser client up front and inject it as the
    // adapter's factory so the runtime can observe transport-loss
    // transitions (the wire has no "socket closed" envelope; the
    // reducer's socketClosed branch drives the reconnecting banner).
    const wsClient = createWsMatchClient({ verboseLogging: false });
    const client = createConsoleClient(
        {
            url: safeUrl,
            displayName,
            matchId: matchId as MatchId,
            ...(token === null ? {} : { reconnectToken: token as SessionToken }),
        },
        { matchClientFactory: () => wsClient },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => {
        bridge.handleEffect(effect);
    };

    let lastConnection = wsClient.state().connection;
    wsClient.onConnectionChanged((current) => {
        if (current === 'disconnected' && (lastConnection === 'joined' || lastConnection === 'rejoined')) {
            store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        }
        lastConnection = current;
    });

    window.__europaLive = { store, client, bootError: null };

    const boot = async (): Promise<void> => {
        try {
            await client.connect();
            await client.joinMatch();
        } catch (error: unknown) {
            const handle = window.__europaLive;
            if (handle !== undefined) {
                handle.bootError = error instanceof Error ? error.message : String(error);
            }
        }
    };
    void boot();

    createRoot(root).render(
        <StrictMode>
            <StoreApp store={store} />
        </StrictMode>,
    );
}
