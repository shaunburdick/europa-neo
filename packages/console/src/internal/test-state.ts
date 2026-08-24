/**
 * Test/demo state injection seam — Feature 005 (T048).
 *
 * @internal Package-internal helper. Do not import from production
 * code outside `src/render/App.tsx`'s fallback chain and the demo
 * mount in `src/main.tsx`.
 *
 * @deprecated Outside tests: production code must obtain state from
 * the runtime (`createConsole`, Phase 8 T086), never from this seam.
 * The seam exists ONLY for the MVP standalone-render path (Phase 3
 * scope clarification): "given a scripted PlayerView, the console
 * renders it correctly and the a11y overlay is complete" — no live
 * server required (Q-C02 + the US1 acceptance tests). It is removed
 * once the runtime lands.
 *
 * Everything here is deterministic (no wall clock, no randomness) so
 * rendered output is byte-stable across test runs and demo boots.
 */

import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import type { ConsoleState, PlayerView } from '../state/types';

/** Module-level injected state (the T048 seam). */
let injectedState: ConsoleState | null = null;

/**
 * Inject a `ConsoleState` that {@link import('../render/App').App}
 * renders when no `state` prop is provided. Test-only (see module
 * JSDoc for the MVP rationale + deprecation boundary).
 *
 * @param state The state the App should render standalone.
 */
export function setConsoleStateForTesting(state: ConsoleState): void {
    injectedState = state;
}

/**
 * Clear any injected test state (test teardown hygiene).
 */
export function clearConsoleStateForTesting(): void {
    injectedState = null;
}

/**
 * Read the injected state without clearing it. Called by `App` as the
 * second link of its state-resolution chain. `null` when nothing was
 * injected.
 */
export function peekInjectedConsoleState(): ConsoleState | null {
    return injectedState;
}

/**
 * Build a live-seeded `ConsoleState` around a scripted `PlayerView`
 * (status `'live'`, input enabled, seated as the view's owner). This
 * is exactly the seeding `scriptedTick` performs in the test fixtures,
 * minus the action dispatch — used by the demo mount in `main.tsx`
 * and by component/a11y suites that need a full App boot. Pure.
 *
 * @param view The fog-filtered view the console should render.
 */
export function createStubConsoleState(view: PlayerView): ConsoleState {
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: view,
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: view.player },
    };
}

/** Board size of the deterministic demo view (16×16). */
export const DEMO_BOARD_SIZE = 16;

/**
 * Deterministic demo `PlayerView` for the dev-server mount (T047:
 * "main.tsx mounts this with a stub ConsoleState") and the E2E smoke
 * (T042). A 16×16 board with a 22-cell visibility cluster in the
 * south-west quadrant exercising every render feature: water, land at
 * multiple elevations, owned cities with troops/pipes/reserves for
 * both players, and empty land. Pure data — no randomness.
 */
export function createDemoPlayerView(): PlayerView {
    return {
        player: 1,
        tick: 42,
        visibleCells: DEMO_VISIBLE_CELLS.map((cell) => ({ ...cell })),
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: {
            boardSize: DEMO_BOARD_SIZE,
            playerCount: 2,
            tickIntervalMs: 250,
            seed: 0,
            visibilityRadius: 2,
        },
    };
}

/**
 * The demo cluster's raw cell data (engine CellView shape, mirroring
 * tests/fixtures/player-view.ts's builder output; duplicated here
 * because src cannot import from tests/).
 */
const DEMO_VISIBLE_CELLS: ReadonlyArray<{
    readonly coord: { readonly x: number; readonly y: number };
    readonly cell: {
        readonly x: number;
        readonly y: number;
        readonly elevation: number;
        readonly terrain: 'land' | 'water';
    };
    readonly troopCount: number;
    readonly troopOwner: 1 | 2 | null;
    readonly pipes: ReadonlySet<'N' | 'E' | 'S' | 'W'>;
    readonly reservesPercent: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    readonly cityOwner: 1 | 2 | null;
}> = [
    // Row 8: contested border — P1 city with pipes + reserves.
    {
        coord: pt(3, 8),
        cell: c(3, 8, 40, 'land'),
        troopCount: 32,
        troopOwner: 1,
        pipes: setOf('N', 'E'),
        reservesPercent: 7,
        cityOwner: 1,
    },
    {
        coord: pt(4, 8),
        cell: c(4, 8, 60, 'land'),
        troopCount: 12,
        troopOwner: 1,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(5, 8),
        cell: c(5, 8, 90, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    // Row 9: river band (water).
    {
        coord: pt(2, 9),
        cell: c(2, 9, 0, 'water'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(3, 9),
        cell: c(3, 9, 0, 'water'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(4, 9),
        cell: c(4, 9, 10, 'land'),
        troopCount: 5,
        troopOwner: 2,
        pipes: setOf('W'),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(5, 9),
        cell: c(5, 9, 120, 'land'),
        troopCount: 8,
        troopOwner: 1,
        pipes: setOf(),
        reservesPercent: 3,
        cityOwner: null,
    },
    // Row 10: highlands + P2 city.
    {
        coord: pt(2, 10),
        cell: c(2, 10, 200, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(3, 10),
        cell: c(3, 10, 230, 'land'),
        troopCount: 21,
        troopOwner: 1,
        pipes: setOf('S', 'E'),
        reservesPercent: 9,
        cityOwner: null,
    },
    {
        coord: pt(4, 10),
        cell: c(4, 10, 180, 'land'),
        troopCount: 18,
        troopOwner: 2,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: 2,
    },
    {
        coord: pt(5, 10),
        cell: c(5, 10, 150, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    // Rows 11–13: open ground filling out the horizon.
    {
        coord: pt(3, 11),
        cell: c(3, 11, 70, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(4, 11),
        cell: c(4, 11, 80, 'land'),
        troopCount: 2,
        troopOwner: 1,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(5, 11),
        cell: c(5, 11, 95, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(6, 11),
        cell: c(6, 11, 110, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(3, 12),
        cell: c(3, 12, 55, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(4, 12),
        cell: c(4, 12, 65, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(5, 12),
        cell: c(5, 12, 75, 'land'),
        troopCount: 14,
        troopOwner: 2,
        pipes: setOf('N'),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(6, 12),
        cell: c(6, 12, 85, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(3, 13),
        cell: c(3, 13, 30, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(4, 13),
        cell: c(4, 13, 35, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
    {
        coord: pt(5, 13),
        cell: c(5, 13, 45, 'land'),
        troopCount: 0,
        troopOwner: null,
        pipes: setOf(),
        reservesPercent: 0,
        cityOwner: null,
    },
];

/** Point literal shorthand for the demo table. */
function pt(x: number, y: number): { readonly x: number; readonly y: number } {
    return { x, y };
}

/** Terrain literal shorthand for the demo table. */
function c(
    x: number,
    y: number,
    elevation: number,
    terrain: 'land' | 'water',
): {
    readonly x: number;
    readonly y: number;
    readonly elevation: number;
    readonly terrain: 'land' | 'water';
} {
    return { x, y, elevation, terrain };
}

/** Pipe-set literal shorthand for the demo table. */
function setOf(...directions: ReadonlyArray<'N' | 'E' | 'S' | 'W'>): ReadonlySet<'N' | 'E' | 'S' | 'W'> {
    return new Set(directions);
}
