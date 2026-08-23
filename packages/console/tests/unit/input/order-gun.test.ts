/**
 * Order-gun unit tests — Feature 005 (T058).
 *
 * Covers the gun order-builder chain (spec US3 AC-2): `g` fires to
 * the same computed destination as paratroop for the identical aiming
 * posture, `o` is the alias, and the local preflight gates water /
 * off-horizon targets before any wire traffic while enemy targets
 * pass through (server is final authority).
 */

import { describe, expect, test } from 'vitest';

import { DEFAULT_CAMERA } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { fireGun } from '../../../src/input/order-gun';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { createOrderBridge } from '../../../src/state/order-actions';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { CursorTarget, Direction, ReducerEffect } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** Board around anchor (10, 10): land NE ring 2, water SE, enemy E. */
function makeStore(): { readonly store: ConsoleStore; readonly client: FakeMatchClient } {
  const view = buildPlayerView({
    width: 16,
    height: 16,
    playerId: 1,
    visibleCells: [
      buildCellView({
        coord: { x: 10, y: 10 },
        elevation: 50,
        troops: 20,
        owner: 1,
        pipes: new Set<Direction>(['N']),
      }),
      buildCellView({ coord: { x: 12, y: 8 }, elevation: 20 }),
      buildCellView({ coord: { x: 11, y: 12 }, terrain: 'water' }),
      buildCellView({ coord: { x: 12, y: 10 }, elevation: 30, troops: 5, owner: 2 }),
    ],
  });
  const client = new FakeMatchClient();
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const store = createConsoleStore(
    { ...createLiveConsoleState(view), selection: { x: 10, y: 10 } },
    (effect) => {
      forward?.(effect);
    },
  );
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);
  return { store, client };
}

function cursorIn(fx: number, fy: number): CursorTarget {
  return hitTest(
    { x: (10 + fx) * DEFAULT_CAMERA.zoom, y: (10 + fy) * DEFAULT_CAMERA.zoom },
    DEFAULT_CAMERA,
  );
}

describe('fireGun (g / o chain)', () => {
  test('identical NE posture issues OrderGun to (12, 8)', async () => {
    const { store, client } = makeStore();
    const outcome = fireGun({
      store,
      cursor: cursorIn(0.85, 0.15),
      cursorAgeMs: 10,
    });
    expect(outcome.status).toBe('ok');
    await Promise.resolve();
    expect(client.orders).toHaveLength(1);
    expect(client.orders[0]?.order).toEqual({
      kind: 'gun',
      player: 1,
      source: { x: 10, y: 10 },
      target: { x: 12, y: 8 },
    });
  });

  test('water target rejects before sendOrder (no store effect)', async () => {
    const { store, client } = makeStore();
    const outcome = fireGun({
      store,
      cursor: cursorIn(0.65, 0.85),
      cursorAgeMs: 10,
    });
    expect(outcome).toEqual({
      status: 'rejected',
      reason: { kind: 'water_target', coord: { x: 11, y: 12 } },
    });
    await Promise.resolve();
    expect(client.orders).toHaveLength(0);
  });

  test('enemy target passes preflight and reaches the wire', async () => {
    const { store, client } = makeStore();
    const outcome = fireGun({
      store,
      cursor: cursorIn(0.85, 0.5),
      cursorAgeMs: 10,
    });
    expect(outcome.status).toBe('ok');
    await Promise.resolve();
    expect(client.orders[0]?.order).toMatchObject({ kind: 'gun', target: { x: 12, y: 10 } });
  });

  test('centered aim produces no_launch and no wire message', async () => {
    const { store, client } = makeStore();
    const outcome = fireGun({
      store,
      cursor: cursorIn(0.5, 0.5),
      cursorAgeMs: 10,
    });
    expect(outcome).toEqual({ status: 'no_launch', reason: 'center-subcell' });
    await Promise.resolve();
    expect(client.orders).toHaveLength(0);
  });
});
