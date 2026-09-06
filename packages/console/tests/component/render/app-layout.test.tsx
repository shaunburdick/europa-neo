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
