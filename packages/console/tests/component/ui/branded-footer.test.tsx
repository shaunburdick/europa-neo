/**
 * Branded footer presence tests — spec 012 addendum (T-031, FR-023 /
 * FR-026 / FR-027).
 *
 * SC-009 requires EVERY console top-level view to render exactly one
 * branded footer (app name + version + GitHub link). This suite asserts the
 * footer on:
 *   - the lobby landing view (`LobbyLanding`), and
 *   - the standalone `BrandedFooter` component (content + structure).
 *
 * The match/HUD view is covered by `hud-version.test.tsx` (which mounts the
 * full `App`); the waiting-overlay and game-over states are sub-views of
 * `App`, so the App-root footer already covers them — adding a second footer
 * inside `WaitingOverlay` would violate the "exactly one per view" rule.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { APP_VERSION } from '@europa/version';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { BrandedFooter } from '../../../src/ui/branded-footer';
import { LobbyLanding } from '../../../src/ui/lobby-landing';
import '../../../src/styles/index.css';
import { INITIAL_LOBBY_STATE } from '../../../src/state/lobby-reducer';
import type { LobbyState } from '../../../src/state/lobby-state';

afterEach(() => {
    cleanup();
});

/** No-op callbacks for direct Landing renders. */
const noopCallbacks = {
    onSubmitHandle: (): void => undefined,
    onCreate: (): void => undefined,
    onJoin: (): void => undefined,
    onSpectate: (): void => undefined,
    onRetry: (): void => undefined,
    onAcknowledgeSuperseded: (): void => undefined,
};

describe('BrandedFooter component (standalone)', () => {
    test('renders app name, v-prefixed APP_VERSION, and the GitHub link', async () => {
        const screen = await render(<BrandedFooter />);
        const footer = screen.getByRole('contentinfo');
        await expect.element(footer).toBeVisible();
        expect(footer.element().textContent).toContain('Europa Neo');
        expect(footer.element().textContent).toContain(`v${APP_VERSION}`);
        const link = footer.element().querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('href')).toBe('https://github.com/shaunburdick/europa-neo');
    });
});

describe('BrandedFooter on the lobby landing view (FR-023)', () => {
    test('renders exactly one footer carrying the app name, version, and GitHub link', async () => {
        const state: LobbyState = {
            ...INITIAL_LOBBY_STATE,
            connection: 'ready',
            identityStatus: 'named',
            handle: 'Nova',
        };
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // Exactly one footer across the whole view (no duplicate version line).
        const footers = screen.container.querySelectorAll('footer');
        expect(footers).toHaveLength(1);

        const footer = footers[0];
        if (footer === undefined) {
            throw new Error('expected a branded footer');
        }
        expect(footer.textContent).toContain('Europa Neo');
        expect(footer.textContent).toContain(`v${APP_VERSION}`);
        const link = footer.querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('href')).toBe('https://github.com/shaunburdick/europa-neo');
    });
});
