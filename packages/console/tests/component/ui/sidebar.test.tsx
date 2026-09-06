/**
 * Sidebar component tests — issue #76 (T098, FR-015/FR-021).
 *
 * Asserts the sidebar renders all 8 sections in vertical order
 * (Status, Players, Orders, Reserve, Overview, Zoom, Surrender, Help)
 * with the correct landmark roles, and that order-producing controls
 * render disabled/inert when `store === undefined` (spectator parity,
 * FR-021).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { buildMapView } from '../../../src/state/build-map-view';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleState, MapView, MapViewId } from '../../../src/state/types';
import { Sidebar } from '../../../src/ui/sidebar';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** A live (player) console state with a view + selection. */
function liveState() {
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
    return createLiveConsoleState(view);
}

/** Render snapshot for the sidebar's board-derived props. */
function mapViewOf(state: ConsoleState): MapView {
    const view = state.latestView;
    if (view === null || view === undefined) {
        throw new Error('mapViewOf requires a live state with a latestView');
    }
    return buildMapView({
        id: 'sidebar-test' as MapViewId,
        view,
        camera: state.camera,
        hover: null,
        selection: null,
        exclusiveMode: false,
        prevView: null,
        nowMs: 0,
        viewportOffset: { x: 0, y: 0 },
    });
}

/** Common props for a live-state sidebar render. */
function liveSidebarProps(state: ConsoleState) {
    const mapView = mapViewOf(state);
    return {
        state,
        tick: state.latestView?.tick ?? null,
        selectionReserves: 0,
        boardWidth: mapView.width,
        boardHeight: mapView.height,
        cells: [...mapView.cells.values()],
        onSetCamera: vi.fn(),
        onSurrenderRequest: vi.fn(),
        onHelpToggle: vi.fn(),
    };
}

/** The 8 sidebar sections in the contractual vertical order (FR-015). */
const SECTIONS = [
    { id: 'status', label: 'Status' },
    { id: 'players', label: 'Players' },
    { id: 'orders', label: 'Orders' },
    { id: 'reserve', label: 'Reserve' },
    { id: 'overview', label: 'Overview' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'surrender', label: 'Surrender' },
    { id: 'help', label: 'Help' },
] as const;

describe('Sidebar (FR-015)', () => {
    test('renders all 8 sections in vertical order with landmark roles', async () => {
        const state = liveState();
        await render(<Sidebar {...liveSidebarProps(state)} />);

        const sections = document.querySelectorAll<HTMLElement>('.europa-sidebar > section');
        expect(sections.length).toBe(SECTIONS.length);

        sections.forEach((section, index) => {
            const expected = SECTIONS[index];
            expect(section.id, `section ${index} id`).toBe(expected.id);
            expect(section.getAttribute('aria-label'), `section ${index} label`).toBe(expected.label);
        });

        // Vertical order: each section's top is at or below the previous.
        for (let i = 1; i < sections.length; i++) {
            const prev = sections[i - 1] as HTMLElement;
            const curr = sections[i] as HTMLElement;
            expect(curr.getBoundingClientRect().top, `section ${i} below section ${i - 1}`).toBeGreaterThanOrEqual(
                prev.getBoundingClientRect().top,
            );
        }
    });

    test('Status section shows tick + connection status', async () => {
        const state = liveState();
        await render(<Sidebar {...liveSidebarProps(state)} />);
        const status = document.querySelector('#status');
        expect(status?.textContent).toContain('live');
        expect(status?.textContent).toContain(String(state.latestView?.tick ?? ''));
    });
});

describe('Sidebar spectator parity (FR-021)', () => {
    test('order-producing controls render disabled when store is absent', async () => {
        // Spectator: no store, no input, but a selection exists so the
        // Reserve panel renders (disabled) rather than the hint.
        const state = { ...INITIAL_CONSOLE_STATE, inputEnabled: false, selection: { x: 4, y: 4 } };
        await render(
            <Sidebar
                state={state}
                tick={null}
                selectionReserves={0}
                boardWidth={8}
                boardHeight={8}
                cells={[]}
                onSetCamera={vi.fn()}
                onSurrenderRequest={vi.fn()}
                onHelpToggle={vi.fn()}
            />,
        );

        // Orders: exclusive/clear buttons disabled.
        const orders = document.querySelector('#orders');
        const orderButtons = orders?.querySelectorAll('button');
        expect(orderButtons?.length ?? 0).toBeGreaterThan(0);
        for (const b of orderButtons ?? []) {
            expect((b as HTMLButtonElement).disabled).toBe(true);
        }

        // Reserve: slider + quick-select buttons disabled.
        const reserve = document.querySelector('#reserve');
        const reserveInputs = reserve?.querySelectorAll('input, button');
        reserveInputs?.forEach((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
                expect(el.disabled).toBe(true);
            }
        });

        // Surrender: disabled.
        const surrender = document.querySelector('#surrender');
        const surrenderButton = surrender?.querySelector('button');
        expect((surrenderButton as HTMLButtonElement | null)?.disabled).toBe(true);
    });
});
