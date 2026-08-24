/**
 * Production resolution unit tests — Feature 001, T019
 *
 * Covers:
 *   - FR-004: each city cell gains `productionRate` troops per tick,
 *     capped at `cityCapacity`
 *   - Edge case: pre-saturated city adds zero (no overflow)
 *   - Empty board (no cities): state unchanged
 *   - Multiple cities on same owner: each produces independently
 *   - Determinism: same state → same output across 1000 runs
 *
 * resolveProduction is called directly with hand-built WorldState so the
 * tests exercise the pure resolution function in isolation from the
 * tick pipeline (per data-model.md §9 + research.md §10).
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { resolveProduction } from '../../src/resolution/production';
import type { WorldState } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

function emptyState(size: number): WorldState {
  const n = size * size;
  return {
    troopCounts: new Uint32Array(n),
    troopOwners: new Uint8Array(n),
    pipeMasks: new Uint8Array(n),
    reservesPct: new Uint8Array(n),
    cityOwners: new Uint8Array(n),
  };
}

/** Helper: mark a cell as a city owned by `owner`. */
function placeCity(state: WorldState, size: number, x: number, y: number, owner: number): void {
  state.cityOwners[y * size + x] = owner;
}

describe('resolveProduction — FR-004 city production', () => {
  it('a single city adds productionRate troops per call', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(out.troopCounts[1 * size + 1]).toBe(ENGINE_CONSTANTS.productionRate);
    expect(out.troopOwners[1 * size + 1]).toBe(1);
  });

  it('capped at cityCapacity — pre-saturated city adds zero', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    const state = emptyState(size);
    const idx = 1 * size + 1;
    placeCity(state, size, 1, 1, 1);
    // Pre-fill exactly to capacity.
    state.troopCounts[idx] = ENGINE_CONSTANTS.cityCapacity;
    state.troopOwners[idx] = 1;

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(out.troopCounts[idx]).toBe(ENGINE_CONSTANTS.cityCapacity);
  });

  it('repeats add productionRate until saturation, then caps', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    let state = emptyState(size);
    placeCity(state, size, 1, 1, 1);

    const expected = ENGINE_CONSTANTS.productionRate * ENGINE_CONSTANTS.cityCapacity; // ticks until saturate
    const overshoot = expected + 10; // extra ticks past saturation
    for (let i = 0; i < overshoot; i++) {
      state = resolveProduction(state, board, ENGINE_CONSTANTS);
    }
    expect(state.troopCounts[1 * size + 1]).toBe(ENGINE_CONSTANTS.cityCapacity);
  });

  it('partial-saturated city adds exactly enough to reach capacity', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    const state = emptyState(size);
    const idx = 1 * size + 1;
    placeCity(state, size, 1, 1, 1);
    // Pre-fill so remaining gap is exactly productionRate.
    state.troopCounts[idx] = ENGINE_CONSTANTS.cityCapacity - ENGINE_CONSTANTS.productionRate;
    state.troopOwners[idx] = 1;

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(out.troopCounts[idx]).toBe(ENGINE_CONSTANTS.cityCapacity);
  });

  it('multiple cities on the same owner each produce independently', () => {
    const size = 8;
    // Two cities for player 1 (allowed: same owner, different cells).
    const board = buildSmallBoard(size, [
      [1, 1, 1],
      [6, 6, 1],
    ]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);
    placeCity(state, size, 6, 6, 1);

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(out.troopCounts[1 * size + 1]).toBe(ENGINE_CONSTANTS.productionRate);
    expect(out.troopCounts[6 * size + 6]).toBe(ENGINE_CONSTANTS.productionRate);
    expect(out.troopOwners[1 * size + 1]).toBe(1);
    expect(out.troopOwners[6 * size + 6]).toBe(1);
  });

  it('cities of different owners are independent', () => {
    const size = 8;
    const board = buildSmallBoard(size, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);
    placeCity(state, size, 6, 6, 2);

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(out.troopCounts[1 * size + 1]).toBe(ENGINE_CONSTANTS.productionRate);
    expect(out.troopOwners[1 * size + 1]).toBe(1);
    expect(out.troopCounts[6 * size + 6]).toBe(ENGINE_CONSTANTS.productionRate);
    expect(out.troopOwners[6 * size + 6]).toBe(2);
  });

  it('empty board (no cities) returns state with all counts unchanged', () => {
    const size = 8;
    const board = buildSmallBoard(size, []);
    const state = emptyState(size);

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    expect(Array.from(out.troopCounts)).toEqual(Array.from(state.troopCounts));
    expect(Array.from(out.troopOwners)).toEqual(Array.from(state.troopOwners));
  });

  it('production does not affect non-city cells', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);

    const out = resolveProduction(state, board, ENGINE_CONSTANTS);
    // Sample some non-city cells.
    for (const idx of [0, 5, 10, 20, 63]) {
      if (idx === 1 * size + 1) {
        continue;
      }
      expect(out.troopCounts[idx]).toBe(0);
      expect(out.troopOwners[idx]).toBe(0);
    }
  });
});

describe('resolveProduction — determinism', () => {
  it('same state × 1000 calls → byte-identical output', () => {
    const size = 8;
    const board = buildSmallBoard(size, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);
    placeCity(state, size, 6, 6, 2);
    // Pre-fill one city partially to exercise the cap branch.
    state.troopCounts[1 * size + 1] = ENGINE_CONSTANTS.cityCapacity - 1;
    state.troopOwners[1 * size + 1] = 1;

    const reference = resolveProduction(state, board, ENGINE_CONSTANTS);
    for (let i = 0; i < 1000; i++) {
      const next = resolveProduction(state, board, ENGINE_CONSTANTS);
      expect(Array.from(next.troopCounts)).toEqual(Array.from(reference.troopCounts));
      expect(Array.from(next.troopOwners)).toEqual(Array.from(reference.troopOwners));
    }
  });

  it('does not mutate input state arrays', () => {
    const size = 8;
    const board = buildSmallBoard(size, [[1, 1, 1]]);
    const state = emptyState(size);
    placeCity(state, size, 1, 1, 1);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);

    resolveProduction(state, board, ENGINE_CONSTANTS);

    expect(Array.from(state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
  });
});
