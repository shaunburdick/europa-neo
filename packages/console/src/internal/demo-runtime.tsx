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
import type {
  NetworkPayload,
  PlayerView,
  ProtocolEnvelope,
  ReducerEffect,
  SequenceNumber,
} from '../state/types';
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
 * Server-behavior echo for the E2E harness: completes the
 * authoritative loop a real feature-004 server runs for reserves
 * orders — an `orderAck` for the submitted seq, then a `tick`
 * broadcasting the view with the applied value. This drives the REAL
 * inbound path (envelope → NetEvent → reducer → MapView diff →
 * transient label) rather than fabricating client-side state.
 *
 * @internal Test scaffolding only (mirrors demo-runtime's constraints).
 */
class ReservesServerEcho {
  private readonly client: FakeMatchClient;

  private outboundSeq = 0;

  constructor(client: FakeMatchClient) {
    this.client = client;
  }

  /** Apply one reducer effect; echoes only reserves orders. */
  handleEffect(effect: ReducerEffect): void {
    if (effect.kind !== 'sendOrder' || effect.order.kind !== 'setReserves') {
      return;
    }
    const seq = this.findSeqFor(effect.actionId);
    if (seq === null) {
      return;
    }
    this.emit({ type: 'orderAck', payload: { seq, result: { ok: true } } });
    const view = applyReserves(
      this.storeRef?.getState().latestView ?? null,
      effect.order.cell,
      effect.order.percent,
    );
    if (view !== null) {
      this.emit({ type: 'tick', payload: { tick: view.tick, view } });
    }
  }

  /** The store is injected post-construction (circular wiring). */
  storeRef: ConsoleStore | null = null;

  /** Find the wire seq the fake adapter assigned to an ActionId. */
  private findSeqFor(actionId: number): SequenceNumber | null {
    for (const [seq, id] of this.client.seqToActionId) {
      if (id === actionId) {
        return seq;
      }
    }
    return null;
  }

  /** Stamp + broadcast one envelope through the fake client. */
  private emit(payloadShape: {
    readonly type: 'orderAck' | 'tick';
    readonly payload: NetworkPayload;
  }): void {
    this.outboundSeq += 1;
    const envelope: ProtocolEnvelope<NetworkPayload> = {
      type: payloadShape.type,
      version: '',
      seq: this.outboundSeq as SequenceNumber,
      payload: payloadShape.payload,
    };
    this.client.emit(envelope);
  }
}

/**
 * Clone a fog view with one cell's reserves updated (the minimal
 * server-side effect of an accepted `setReserves` order). Returns
 * `null` when there is no view yet or the cell is unseen. Pure.
 */
function applyReserves(
  view: PlayerView | null,
  cell: { readonly x: number; readonly y: number },
  percent: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): PlayerView | null {
  if (view === null) {
    return null;
  }
  let touched = false;
  const visibleCells = view.visibleCells.map((cellView) => {
    if (cellView.coord.x === cell.x && cellView.coord.y === cell.y) {
      touched = true;
      return { ...cellView, reservesPercent: percent };
    }
    return cellView;
  });
  if (!touched) {
    return null;
  }
  return { ...view, tick: view.tick + 1, visibleCells };
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
  const echo = new ReservesServerEcho(client);
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const view = createDemoPlayerView();
  const store = createConsoleStore(createStubConsoleState(view), (effect) => {
    forward?.(effect);
  });
  const bridge = createOrderBridge({ client, store });
  echo.storeRef = store;
  forward = (effect) => {
    bridge.handleEffect(effect);
    echo.handleEffect(effect);
  };

  window.__europaE2E = { orders: client.sent, store };

  createRoot(root).render(
    <StrictMode>
      <StoreApp store={store} />
    </StrictMode>,
  );
}
