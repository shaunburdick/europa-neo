/**
 * Component tests — waiting-for-opponent overlay.
 *
 * Boots the full App with a REAL console store (no injection seam) and
 * drives the exact lifecycle the playtest exposed:
 *   - live + no view  → overlay visible;
 *   - live + tick-0 join snapshot (still filling) → overlay visible;
 *   - first tick broadcast (tick ≥ 1) → overlay gone;
 *   - status leaving 'live' (reconnecting / game-over) → overlay gone,
 *     the owning chrome takes over;
 *   - reduced motion → spinner animation disabled via modifier class;
 *   - appearance announced once on the polite live region;
 *   - static boots (no store) never show the overlay.
 *
 * Feature 012 (FR-005) extends the overlay to N-aware copy for filling
 * rooms of N ∈ {2, 3, 4}: the headline now reads
 * "Waiting for N-k more players… (k/N)" instead of the legacy single-
 * opponent string. The App derives the headline from the runtime-
 * supplied `waitingCapacity` / `waitingSeatsFilled` props (the
 * authoritative lobby entry a real matchmaker filling match produces),
 * falling back to the join assignment when the runtime omits them.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { App } from '../../../src/render/App';
import { formatWaitingMessage } from '../../../src/state/awaiting-start';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import type { ConsoleState, PlayerId } from '../../../src/state/types';
import { WAITING_FOR_OPPONENT_MESSAGE } from '../../../src/ui/waiting-overlay';
import { buildPlayerView } from '../../fixtures/player-view';
import { expectNoDomA11yViolations } from '../../setup-a11y-dom';
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
async function bootWithStore(
    state: ConsoleState,
    opts: { readonly waitingCapacity?: number; readonly waitingSeatsFilled?: number } = {},
): Promise<ConsoleStore> {
    const store = createConsoleStore(state);
    // exactOptionalPropertyTypes: only forward the runtime-supplied lobby
    // entry when present, so the App's optional props never receive an
    // explicit `undefined`.
    await render(
        <App
            store={store}
            {...(opts.waitingCapacity !== undefined ? { waitingCapacity: opts.waitingCapacity } : {})}
            {...(opts.waitingSeatsFilled !== undefined ? { waitingSeatsFilled: opts.waitingSeatsFilled } : {})}
        />,
    );
    return store;
}

/** The overlay element — the React EuropaWaiting renders <div class="europa-waiting">. */
function overlay(): Element | null {
    return document.querySelector('.europa-waiting');
}

/**
 * Query a selector scoped to the overlay element. The React EuropaWaiting
 * renders standard HTML with europa-* classes (no shadow DOM), so queries
 * go directly against the overlay element. When the selector matches the
 * overlay element itself (e.g., '.europa-waiting'), returns it directly
 * since querySelector only searches descendants.
 *
 * @param selector  Selector scoped to the overlay element.
 * @returns The matching element inside the overlay, or `null`.
 */
function overlayShadow(selector: string): Element | null {
    const el = overlay();
    if (!el) return null;
    // If the selector matches the overlay element itself, return it
    // directly — querySelector only searches descendants.
    return el.matches(selector) ? el : el.querySelector(selector);
}

/**
 * The N-aware headline the App renders for a filling room of `capacity`
 * with `seatsFilled` seats occupied. Mirrors the App's derivation so the
 * assertions stay DRY and in lock-step with {@link formatWaitingMessage}.
 */
function expectedHeadline(seatsFilled: number, capacity: number): string {
    return formatWaitingMessage(seatsFilled, capacity);
}

describe('waiting-for-opponent overlay (component, 2-player legacy fallback)', () => {
    // The original 2-player semantics: one seat filled, one more to join.
    const CAPACITY = 2;
    const SEATS_FILLED = 1;
    const HEADLINE = expectedHeadline(SEATS_FILLED, CAPACITY);

    test('visible while live with no view at all', async () => {
        await bootWithStore(liveState(null), { waitingCapacity: CAPACITY, waitingSeatsFilled: SEATS_FILLED });
        expect(overlay()).not.toBeNull();
        expect(document.body.textContent).toContain(HEADLINE);
    });

    test('visible while live with only the tick-0 join snapshot (match still filling)', async () => {
        await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })), {
            waitingCapacity: CAPACITY,
            waitingSeatsFilled: SEATS_FILLED,
        });
        expect(overlay()).not.toBeNull();
        expect(overlayShadow('.europa-waiting__text')?.textContent).toBe(HEADLINE);
    });

    test('hidden once the first tick broadcast arrives', async () => {
        const store = await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })), {
            waitingCapacity: CAPACITY,
            waitingSeatsFilled: SEATS_FILLED,
        });
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
        const store = await bootWithStore(liveState(null), {
            waitingCapacity: CAPACITY,
            waitingSeatsFilled: SEATS_FILLED,
        });
        expect(overlay()).not.toBeNull();

        store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        await vi.waitFor(() => {
            expect(overlay()).toBeNull();
        });
        // The reconnecting banner owns the moment instead (US5 AC-3).
        expect(document.querySelector('.europa-banner')).not.toBeNull();
    });

    test('appearance is announced once on the polite live region', async () => {
        await bootWithStore(liveState(null), { waitingCapacity: CAPACITY, waitingSeatsFilled: SEATS_FILLED });

        // The announcement rides two effect cycles (App mounts the
        // announcer, then the overlay receives it as a prop) — wait for
        // the text to land on a polite live-region node. The page hosts
        // several (feedback section + announcer pair), so assert the
        // message appears on exactly one of them.
        await vi.waitFor(() => {
            const texts = [...document.querySelectorAll('[data-europa-live="polite"]')].map((node) => node.textContent);
            expect(texts).toContain(HEADLINE);
        });
        // Never duplicated by re-renders: exactly one node carries it.
        const carriers = [...document.querySelectorAll('[data-europa-live="polite"]')].filter(
            (node) => node.textContent === HEADLINE,
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

        await bootWithStore(liveState(null), { waitingCapacity: CAPACITY, waitingSeatsFilled: SEATS_FILLED });
        expect(overlay()).not.toBeNull();
        // The --reduced modifier is on the internal .europa-waiting root div, not the host element.
        const root = overlayShadow('.europa-waiting');
        expect(root?.classList.contains('europa-waiting--reduced')).toBe(true);
    });

    test('spinner animates by default (no reduced-motion modifier)', async () => {
        await bootWithStore(liveState(null), { waitingCapacity: CAPACITY, waitingSeatsFilled: SEATS_FILLED });
        const root = overlayShadow('.europa-waiting');
        expect(root?.classList.contains('europa-waiting--reduced')).toBe(false);
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
        await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })), {
            waitingCapacity: CAPACITY,
            waitingSeatsFilled: SEATS_FILLED,
        });
        await expectNoDomA11yViolations(document);
    });
});

describe('N-aware waiting overlay (feature 012 FR-005, T016)', () => {
    // A real matchmaker filling match supplies the authoritative lobby
    // entry (capacity N, seatsFilled 1) to the runtime, which forwards it
    // to App via `waitingCapacity` / `waitingSeatsFilled`. We exercise the
    // exact mounted-App rendering for every supported N ∈ {3, 4}.
    for (const capacity of [3, 4] as const) {
        const seatsFilled = 1;
        const headline = expectedHeadline(seatsFilled, capacity);

        describe(`filling room of N=${String(capacity)}`, () => {
            test('visible with N-aware headline while live with no view', async () => {
                await bootWithStore(liveState(null), { waitingCapacity: capacity, waitingSeatsFilled: seatsFilled });
                expect(overlay()).not.toBeNull();
                expect(overlayShadow('.europa-waiting__text')?.textContent).toBe(headline);
                // The copy is N-aware: it names the remaining seats and the
                // filled/total ratio, never the legacy single-opponent string.
                expect(headline).not.toBe(WAITING_FOR_OPPONENT_MESSAGE);
                expect(headline).toContain(`(${String(seatsFilled)}/${String(capacity)})`);
            });

            test('visible with N-aware headline while holding the tick-0 join snapshot', async () => {
                await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })), {
                    waitingCapacity: capacity,
                    waitingSeatsFilled: seatsFilled,
                });
                expect(overlay()).not.toBeNull();
                expect(overlayShadow('.europa-waiting__text')?.textContent).toBe(headline);
            });

            test('hidden on the first tick broadcast (tick ≥ 1)', async () => {
                const store = await bootWithStore(liveState(buildPlayerView({ width: 32, height: 32, tick: 0 })), {
                    waitingCapacity: capacity,
                    waitingSeatsFilled: seatsFilled,
                });
                expect(overlay()).not.toBeNull();

                store.dispatch({
                    kind: 'tick',
                    view: buildPlayerView({ width: 32, height: 32, tick: 1 }),
                });
                await vi.waitFor(() => {
                    expect(overlay()).toBeNull();
                });
            });

            test('never stacks with the reconnecting banner', async () => {
                const store = await bootWithStore(liveState(null), {
                    waitingCapacity: capacity,
                    waitingSeatsFilled: seatsFilled,
                });
                expect(overlay()).not.toBeNull();

                store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
                await vi.waitFor(() => {
                    expect(overlay()).toBeNull();
                });
                // The reconnecting banner owns the moment; the waiting plate
                // must not co-exist with it.
                expect(document.querySelector('.europa-banner')).not.toBeNull();
                expect(overlay()).toBeNull();
            });

            test('never stacks with the game-over chrome', async () => {
                const store = await bootWithStore(liveState(null), {
                    waitingCapacity: capacity,
                    waitingSeatsFilled: seatsFilled,
                });
                expect(overlay()).not.toBeNull();

                // Engine reported a terminal result → status flips to
                // 'game_over'; the overlay must retire, never stack.
                const result: import('@europa/engine').MatchResult = {
                    kind: 'win',
                    winner: 1 as PlayerId,
                    tick: 5,
                    reason: 'last_standing',
                };
                store.dispatch({ kind: 'terminal', result });
                await vi.waitFor(() => {
                    expect(overlay()).toBeNull();
                });
                // The visible waiting plate is gone — it never stacks with
                // the game-over chrome. (The polite live-region announcer may
                // still retain the last headline text; that is a hidden
                // off-screen node, not visible chrome, so it is not asserted
                // here.)
                expect(overlayShadow('.europa-waiting__text')).toBeNull();
            });

            test('spinner animation is disabled under reduced motion (modifier class)', async () => {
                const listener = (): void => undefined;
                vi.stubGlobal('matchMedia', (query: string) => ({
                    matches: query === '(prefers-reduced-motion: reduce)',
                    addEventListener: listener,
                    removeEventListener: listener,
                }));

                await bootWithStore(liveState(null), { waitingCapacity: capacity, waitingSeatsFilled: seatsFilled });
                expect(overlay()).not.toBeNull();
                // The --reduced modifier is on the internal .europa-waiting root div, not the host element.
                const root = overlayShadow('.europa-waiting');
                expect(root?.classList.contains('europa-waiting--reduced')).toBe(true);
            });

            test('appearance is announced exactly once on the polite live region', async () => {
                await bootWithStore(liveState(null), { waitingCapacity: capacity, waitingSeatsFilled: seatsFilled });

                await vi.waitFor(() => {
                    const texts = [...document.querySelectorAll('[data-europa-live="polite"]')].map(
                        (node) => node.textContent,
                    );
                    expect(texts).toContain(headline);
                });
                // The N-aware copy lands on exactly one polite node — no
                // duplicate announcements across re-renders (WCAG 4.1.3).
                const carriers = [...document.querySelectorAll('[data-europa-live="polite"]')].filter(
                    (node) => node.textContent === headline,
                );
                expect(carriers.length).toBe(1);
            });
        });
    }
});
