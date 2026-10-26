/**
 * Minimap viewport-rect component tests — issue #76 (T111, FR-019).
 *
 * Asserts the minimap's viewport rectangle reflects the CURRENT
 * camera live: after a `setCamera` dispatch (zoom + pan), the canvas
 * repaints with the new rect. Pins the wiring from camera state →
 * minimap paint (the pure `viewportRect` geometry is covered in
 * minimap.test.tsx).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement, useSyncExternalStore } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { MINIMAP_SIZE_PX, viewportRect } from '../../../src/qol/minimap';
import { boardCenterScreen, zoomedCamera } from '../../../src/qol/zoom';
import { buildMapView } from '../../../src/state/build-map-view';
import { createConsoleStore } from '../../../src/state/store';
import type { ConsoleState, MapView, MapViewId } from '../../../src/state/types';
import { Sidebar } from '../../../src/ui/sidebar';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** A live (player) console state with a view + selection. */
function liveState(): ConsoleState {
    const view = buildPlayerView({
        width: 8,
        height: 8,
        playerId: 1,
        visibleCells: [
            buildCellView({
                coord: { x: 4, y: 4 },
                elevation: 50,
                troops: 10,
                owner: 1,
                pipes: new Set(['N']),
            }),
        ],
    });
    return createLiveConsoleState(view);
}

/**
 * App-like harness: subscribes to the store and re-renders the
 * Sidebar with the committed state (mirrors `App`'s
 * `useSyncExternalStore` wiring so camera changes flow through).
 */
function SidebarHarness({ store, mapView }: { store: ReturnType<typeof createConsoleStore>; mapView: MapView }) {
    const state = useSyncExternalStore(
        (onChange) => store.subscribe(onChange),
        () => store.getState(),
        () => store.getState(),
    );
    return createElement(Sidebar, {
        state,
        selectionReserves: 0,
        boardWidth: mapView.width,
        boardHeight: mapView.height,
        cells: [...mapView.cells.values()],
        onSetCamera: (camera) => {
            store.dispatch({ kind: 'setCamera', camera });
        },
        onSurrenderRequest: () => undefined,
        onHelpToggle: () => undefined,
    });
}

/** Render the sidebar bound to a real store (camera flows through it). */
async function mountSidebarWithStore(state: ConsoleState) {
    const store = createConsoleStore(state);
    const mapView = buildMapViewOf(state);
    await render(createElement(SidebarHarness, { store, mapView }));
    return { store, mapView };
}

/** Build the MapView the sidebar derives its board props from. */
function buildMapViewOf(state: ConsoleState): MapView {
    const view = state.latestView;
    if (view === null || view === undefined) {
        throw new Error('buildMapViewOf requires a live state with a latestView');
    }
    return buildMapView({
        id: 'minimap-viewport-test' as MapViewId,
        view,
        camera: state.camera,
        hover: null,
        selection: null,
        exclusiveMode: false,
        prevView: null,
        nowMs: 0,
        viewportOffset: { x: 0, y: 0 },
    });
}

/** Last `strokeRect` call args (the viewport rect paint). */
function lastStrokeRect(spy: ReturnType<typeof vi.spyOn>): { x: number; y: number; w: number; h: number } {
    const call = spy.mock.calls.at(-1);
    expect(call, 'strokeRect was called').toBeDefined();
    const [x, y, w, h] = call as [number, number, number, number];
    return { x, y, w, h };
}

describe('Minimap viewport rect after setCamera (FR-019)', () => {
    test('zooming in repaints the rect for the new camera', async () => {
        const state = liveState();
        const { store, mapView } = await mountSidebarWithStore(state);
        const strokeSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'strokeRect');

        const board = { width: mapView.width, height: mapView.height };
        const camera = store.getState().camera;
        const next = zoomedCamera(camera, -100, boardCenterScreen(camera, board), board);
        store.dispatch({ kind: 'setCamera', camera: next });

        // The effect repaints after the dispatch commits.
        await vi.waitFor(() => {
            expect(strokeSpy.mock.calls.length).toBeGreaterThan(0);
        });
        const painted = lastStrokeRect(strokeSpy);
        const expected = viewportRect(store.getState().camera, board);
        // The wheel lands on a fractional zoom (32 × 1.15 = 36.8), so each
        // edge snaps to the pixel nearest it and the 1 px stroke covers one
        // whole column/row (issue #209).
        const left = Math.round(expected.x) + 0.5;
        const top = Math.round(expected.y) + 0.5;
        const right = Math.round(expected.x + expected.w) + 0.5;
        const bottom = Math.round(expected.y + expected.h) + 0.5;
        expect(painted.x).toBeCloseTo(left, 4);
        expect(painted.y).toBeCloseTo(top, 4);
        expect(painted.w).toBeCloseTo(right - left, 4);
        expect(painted.h).toBeCloseTo(bottom - top, 4);
    });

    test('panning shifts the rect without resizing it', async () => {
        const state = liveState();
        const { store, mapView } = await mountSidebarWithStore(state);
        const strokeSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'strokeRect');

        const board = { width: mapView.width, height: mapView.height };
        const camera = store.getState().camera;
        const panned = { ...camera, pan: { x: -32, y: -64 } };
        store.dispatch({ kind: 'setCamera', camera: panned });

        await vi.waitFor(() => {
            expect(strokeSpy.mock.calls.length).toBeGreaterThan(0);
        });
        const painted = lastStrokeRect(strokeSpy);
        const expected = viewportRect(store.getState().camera, board);
        // At a whole-pixel rect the snap is the same `+0.5` alignment.
        expect(painted.x).toBeCloseTo(expected.x + 0.5, 4);
        expect(painted.y).toBeCloseTo(expected.y + 0.5, 4);
        expect(painted.w).toBeCloseTo(expected.w, 4);
        expect(painted.h).toBeCloseTo(expected.h, 4);
        expect(painted.x).toBeGreaterThanOrEqual(0.5);
        expect(painted.y).toBeGreaterThanOrEqual(0.5);
        expect(painted.x + painted.w).toBeLessThanOrEqual(MINIMAP_SIZE_PX + 0.5);
        expect(painted.y + painted.h).toBeLessThanOrEqual(MINIMAP_SIZE_PX + 0.5);
    });
});
