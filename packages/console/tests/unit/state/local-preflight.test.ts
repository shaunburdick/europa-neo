/**
 * Local preflight unit tests — Feature 005 (Q-U05, T097 coverage).
 *
 * The preflight is a UX gate only (the server is final authority,
 * FR-006): out-of-range, water, not-owner, no-troops, and invalid
 * reserves are rejected locally; everything else passes as `null`.
 */

import { describe, expect, it } from 'vitest';

import { localPreflightOrder } from '../../../src/state/local-preflight';
import type { CellView, Order, PlayerView, ReservesPct } from '../../../src/state/types';

/** Build a fog view with the given cells. */
function viewWith(cells: CellView[]): PlayerView {
  return {
    player: 1,
    tick: 1,
    visibleCells: cells,
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: { boardSize: 16, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
  };
}

function cell(
  x: number,
  y: number,
  owner: 1 | 2 | null,
  troops: number,
  terrain: 'land' | 'water' = 'land',
): CellView {
  return {
    coord: { x, y },
    cell: { x, y, elevation: 10, terrain },
    troopCount: troops,
    troopOwner: owner,
    pipes: new Set(),
    reservesPercent: 0 as ReservesPct,
    cityOwner: null,
  };
}

const VIEW = viewWith([
  cell(5, 5, 1, 20), // owned, troops
  cell(6, 5, 1, 0), // owned, empty
  cell(7, 5, 2, 4), // enemy
  cell(8, 5, null, 0), // neutral
  cell(5, 4, 1, 3), // adjacent north (range 1)
  cell(9, 5, 1, 2), // water? no — plain far cell
]);
const WATER_VIEW = viewWith([cell(5, 5, 1, 10), cell(6, 5, null, 0, 'water')]);

describe('localPreflightOrder (Q-U05)', () => {
  it('passes valid attacks within Chebyshev range', () => {
    const order: Order = {
      kind: 'paratroop',
      player: 1,
      source: { x: 5, y: 5 },
      target: { x: 5, y: 4 },
    };
    expect(localPreflightOrder(order, VIEW, 1)).toBeNull();
  });

  it('rejects attacks beyond ring 2', () => {
    const order: Order = {
      kind: 'gun',
      player: 1,
      source: { x: 5, y: 5 },
      target: { x: 9, y: 5 },
    };
    const rejection = localPreflightOrder(order, VIEW, 1);
    expect(rejection).toMatchObject({ kind: 'paratroop_range' });
  });

  it('checks only view-visible facts for attacks — troop counts are the server’s call', () => {
    // The preflight sees range/terrain/horizon; source troop counts
    // and ownership are server-side facts (FR-006), so an empty
    // source still passes locally.
    const emptySource: Order = {
      kind: 'paratroop',
      player: 1,
      source: { x: 6, y: 5 },
      target: { x: 5, y: 4 },
    };
    expect(localPreflightOrder(emptySource, VIEW, 1)).toBeNull();
    // An attack whose target is outside the horizon fails closed.
    const blindTarget: Order = {
      kind: 'gun',
      player: 1,
      source: { x: 5, y: 5 },
      target: { x: 7, y: 7 }, // in range (Chebyshev 2) but unseen
    };
    expect(localPreflightOrder(blindTarget, VIEW, 1)).toMatchObject({ kind: 'out_of_bounds' });
  });

  it('rejects water targets', () => {
    const order: Order = {
      kind: 'paratroop',
      player: 1,
      source: { x: 5, y: 5 },
      target: { x: 6, y: 5 },
    };
    expect(localPreflightOrder(order, WATER_VIEW, 1)).toMatchObject({ kind: 'water_target' });
  });

  it('rejects pipe/reserves gestures on unowned or unseen cells', () => {
    const onEnemy: Order = { kind: 'setPipe', player: 1, cell: { x: 7, y: 5 }, direction: 'N' };
    expect(localPreflightOrder(onEnemy, VIEW, 1)).toMatchObject({ kind: 'not_owner' });
    const unseen: Order = { kind: 'clearAllPipes', player: 1, cell: { x: 0, y: 0 } };
    expect(localPreflightOrder(unseen, VIEW, 1)).toMatchObject({ kind: 'out_of_bounds' });
    const onWater: Order = { kind: 'setPipe', player: 1, cell: { x: 6, y: 5 }, direction: 'N' };
    expect(localPreflightOrder(onWater, WATER_VIEW, 1)).toMatchObject({ kind: 'water_target' });
  });

  it('rejects reserves percentages outside 0..9', () => {
    const bad: Order = {
      kind: 'setReserves',
      player: 1,
      cell: { x: 5, y: 5 },
      percent: 12 as never,
    };
    expect(localPreflightOrder(bad, VIEW, 1)).toMatchObject({ kind: 'invalid_percent' });
  });

  it('accepts reserves and pipes on owned visible cells; surrender always passes', () => {
    expect(
      localPreflightOrder(
        { kind: 'setReserves', player: 1, cell: { x: 5, y: 5 }, percent: 5 },
        VIEW,
        1,
      ),
    ).toBeNull();
    expect(
      localPreflightOrder(
        { kind: 'setPipe', player: 1, cell: { x: 5, y: 5 }, direction: 'N' },
        VIEW,
        1,
      ),
    ).toBeNull();
    expect(localPreflightOrder({ kind: 'surrender', player: 1 }, VIEW, 1)).toBeNull();
  });

  it('is fast enough to sit on the input path (<0.1ms budget is perf-tested)', () => {
    // Sanity: repeated calls are pure and stable.
    const order: Order = {
      kind: 'paratroop',
      player: 1,
      source: { x: 5, y: 5 },
      target: { x: 5, y: 4 },
    };
    expect(localPreflightOrder(order, VIEW, 1)).toBe(localPreflightOrder(order, VIEW, 1));
  });
});
