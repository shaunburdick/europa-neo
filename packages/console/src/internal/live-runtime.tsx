/**
 * Live full-stack runtime — Integration wave harness.
 *
 * @internal Package-internal integration scaffolding. Mounted by
 * `main.tsx` ONLY when the page URL carries a `live` query parameter.
 * Unlike {@link ./demo-runtime} (which injects a recording fake), this
 * boots the REAL production path end-to-end:
 *
 *   store → order bridge → ConsoleClient adapter →
 *   WsMatchClient (native WebSocket, networking's wire codec) →
 *   live createMatchServer → matchmaking-bound engine/terrain/fog
 *
 * Query parameters (all required except `token`):
 *   - `ws`    WebSocket URL of the match server (e.g. ws://host:port)
 *   - `match` MatchId to join
 *   - `name`  Display name for the seat claim
 *   - `token` Optional reconnect token (rejoin path)
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
  }
}

/**
 * Root component binding the live store to {@link App}.
 */
function StoreApp({ store }: { readonly store: ConsoleStore }): JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return <App store={store} state={state} />;
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
  const params = new URLSearchParams(window.location.search);
  const url = params.get('ws');
  const matchId = params.get('match');
  const displayName = params.get('name') ?? '';
  const token = params.get('token');

  if (url === null || matchId === null) {
    // No store to surface feedback through yet; expose the reason on
    // the handle so drivers fail with a diagnostic instead of hanging.
    window.__europaLive = {
      store: undefined as unknown as ConsoleStore,
      client: undefined as unknown as ConsoleClient,
      bootError: 'live runtime requires ?ws=<url>&match=<id> query parameters',
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
      url,
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
    if (
      current === 'disconnected' &&
      (lastConnection === 'joined' || lastConnection === 'rejoined')
    ) {
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
