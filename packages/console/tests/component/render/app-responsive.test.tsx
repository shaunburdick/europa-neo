/**
 * App responsive layout component tests — issue #76 (T113, FR-020).
 *
 * Below the 768px desktop breakpoint the sidebar MUST stack below the
 * board in a single column (no horizontal overflow). Asserts the
 * media query flips `europa-main` to column and the sidebar to full
 * width below the board area.
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
// (flex row, ~280px sidebar, 768px media query) — load it for this suite only.
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

describe('App responsive stacking (FR-020)', () => {
    test('below 768px the sidebar stacks below the board in one column', async () => {
        // Desktop first: two-column row.
        await page.viewport(1024, 768);
        await render(<App store={makeStore()} />);

        const main = document.querySelector<HTMLElement>('.europa-main');
        const board = document.querySelector<HTMLElement>('.europa-board-area');
        const sidebar = document.querySelector<HTMLElement>('.europa-sidebar');
        expect(main).not.toBeNull();
        expect(board).not.toBeNull();
        expect(sidebar).not.toBeNull();

        const desktopMain = window.getComputedStyle(main as HTMLElement);
        expect(desktopMain.flexDirection).toBe('row');
        const desktopSidebar = window.getComputedStyle(sidebar as HTMLElement);
        expect(desktopSidebar.width).toBe('280px');

        // Narrow: single column, sidebar below the board, full width.
        await page.viewport(600, 800);

        const mobileMain = window.getComputedStyle(main as HTMLElement);
        expect(mobileMain.flexDirection).toBe('column');

        const boardRect = (board as HTMLElement).getBoundingClientRect();
        const sidebarRect = (sidebar as HTMLElement).getBoundingClientRect();
        expect(sidebarRect.top).toBeGreaterThanOrEqual(boardRect.bottom - 1);
        expect(sidebarRect.width).toBeGreaterThanOrEqual(560); // ~full width
    });
});
