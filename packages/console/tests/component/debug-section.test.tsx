/**
 * Debug section component tests — Feature 022 (Developer Debugging Tools)
 *
 * Asserts the sidebar's Debug section:
 *   - Exists and starts collapsed (FR-018)
 *   - Expands on header click to reveal seed (FR-015)
 *   - Seed display has correct aria-label (FR-016)
 *   - Visible in both player and spectator modes (FR-017)
 *   - No seed rendered when seed is undefined
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { INITIAL_CONSOLE_STATE } from '../../src/state/reducer';
import type { ConsoleState } from '../../src/state/types';
import { Sidebar } from '../../src/ui/sidebar';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../fixtures/player-view';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** A live (player) console state with a view containing seed 42. */
function liveStateWithSeed(seed: number): ConsoleState {
    const view = buildPlayerView({
        width: 8,
        height: 8,
        playerId: 1,
        seed,
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
    return createLiveConsoleState(view);
}

/** A spectator state (no store, input disabled) with seed 42. */
function spectatorStateWithSeed(seed: number): ConsoleState {
    const view = buildPlayerView({
        width: 8,
        height: 8,
        playerId: 1,
        seed,
        visibleCells: [],
    });
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        latestView: view,
        inputEnabled: false,
    };
}

/** Common props for a sidebar render — minimal, no board-derived props needed for debug tests. */
function sidebarProps(state: ConsoleState) {
    return {
        state,
        selectionReserves: 0,
        boardWidth: 0,
        boardHeight: 0,
        cells: [],
        onSetCamera: vi.fn(),
        onSurrenderRequest: vi.fn(),
        onHelpToggle: vi.fn(),
    };
}

describe('Sidebar Debug section (FR-014–FR-018)', () => {
    test('Debug section exists and starts collapsed', async () => {
        const state = liveStateWithSeed(42);
        await render(<Sidebar {...sidebarProps(state)} interactive={true} />);

        const debug = document.querySelector('#debug');
        expect(debug).not.toBeNull();

        // Starts collapsed — seed text should not be visible.
        expect(debug?.textContent).not.toContain('Seed: 42');

        // The toggle button should have aria-expanded="false".
        const toggle = debug?.querySelector('button');
        expect(toggle).not.toBeNull();
        expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    });

    test('Clicking Debug header expands to show seed', async () => {
        const state = liveStateWithSeed(42);
        const user = userEvent.setup();
        await render(<Sidebar {...sidebarProps(state)} interactive={true} />);

        const debug = document.querySelector('#debug');
        const toggle = debug?.querySelector('button');
        expect(toggle).not.toBeNull();

        // Click to expand.
        if (toggle === null || toggle === undefined) return;
        await user.click(toggle);

        // Now seed should be visible.
        expect(debug?.textContent).toContain('Seed: 42');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    test('Seed display has correct aria-label (FR-016)', async () => {
        const state = liveStateWithSeed(42);
        const user = userEvent.setup();
        await render(<Sidebar {...sidebarProps(state)} interactive={true} />);

        // Expand the debug section.
        const debug = document.querySelector('#debug');
        const toggle = debug?.querySelector('button');
        if (toggle === null || toggle === undefined) return;
        await user.click(toggle);

        // Find the seed element.
        const seedEl = debug?.querySelector('[aria-label="Map seed: 42"]');
        expect(seedEl).not.toBeNull();
        expect(seedEl?.textContent).toBe('Seed: 42');
    });

    test('Debug section visible in spectator mode (FR-017)', async () => {
        const state = spectatorStateWithSeed(99);
        const user = userEvent.setup();
        await render(<Sidebar {...sidebarProps(state)} interactive={false} />);

        const debug = document.querySelector('#debug');
        expect(debug).not.toBeNull();

        // Expand.
        const toggle = debug?.querySelector('button');
        if (toggle === null || toggle === undefined) return;
        await user.click(toggle);

        // Seed should be visible for spectators too.
        expect(debug?.textContent).toContain('Seed: 99');
    });

    test('No seed rendered when seed is undefined', async () => {
        // State with no latestView — seed will be undefined.
        const state = { ...INITIAL_CONSOLE_STATE };
        await render(
            <Sidebar
                state={state}
                selectionReserves={0}
                boardWidth={0}
                boardHeight={0}
                cells={[]}
                onSetCamera={vi.fn()}
                onSurrenderRequest={vi.fn()}
                onHelpToggle={vi.fn()}
                interactive={false}
            />,
        );

        const debug = document.querySelector('#debug');
        expect(debug).not.toBeNull();

        // Expand — but no seed should appear.
        const toggle = debug?.querySelector('button');
        if (toggle === null || toggle === undefined) return;
        const user = userEvent.setup();
        await user.click(toggle);

        expect(debug?.textContent).not.toContain('Seed:');
    });

    test('Debug section can collapse after expanding', async () => {
        const state = liveStateWithSeed(42);
        const user = userEvent.setup();
        await render(<Sidebar {...sidebarProps(state)} interactive={true} />);

        const debug = document.querySelector('#debug');
        const toggle = debug?.querySelector('button');
        if (toggle === null || toggle === undefined) return;

        // Expand.
        await user.click(toggle);
        expect(debug?.textContent).toContain('Seed: 42');

        // Collapse.
        await user.click(toggle);
        expect(debug?.textContent).not.toContain('Seed: 42');
    });
});
