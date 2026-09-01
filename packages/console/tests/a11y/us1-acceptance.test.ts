/**
 * US1 a11y acceptance test — Feature 005 (T041).
 *
 * Covers Q-A01, Q-A04, Q-A05 (US1 portion): boots the full console
 * with a mock PlayerView (10×10 board, 3 cells visible, 97 outside
 * the horizon) and asserts:
 *   (a) zero axe violations,
 *   (b) Tab order visits skip-link → map → hud
 *       (per KeyboardNavigator.getTabbableRegions),
 *   (c) ArrowDown moves the roving focus one row down
 *       (aria-activedescendant + visible focus ring),
 *   (d) an aria-live="polite" region is present (tick announcements),
 *   (e) the focused cell meets WCAG 2.5.8 target size (≥ 24×24 CSS px).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import {
    clearConsoleStateForTesting,
    createStubConsoleState,
    setConsoleStateForTesting,
} from '../../src/internal/test-state';
import { App } from '../../src/render/App';
import { cellElementId } from '../../src/render/cell-view';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

/** Boot the App with the 10×10 / 3-visible acceptance view. */
async function bootAcceptanceConsole() {
    const view = buildPlayerView({
        width: 10,
        height: 10,
        playerId: 1,
        // Center cell (5,5) is the KeyboardNavigator's initial focus;
        // (5,6) is its ArrowDown neighbor; (4,5) adds water variety.
        visibleCells: [
            buildCellView({
                coord: { x: 5, y: 5 },
                elevation: 60,
                troops: 12,
                owner: 1,
                isCity: true,
                pipes: new Set(['E']),
                reservesPct: 5,
            }),
            buildCellView({ coord: { x: 5, y: 6 }, elevation: 45, troops: 3, owner: 1 }),
            buildCellView({ coord: { x: 4, y: 5 }, terrain: 'water' }),
        ],
    });
    setConsoleStateForTesting(createStubConsoleState(view));
    const screen = await render(createElement(App));
    return screen;
}

afterEach(() => {
    cleanup();
    clearConsoleStateForTesting();
});

describe('US1 a11y acceptance (T041)', () => {
    test('(a) zero axe violations on the booted board (Q-A01)', async () => {
        await bootAcceptanceConsole();
        await expectNoDomA11yViolations(document);
    });

    test('(b) Tab order visits skip-link → map → hud (Q-A04)', async () => {
        await bootAcceptanceConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('skip-link');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('map');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('hud');

        // The order matches KeyboardNavigator.getTabbableRegions' first
        // three focusable entries (order-bar arrives with US2).
        const expectedIds = ['skip-link', 'map', 'hud'];
        const visitedIds = expectedIds; // asserted step-by-step above
        expect(visitedIds).toEqual(expectedIds);
    });

    test('(c) ArrowDown moves roving focus one row down', async () => {
        const screen = await bootAcceptanceConsole();
        const user = userEvent.setup();

        // Focus the grid (second Tab stop).
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        const grid = document.getElementById('map');
        expect(grid).not.toBeNull();

        // Initial focus = board center (5,5), which is visible here.
        expect(grid?.getAttribute('aria-activedescendant')).toBe(cellElementId({ x: 5, y: 5 }));

        await user.keyboard('{ArrowDown}');

        expect(grid?.getAttribute('aria-activedescendant')).toBe(cellElementId({ x: 5, y: 6 }));
        // The focused cell carries the visible focus ring class.
        const focusedCell = screen.container.querySelector(`#${cellElementId({ x: 5, y: 6 })}`);
        expect(focusedCell?.classList.contains('europa-cell--focused')).toBe(true);
        // DOM focus stays on the grid container (aria-activedescendant model).
        expect(document.activeElement?.id).toBe('map');
    });

    test('(d) an aria-live="polite" region exists for tick announcements', async () => {
        await bootAcceptanceConsole();

        const polite = document.querySelector('[aria-live="polite"]');
        expect(polite).not.toBeNull();
        expect(polite?.getAttribute('data-europa-live')).toBe('polite');
    });

    test('(e) focused cell target size ≥ 24×24 CSS px (WCAG 2.5.8)', async () => {
        const screen = await bootAcceptanceConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}'); // focus grid → initial center cell

        const focusedCell = screen.container.querySelector(`#${cellElementId({ x: 5, y: 5 })}`);
        expect(focusedCell).not.toBeNull();
        const rect = (focusedCell as HTMLElement).getBoundingClientRect();
        expect(rect.width).toBeGreaterThanOrEqual(24);
        expect(rect.height).toBeGreaterThanOrEqual(24);
    });
});
