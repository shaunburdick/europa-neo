/**
 * E2E demo runtime — Feature 005 (T052/T060 harness).
 *
 * @internal Package-internal test scaffolding. Mounted by `main.tsx`
 * ONLY when the page URL carries an `e2e` query parameter. It boots
 * the full interactive pipeline — store → input controllers → order
 * bridge → fake client — against the deterministic demo view, so
 * Playwright specs can drive real pointer/keyboard gestures and read
 * the captured wire orders back through `window.__europaE2E`.
 *
 * Why a fake client: feature 004 ships no browser-side client runtime,
 * so a host-injected factory is required in production (see
 * `src/net/client.ts`). The E2E harness is its own host, injecting a
 * recording fake. This file is excluded from coverage and never
 * imported outside main.tsx's e2e branch.
 *
 * Deterministic: no randomness; the only clock reads are the store's
 * sanctioned `performance.now()` boundary.
 */

import type { JSX } from 'react';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../render/App';
import { createOrderBridge } from '../state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../state/store';
import type { ReducerEffect } from '../state/types';
import { FakeMatchClient } from './fake-match-client';
import { createDemoPlayerView, createStubConsoleState } from './test-state';

/** The window-global handle Playwright specs read. */
export interface EuropaE2EHandle {
  /** Orders captured by the fake client, in send order. */
  readonly orders: FakeMatchClient['sent'];
  /** The live store (for state assertions). */
  readonly store: ConsoleStore;
}

declare global {
  interface Window {
    __europaE2E?: EuropaE2EHandle;
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
 * Mount the interactive E2E console into `root`.
 *
 * The store ↔ bridge wiring has a circular construction dependency
 * (the store takes the bridge as its effect sink; the bridge takes
 * the store). Resolved with a forwarding slot assigned once both
 * exist — effects cannot fire before the first dispatch, which only
 * happens after mount.
 *
 * @param root The DOM mount node (index.html's `#root`).
 */
export function mountDemoRuntime(root: HTMLElement): void {
  const client = new FakeMatchClient();
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const view = createDemoPlayerView();
  const store = createConsoleStore(createStubConsoleState(view), (effect) => {
    forward?.(effect);
  });
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);

  window.__europaE2E = { orders: client.sent, store };

  createRoot(root).render(
    <StrictMode>
      <StoreApp store={store} />
    </StrictMode>,
  );
}
