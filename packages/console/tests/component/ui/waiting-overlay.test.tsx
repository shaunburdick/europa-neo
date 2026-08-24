/**
 * Component tests — waiting-for-opponent overlay (post-playtest fix).
 *
 * Boots the full App with a REAL console store (no injection seam) and
 * drives the exact lifecycle the playtest exposed:
 *   - live + no view  → overlay visible;
 *   - live + tick-0 join snapshot (still filling) → overlay visible;
 *   - first tick broadcast (tick ≥ 1) → overlay gone;
 *   - status leaving 'live' (reconnecting) → overlay gone, banner owns
 *     the UI;
 *   - reduced motion → spinner animation disabled via modifier class;
 *   - appearance announced once on the polite live region;
 *   - static boots (no store) never show the overlay.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { App } from '../../../src/render/App';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import type { ConsoleState } from '../../../src/state/types';
import { WAITING_FOR_OPPONENT_MESSAGE } from '../../../src/ui/waiting-overlay';
import { buildPlayerView } from '../../fixtures/player-view';
import { expectNoDomA11yViolations } from '../../setup';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Seed a live seated store state around an optional view. Pure. */
function liveState(view: ReturnType<typeof buildPlayerView> | null): ConsoleState {
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: view,
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
    };
}

/** Boot the App against a store seeded with `state`. */
async function bootWithStore(state: ConsoleState): Promise<ConsoleStore> {
    const store = createConsoleStore(state);
    await render(<App store={store} />);
    return store;
}

/** The overlay root, queried by its stable data attribute. */
function overlay(): Element | null {
    return document.querySelector('[data-europa-waiting="true"]');
}

describe('waiting-for-opponent overlay (component)', () => {
    test('visible while live with no view at all', async () => {
        await bootWithStore(liveState(null));
        expect(overlay()).not.toBeNull();
        expect(document.body.textContent).toContain(WAITING_FOR_OPPONENT_MESSAGE);
    });

    test('visible while live with only the tick-0 join snapshot (match still filling)', async () => {
        await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })));
        expect(overlay()).not.toBeNull();
    });

    test('hidden once the first tick broadcast arrives', async () => {
        const store = await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })));
        expect(overlay()).not.toBeNull();

        // External-store updates are scheduled; wait for the commit.
        store.dispatch({
            kind: 'tick',
            view: buildPlayerView({ width: 32, height: 32, tick: 1 }),
        });
        await vi.waitFor(() => {
            expect(overlay()).toBeNull();
        });
    });

    test('hidden when status leaves live (reconnecting banner takes precedence)', async () => {
        const store = await bootWithStore(liveState(null));
        expect(overlay()).not.toBeNull();

        store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        await vi.waitFor(() => {
            expect(overlay()).toBeNull();
        });
        // The reconnecting banner owns the moment instead (US5 AC-3).
        expect(document.querySelector('.europa-banner')).not.toBeNull();
    });

    test('appearance is announced once on the polite live region', async () => {
        await bootWithStore(liveState(null));

        // The announcement rides two effect cycles (App mounts the
        // announcer, then the overlay receives it as a prop) — wait for
        // the text to land on a polite live-region node. The page hosts
        // several (feedback section + announcer pair), so assert the
        // message appears on exactly one of them.
        await vi.waitFor(() => {
            const texts = [...document.querySelectorAll('[data-europa-live="polite"]')].map((node) => node.textContent);
            expect(texts).toContain(WAITING_FOR_OPPONENT_MESSAGE);
        });
        // Never duplicated by re-renders: exactly one node carries it.
        const carriers = [...document.querySelectorAll('[data-europa-live="polite"]')].filter(
            (node) => node.textContent === WAITING_FOR_OPPONENT_MESSAGE,
        );
        expect(carriers.length).toBe(1);
    });

    test('spinner animation is disabled under reduced motion (modifier class)', async () => {
        // Stub matchMedia BEFORE mount so the App-owned subscription fires
        // with reduce = true (subscribeReducedMotion feature-detects it).
        const listener = (): void => undefined;
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            addEventListener: listener,
            removeEventListener: listener,
        }));

        await bootWithStore(liveState(null));
        expect(overlay()).not.toBeNull();
        expect(overlay()?.classList.contains('europa-waiting--reduced')).toBe(true);
    });

    test('spinner animates by default (no reduced-motion modifier)', async () => {
        await bootWithStore(liveState(null));
        expect(overlay()?.classList.contains('europa-waiting--reduced')).toBe(false);
    });

    test('static boots (no store) never show the overlay', async () => {
        // A live-looking snapshot without a store is pure snapshot
        // rendering — no connection lifecycle, no waiting room.
        const { setConsoleStateForTesting, clearConsoleStateForTesting } = await import(
            '../../../src/internal/test-state'
        );
        setConsoleStateForTesting(liveState(null));
        try {
            await render(<App />);
            expect(overlay()).toBeNull();
        } finally {
            clearConsoleStateForTesting();
        }
    });

    test('zero axe violations with the overlay up', async () => {
        await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })));
        await expectNoDomA11yViolations(document);
    });
});
