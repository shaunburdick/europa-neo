/**
 * Render pipeline invariant — three-layer screen-position agreement.
 *
 * The board is painted by three independent systems that MUST produce
 * identical screen positions for every visible cell:
 *
 *   1. Canvas:      ctx.translate(-offX, -offY) then fillRect(x*zoom, …)
 *   2. GridOverlay: CSS translate(${-offX}px, ${-offY}px) + CellView left/top
 *   3. TargetingOverlay: inline left = x*zoom − offX, top = y*zoom − offY
 *
 * All three satisfy:  screenPos = cell × zoom − viewportOffset
 *
 * This suite boots the full App with a scripted store, derives the
 * actual zoom from the rendered grid, computes the expected viewport
 * offset from the container dimensions, and asserts that every layer
 * agrees within 1 px rounding tolerance.
 *
 * Runs in Vitest Browser Mode (real Chromium) per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { App } from '../../../src/render/App';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';
import '../../../src/styles/index.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Board dimension used by every test in this suite. */
const BOARD_SIZE = 8;

/**
 * Sample cells exercising corners, center, and edges.  All coordinates
 * are within the 0..BOARD_SIZE-1 range.
 */
const SAMPLE_CELLS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
    { x: 0, y: 0 }, // top-left corner
    { x: 7, y: 7 }, // bottom-right corner
    { x: 3, y: 3 }, // center
    { x: 0, y: 7 }, // bottom-left
    { x: 7, y: 0 }, // top-right
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a live ConsoleStore with all sample cells visible. */
function makeStore(): ConsoleStore {
    const view = buildPlayerView({
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        playerId: 1,
        visibleCells: SAMPLE_CELLS.map((coord) =>
            buildCellView({
                coord,
                elevation: 50,
                troops: 10,
                owner: 1,
            }),
        ),
    });
    return createConsoleStore(createLiveConsoleState(view));
}

/**
 * Wait for all sample cells to appear in the grid overlay.  Returns
 * the grid element for convenience.
 */
async function waitForGrid(): Promise<HTMLElement> {
    const grid = document.querySelector<HTMLElement>('#map');
    if (grid === null) {
        throw new Error('Grid overlay (#map) not found in DOM');
    }
    await expect
        .poll(() => grid.querySelectorAll('[role="gridcell"]').length, {
            message: `expected ${SAMPLE_CELLS.length} gridcells, got ${grid.querySelectorAll('[role="gridcell"]').length}`,
        })
        .toBe(SAMPLE_CELLS.length);
    return grid;
}

/**
 * Wait for the TargetingOverlay to appear in the DOM after a
 * `selectCell` dispatch.  Returns the overlay element.
 */
async function waitForTargetingOverlay(): Promise<HTMLElement> {
    await expect
        .poll(() => document.querySelector<HTMLElement>('.europa-targeting'), {
            message: 'TargetingOverlay (.europa-targeting) did not appear after selectCell',
        })
        .not.toBeNull();
    const el = document.querySelector<HTMLElement>('.europa-targeting');
    if (el === null) throw new Error('TargetingOverlay not found after poll');
    return el;
}

/**
 * Derive the actual zoom, container rect, and viewport offset from the
 * live DOM — mirrors the pattern in app-layout.test.tsx.
 *
 * The fit-zoom initialization in App.tsx may set a zoom different from
 * the DEFAULT_CAMERA value, so we always read the actual zoom from the
 * grid's inline width.  The viewport offset is computed from the same
 * formula as src/render/viewport-offset.ts (pan is {0,0} for the
 * initial camera, so the centering branch applies).
 */
function readRenderedGeometry(): {
    readonly zoom: number;
    readonly containerRect: DOMRect;
    readonly viewportOffset: { readonly x: number; readonly y: number };
    readonly boardPx: number;
} {
    const grid = document.querySelector<HTMLElement>('#map');
    if (grid === null) {
        throw new Error('Grid overlay (#map) not found in DOM');
    }
    const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
    if (boardArea === null) {
        throw new Error('Board area (.europa-board-area) not found in DOM');
    }

    const containerRect = boardArea.getBoundingClientRect();
    const boardPx = parseFloat(grid.style.width);
    const zoom = boardPx / BOARD_SIZE;

    // Mirrors computeViewportOffset from src/render/viewport-offset.ts.
    // With initial pan = {0, 0}, the centering branch always applies
    // when the board is smaller than or equal to the container.
    const offX = boardPx < containerRect.width ? -(containerRect.width - boardPx) / 2 : 0;
    const offY = boardPx < containerRect.height ? -(containerRect.height - boardPx) / 2 : 0;

    return { zoom, containerRect, viewportOffset: { x: offX, y: offY }, boardPx };
}

/**
 * Parse the grid container's inline `translate(Xpx, Ypx)` transform
 * into numeric components.  Throws if the transform is missing or
 * unparseable.
 */
function parseGridTransform(): { readonly x: number; readonly y: number } {
    const grid = document.querySelector<HTMLElement>('#map');
    if (grid === null) {
        throw new Error('Grid overlay (#map) not found in DOM');
    }
    const match = grid.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    if (match === null) {
        throw new Error(`Unexpected grid transform: "${grid.style.transform}"`);
    }
    return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}

/**
 * Compute the expected viewport-relative screen position for a cell,
 * given the current rendered geometry.  This is the canonical formula
 * that all three layers must satisfy:
 *
 *   screenX = cell.x × zoom − viewportOffset.x
 *   screenY = cell.y × zoom − viewportOffset.y
 *
 * The result is in viewport coordinates (same space as getBoundingClientRect).
 */
function expectedScreenPos(
    x: number,
    y: number,
    geometry: {
        readonly zoom: number;
        readonly containerRect: DOMRect;
        readonly viewportOffset: { readonly x: number; readonly y: number };
    },
): { readonly left: number; readonly top: number } {
    return {
        left: x * geometry.zoom - geometry.viewportOffset.x + geometry.containerRect.left,
        top: y * geometry.zoom - geometry.viewportOffset.y + geometry.containerRect.top,
    };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Grid overlay transform matches viewportOffset', () => {
    test('translate(...) equals the computed viewportOffset', async () => {
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const grid = await waitForGrid();
        const { viewportOffset, boardPx } = readRenderedGeometry();
        const transform = parseGridTransform();

        // GridOverlay applies translate(${-offX}px, ${-offY}px)
        expect(transform.x).toBeCloseTo(-viewportOffset.x, 0);
        expect(transform.y).toBeCloseTo(-viewportOffset.y, 0);

        // Grid dimensions = boardCells × zoom
        expect(grid.style.width).toBe(`${boardPx}px`);
        expect(grid.style.height).toBe(`${boardPx}px`);
    });
});

describe('CellView positions match the viewportOffset formula', () => {
    test('all sample cells sit within 1 px of x*zoom − offX, y*zoom − offY', async () => {
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const grid = await waitForGrid();
        const geometry = readRenderedGeometry();

        for (const { x, y } of SAMPLE_CELLS) {
            const expected = expectedScreenPos(x, y, geometry);

            const cell = grid.querySelector<HTMLElement>(`#europa-cell-${x}-${y}`);
            expect(cell, `Cell (${x}, ${y}) should exist in the DOM`).not.toBeNull();
            const rect = (cell as HTMLElement).getBoundingClientRect();

            expect(
                Math.abs(rect.left - expected.left),
                `Cell (${x}, ${y}) left: expected ${expected.left}, got ${rect.left}`,
            ).toBeLessThanOrEqual(1);
            expect(
                Math.abs(rect.top - expected.top),
                `Cell (${x}, ${y}) top: expected ${expected.top}, got ${rect.top}`,
            ).toBeLessThanOrEqual(1);
        }
    });
});

describe('TargetingOverlay position matches the viewportOffset formula', () => {
    test('overlay for cell (3, 3) aligns with the same formula', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        await waitForGrid();

        // Select cell (3, 3) so the TargetingOverlay appears.
        store.dispatch({ kind: 'selectCell', cell: { x: 3, y: 3 } });
        const targeting = await waitForTargetingOverlay();

        const geometry = readRenderedGeometry();
        const expected = expectedScreenPos(3, 3, geometry);
        const rect = targeting.getBoundingClientRect();

        expect(Math.abs(rect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.top - expected.top)).toBeLessThanOrEqual(1);
        expect(rect.width).toBeCloseTo(geometry.zoom, 0);
        expect(rect.height).toBeCloseTo(geometry.zoom, 0);
    });

    test('overlay for cell (7, 0) — top-right corner — aligns', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        await waitForGrid();

        store.dispatch({ kind: 'selectCell', cell: { x: 7, y: 0 } });
        const targeting = await waitForTargetingOverlay();

        const geometry = readRenderedGeometry();
        const expected = expectedScreenPos(7, 0, geometry);
        const rect = targeting.getBoundingClientRect();

        expect(Math.abs(rect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.top - expected.top)).toBeLessThanOrEqual(1);
    });
});

describe('CellView and TargetingOverlay agree on screen position', () => {
    test('both layers place cell (3, 3) within 1 px of each other', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        const grid = await waitForGrid();
        const geometry = readRenderedGeometry();

        // Expected screen position for cell (3, 3)
        const expected = expectedScreenPos(3, 3, geometry);

        // Layer 2: CellView (GridOverlay)
        const cell = grid.querySelector<HTMLElement>('#europa-cell-3-3');
        expect(cell).not.toBeNull();
        const cellRect = (cell as HTMLElement).getBoundingClientRect();

        // Layer 3: TargetingOverlay
        store.dispatch({ kind: 'selectCell', cell: { x: 3, y: 3 } });
        const targeting = await waitForTargetingOverlay();
        const targetingRect = targeting.getBoundingClientRect();

        // Both must match the expected position within 1 px.
        expect(Math.abs(cellRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(cellRect.top - expected.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(targetingRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(targetingRect.top - expected.top)).toBeLessThanOrEqual(1);

        // Both must match each other within 1 px.
        expect(Math.abs(cellRect.left - targetingRect.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(cellRect.top - targetingRect.top)).toBeLessThanOrEqual(1);
    });

    test('both layers place cell (0, 7) — bottom-left — within 1 px', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        const grid = await waitForGrid();
        const geometry = readRenderedGeometry();

        const expected = expectedScreenPos(0, 7, geometry);

        const cell = grid.querySelector<HTMLElement>('#europa-cell-0-7');
        expect(cell).not.toBeNull();
        const cellRect = (cell as HTMLElement).getBoundingClientRect();

        store.dispatch({ kind: 'selectCell', cell: { x: 0, y: 7 } });
        const targeting = await waitForTargetingOverlay();
        const targetingRect = targeting.getBoundingClientRect();

        expect(Math.abs(cellRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(cellRect.top - expected.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(targetingRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(targetingRect.top - expected.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(cellRect.left - targetingRect.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(cellRect.top - targetingRect.top)).toBeLessThanOrEqual(1);
    });
});

describe('Canvas dimensions match the board area container', () => {
    test('canvas bitmap dimensions are within 1 px of the container', async () => {
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        // Wait for the canvas to be painted at least once.
        await expect
            .poll(
                () => {
                    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
                    return canvas !== null && canvas.width > 0 && canvas.height > 0;
                },
                { message: 'canvas should have non-zero dimensions after paint' },
            )
            .toBe(true);

        const canvas = document.querySelector<HTMLCanvasElement>('canvas');
        expect(canvas).not.toBeNull();

        const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
        expect(boardArea).not.toBeNull();
        const containerRect = (boardArea as HTMLElement).getBoundingClientRect();

        // Canvas bitmap dimensions are set to Math.round(container) in App.tsx.
        expect(Math.abs((canvas as HTMLCanvasElement).width - Math.round(containerRect.width))).toBeLessThanOrEqual(1);
        expect(Math.abs((canvas as HTMLCanvasElement).height - Math.round(containerRect.height))).toBeLessThanOrEqual(
            1,
        );

        // Canvas CSS dimensions fill the container (width: 100%; height: 100%).
        const canvasRect = (canvas as HTMLCanvasElement).getBoundingClientRect();
        expect(Math.abs(canvasRect.width - containerRect.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(canvasRect.height - containerRect.height)).toBeLessThanOrEqual(1);
    });
});

describe('Zoom change propagates to all layers', () => {
    test('after zooming, CellView and TargetingOverlay positions shift consistently', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        const grid = await waitForGrid();
        const before = readRenderedGeometry();

        // Dispatch a zoom change — double the current zoom and keep pan at {0, 0}
        // so the centering branch still applies.
        const newZoom = before.zoom * 2;
        store.dispatch({
            kind: 'setCamera',
            camera: {
                zoom: newZoom,
                pan: { x: 0, y: 0 },
                minZoom: newZoom,
                maxZoom: newZoom * 3,
            },
        });

        // Wait for the grid to update with the new zoom.
        await expect
            .poll(
                () => {
                    const g = document.querySelector<HTMLElement>('#map');
                    if (g === null) return false;
                    const parsed = parseFloat(g.style.width);
                    // Wait for the board width to reflect the new zoom (8 * newZoom).
                    return Math.abs(parsed - BOARD_SIZE * newZoom) < 1;
                },
                { message: `grid width should update to ${BOARD_SIZE * newZoom} after zoom dispatch` },
            )
            .toBe(true);

        const after = readRenderedGeometry();
        const afterCellEl = grid.querySelector<HTMLElement>('#europa-cell-3-3');
        expect(afterCellEl).not.toBeNull();
        const afterCellRect = (afterCellEl as HTMLElement).getBoundingClientRect();

        // The expected position at the new zoom should match what the DOM reports.
        const expected = expectedScreenPos(3, 3, after);
        expect(Math.abs(afterCellRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterCellRect.top - expected.top)).toBeLessThanOrEqual(1);

        // TargetingOverlay must agree.
        store.dispatch({ kind: 'selectCell', cell: { x: 3, y: 3 } });
        const targeting = await waitForTargetingOverlay();
        const targetingRect = targeting.getBoundingClientRect();

        expect(Math.abs(targetingRect.left - expected.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(targetingRect.top - expected.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterCellRect.left - targetingRect.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterCellRect.top - targetingRect.top)).toBeLessThanOrEqual(1);
    });
});
