/**
 * Quickstart Q-F02 — Enemy visibility in/out of the horizon
 * Feature 002, US1 AC-3, FR-005 (T025)
 *
 * Per quickstart.md §2 Q-F02:
 *   - Enemy troop inside the viewer's horizon appears in
 *     `visibleCells` with exact `troopOwner` and `troopCount`.
 *   - Enemy troop outside the horizon is absent from `visibleCells`
 *     entirely.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/index';
import { buildWorldWithTroops, TEST_PLAYER_IDS, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

const P1 = TEST_PLAYER_IDS[1];
const P2 = TEST_PLAYER_IDS[2];

describe('Q-F02 — enemy visibility at the horizon boundary', () => {
    it('enemy at (9,8) is inside player\u2019s radius at (8,8): exact owner + count exposed', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [8, 8, P1, 5],
                [9, 8, P2, 7],
            ]),
            RADIUS,
        );
        const view = computePlayerView(world, P1);

        const enemy = view.visibleCells.find((c) => c.coord.x === 9 && c.coord.y === 8);
        expect(enemy).toBeDefined();
        expect(enemy?.troopOwner).toBe(P2);
        expect(enemy?.troopCount).toBe(7);
    });

    it('enemy at (15,15) is outside the horizon: absent from visibleCells entirely', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [8, 8, P1, 5],
                [15, 15, P2, 9],
            ]),
            RADIUS,
        );
        const view = computePlayerView(world, P1);

        expect(view.visibleCells.find((c) => c.coord.x === 15 && c.coord.y === 15)).toBeUndefined();
    });
});
