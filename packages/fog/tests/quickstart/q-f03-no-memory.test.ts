/**
 * Quickstart Q-F03 — No memory of previously seen terrain
 * Feature 002, US2 AC-1 + AC-2, FR-004 (T031)
 *
 * Per quickstart.md §2 Q-F03:
 *   - Destroying the viewer stack (count → 0) causes the
 *     previously-visible cells to be absent from the next PlayerView.
 *   - A friendly stack marching out of range causes the region to
 *     revert to unknown.
 *   - Cities alone do not project vision: a player with a city but
 *     no troops sees zero cells.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/index';
import { isVisible } from '../../src/utils';
import { buildWorldWithCities, buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

describe('Q-F03 — no memory of previously seen terrain', () => {
    it('destroying the viewer stack empties the next view (no carried-over cells)', () => {
        const before = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        expect(computePlayerView(before, 1).visibleCells.length).toBeGreaterThan(0);

        // Destroy via the same mutation path combat uses.
        const counts = new Uint32Array(before.state.troopCounts);
        counts[8 * 16 + 8] = 0;
        const after = { ...before, state: { ...before.state, troopCounts: counts } };

        const view = computePlayerView(after, 1);
        expect(view.visibleCells).toHaveLength(0);
    });

    it('a stack marching out of range reverts the old region to unknown', () => {
        const before = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [8, 8, 1, 5],
                [13, 13, 1, 5],
            ]),
            RADIUS,
        );
        const viewBefore = computePlayerView(before, 1);
        expect(isVisible(viewBefore, { x: 8, y: 8 })).toBe(true);

        // March the (8,8) stack away to the far corner; the (13,13)
        // stack stays. The region around (8,8) must revert to unknown —
        // including for cells only the moved stack could see.
        const owners = new Uint8Array(before.state.troopOwners);
        const counts = new Uint32Array(before.state.troopCounts);
        owners[8 * 16 + 8] = 0;
        counts[8 * 16 + 8] = 0;
        owners[0 * 16 + 0] = 1;
        counts[0 * 16 + 0] = 5;
        const after = {
            ...before,
            state: { ...before.state, troopOwners: owners, troopCounts: counts },
        };

        const viewAfter = computePlayerView(after, 1);
        expect(isVisible(viewAfter, { x: 8, y: 8 })).toBe(false);
        expect(isVisible(viewAfter, { x: 6, y: 6 })).toBe(false); // only-old-stack cell
        expect(isVisible(viewAfter, { x: 13, y: 13 })).toBe(true); // still visible
    });

    it('cities alone do not project vision: city owner with no troops sees zero cells', () => {
        const world = withVisibilityRadius(
            buildWorldWithCities(16, [
                [8, 8, 1],
                [3, 3, 2],
            ]),
            RADIUS,
        );
        const view = computePlayerView(world, 1);
        expect(view.visibleCells).toHaveLength(0);
    });
});
