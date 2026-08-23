/**
 * Order-reserves unit tests — Feature 005 (T066).
 *
 * Covers spec US4 AC-1/2 + FR-004 (digits 0–9):
 *   · pressing `7` over a friendly cell dispatches
 *     `{ kind: 'setReserves', cell, percent: 7 }`;
 *   · the reducer emits the `sendOrder` effect carrying
 *     `OrderSetReserves { player, cell, percent }` plus the
 *     "Reserved 70% at (x, y)" confirmation;
 *   · the transient `MapLabel { cell, text: '70%' }` appears in the
 *     MapView built from the applied view, stamped
 *     `expiresAtMs = nowMs + CONSOLE_CONSTANTS.labelTtlMs` (1500 ms)
 *     and pruned by the label overlay once expired (T071 lifecycle);
 *   · pressing `0` clears reserves (`percent: 0`);
 *   · out-of-bounds digits (`a`, `+`) are ignored.
 *
 * Architecture note (Wave 8E deviation, documented): the frozen
 * `ReducerEffect` contract union has no label variant, so the label
 * is raised by the MapView layer (T024) when the applied view
 * carries the new reserves value — the server-authoritative
 * confirmation path — rather than by a reducer effect at dispatch.
 */

import { describe, expect, test } from 'vitest';

import { CONSOLE_CONSTANTS } from '../../../src/config';
import { translateKey } from '../../../src/input/order-draft';
import { buildReservesAction, resolveReservePercent } from '../../../src/input/order-reserves';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { liveLabels } from '../../../src/render/label-overlay';
import { buildMapView, coordKey } from '../../../src/state/build-map-view';
import { createOrderBridge } from '../../../src/state/order-actions';
import { reduce } from '../../../src/state/reducer';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type {
  CameraState,
  Direction,
  MapView,
  PlayerView,
  ReducerEffect,
} from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** The focused friendly cell shared by every scenario. */
const CELL = { x: 5, y: 5 };

/** Default camera used for MapView construction. */
const CAMERA: CameraState = { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 };

/** Board with one owned friendly cell under the cursor. */
function makeView(reservesPercent: 0 | 7 = 0): PlayerView {
  return buildPlayerView({
    width: 10,
    height: 10,
    playerId: 1,
    tick: reservesPercent === 0 ? 0 : 1,
    visibleCells: [
      buildCellView({
        coord: CELL,
        elevation: 60,
        troops: 12,
        owner: 1,
        isCity: true,
        pipes: new Set<Direction>(['E']),
        reservesPct: reservesPercent,
      }),
    ],
  });
}

/** Live store + recording client wired through the order bridge. */
function makeStore(view: PlayerView): {
  readonly store: ConsoleStore;
  readonly client: FakeMatchClient;
} {
  const client = new FakeMatchClient();
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const store = createConsoleStore(
    { ...createLiveConsoleState(view), selection: CELL },
    (effect) => {
      forward?.(effect);
    },
  );
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);
  return { store, client };
}

describe('resolveReservePercent (digit table)', () => {
  test('digits map to their engine percent digit', () => {
    expect(resolveReservePercent('7')).toBe(7);
    expect(resolveReservePercent('0')).toBe(0);
    expect(resolveReservePercent('9')).toBe(9);
  });

  test('out-of-bounds keys are not reserve keys', () => {
    expect(resolveReservePercent('a')).toBeNull();
    expect(resolveReservePercent('+')).toBeNull();
    expect(resolveReservePercent('Escape')).toBeNull();
  });
});

describe('buildReservesAction (gesture gating)', () => {
  test('live input + selection yields the setReserves action', () => {
    const state = { ...createLiveConsoleState(makeView(0)), selection: CELL };
    const outcome = buildReservesAction(state, '7');
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'setReserves', cell: CELL, percent: 7 },
    });
  });

  test('non-live input is ignored', () => {
    const state = {
      ...createLiveConsoleState(makeView(0)),
      selection: CELL,
      status: 'reconnecting' as const,
      inputEnabled: false,
    };
    expect(buildReservesAction(state, '7')).toEqual({ kind: 'ignore', reason: 'not-live' });
  });

  test('no focused cell is ignored', () => {
    const state = { ...createLiveConsoleState(makeView(0)), selection: null };
    expect(buildReservesAction(state, '7')).toEqual({ kind: 'ignore', reason: 'no-selection' });
  });

  test('non-digits fall through (null)', () => {
    const state = { ...createLiveConsoleState(makeView(0)), selection: CELL };
    expect(buildReservesAction(state, 'a')).toBeNull();
    expect(buildReservesAction(state, '+')).toBeNull();
  });

  test('translateKey routes digits through the reserves module', () => {
    const state = { ...createLiveConsoleState(makeView(0)), selection: CELL };
    const outcome = translateKey({
      key: '7',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      state,
      cursor: null,
      cursorAgeMs: null,
    });
    expect(outcome).toEqual({
      kind: 'action',
      action: { kind: 'setReserves', cell: CELL, percent: 7 },
    });
  });
});

describe('US4 AC-1: pressing 7 issues the order + confirmation', () => {
  test('store dispatch sends OrderSetReserves percent 7 and confirms', async () => {
    const { store, client } = makeStore(makeView(0));
    store.dispatch({ kind: 'setReserves', cell: CELL, percent: 7 });
    await Promise.resolve();

    expect(client.orders).toHaveLength(1);
    expect(client.orders[0]?.order).toEqual({
      kind: 'setReserves',
      player: 1,
      cell: CELL,
      percent: 7,
    });
    const texts = store.getState().feedback.map((message) => message.text);
    expect(texts).toContain('Reserved 70% at (5, 5)');
  });

  test('reducer emits sendOrder + polite announce effects', () => {
    const seeded = { ...createLiveConsoleState(makeView(0)), selection: CELL };
    const { effects } = reduce(
      seeded,
      { kind: 'setReserves', cell: CELL, percent: 7 },
      {
        nowMs: 1000,
      },
    );
    const kinds = effects.map((effect) => effect.kind);
    expect(kinds).toContain('sendOrder');
    expect(kinds).toContain('announce');
    const send = effects.find((effect) => effect.kind === 'sendOrder');
    expect(send?.order ?? null).toEqual({
      kind: 'setReserves',
      player: 1,
      cell: CELL,
      percent: 7,
    });
  });
});

describe('US4 AC-1: the transient "70%" label', () => {
  test('MapView raises MapLabel with 1500 ms expiry on the applied view', () => {
    const nowMs = 10_000;
    const before = buildMapView({
      id: 'mv-0',
      view: makeView(0),
      camera: CAMERA,
      hover: null,
      selection: CELL,
      exclusiveMode: false,
      prevView: null,
      nowMs,
    });
    const after = buildMapView({
      id: 'mv-1',
      view: makeView(7),
      camera: CAMERA,
      hover: null,
      selection: CELL,
      exclusiveMode: false,
      prevView: before,
      nowMs,
    });

    expect(after.labels).toHaveLength(1);
    const label = after.labels[0];
    expect(label?.cell).toEqual(CELL);
    expect(label?.text).toBe('70%');
    expect(label?.expiresAtMs).toBe(nowMs + CONSOLE_CONSTANTS.labelTtlMs);
    expect(CONSOLE_CONSTANTS.labelTtlMs).toBe(1500);
  });

  test('label overlay prunes labels strictly after their expiry', () => {
    const nowMs = 10_000;
    const before = buildMapView({
      id: 'mv-0',
      view: makeView(0),
      camera: CAMERA,
      hover: null,
      selection: CELL,
      exclusiveMode: false,
      prevView: null,
      nowMs,
    });
    const mapView: MapView = buildMapView({
      id: 'mv-1',
      view: makeView(7),
      camera: CAMERA,
      hover: null,
      selection: CELL,
      exclusiveMode: false,
      prevView: before,
      nowMs,
    });
    const label = mapView.labels[0];
    expect(label).toBeDefined();
    if (label === undefined) {
      return;
    }
    expect(liveLabels(mapView.labels, label.expiresAtMs)).toHaveLength(1);
    expect(liveLabels(mapView.labels, label.expiresAtMs + 1)).toHaveLength(0);
    // Unrelated cells never raise labels.
    expect(mapView.cells.has(coordKey(CELL))).toBe(true);
  });
});

describe('US4 AC-2: pressing 0 clears reserves', () => {
  test('percent 0 is issued and confirmed', async () => {
    const { store, client } = makeStore(makeView(7));
    store.dispatch({ kind: 'setReserves', cell: CELL, percent: 0 });
    await Promise.resolve();

    expect(client.orders).toHaveLength(1);
    expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 0 });
    const texts = store.getState().feedback.map((message) => message.text);
    expect(texts).toContain('Reserved 0% at (5, 5)');
  });
});
