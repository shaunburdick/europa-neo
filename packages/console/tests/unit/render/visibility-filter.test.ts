/**
 * Unit tests: visibility horizon filter — Feature 005 (T038).
 *
 * Covers FR-001 + data-model.md §2/§17: exactly one entry per
 * `visibleCells[i]`, out-of-horizon cells absent (renderer paints
 * void), coordKey/keyToCoord round-trip, no duplication or missing
 * entries.
 */

import { describe, expect, test } from 'vitest';
import { filterVisibleCells } from '../../../src/render/visibility-filter';
import { cellViewToRenderInfo, coordKey, keyToCoord } from '../../../src/state/build-map-view';
import { buildCellView, buildPlayerView } from '../../fixtures/player-view';

describe('filterVisibleCells (T038 / FR-001)', () => {
    test('returns one entry per visibleCells[i], keyed by coordKey', () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [
                buildCellView({ coord: { x: 1, y: 2 }, elevation: 30, troops: 5, owner: 1 }),
                buildCellView({ coord: { x: 3, y: 4 }, terrain: 'water' }),
                buildCellView({
                    coord: { x: 8, y: 9 },
                    elevation: 220,
                    isCity: true,
                    owner: 2,
                    troops: 12,
                }),
            ],
        });

        const cells = filterVisibleCells(view);

        expect(cells.size).toBe(view.visibleCells.length);
        expect([...cells.keys()].sort()).toEqual(['1,2', '3,4', '8,9'].sort());
    });

    test('cells outside the horizon are absent from the result', () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            // Only a 2-cell sliver of the 100-cell board is visible.
            visibleCells: [buildCellView({ coord: { x: 0, y: 0 } }), buildCellView({ coord: { x: 1, y: 0 } })],
        });

        const cells = filterVisibleCells(view);

        expect(cells.size).toBe(2);
        expect(cells.has('0,0')).toBe(true);
        expect(cells.has('1,0')).toBe(true);
        // Out-of-horizon probes — must NOT be present.
        expect(cells.has('2,0')).toBe(false);
        expect(cells.has('9,9')).toBe(false);
        expect(cells.has('5,5')).toBe(false);
    });

    test('map size === visibleCells.length (no duplication, no missing)', () => {
        const visibleCells = Array.from({ length: 25 }, (_, i) =>
            buildCellView({ coord: { x: i % 5, y: Math.floor(i / 5) }, elevation: i * 10 }),
        );
        const view = buildPlayerView({ width: 5, height: 5, visibleCells });

        const cells = filterVisibleCells(view);

        expect(view.visibleCells.length).toBe(25);
        expect(cells.size).toBe(visibleCells.length);
        expect(new Set(cells.keys()).size).toBe(cells.size);
    });

    test('coordKey(coord) round-trips via keyToCoord(key)', () => {
        const coords = [
            { x: 0, y: 0 },
            { x: 31, y: 31 },
            { x: 5, y: 7 },
            { x: 123, y: 456 },
        ];
        for (const coord of coords) {
            expect(keyToCoord(coordKey(coord))).toEqual(coord);
        }
    });

    test('values are CellRenderInfo conversions of the engine CellViews', () => {
        const source = buildCellView({
            coord: { x: 6, y: 3 },
            elevation: 200,
            terrain: 'land',
            troops: 32,
            owner: 1,
            isCity: true,
            pipes: new Set(['N', 'E']),
            reservesPct: 7,
        });
        const view = buildPlayerView({ width: 10, height: 10, visibleCells: [source] });

        const cells = filterVisibleCells(view);

        expect(cells.get('6,3')).toEqual(cellViewToRenderInfo(source));
        const info = cells.get('6,3');
        expect(info?.terrain).toBe('land');
        expect(info?.elevation).toBe(200);
        expect(info?.troops).toBe(32);
        expect(info?.owner).toBe(1);
        expect(info?.isCity).toBe(true);
        expect(info?.pipes).toEqual(new Set(['N', 'E']));
        expect(info?.reservesPct).toBe(7);
    });
});
