/**
 * Acceptance Tests: US1 — Visibility Horizon Around Owned Troops
 * Feature 002 (T023)
 *
 * Covers the three spec US1 acceptance scenarios end-to-end through
 * `computePlayerView` (the same entry point networking will call):
 *
 *   AC-1: Given a lone friendly stack on an open board, When
 *         visibility is computed, Then all cells within the sensor
 *         radius are visible and nothing beyond is.
 *   AC-2: Given two friendly stacks in different regions, When
 *         visibility is computed, Then the visible set is the union
 *         of both stacks' horizons.
 *   AC-3: Given an enemy stack inside my horizon, When I receive
 *         state, Then its position and count are included; enemy
 *         stacks outside my horizon are absent entirely.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/playerView';
import { isVisible } from '../../src/utils';
import { expectedChebyshevDisk } from '../fixtures/view';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Scenario radius per quickstart Q-F01 (Chebyshev range 3). */
const RADIUS = 3;

describe('US1 — Visibility Horizon Around Owned Troops', () => {
    it('AC-1: Given a lone friendly stack on an open board, When visibility is computed, Then all cells within the sensor radius are visible and nothing beyond is', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const view = computePlayerView(world, 1);

        // All cells within the sensor radius are visible.
        const disk = expectedChebyshevDisk({ x: 8, y: 8 }, RADIUS, 16, 16);
        expect(view.visibleCells).toHaveLength(disk.length);
        for (const coord of disk) {
            expect(isVisible(view, coord)).toBe(true);
        }

        // Nothing beyond is: nearest out-of-horizon ring is absent.
        expect(isVisible(view, { x: 4, y: 4 })).toBe(false); // distance 4
        expect(isVisible(view, { x: 12, y: 8 })).toBe(false); // distance 4
        expect(isVisible(view, { x: 0, y: 0 })).toBe(false); // distance 8
    });

    it('AC-2: Given two friendly stacks in different regions, When visibility is computed, Then the visible set is the union of both stacks\u2019 horizons', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [3, 3, 1, 2],
                [12, 12, 1, 2],
            ]),
            RADIUS,
        );
        const view = computePlayerView(world, 1);

        const diskA = expectedChebyshevDisk({ x: 3, y: 3 }, RADIUS, 16, 16);
        const diskB = expectedChebyshevDisk({ x: 12, y: 12 }, RADIUS, 16, 16);

        // Union length = sum of disks (disjoint regions).
        expect(view.visibleCells).toHaveLength(diskA.length + diskB.length);
        for (const coord of [...diskA, ...diskB]) {
            expect(isVisible(view, coord)).toBe(true);
        }
        // A midpoint cell outside both disks stays hidden.
        expect(isVisible(view, { x: 8, y: 8 })).toBe(false);
    });

    it('AC-3: Given an enemy stack inside my horizon, When I receive state, Then its position and count are included; enemy stacks outside my horizon are absent entirely', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [8, 8, 1, 5],
                [10, 8, 2, 7], // inside: Chebyshev distance 2
                [15, 15, 2, 9], // outside: Chebyshev distance 7
            ]),
            RADIUS,
        );
        const view = computePlayerView(world, 1);

        // Inside: position AND exact count exposed.
        const inside = view.visibleCells.find((c) => c.coord.x === 10 && c.coord.y === 8);
        expect(inside).toBeDefined();
        expect(inside?.troopOwner).toBe(2);
        expect(inside?.troopCount).toBe(7);

        // Outside: absent ENTIRELY — not redacted-with-placeholder.
        expect(view.visibleCells.find((c) => c.coord.x === 15 && c.coord.y === 15)).toBeUndefined();
    });
});
