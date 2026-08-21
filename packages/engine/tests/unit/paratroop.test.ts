/**
 * Paratroop resolution unit tests — Feature 001, T041
 *
 * Covers FR-013:
 *   - Cost is 2:1 (paratrooper drops N troops at cost 2N from source).
 *   - Range ≤ 2 Chebyshev.
 *   - Clears destination pipes on landing.
 *
 * Covers edge cases:
 *   - "paratroop into water fails validation" — rejected by validateCommand.
 *   - "reserves > count holds all" — paratroop respects reserves invariant
 *     (source must have ≥ 2 × N troops net of reserves floor; landing
 *     target inherits the troop count without affecting reserves).
 *   - Source insufficient: error, no state change.
 *   - Range too far: error.
 *
 * Also covers determinism: same input → byte-identical output across 100 calls.
 *
 * The `paratroopCost` constant (ENGINE_CONSTANTS.paratroopCost = 10) is
 * interpreted as N — the number of paratroopers dropped per order.
 * Source loses 2 × N (= 20), target gains N (= 10). This matches the
 * FR-013 "2:1 cost ratio" rule exactly.
 *
 * resolveParatroop is called directly with a hand-built WorldState
 * and the paratroop orders to apply. This isolates the rule from the
 * rest of the tick pipeline; the integration is covered by the
 * quickstart test.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { resolveParatroop } from '../../src/resolution/paratroop';
import type { Board, Order, PlayerId, World, WorldState } from '../../src/types';
import { validateCommand } from '../../src/validate';
import { buildSmallBoard } from '../fixtures/board';

const CONSTANTS = ENGINE_CONSTANTS;
// N (paratroopers dropped per order) = ENGINE_CONSTANTS.paratroopCost.
const N = CONSTANTS.paratroopCost;
const TWO_N = N * 2;

/** Row-major cell index (matches placeStack helper convention). */
function idx(size: number, x: number, y: number): number {
  return y * size + x;
}

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

function placeStack(
  state: WorldState,
  size: number,
  x: number,
  y: number,
  owner: number,
  count: number,
  pipes = 0,
): void {
  const i = idx(size, x, y);
  state.troopCounts[i] = count;
  state.troopOwners[i] = owner;
  state.pipeMasks[i] = pipes;
}

function buildWorld(size: number, board: Board, state: WorldState): World {
  return {
    config: {
      boardSize: size,
      playerCount: 2,
      tickIntervalMs: 250,
      seed: 1,
      visibilityRadius: CONSTANTS.visibilityRadiusDefault,
    },
    tick: 0,
    board,
    players: [
      { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
      { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
    ],
    state,
    rngSeed: 1,
    rngState: new Uint32Array([1, 2, 3, 4]),
  };
}

describe('resolveParatroop — FR-013 2:1 cost + landing + range', () => {
  it('drops N paratroopers at cost 2N from source (2:1 ratio)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
    expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(N);
    expect(result.state.troopOwners[idx(size, 3, 4)]).toBe(1);
  });

  it('range Chebyshev distance 2 (3,3)→(5,3): allowed', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
    expect(result.state.troopCounts[idx(size, 5, 3)]).toBe(N);
  });

  it('range Chebyshev distance 0 (source == target): net effect -N, capped at cellCapacity', () => {
    // Use 30 troops (cellCapacity) so the cap doesn't truncate the result.
    // Net: 30 - 2N + N = 30 - N = 20.
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 30);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 3 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(30 - TWO_N + N);
  });

  it('clears destination pipeMasks (FR-013)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    placeStack(state, size, 4, 3, 0, 0, 0x0f);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.pipeMasks[idx(size, 4, 3)]).toBe(0);
  });

  it('does not clear source pipeMasks', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100, 0x02);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.state.pipeMasks[idx(size, 3, 3)]).toBe(0x02);
  });
});

describe('resolveParatroop — validation: paratroop into water fails validation', () => {
  it('target is water: paratroop is rejected and produces no state change', () => {
    const size = 8;
    const cells = Array.from({ length: size * size }, (_, i) => ({
      x: i % size,
      y: Math.floor(i / size),
      elevation: 0,
      terrain: 'land' as const,
    }));
    cells[idx(size, 3, 4)] = {
      ...(cells[idx(size, 3, 4)] ?? { x: 0, y: 0, elevation: 0, terrain: 'land' as const }),
      terrain: 'water',
    };
    const board: Board = Object.freeze({
      width: size,
      height: size,
      cells: Object.freeze(cells),
      cities: Object.freeze([]),
    });
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('water_target');
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
    expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(0);
  });
});

describe('resolveParatroop — validation: source insufficient', () => {
  it('source has fewer than 2N troops: error, no state change', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, TWO_N - 1);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(TWO_N - 1);
    expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(0);
  });

  it('source has zero troops: error, no state change', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 0);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
  });
});

describe('resolveParatroop — validation: range too far', () => {
  it('Chebyshev distance 3 (3,3)→(6,3): error, no state change', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 6, y: 3 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('paratroop_range');
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
  });

  it('diagonal Chebyshev distance 3 (3,3)→(6,6): error', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 6, y: 6 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('paratroop_range');
  });
});

describe('resolveParatroop — validation: not-owner', () => {
  it('source not owned by player: error, no state change', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 2, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason.kind).toBe('not_owner');
  });
});

describe('resolveParatroop — Edge Case: reserves > count holds all', () => {
  it('paratroop respects reserves invariant: source stays above reserves floor', () => {
    // Source has 100 troops, reserves=9 (90%) → floor ≈ 90.
    // Spending 2N = 20 would bring count to 80, below the floor of 90.
    // Implementation rejects as insufficient.
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    state.reservesPct[idx(size, 3, 3)] = 9;
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
  });

  it('paratroop allowed when source has plenty above reserves floor', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 200);
    state.reservesPct[idx(size, 3, 3)] = 9;
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(200 - TWO_N);
  });
});

describe('resolveParatroop — branch coverage: edge cases', () => {
  it('source exactly at 2N troops: source becomes 0, owner becomes 0', () => {
    // Source has EXACTLY 2N troops → after spending, source = 0 and
    // owner becomes 0 (covered branch on line 127 of paratroop.ts).
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, TWO_N);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(0);
    expect(result.state.troopOwners[idx(size, 3, 3)]).toBe(0);
    expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(N);
  });

  it('no input orders: state reference preserved (no-op branch)', () => {
    // No paratroop orders → stateChanged === false → input returned by reference.
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('all input orders rejected: state reference preserved', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 99, y: 99 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors.length).toBe(1);
    expect(result.state).toBe(state);
  });

  it('non-paratroop orders are silently filtered (no state change)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const orders: Order[] = [{ kind: 'setPipe', player: 1, cell: { x: 3, y: 3 }, direction: 'E' }];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('target at cellCapacity: paratroop clamped (caps to cellCapacity)', () => {
    // Target already at cellCapacity (30) → adding N would exceed → clamp.
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    placeStack(state, size, 3, 4, 0, CONSTANTS.cellCapacity);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
    ];
    const result = resolveParatroop(state, board, CONSTANTS, orders);
    expect(result.errors).toEqual([]);
    // Target clamped at cellCapacity.
    expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(CONSTANTS.cellCapacity);
  });
});

describe('resolveParatroop — determinism', () => {
  it('same input × 100 calls → byte-identical output', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    placeStack(state, size, 4, 3, 0, 0, 0x0f);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
    ];
    const reference = resolveParatroop(state, board, CONSTANTS, orders);
    for (let i = 0; i < 100; i++) {
      const next = resolveParatroop(state, board, CONSTANTS, orders);
      expect(Array.from(next.state.troopCounts)).toEqual(Array.from(reference.state.troopCounts));
      expect(Array.from(next.state.troopOwners)).toEqual(Array.from(reference.state.troopOwners));
      expect(Array.from(next.state.pipeMasks)).toEqual(Array.from(reference.state.pipeMasks));
    }
  });

  it('does not mutate input state', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    placeStack(state, size, 4, 3, 0, 0, 0x0f);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);
    const pipesBefore = Array.from(state.pipeMasks);
    const orders: Order[] = [
      { kind: 'paratroop', player: 1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
    ];
    resolveParatroop(state, board, CONSTANTS, orders);
    expect(Array.from(state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
    expect(Array.from(state.pipeMasks)).toEqual(pipesBefore);
  });
});

describe('validateCommand — OrderParatroop validation', () => {
  it('out-of-bounds target → out_of_bounds error', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 99, y: 99 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out_of_bounds');
  });

  it('water target → water_target error', () => {
    const size = 8;
    const cells = Array.from({ length: size * size }, (_, i) => ({
      x: i % size,
      y: Math.floor(i / size),
      elevation: 0,
      terrain: 'land' as const,
    }));
    cells[idx(size, 3, 4)] = {
      ...(cells[idx(size, 3, 4)] ?? { x: 0, y: 0, elevation: 0, terrain: 'land' as const }),
      terrain: 'water',
    };
    const board: Board = Object.freeze({
      width: size,
      height: size,
      cells: Object.freeze(cells),
      cities: Object.freeze([]),
    });
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 3, y: 4 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('water_target');
  });

  it('source not owned → not_owner error', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 2, 100);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 3, y: 4 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('not_owner');
  });

  it('source insufficient troops → no_source_troops error', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, TWO_N - 1);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 3, y: 4 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('no_source_troops');
  });

  it('Chebyshev distance > 2 → paratroop_range error', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 6, y: 6 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('paratroop_range');
  });

  it('valid range + owned + has troops → ok', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    placeStack(state, size, 3, 3, 1, 100);
    const world = buildWorld(size, board, state);
    const r = validateCommand(world, {
      kind: 'paratroop',
      player: 1 as PlayerId,
      source: { x: 3, y: 3 },
      target: { x: 5, y: 3 },
    });
    expect(r.ok).toBe(true);
  });
});
