/**
 * Hotkeys unit tests — Feature 005 (T072).
 *
 * Covers Q-U10 (every default key is bound; every binding is unique)
 * + Q-A05 + the override mechanism:
 *   · every key in `DEFAULT_INPUT_MAPPING` resolves to a non-null
 *     `HotkeyId` in `buildHotkeyTable`;
 *   · no two bindings share the same key string
 *     (`findHotkeyCollisions` empty; Alt chords count as their own
 *     keys);
 *   · `ConsoleConfig.inputMapping` replaces the default per-binding
 *     (a custom table reroutes paratroop to another key);
 *   · the controller dispatches through the configured table and
 *     respects input gating.
 */

import { describe, expect, test, vi } from 'vitest';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import {
  buildHotkeyTable,
  findHotkeyCollisions,
  HotkeyController,
  resolveInputMapping,
} from '../../../src/qol/hotkeys';
import { createOrderBridge } from '../../../src/state/order-actions';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { Direction, InputMapping, ReducerEffect } from '../../../src/state/types';
import { DEFAULT_INPUT_MAPPING } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** Every key string the default mapping binds (single chars + chords). */
function defaultBoundKeys(): readonly string[] {
  const m = DEFAULT_INPUT_MAPPING;
  return [
    m.pipeKeys.pipeNorth,
    m.pipeKeys.pipeWest,
    m.pipeKeys.pipeSouth,
    m.pipeKeys.pipeEast,
    ...Object.values(m.pipeExclusiveKeys),
    m.clearCellPipes,
    m.paratroopPrimary,
    m.paratroopAlt,
    m.gunPrimary,
    m.gunAlt,
    ...m.reserveKeys,
    m.cancel,
    m.selectionMove.north,
    m.selectionMove.west,
    m.selectionMove.south,
    m.selectionMove.east,
  ];
}

describe('buildHotkeyTable (Q-U10)', () => {
  test('every default key is bound to a non-null handler id', () => {
    const table = buildHotkeyTable(DEFAULT_INPUT_MAPPING);
    for (const key of defaultBoundKeys()) {
      expect(table.has(key.toLowerCase()) || table.has(key), `key ${key}`).toBe(true);
      const id = table.get(key.toLowerCase()) ?? table.get(key);
      expect(id).toBeTruthy();
    }
  });

  test('the table covers exactly the declared bindings (no extras)', () => {
    const table = buildHotkeyTable(DEFAULT_INPUT_MAPPING);
    // 4 pipe + 4 exclusive + clear + 2 paratroop + 2 gun + 10 digits
    // + cancel + 4 arrows = 28.
    expect(table.size).toBe(28);
  });

  test('no two bindings share the same key string', () => {
    expect(findHotkeyCollisions(DEFAULT_INPUT_MAPPING)).toEqual([]);
  });

  test('a colliding mapping is rejected loudly', () => {
    const colliding: InputMapping = {
      ...DEFAULT_INPUT_MAPPING,
      gunPrimary: 'p', // already bound by paratroopPrimary
    };
    expect(findHotkeyCollisions(colliding)).toEqual(['p']);
    expect(() => buildHotkeyTable(colliding)).toThrow(/duplicate/i);
  });
});

describe('resolveInputMapping (override mechanism)', () => {
  test('defaults to DEFAULT_INPUT_MAPPING', () => {
    expect(resolveInputMapping()).toBe(DEFAULT_INPUT_MAPPING);
    expect(resolveInputMapping(undefined)).toBe(DEFAULT_INPUT_MAPPING);
  });

  test('a host override replaces the default wholesale', () => {
    const custom: InputMapping = {
      ...DEFAULT_INPUT_MAPPING,
      paratroopPrimary: 'q',
      paratroopAlt: 'w',
    };
    const resolved = resolveInputMapping(custom);
    expect(resolved).toBe(custom);
    const table = buildHotkeyTable(resolved);
    expect(table.get('q')).toBe('paratroop');
    expect(table.get('p')).toBeUndefined();
  });
});

/** Live store around a one-cell board + recording client. */
function makeStore(selection: { x: number; y: number } | null): {
  readonly store: ConsoleStore;
  readonly client: FakeMatchClient;
} {
  const view = buildPlayerView({
    width: 8,
    height: 8,
    playerId: 1,
    visibleCells: [
      buildCellView({
        coord: { x: 4, y: 4 },
        elevation: 50,
        troops: 10,
        owner: 1,
        pipes: new Set<Direction>(['N']),
      }),
    ],
  });
  const client = new FakeMatchClient();
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const store = createConsoleStore({ ...createLiveConsoleState(view), selection }, (effect) => {
    forward?.(effect);
  });
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);
  return { store, client };
}

/** Dispatch a keydown on the document (happy-dom). */
function pressKey(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

describe('HotkeyController (integration)', () => {
  test('routes digits through the configured table into orders', async () => {
    const { store, client } = makeStore({ x: 4, y: 4 });
    const controller = new HotkeyController(store);
    controller.attach();
    pressKey('7');
    await Promise.resolve();
    expect(client.orders).toHaveLength(1);
    expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
    controller.dispose();
  });

  test('a custom mapping reroutes paratroop to the override key', () => {
    const custom: InputMapping = {
      ...DEFAULT_INPUT_MAPPING,
      paratroopPrimary: 'q',
      paratroopAlt: 'w',
    };
    const { store, client } = makeStore({ x: 4, y: 4 });
    const controller = new HotkeyController(store, { mapping: custom });
    controller.attach();

    pressKey('q');
    expect(client.orders).toHaveLength(0); // no cursor aim → no launch

    pressKey('7');
    expect(client.orders).toHaveLength(1); // digits still work
    controller.dispose();
  });

  test('interactive chrome owns its keys (gating shared with draft)', () => {
    const { store, client } = makeStore({ x: 4, y: 4 });
    const controller = new HotkeyController(store);
    controller.attach();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }));
    expect(client.orders).toHaveLength(0);
    button.remove();
    controller.dispose();
  });

  test('dispose removes the listener', () => {
    const { store, client } = makeStore({ x: 4, y: 4 });
    const controller = new HotkeyController(store);
    controller.attach();
    controller.dispose();
    const spy = vi.fn();
    store.subscribe(spy);
    pressKey('7');
    expect(client.orders).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
