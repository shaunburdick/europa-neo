/**
 * Unit Tests: computeVisibleSet — Feature 002, US1 (T021)
 *
 * Covers FR-001 + US1 AC-1 + US1 AC-2:
 *   - Lone stack at (8,8) on 16×16 produces exactly the 49-cell
 *     Chebyshev disk.
 *   - Two friendly stacks in disjoint regions produce a union whose
 *     length equals the sum of the individual disks.
 *   - A stack at (0,0) on 16×16 produces a 4×4 = 16-cell clipped
 *     disk (no out-of-bounds leak).
 *   - Output is row-major with no duplicates.
 *   - `visible.player` echoes the input player; `visible.tick`
 *     echoes `world.tick`.
 *   - Viewers with `troopCount === 0` are excluded (destroyed stack).
 *   - Cities do NOT project vision (spec US1 Edge Case "city
 *     ownership").
 */

import { describe, expect, it } from 'vitest';
import { computeVisibleSet } from '../../src/visibleSet';
import { disjointDisks, expectedChebyshevDisk } from '../fixtures/view';
import { buildWorldWithCities, buildWorldWithTroops } from '../fixtures/world';

/**
 * Scenario radius per quickstart Q-F01 ("Chebyshev range 3"): a
 * radius-3 disk is 7×7 = 49 cells unclipped, 4×4 = 16 at a corner.
 * (`FOG_CONSTANTS.testRadius` mirrors the ENGINE default of 4 and is
 * asserted separately in `index.test.ts`.)
 */
const RADIUS = 3;

describe('computeVisibleSet (US1)', () => {
  it('lone stack at (8,8) on 16×16 sees exactly its 49-cell Chebyshev disk', () => {
    const world = buildWorldWithTroops(16, [[8, 8, 1, 5]]);
    const visible = computeVisibleSet(world, 1, RADIUS);

    const expected = expectedChebyshevDisk({ x: 8, y: 8 }, RADIUS, 16, 16);
    expect(visible.visibleCells).toHaveLength(49);
    expect(visible.visibleCells).toEqual(expected);
    expect(visible.player).toBe(1);
    expect(visible.tick).toBe(world.tick);
  });

  it('two disjoint friendly stacks union to the sum of their disks', () => {
    // (3,3) and (12,12) on 16×16 with radius 4 are far apart.
    const world = buildWorldWithTroops(16, [
      [3, 3, 1, 2],
      [12, 12, 1, 2],
    ]);
    const visible = computeVisibleSet(world, 1, RADIUS);

    const diskA = expectedChebyshevDisk({ x: 3, y: 3 }, RADIUS, 16, 16);
    const diskB = expectedChebyshevDisk({ x: 12, y: 12 }, RADIUS, 16, 16);
    // Throws with a descriptive message if the setup accidentally
    // overlaps — a test-author bug, not a fog bug.
    expect(disjointDisks(diskA, diskB)).toBe(true);

    expect(visible.visibleCells).toHaveLength(diskA.length + diskB.length);
    // Every cell of both disks is present; row-major order holds.
    for (const coord of [...diskA, ...diskB]) {
      expect(visible.visibleCells).toContainEqual(coord);
    }
  });

  it('stack at (0,0) clips to a 4×4 corner disk with no out-of-bounds leak', () => {
    const world = buildWorldWithTroops(16, [[0, 0, 1, 3]]);
    const visible = computeVisibleSet(world, 1, RADIUS);

    expect(visible.visibleCells).toHaveLength(16);
    for (const coord of visible.visibleCells) {
      expect(coord.x).toBeGreaterThanOrEqual(0);
      expect(coord.y).toBeGreaterThanOrEqual(0);
      expect(coord.x).toBeLessThanOrEqual(RADIUS);
      expect(coord.y).toBeLessThanOrEqual(RADIUS);
    }
  });

  it('output is row-major with no duplicates', () => {
    const world = buildWorldWithTroops(16, [
      [4, 4, 1, 1],
      [10, 10, 1, 1],
    ]);
    const visible = computeVisibleSet(world, 1, RADIUS);

    let lastKey = -1;
    const seen = new Set<number>();
    for (const coord of visible.visibleCells) {
      const key = coord.y * 16 + coord.x;
      expect(key).toBeGreaterThan(lastKey);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      lastKey = key;
    }
  });

  it('destroyed stacks (troopCount 0) project no vision', () => {
    // The fixture rejects count ≤ 0 placements, so simulate a
    // destroyed stack by cloning state and zeroing the count — the
    // same mutation path combat takes in the engine.
    const base = buildWorldWithTroops(16, [[8, 8, 1, 5]]);
    const counts = new Uint32Array(base.state.troopCounts);
    counts[8 * 16 + 8] = 0;
    const world = { ...base, state: { ...base.state, troopCounts: counts } };

    const visible = computeVisibleSet(world, 1, RADIUS);
    expect(visible.visibleCells).toHaveLength(0);
  });

  it('enemy stacks do not extend the viewer horizon', () => {
    // Player 1's view must not include cells beyond player 1's own
    // disks even when player 2 has stacks elsewhere.
    const world = buildWorldWithTroops(16, [
      [8, 8, 1, 5],
      [15, 15, 2, 9],
    ]);
    const visible = computeVisibleSet(world, 1, RADIUS);

    const expected = expectedChebyshevDisk({ x: 8, y: 8 }, RADIUS, 16, 16);
    expect(visible.visibleCells).toEqual(expected);
    expect(visible.visibleCells).not.toContainEqual({ x: 15, y: 15 });
  });

  it('cities alone do not project vision (no troops → empty set)', () => {
    const world = buildWorldWithCities(16, [
      [8, 8, 1],
      [3, 3, 2],
    ]);
    const visible = computeVisibleSet(world, 1, RADIUS);
    expect(visible.visibleCells).toHaveLength(0);
  });

  it('omitting the radius falls back to the match config radius', () => {
    const world = buildWorldWithTroops(16, [[8, 8, 1, 5]]);
    const explicit = computeVisibleSet(world, 1, world.config.visibilityRadius);
    const defaulted = computeVisibleSet(world, 1);
    expect(defaulted).toEqual(explicit);
  });

  it('matches engine signed 32-bit normalization at the upper boundary', () => {
    const world = buildWorldWithTroops(16, [[8, 8, 1, 5]]);

    expect(computeVisibleSet(world, 1, 2_147_483_647).visibleCells).toHaveLength(256);
    expect(computeVisibleSet(world, 1, 2_147_483_648).visibleCells).toEqual([{ x: 8, y: 8 }]);
  });

  it('matches engine normalization for negative and fractional radii', () => {
    const world = buildWorldWithTroops(16, [[8, 8, 1, 5]]);

    expect(computeVisibleSet(world, 1, -1).visibleCells).toEqual([{ x: 8, y: 8 }]);
    expect(computeVisibleSet(world, 1, 1.9).visibleCells).toHaveLength(9);
    // Values below signed 32-bit range wrap before the engine's clamp.
    expect(computeVisibleSet(world, 1, -2_147_483_649).visibleCells).toHaveLength(256);
  });
});
