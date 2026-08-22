/**
 * Quickstart Q-F01 — Lone stack sees its full Chebyshev horizon
 * Feature 002, US1 AC-1 + AC-2, FR-001 (T024)
 *
 * Per quickstart.md §2 Q-F01:
 *   - One stack at (8,8) on a 16×16 board sees exactly the 49 cells
 *     in Chebyshev range 3.
 *   - Two friendly stacks in disjoint regions see exactly 49 × 2 =
 *     98 cells.
 */

import { describe, expect, it } from 'vitest';
import { computeVisibleSet } from '../../src/index';
import { expectedChebyshevDisk } from '../fixtures/view';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

describe('Q-F01 — lone stack sees its full Chebyshev horizon', () => {
  it('one stack at (8,8) on a 16×16 board sees exactly the 49 cells in Chebyshev range 3', () => {
    const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
    const visible = computeVisibleSet(world, 1);

    const expected = expectedChebyshevDisk({ x: 8, y: 8 }, RADIUS, 16, 16);
    expect(visible.visibleCells).toEqual(expected);
    expect(visible.visibleCells).toHaveLength(49);
  });

  it('two friendly stacks in disjoint regions see exactly 98 cells (49 × 2)', () => {
    // (3,3) spans [0..6]², (12,12) spans [9..15]² — disjoint.
    const world = withVisibilityRadius(
      buildWorldWithTroops(16, [
        [3, 3, 1, 2],
        [12, 12, 1, 2],
      ]),
      RADIUS,
    );
    const visible = computeVisibleSet(world, 1);
    expect(visible.visibleCells).toHaveLength(49 * 2);
  });
});
