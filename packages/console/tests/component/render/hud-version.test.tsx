/**
 * HUD version footer component tests — feature 009 (T-005, SC-004).
 *
 * SC-004 read through the Clarifications v1.0 presentation ruling:
 * the HUD's visible text carries `` `v${APP_VERSION}` `` as REAL DOM
 * text (not canvas, not a title attribute). The assertion imports
 * `APP_VERSION` from `@europa/version` rather than hard-coding
 * `'0.0.0'` so the lockstep bump (T-010) cannot stale this suite.
 *
 * Coverage here:
 *   - the version span renders inside the labelled status bar
 *     (`#hud[aria-label="Status bar"]`) in every connection state —
 *     idle boot, live match, and reconnecting — because it derives
 *     from the bundled constant, not from connection state (works on
 *     the serverless `/` demo too, per spec Edge Cases);
 *   - it is a plain, non-interactive `<span>`: no tabindex, no
 *     pointer/keyboard interception (FR-007);
 *   - axe coverage for contrast/DOM-text lives in the a11y suite,
 *     which scans this same mounted App.
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

/** The HUD's version element, scoped to the labelled status bar. */
function hudVersion(): HTMLElement {
    const hud = document.querySelector('#hud[aria-label="Status bar"]');
    if (hud === null) {
        throw new Error('HUD status bar not mounted');
    }
    const version = hud.querySelector('.europa-hud__version');
    if (!(version instanceof HTMLElement)) {
        throw new Error('version footer not mounted inside #hud');
    }
    return version;
}

describe('HUD version footer (feature 009 T-005, SC-004)', () => {
    test('renders the v-prefixed APP_VERSION as real DOM text in the status bar (live state)', async () => {
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

        const version = hudVersion();
        // Exact visible text — v-prefixed bundled constant (Clarifications
        // presentation ruling), asserted against the imported constant so
        // T-010's bump survives without editing this file.
        expect(version.textContent).toBe(`v${APP_VERSION}`);
    });

    test('renders in the idle boot state (no view, no connection yet)', async () => {
        await bootWithState(INITIAL_CONSOLE_STATE);
        expect(hudVersion().textContent).toBe(`v${APP_VERSION}`);
    });

    test('renders in the reconnecting state', async () => {
        await bootWithState({ ...INITIAL_CONSOLE_STATE, status: 'reconnecting' });
        expect(hudVersion().textContent).toBe(`v${APP_VERSION}`);
    });

    test('is a plain non-interactive span (no pointer/keyboard interception)', async () => {
        await bootWithState(INITIAL_CONSOLE_STATE);
        const version = hudVersion();
        expect(version.tagName).toBe('SPAN');
        expect(version.getAttribute('tabindex')).toBeNull();
        expect(version.closest('button, a, input, select, textarea, [role="button"]')).toBeNull();
    });
});
