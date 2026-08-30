/**
 * Branded footer component tests — spec 012 addendum (T-031, FR-023 /
 * FR-026 / FR-027).
 *
 * The app name + version + GitHub link now live in ONE shared
 * `BrandedFooter` mounted at the App view root (the former HUD
 * `v${APP_VERSION}` span was consolidated into it — FR-023: no duplicate
 * version string on a view). The assertions import `APP_VERSION` from
 * `@europa/version` rather than hard-coding `'0.0.0'` so the lockstep bump
 * cannot stale this suite.
 *
 * Coverage here:
 *   - the footer renders inside the mounted App in every connection state —
 *     idle boot, live match, and reconnecting — because it derives from the
 *     bundled constant, not from connection state;
 *   - it carries the app name, the v-prefixed `APP_VERSION` as REAL DOM
 *     text, and a GitHub link pointing at the canonical repository;
 *   - the footer is a `<footer>` landmark; the only interactive element is
 *     the external link (proper `rel`/`target`), so the footer itself
 *     intercepts no pointer/keyboard input.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { APP_VERSION } from '@europa/version';
import { createElement } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { App } from '../../../src/render/App';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleState } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
});

/** Mount the App with an explicit static state (snapshot path). */
async function bootWithState(state: ConsoleState) {
    return render(createElement(App, { state }));
}

/** The branded footer element mounted by the App. */
function brandedFooter(): HTMLElement {
    const footer = document.querySelector('footer');
    if (!(footer instanceof HTMLElement)) {
        throw new Error('branded footer not mounted');
    }
    return footer;
}

describe('Branded footer (spec 012 addendum T-031, FR-023)', () => {
    test('renders app name, v-prefixed APP_VERSION, and GitHub link in the live state', async () => {
        const view = buildPlayerView({
            width: 10,
            height: 10,
            playerId: 1,
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
            ],
        });
        await bootWithState(createLiveConsoleState(view));

        const footer = brandedFooter();
        expect(footer.textContent).toContain('Europa Neo');
        expect(footer.textContent).toContain(`v${APP_VERSION}`);
        const link = footer.querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('href')).toBe('https://github.com/shaunburdick/europa-neo');
    });

    test('renders in the idle boot state (no view, no connection yet)', async () => {
        await bootWithState(INITIAL_CONSOLE_STATE);
        const footer = brandedFooter();
        expect(footer.textContent).toContain('Europa Neo');
        expect(footer.textContent).toContain(`v${APP_VERSION}`);
    });

    test('renders in the reconnecting state', async () => {
        await bootWithState({ ...INITIAL_CONSOLE_STATE, status: 'reconnecting' });
        const footer = brandedFooter();
        expect(footer.textContent).toContain(`v${APP_VERSION}`);
    });

    test('is a footer landmark whose only interactive element is the external link', async () => {
        await bootWithState(INITIAL_CONSOLE_STATE);
        const footer = brandedFooter();
        expect(footer.tagName).toBe('FOOTER');
        // The footer itself is non-interactive; the GitHub link is the only
        // focusable control and carries safe external-link attributes.
        const link = footer.querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toContain('noreferrer');
        expect(link?.getAttribute('rel')).toContain('noopener');
        expect(footer.closest('button, input, select, textarea, [role="button"]')).toBeNull();
    });
});
