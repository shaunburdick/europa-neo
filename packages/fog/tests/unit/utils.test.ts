/**
 * Unit Tests: PlayerView query + hash helpers — Feature 002 (T018)
 *
 * Covers `isVisible`, `visibleCellAt`, and `hashPlayerView`:
 *   - `isVisible`: cell present → true; absent → false; empty view →
 *     false for any coord.
 *   - `visibleCellAt`: returns the `CellView` for present coords and
 *     `undefined` for absent ones.
 *   - `hashPlayerView`: determinism (same view → same hash) and
 *     sensitivity (different cells / tick / pipes → different hash).
 *
 * Views are built through the fixture builder + the engine's
 * `getCell` so the tests exercise real decoded payloads rather than
 * hand-rolled stand-ins.
 */

import { getCell } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { hashPlayerView, isVisible, visibleCellAt } from '../../src/utils';
import { buildExpectedPlayerView } from '../fixtures/view';
import { buildWorldWithTroops } from '../fixtures/world';

/** Build a small two-cell view for query-helper tests. */
function buildSmallView() {
    const world = buildWorldWithTroops(16, [
        [8, 8, 1, 5],
        [9, 8, 2, 3],
    ]);
    const cells = [getCell(world, 8, 8), getCell(world, 9, 8)];
    return {
        world,
        view: buildExpectedPlayerView(1, world.tick, cells, world.config),
    };
}

describe('isVisible (PlayerView query)', () => {
    it('returns true for a present coord', () => {
        const { view } = buildSmallView();
        expect(isVisible(view, { x: 8, y: 8 })).toBe(true);
        expect(isVisible(view, { x: 9, y: 8 })).toBe(true);
    });

    it('returns false for an absent coord', () => {
        const { view } = buildSmallView();
        expect(isVisible(view, { x: 0, y: 0 })).toBe(false);
        expect(isVisible(view, { x: 8, y: 9 })).toBe(false);
    });

    it('returns false for any coord on an empty view', () => {
        const world = buildWorldWithTroops(16, [[8, 8, 2, 5]]);
        const empty = buildExpectedPlayerView(1, world.tick, [], world.config);
        expect(isVisible(empty, { x: 8, y: 8 })).toBe(false);
        expect(isVisible(empty, { x: 0, y: 0 })).toBe(false);
    });
});

describe('visibleCellAt (PlayerView lookup)', () => {
    it('returns the CellView for present coords', () => {
        const { world, view } = buildSmallView();
        expect(visibleCellAt(view, { x: 9, y: 8 })).toEqual(getCell(world, 9, 8));
    });

    it('returns undefined for absent coords', () => {
        const { view } = buildSmallView();
        expect(visibleCellAt(view, { x: 15, y: 15 })).toBeUndefined();
    });
});

describe('hashPlayerView', () => {
    it('is deterministic: identical views hash identically across calls', () => {
        const first = buildSmallView();
        const second = buildSmallView(); // same seed → identical world
        expect(hashPlayerView(first.view)).toBe(hashPlayerView(second.view));
        // Repeated hashing of the same object is stable too.
        expect(hashPlayerView(first.view)).toBe(hashPlayerView(first.view));
    });

    it('is sensitive to visibleCells length', () => {
        const { view } = buildSmallView();
        const shorter = buildExpectedPlayerView(view.player, view.tick, view.visibleCells.slice(0, 1), view.config);
        expect(hashPlayerView(shorter)).not.toBe(hashPlayerView(view));
    });

    it('is sensitive to tick changes', () => {
        const { view } = buildSmallView();
        const later = buildExpectedPlayerView(view.player, view.tick + 1, view.visibleCells, view.config);
        expect(hashPlayerView(later)).not.toBe(hashPlayerView(view));
    });

    it('is sensitive to pipe differences (Set fields are normalized)', () => {
        const { view } = buildSmallView();
        const piped = buildExpectedPlayerView(view.player, view.tick, view.visibleCells, view.config);
        // Mutate one cell's pipe set on a copy of the view.
        const mutatedCells = view.visibleCells.map((cell, idx) =>
            idx === 0 ? { ...cell, pipes: new Set(['N'] as const) } : cell,
        );
        const mutated = { ...piped, visibleCells: mutatedCells };
        expect(hashPlayerView(mutated)).not.toBe(hashPlayerView(view));
    });

    it('returns a 16-char lowercase hex string', () => {
        const { view } = buildSmallView();
        const hash = hashPlayerView(view);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
});
