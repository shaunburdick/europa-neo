/**
 * A11y acceptance — waiting-for-opponent overlay (post-playtest fix).
 *
 * Boots the full App in the exact playtested state (joined while the
 * match is still filling) and asserts:
 *   (a) zero axe violations with the overlay up,
 *   (b) the appearance is announced on a polite live region exactly
 *       once (WCAG 4.1.3 Status Messages),
 *   (c) the overlay adds nothing to the Tab order (it is
 *       pointer-transparent and focus-free; the skip link remains the
 *       first Tab stop),
 *   (d) the decorative spinner is hidden from assistive tech.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { App } from '../../src/render/App';
import { formatWaitingMessage } from '../../src/state/awaiting-start';
import { INITIAL_CONSOLE_STATE } from '../../src/state/reducer';
import { createConsoleStore } from '../../src/state/store';
import type { ConsoleState } from '../../src/state/types';
import '../../src/styles/index.css';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
});

/**
 * Boot the App joined-but-filling: live status with only the tick-0
 * join snapshot in hand (no tick broadcast yet). The snapshot carries
 * the seat's own city + horizon (as a real join snapshot would) on
 * the standard 10×10 acceptance board so the ARIA grid mounts.
 */
async function bootAwaitingConsole(): Promise<void> {
    const state: ConsoleState = {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: buildPlayerView({
            width: 10,
            height: 10,
            tick: 0,
            playerId: 1,
            visibleCells: [
                buildCellView({
                    coord: { x: 5, y: 5 },
                    elevation: 60,
                    troops: 12,
                    owner: 1,
                    isCity: true,
                    reservesPct: 5,
                }),
                buildCellView({ coord: { x: 5, y: 6 }, elevation: 45, troops: 3, owner: 1 }),
            ],
        }),
        // A 2-player context: one opponent means capacity = 2, so the
        // N-aware headline resolves to "Waiting for 1 more player… (1/2)".
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1, opponents: ['Opponent'] },
    };
    await render(createElement(App, { store: createConsoleStore(state) }));
}

describe('waiting-for-opponent overlay a11y acceptance', () => {
    test('(a) zero axe violations with the overlay up', async () => {
        await bootAwaitingConsole();
        await expectNoDomA11yViolations(document);
    });

    test('(b) appearance is announced once on a polite live region', async () => {
        await bootAwaitingConsole();

        // Two effect cycles mount the announcer before the announcement
        // lands — poll until one polite node carries exactly the message.
        const carriers = (): number =>
            [...document.querySelectorAll('[data-europa-live="polite"]')].filter(
                (node) => node.textContent === formatWaitingMessage(1, 2),
            ).length;
        await vi.waitFor(() => {
            expect(carriers()).toBe(1);
        });
    });

    test('(c) overlay stays out of the Tab order (skip link first)', async () => {
        await bootAwaitingConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('skip-link');

        // Nothing inside the overlay is focusable; the next stop is the
        // board grid (the contractual Q-A04 head sequence), proving the
        // overlay introduced no tab stops of its own.
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('map');
    });

    test('(d) the spinner is decorative (aria-hidden), text carries meaning', async () => {
        await bootAwaitingConsole();

        // <europa-waiting> renders its structure inside an open shadow root
        // (spec 014 Wave 2), so the internal spinner/text elements are
        // queried through the host's shadowRoot.
        const overlayRoot = document.querySelector('europa-waiting')?.shadowRoot ?? null;
        const pulse = overlayRoot?.querySelector('.europa-waiting__pulse');
        expect(pulse).not.toBeNull();
        expect(pulse?.getAttribute('aria-hidden')).toBe('true');
        expect(overlayRoot?.querySelector('.europa-waiting__text')?.textContent).toBe(formatWaitingMessage(1, 2));
    });
});
