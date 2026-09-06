/**
 * App layout component tests — issue #76 (T099, FR-014/FR-016).
 *
 * Asserts `europa-main` is `display: flex` with `europa-board-area`
 * left (flex-grow: 1) and `europa-sidebar` right (fixed ~280px), and
 * that the sidebar stays static during zoom/pan (FR-016 — only the
 * board area's transform changes).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { App } from '../../../src/render/App';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';
// The layout assertions read computed styles from the app's own stylesheet
// (flex row, ~280px sidebar) — load it for this suite only.
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** A live store around a small board. */
function makeStore(): ConsoleStore {
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
    return createConsoleStore(createLiveConsoleState(view));
}

describe('App two-column layout (FR-014)', () => {
    test('europa-main is flex with board area left and sidebar right', async () => {
        // Desktop viewport — the sidebar's 280px fixed width is only
        // enforced above the 768px responsive breakpoint (FR-020).
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const main = document.querySelector<HTMLElement>('.europa-main');
        expect(main).not.toBeNull();
        const mainStyle = window.getComputedStyle(main as HTMLElement);
        expect(mainStyle.display).toBe('flex');

        const board = document.querySelector<HTMLElement>('.europa-board-area');
        const sidebar = document.querySelector<HTMLElement>('.europa-sidebar');
        expect(board).not.toBeNull();
        expect(sidebar).not.toBeNull();

        const boardStyle = window.getComputedStyle(board as HTMLElement);
        expect(boardStyle.flexGrow).toBe('1');

        const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 0;
        expect(sidebarWidth).toBeGreaterThanOrEqual(240);
        expect(sidebarWidth).toBeLessThanOrEqual(320);

        // Sidebar sits to the RIGHT of the board area.
        const boardRect = (board as HTMLElement).getBoundingClientRect();
        const sidebarRect = (sidebar as HTMLElement).getBoundingClientRect();
        expect(sidebarRect.left).toBeGreaterThanOrEqual(boardRect.right - 1);
    });
});

describe('App sidebar static during zoom/pan (FR-016)', () => {
    test('sidebar geometry is unchanged across setCamera dispatches', async () => {
        await page.viewport(1024, 768);
        const store = makeStore();
        await render(<App store={store} />);

        const sidebar = document.querySelector<HTMLElement>('.europa-sidebar');
        expect(sidebar).not.toBeNull();
        const before = sidebar?.getBoundingClientRect();

        // Dispatch a zoom + pan through the store.
        store.dispatch({
            kind: 'setCamera',
            camera: { zoom: 64, pan: { x: -100, y: -50 }, minZoom: 32, maxZoom: 96 },
        });

        const after = sidebar?.getBoundingClientRect();
        expect(after?.x).toBe(before?.x);
        expect(after?.y).toBe(before?.y);
        expect(after?.width).toBe(before?.width);
        expect(after?.height).toBe(before?.height);
    });
});

describe('Grid overlay alignment with canvas viewportOffset', () => {
    test('grid overlay uses top-left anchor, not inset stretch', async () => {
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const grid = document.querySelector<HTMLElement>('#map');
        expect(grid).not.toBeNull();

        const style = window.getComputedStyle(grid as HTMLElement);
        expect(style.position).toBe('absolute');
        expect(style.top).toBe('0px');
        expect(style.left).toBe('0px');
        // inset:0 would pin right/bottom to 0px — the top-left anchor with
        // explicit width/height means the grid has explicit dimensions set.
        expect(style.right).not.toBe('0px');
        expect((grid as HTMLElement).style.width).toBeTruthy();
    });

    test('grid overlay transform matches expected viewport offset', async () => {
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const grid = document.querySelector<HTMLElement>('#map');
        expect(grid).not.toBeNull();

        // Inline style: width/height = boardSize * zoom, transform = translate(Xpx, Ypx)
        const inlineTransform = (grid as HTMLElement).style.transform;
        expect(inlineTransform).toMatch(/translate\(/);

        const match = inlineTransform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
        expect(match).not.toBeNull();
        const parsedX = parseFloat(match![1]);
        const parsedY = parseFloat(match![2]);

        // Derive actual zoom from the grid's inline width (set by fitZoom init)
        const boardCells = 8;
        const actualBoardPx = parseFloat((grid as HTMLElement).style.width);
        const actualZoom = actualBoardPx / boardCells;

        const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
        expect(boardArea).not.toBeNull();
        const containerW = (boardArea as HTMLElement).getBoundingClientRect().width;
        const containerH = (boardArea as HTMLElement).getBoundingClientRect().height;

        // Compute expected viewport offset using the actual zoom — mirrors App.tsx useMemo
        const offX = actualBoardPx < containerW ? -(containerW - actualBoardPx) / 2 : 0;
        const offY = actualBoardPx < containerH ? -(containerH - actualBoardPx) / 2 : 0;

        // GridOverlay negates viewportOffset in its inline transform:
        //   translate(${-viewportOffset.x}px, ${-viewportOffset.y}px)
        expect(parsedX).toBeCloseTo(-offX, 0);
        expect(parsedY).toBeCloseTo(-offY, 0);

        // Inline grid dimensions = boardCells * actualZoom
        expect((grid as HTMLElement).style.width).toBe(`${actualBoardPx}px`);
        expect((grid as HTMLElement).style.height).toBe(`${actualBoardPx}px`);
    });
});
