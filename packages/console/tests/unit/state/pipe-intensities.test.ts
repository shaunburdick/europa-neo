/**
 * Unit tests: pipeIntensities in buildMapView — issue #43.
 *
 * Verifies that buildMapView populates the pipeIntensities map
 * correctly for cells with pipes, and leaves it empty for cells
 * without pipes.
 */

import { describe, expect, test } from 'vitest';
import { DEFAULT_CAMERA } from '../../../src/config';
import { buildMapView } from '../../../src/state/build-map-view';
import type { CellView, Coord, Direction, MapViewId, PlayerView } from '../../../src/state/types';

/** Minimal CellView factory. */
function cell(coord: Coord, elevation: number, pipes: ReadonlySet<Direction> = new Set(), troopCount = 0): CellView {
    return {
        coord,
        cell: { x: coord.x, y: coord.y, elevation, terrain: 'land' },
        troopCount,
        troopOwner: troopCount > 0 ? 1 : null,
        pipes,
        reservesPercent: 0,
        cityOwner: null,
    };
}

/** Minimal PlayerView factory. */
function view(cells: CellView[]): PlayerView {
    return {
        player: 1,
        tick: 1,
        visibleCells: cells,
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: {
            boardSize: 8,
            playerCount: 2,
            tickIntervalMs: 250,
            seed: 0,
            visibilityRadius: 2,
        },
    };
}

describe('buildMapView pipeIntensities (issue #43)', () => {
    test('cell without pipes has empty pipeIntensities', () => {
        const mv = buildMapView({
            id: 'mv-0' as MapViewId,
            view: view([cell({ x: 0, y: 0 }, 100)]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('0,0');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.size).toBe(0);
    });

    test('downhill pipe has intensity > 0', () => {
        // src at (1,1) elev 100, dst at (1,0) elev 50 → downhill Δ=-50
        const mv = buildMapView({
            id: 'mv-1' as MapViewId,
            view: view([cell({ x: 1, y: 0 }, 50), cell({ x: 1, y: 1 }, 100, new Set(['N']))]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('1,1');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.get('N')).toBe(1); // capped at 1 (|Δ|=50 > cap=5)
    });

    test('flat pipe has intensity 0', () => {
        const mv = buildMapView({
            id: 'mv-2' as MapViewId,
            view: view([cell({ x: 1, y: 0 }, 100), cell({ x: 1, y: 1 }, 100, new Set(['N']))]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('1,1');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.get('N')).toBe(0);
    });

    test('uphill pipe has intensity > 0', () => {
        // src at (1,1) elev 100, dst at (1,0) elev 103 → uphill Δ=3
        const mv = buildMapView({
            id: 'mv-3' as MapViewId,
            view: view([cell({ x: 1, y: 0 }, 103), cell({ x: 1, y: 1 }, 100, new Set(['N']))]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('1,1');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.get('N')).toBe(3 / 7);
    });

    test('stalled pipe has intensity 0', () => {
        // src at (1,1) elev 100, dst at (1,0) elev 107 → stalled
        const mv = buildMapView({
            id: 'mv-4' as MapViewId,
            view: view([cell({ x: 1, y: 0 }, 107), cell({ x: 1, y: 1 }, 100, new Set(['N']))]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('1,1');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.get('N')).toBe(0);
    });

    test('fog-unknown destination has intensity 0', () => {
        // src at (0,1) has a north pipe, but (0,0) is absent → fog → flat → 0
        const mv = buildMapView({
            id: 'mv-5' as MapViewId,
            view: view([cell({ x: 0, y: 1 }, 100, new Set(['N']))]),
            camera: DEFAULT_CAMERA,
            hover: null,
            selection: null,
            exclusiveMode: false,
            prevView: null,
            nowMs: 0,
        });
        const info = mv.cells.get('0,1');
        expect(info).toBeDefined();
        expect(info?.pipeIntensities.get('N')).toBe(0);
    });
});
