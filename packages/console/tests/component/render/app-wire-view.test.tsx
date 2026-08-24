/**
 * Component tests — wire-view rehydration end-to-end (live-wire defect
 * fix, both user-visible symptoms).
 *
 * Boots the FULL production chain — native-shaped WebSocket frames →
 * `WsMatchClient` decode → console adapter → order bridge → real store
 * → mounted `<App>` — with views exactly as they look ON THE WIRE
 * (`pipes` as sorted arrays, the codec's serialization transform).
 *
 * Before the fix these tests crash twice over:
 *   - every pointerdown threw `TypeError: …pipes.has is not a function`
 *     (region-select reading the raw array) — the reported console
 *     error on every board click; and
 *   - the second tick froze the UI: `buildMapView`'s render-path diff
 *     reached `pipesEqual` with arrays and threw during render,
 *     unmounting the tree while the socket stayed open.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { createConsoleClient } from '../../../src/net/client';
import { createWsMatchClient } from '../../../src/net/ws-match-client';
import { App } from '../../../src/render/App';
import { createOrderBridge } from '../../../src/state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import type {
  NetworkPayload,
  ProtocolEnvelope,
  ReducerEffect,
  SequenceNumber,
} from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Scripted server: emits REAL wire JSON (Set-typed fields as arrays)
// ---------------------------------------------------------------------------

/** Server-seq counter for fabricated inbound envelopes. */
let serverSeq = 0;

/**
 * Minimal synchronous WebSocket double recording outbound frames (the
 * same shape as the unit-suite fake, scoped locally so the browser
 * project stays self-contained).
 */
class WireWebSocket {
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.onclose?.({ code: code ?? 1005 });
  }

  /** Deliver one fabricated server envelope as wire JSON. */
  deliver(type: string, payload: Record<string, unknown>): void {
    serverSeq += 1;
    const envelope = {
      type,
      version: '0.1.0',
      seq: serverSeq as SequenceNumber,
      payload,
    } as unknown as ProtocolEnvelope<NetworkPayload>;
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }
}

/**
 * A cell exactly as the wire carries it: `pipes` is the codec's
 * SORTED ARRAY — not a Set. This is the shape that reached consumers
 * unrepaired before the fix.
 */
function wireCell(x: number, y: number, pipes: string[]): Record<string, unknown> {
  return {
    coord: { x, y },
    cell: { x, y, elevation: 60, terrain: 'land' },
    troopCount: 12,
    troopOwner: 1,
    pipes,
    reservesPercent: 0,
    cityOwner: null,
  };
}

/** Minimal PlayerView as serialized on the wire (array pipes inside). */
function wireView(tick: number, cells: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    player: 1,
    tick,
    visibleCells: cells,
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: { boardSize: 32, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
  };
}

// ---------------------------------------------------------------------------
// Boot: production chain up to a mounted App
// ---------------------------------------------------------------------------

interface Boot {
  readonly socket: WireWebSocket;
  readonly store: ConsoleStore;
}

/**
 * Wire FakeSocket → WsMatchClient → adapter → bridge → store → App and
 * complete the hello/join handshake with a wire-shaped join snapshot.
 * Mirrors `internal/live-runtime.tsx` wiring exactly.
 */
async function bootLiveConsole(): Promise<Boot> {
  const socket = new WireWebSocket('ws://wire-component');
  const wsClient = createWsMatchClient({ webSocketFactory: () => socket });
  const client = createConsoleClient(
    { url: 'ws://wire-component', displayName: 'Alice', matchId: 'm-1' as never },
    { matchClientFactory: () => wsClient },
  );
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const store = createConsoleStore(INITIAL_CONSOLE_STATE, (effect) => {
    forward?.(effect);
  });
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => {
    bridge.handleEffect(effect);
  };

  await render(<App store={store} />);

  const connecting = client.connect();
  socket.onopen?.();
  socket.deliver('helloAck', {
    protocolVersion: '0.1.0',
    connectionId: 'c-1',
    heartbeatIntervalMs: 5000,
  });
  await connecting;

  const joining = client.joinMatch();
  // Join snapshot WITH a pipe-bearing cell, wire-shaped (array!).
  socket.deliver('joinAck', {
    sessionToken: 'tok-1',
    playerId: 1,
    view: wireView(1, [wireCell(5, 5, ['E'])]),
    tick: 1,
    players: [],
  });
  await joining;
  return { socket, store };
}

/** Stub the board area's rect so hit-test coordinates are exact. */
function pinBoardGeometry(): HTMLElement {
  const board = document.querySelector('.europa-board-area');
  if (!(board instanceof HTMLElement)) {
    throw new Error('board area not mounted');
  }
  Object.defineProperty(board, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      right: 512,
      bottom: 512,
      width: 512,
      height: 512,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
  return board;
}

/** Screen point at fraction `(fx, fy)` inside cell (cx, cy) at zoom 32. */
function pointInCell(
  cx: number,
  cy: number,
  fx: number,
  fy: number,
): { clientX: number; clientY: number } {
  const zoom = 32;
  return { clientX: Math.round((cx + fx) * zoom), clientY: Math.round((cy + fy) * zoom) };
}

afterEach(() => {
  cleanup();
});

describe('live wire views drive the mounted console (rehydration regression)', () => {
  test('pointerdown on a wire-decoded cell issues the toggle order without crashing', async () => {
    const { socket } = await bootLiveConsole();
    const board = pinBoardGeometry();

    // East half of (5,5): the join snapshot carried pipes ["E"] as an
    // ARRAY. Pre-fix this very line threw `pipes.has is not a function`
    // inside handleDown. Toggle semantics need the rehydrated Set.
    board.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...pointInCell(5, 5, 0.75, 0.5),
        button: 0,
        bubbles: true,
      }),
    );
    await vi.waitFor(() => {
      const orderFrame = socket.sent.find((frame) => frame.includes('"clearPipe"'));
      expect(orderFrame).toBeDefined();
    });
  });

  test('consecutive ticks with pipe-bearing cells keep the app alive (freeze regression)', async () => {
    const { socket } = await bootLiveConsole();
    const board = pinBoardGeometry();

    // Tick 2 then tick 3, same pipe-bearing cell, unchanged scalars —
    // the exact conditions under which the pre-fix render diff reached
    // pipesEqual with raw arrays and threw DURING RENDER, unmounting
    // the tree (the "ticks freeze until refresh" report).
    socket.deliver('tick', {
      tick: 2,
      view: wireView(2, [wireCell(5, 5, ['E'])]),
    });
    socket.deliver('tick', {
      tick: 3,
      view: wireView(3, [wireCell(5, 5, ['E'])]),
    });

    // The tree survived: board still mounted AND interactive — a fresh
    // click on a pipe-free region still issues an order.
    board.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...pointInCell(5, 5, 0.25, 0.5),
        button: 0,
        bubbles: true,
      }),
    );
    await vi.waitFor(() => {
      const orderFrame = socket.sent.find((frame) => frame.includes('"setPipe"'));
      expect(orderFrame).toBeDefined();
    });
    expect(document.querySelector('.europa-board-area')).not.toBeNull();
  });
});
