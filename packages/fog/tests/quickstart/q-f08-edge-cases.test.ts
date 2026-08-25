/**
 * Quickstart Q-F08 — Edge cases (Feature 002, T038)
 *
 * Per quickstart.md §2 Q-F08:
 *   - Player with 0 troops sees nothing.
 *   - Player with 0 cities and 0 troops sees nothing.
 *   - Viewer at (0,0) on 16×16 — visibility clipped to 4×4 = 16
 *     cells (no out-of-bounds leak).
 *   - Viewer at (31,31) on 32×32 — visibility clipped to 4×4 = 16
 *     cells.
 *   - Viewer on water — visibility is computed (water does NOT block
 *     vision per spec Assumptions).
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView, isVisible } from '../../src/index';
import { buildSmallWorld, buildWorldWithTroops, buildWorldWithWater, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

describe('Q-F08 — edge cases', () => {
    it('player with 0 troops sees nothing', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 2, 5]]), RADIUS);
        expect(computePlayerView(world, 1).visibleCells).toHaveLength(0);
    });

    it('player with 0 cities and 0 troops sees nothing', () => {
        const world = withVisibilityRadius(buildSmallWorld(16, 2), RADIUS);
        expect(computePlayerView(world, 1).visibleCells).toHaveLength(0);
    });

    it('viewer at (0,0) on 16×16 clips to a 4×4 corner disk — no out-of-bounds leak', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[0, 0, 1, 3]]), RADIUS);
        const view = computePlayerView(world, 1);
        expect(view.visibleCells).toHaveLength(16);
        for (const cell of view.visibleCells) {
            expect(cell.coord.x).toBeGreaterThanOrEqual(0);
            expect(cell.coord.y).toBeGreaterThanOrEqual(0);
            expect(cell.coord.x).toBeLessThanOrEqual(RADIUS);
            expect(cell.coord.y).toBeLessThanOrEqual(RADIUS);
        }
    });

    it('viewer at (31,31) on 32×32 clips to a 4×4 corner disk', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(32, [[31, 31, 1, 3]]), RADIUS);
        const view = computePlayerView(world, 1);
        expect(view.visibleCells).toHaveLength(16);
        for (const cell of view.visibleCells) {
            expect(cell.coord.x).toBeGreaterThanOrEqual(32 - 1 - RADIUS);
            expect(cell.coord.y).toBeGreaterThanOrEqual(32 - 1 - RADIUS);
            expect(cell.coord.x).toBeLessThanOrEqual(31);
            expect(cell.coord.y).toBeLessThanOrEqual(31);
        }
    });

    it('viewer on water still projects vision (water does not block Chebyshev range)', () => {
        // Water at the viewer's own cell and at a neighbor; the stack
        // stands on the water cell.
        const world = withVisibilityRadius(
            buildWorldWithWater(
                16,
                [
                    { x: 8, y: 8 },
                    { x: 9, y: 8 },
                ],
                [[8, 8, 1, 5]],
            ),
            RADIUS,
        );
        const view = computePlayerView(world, 1);

        // The full radius-3 disk is visible despite standing on water…
        expect(view.visibleCells).toHaveLength(49);
        // …including the water cells themselves.
        expect(isVisible(view, { x: 8, y: 8 })).toBe(true);
        expect(isVisible(view, { x: 9, y: 8 })).toBe(true);
        const waterCell = view.visibleCells.find((c) => c.coord.x === 9 && c.coord.y === 8);
        expect(waterCell?.cell.terrain).toBe('water');
    });
});
