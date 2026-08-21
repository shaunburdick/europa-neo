/**
 * Flow resolution unit tests — Feature 001, T020
 *
 * Covers:
 *   - FR-007: slope factors — downhill > flat > uphill
 *   - FR-006: 4-way pipe support, exclusive mode
 *   - Water-target rejection (flow into water is a no-op)
 *   - Capacity clamp: destination never exceeds cellCapacity
 *   - Determinism: same input → same output
 *
 * resolveFlow is called directly with hand-built WorldState so the
 * tests exercise the pure resolution function in isolation.
 *
 * The current ENGINE_CONSTANTS has flowBase=0 (so flat flow = 0 in v1);
 * we therefore construct synthetic constants inside this test file so
 * the slope-ordering assertions (downhill > flat > uphill) are
 * observable. The constants stay centralized in `constants.ts`; the
 * test just verifies the function honors whatever constants it is
 * given.
 */

import { describe, expect, it } from 'vitest';
import type { EngineConstants } from '../../src/contracts/engine-api';
import { resolveFlow } from '../../src/resolution/flow';
import type { Board, WorldState } from '../../src/types';
import { buildBoardWithElevation, buildSmallBoard } from '../fixtures/board';

// Synthetic constants where flat flow actually moves troops so we can
// observe the slope-ordering relationship (downhill > flat > uphill).
const TEST_CONSTANTS: EngineConstants = {
  productionRate: 1,
  cityCapacity: 30,
  cellCapacity: 30,
  decayPerTick: 1,
  flowDownhillFactor: 2,
  flowUphillFactor: 0,
  flowBase: 2,
  paratroopCost: 10,
  gunCost: 5,
  gunDamage: 2,
  visibilityRadiusDefault: 4,
};

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

const N = 0x01;
const E = 0x02;
const S = 0x04;
const W = 0x08;

function setPipe(
  state: WorldState,
  size: number,
  x: number,
  y: number,
  directionMask: number,
  count: number,
  owner: number,
): void {
  const idx = y * size + x;
  state.pipeMasks[idx] = directionMask;
  state.troopCounts[idx] = count;
  state.troopOwners[idx] = owner;
}

describe('resolveFlow — FR-007 slope factors', () => {
  it('downhill destination gains flowDownhillFactor × flowBase troops', () => {
    // Source at elevation 5, destination east at elevation 2 (downhill).
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [5, 0],
      [2, 0],
    ];
    const board: Board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 0, 0, E, 30, 1); // source full, pipes east

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    const dest = 0 * 8 + 1;
    expect(out.troopCounts[dest]).toBe(TEST_CONSTANTS.flowBase * TEST_CONSTANTS.flowDownhillFactor);
    expect(out.troopOwners[dest]).toBe(1);
  });

  it('flat destination gains flowBase troops', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [3, 0],
      [3, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 0, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    const dest = 0 * 8 + 1;
    expect(out.troopCounts[dest]).toBe(TEST_CONSTANTS.flowBase);
  });

  it('uphill destination gains flowUphillFactor × flowBase troops (zero with v1 default)', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [5, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 0, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    const dest = 0 * 8 + 1;
    expect(out.troopCounts[dest]).toBe(TEST_CONSTANTS.flowBase * TEST_CONSTANTS.flowUphillFactor);
  });

  it('downhill > flat > uphill ordering holds for identical source stacks', () => {
    // Three boards; same pipe order (E); same source count. We compare
    // destination counts. With our synthetic constants, the ordering is
    // strict: downhill > flat > uphill.
    const downhill = buildBoardWithElevation(
      8,
      [
        [10, 0],
        [0, 0],
      ],
      [],
    );
    const flat = buildBoardWithElevation(
      8,
      [
        [5, 0],
        [5, 0],
      ],
      [],
    );
    const uphill = buildBoardWithElevation(
      8,
      [
        [0, 0],
        [10, 0],
      ],
      [],
    );

    const make = (): WorldState => {
      const s = emptyState(8);
      setPipe(s, 8, 0, 0, E, 30, 1);
      return s;
    };

    const downDest = resolveFlow(make(), downhill, TEST_CONSTANTS).troopCounts[1];
    const flatDest = resolveFlow(make(), flat, TEST_CONSTANTS).troopCounts[1];
    const upDest = resolveFlow(make(), uphill, TEST_CONSTANTS).troopCounts[1];

    expect(downDest).toBeGreaterThan(flatDest);
    expect(flatDest).toBeGreaterThan(upDest);
  });
});

describe('resolveFlow — FR-006 pipe support', () => {
  it('4-way pipe support: each direction moves independently', () => {
    // Hand-roll a board: (4,4) is elevation 10, all its neighbors are
    // elevation 5, all other cells are elevation 5 too (so they're
    // "flat" relative to each other but "downhill" relative to (4,4)).
    const size = 8;
    const cells = Array.from({ length: size * size }, (_, i) => {
      const cx = i % size;
      const cy = Math.floor(i / size);
      const elev = cx === 4 && cy === 4 ? 10 : 5;
      return { x: cx, y: cy, elevation: elev, terrain: 'land' as const };
    });
    const board: Board = Object.freeze({
      width: size,
      height: size,
      cells: Object.freeze(cells),
      cities: Object.freeze([]),
    });
    const state = emptyState(8);
    // (4,4) pipes N/E/S/W. All neighbors at elevation 5, source at 10.
    setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    const nIdx = 3 * 8 + 4; // (4,3)
    const eIdx = 4 * 8 + 5; // (5,4)
    const sIdx = 5 * 8 + 4; // (4,5)
    const wIdx = 4 * 8 + 3; // (3,4)
    const expected = TEST_CONSTANTS.flowBase * TEST_CONSTANTS.flowDownhillFactor;
    expect(out.troopCounts[nIdx]).toBe(expected);
    expect(out.troopCounts[eIdx]).toBe(expected);
    expect(out.troopCounts[sIdx]).toBe(expected);
    expect(out.troopCounts[wIdx]).toBe(expected);
  });

  it('exclusive mode: only the configured direction receives troops', () => {
    // Even if the bitmask only has E set, NE/SW shouldn't fire.
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [10, 0],
      [5, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 4, 4, E, 30, 1); // exclusive (single bit)

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    const nIdx = 3 * 8 + 4;
    const eIdx = 4 * 8 + 5;
    const sIdx = 5 * 8 + 4;
    const wIdx = 4 * 8 + 3;
    expect(out.troopCounts[eIdx]).toBeGreaterThan(0);
    expect(out.troopCounts[nIdx]).toBe(0);
    expect(out.troopCounts[sIdx]).toBe(0);
    expect(out.troopCounts[wIdx]).toBe(0);
  });

  it('source with no outgoing pipes does not flow', () => {
    const board = buildSmallBoard(8, []);
    const state = emptyState(8);
    state.troopCounts[0] = 30;
    state.troopOwners[0] = 1;
    // No pipes.
    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1]).toBe(0);
    expect(out.troopCounts[8]).toBe(0);
  });
});

describe('resolveFlow — water-target rejection', () => {
  it('flow into a water cell is a no-op (water impassable)', () => {
    // Hand-roll a board where destination is water.
    const size = 8;
    const cells = Array.from({ length: size * size }, (_, i) => ({
      x: i % size,
      y: Math.floor(i / size),
      elevation: 0,
      terrain: 'land' as const,
    }));
    const targetCell = cells[1];
    if (targetCell === undefined) throw new Error('test setup: cells[1] missing');
    cells[1] = { ...targetCell, terrain: 'water' };
    const board: Board = Object.freeze({
      width: size,
      height: size,
      cells: Object.freeze(cells),
      cities: Object.freeze([]),
    });
    const state = emptyState(size);
    setPipe(state, size, 0, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1]).toBe(0);
    expect(out.troopOwners[1]).toBe(0);
  });

  it('out-of-board destination is a no-op (bounds-checked at flow time)', () => {
    // Source at right edge piping east — destination would be off-board.
    const size = 8;
    const board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const srcIdx = 0 * size + 7; // (7, 0)
    setPipe(state, size, 7, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    // No transfer to any cell (destination is off-board). Exclude the
    // source cell from the count (it had 30 to start).
    let nonZeroOffSource = 0;
    for (let i = 0; i < out.troopCounts.length; i++) {
      if (i === srcIdx) continue;
      if ((out.troopCounts[i] ?? 0) > 0) nonZeroOffSource++;
    }
    expect(nonZeroOffSource).toBe(0);
    // Source cell itself still has its original count (no decrement).
    expect(out.troopCounts[srcIdx]).toBe(30);
  });
});

describe('resolveFlow — capacity clamp', () => {
  it('destination never exceeds cellCapacity', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [10, 0],
      [0, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    // Pre-fill destination near cap; source has huge stack.
    state.troopCounts[1] = TEST_CONSTANTS.cellCapacity - 1;
    state.troopOwners[1] = 1;
    setPipe(state, 8, 0, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1]).toBeLessThanOrEqual(TEST_CONSTANTS.cellCapacity);
  });

  it('capacity clamp truncates the addition, not the existing stack', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [10, 0],
      [0, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    // Destination exactly at cap.
    state.troopCounts[1] = TEST_CONSTANTS.cellCapacity;
    state.troopOwners[1] = 1;
    setPipe(state, 8, 0, 0, E, 30, 1);

    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.cellCapacity);
  });
});

describe('resolveFlow — defensive branches', () => {
  it('skips cells where pipe mask is set but the cell has no troops', () => {
    // Pipe is set on an empty cell — nothing to flow.
    const board = buildSmallBoard(8, []);
    const state = emptyState(8);
    state.pipeMasks[1 * 8 + 1] = E;
    // No troops, no owner.
    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1 * 8 + 2]).toBe(0); // east neighbor unaffected
  });

  it('skips cells where pipe mask is set but owner is 0 (no owner)', () => {
    const board = buildSmallBoard(8, []);
    const state = emptyState(8);
    state.pipeMasks[1 * 8 + 1] = E;
    state.troopCounts[1 * 8 + 1] = 30;
    state.troopOwners[1 * 8 + 1] = 0; // no owner despite troops
    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1 * 8 + 2]).toBe(0);
  });

  it('flow honors flat slope (factor = 1)', () => {
    // Source and destination at same elevation → flat → factor = 1.
    // With flowBase = 2, expected moved = 2.
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [5, 0],
      [5, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 0, 0, E, 30, 1);
    const out = resolveFlow(state, board, TEST_CONSTANTS);
    expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.flowBase);
  });
});

describe('resolveFlow — determinism', () => {
  it('same input × 1000 calls → byte-identical output', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [10, 0],
      [5, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);

    const reference = resolveFlow(state, board, TEST_CONSTANTS);
    for (let i = 0; i < 1000; i++) {
      const next = resolveFlow(state, board, TEST_CONSTANTS);
      expect(Array.from(next.troopCounts)).toEqual(Array.from(reference.troopCounts));
      expect(Array.from(next.troopOwners)).toEqual(Array.from(reference.troopOwners));
    }
  });

  it('does not mutate input state arrays', () => {
    const elevMap: ReadonlyArray<readonly [number, number]> = [
      [10, 0],
      [5, 0],
    ];
    const board = buildBoardWithElevation(8, elevMap, []);
    const state = emptyState(8);
    setPipe(state, 8, 0, 0, E, 30, 1);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);

    resolveFlow(state, board, TEST_CONSTANTS);

    expect(Array.from(state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
  });
});
