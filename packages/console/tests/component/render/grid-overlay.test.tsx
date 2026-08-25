/**
 * Component tests: ARIA grid overlay — Feature 005 (T039).
 *
 * Covers Q-B03, Q-B04, Q-A01: role="grid" + aria-label, one
 * gridcell per visible cell with explicit indices, the full
 * accessible-name contract (coordinates / troops / owner / pipes /
 * city), and a clean axe scan.
 *
 * Runs in Vitest Browser Mode (real Chromium) per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { DEFAULT_CAMERA } from '../../../src/config';
import { GridOverlay } from '../../../src/render/grid-overlay';
import { buildMapView } from '../../../src/state/build-map-view';
import type { MapView, MapViewId } from '../../../src/state/types';
import { buildCellView, buildPlayerView } from '../../fixtures/player-view';
import { expectNoDomA11yViolations } from '../../setup';
import '../../../src/styles/index.css';

/** Build a MapView snapshot around a PlayerView (test defaults). */
function mapViewFrom(view: ReturnType<typeof buildPlayerView>): MapView {
    return buildMapView({
        id: 'mv-test' as MapViewId,
        view,
        camera: DEFAULT_CAMERA,
        hover: null,
        selection: null,
        exclusiveMode: false,
        prevView: null,
        nowMs: 0,
    });
}

afterEach(() => {
    cleanup();
});

describe('GridOverlay (T039 / Q-B03, Q-B04, Q-A01)', () => {
    test('renders role="grid" with aria-label="Game board"', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [buildCellView({ coord: { x: 2, y: 3 } })],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        const grid = screen.container.querySelector('[role="grid"]');
        expect(grid).not.toBeNull();
        expect(grid?.getAttribute('aria-label')).toBe('Game board');
    });

    test('renders exactly one gridcell per visible cell with row/col indices', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [
                buildCellView({ coord: { x: 5, y: 7 } }),
                buildCellView({ coord: { x: 0, y: 0 } }),
                buildCellView({ coord: { x: 9, y: 2 } }),
            ],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        const cells = screen.container.querySelectorAll('[role="gridcell"]');
        expect(cells.length).toBe(3);

        const target = screen.container.querySelector('#europa-cell-5-7');
        expect(target?.getAttribute('aria-rowindex')).toBe('8'); // 1-based
        expect(target?.getAttribute('aria-colindex')).toBe('6'); // 1-based
    });

    test('out-of-horizon cells emit no a11y node', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [buildCellView({ coord: { x: 4, y: 4 } })],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        // 100-cell board, 1 visible → exactly 1 gridcell; every other
        // coordinate is void with no DOM presence.
        expect(screen.container.querySelectorAll('[role="gridcell"]').length).toBe(1);
        expect(screen.container.querySelector('#europa-cell-0-0')).toBeNull();
        expect(screen.container.querySelector('#europa-cell-9-9')).toBeNull();
    });

    test('aria-label includes coordinates, troops, owner, city, and pipes (Q-B04)', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [
                buildCellView({
                    coord: { x: 5, y: 7 },
                    troops: 32,
                    owner: 1,
                    isCity: true,
                    pipes: new Set(['N', 'E']),
                    reservesPct: 7,
                }),
            ],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        const label = screen.container.querySelector('#europa-cell-5-7')?.getAttribute('aria-label');
        expect(label).toContain('(5, 7)');
        expect(label).toContain('32 troops');
        expect(label).toContain('Player 1');
        expect(label).toContain('city');
        expect(label).toContain('pipes: N, E');
    });

    test('empty cell announces unowned with zero troops and no pipe segment', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [buildCellView({ coord: { x: 1, y: 1 }, terrain: 'water' })],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        const label = screen.container.querySelector('#europa-cell-1-1')?.getAttribute('aria-label');
        expect(label).toContain('0 troops');
        expect(label).toContain('unowned');
        expect(label).not.toContain('pipes:');
        expect(label).not.toContain('city');
    });

    test('cells sit at board-absolute pixel offsets from the grid top-left', async () => {
        // Regression guard for the double-vertical-offset defect: rows
        // used to be positioned containers, so a cell's board-absolute
        // `top: y*zoom` was applied INSIDE a row already offset by
        // `y*zoom` — effective y = 2·y·zoom. Row 0 aligned; every later
        // row drifted below the canvas as horizontal "bands". Rows are
        // now non-positioned ARIA pass-throughs, so each cell must sit
        // exactly y*zoom below / x*zoom right of the grid's top-left.
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [buildCellView({ coord: { x: 0, y: 2 } }), buildCellView({ coord: { x: 4, y: 7 } })],
        });
        const screen = await render(<GridOverlay mapView={mapViewFrom(view)} />);

        const grid = screen.container.querySelector('[role="grid"]');
        expect(grid).not.toBeNull();
        const gridRect = (grid as HTMLElement).getBoundingClientRect();

        /** Assert the cell sits within ±1px of an expected grid offset. */
        function expectOffsetAt(cellId: string, expectedX: number, expectedY: number): void {
            const cell = screen.container.querySelector(`#${cellId}`);
            expect(cell).not.toBeNull();
            const rect = (cell as HTMLElement).getBoundingClientRect();
            expect(Math.abs(rect.top - gridRect.top - expectedY)).toBeLessThanOrEqual(1);
            expect(Math.abs(rect.left - gridRect.left - expectedX)).toBeLessThanOrEqual(1);
        }

        const { zoom } = DEFAULT_CAMERA;
        // The reported defect's shape: cell (0,2) at zoom 32 must sit
        // ~64px from the grid top — NOT ~128px.
        expectOffsetAt('europa-cell-0-2', 0 * zoom, 2 * zoom);
        // A second row plus the horizontal axis for one cell.
        expectOffsetAt('europa-cell-4-7', 4 * zoom, 7 * zoom);
    });

    test('axe finds zero WCAG 2.2 A/AA violations on the overlay (Q-A01)', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            visibleCells: [
                buildCellView({
                    coord: { x: 5, y: 7 },
                    troops: 32,
                    owner: 1,
                    isCity: true,
                    pipes: new Set(['N', 'E']),
                    reservesPct: 7,
                }),
                buildCellView({ coord: { x: 2, y: 3 }, terrain: 'water', troops: 5, owner: 2 }),
                buildCellView({ coord: { x: 8, y: 8 }, elevation: 200 }),
            ],
        });
        await render(<GridOverlay mapView={mapViewFrom(view)} />);

        await expectNoDomA11yViolations(document);
    });
});
