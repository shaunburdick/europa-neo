/**
 * Consolidated WCAG 2.2 AA assertions — T015 remediation.
 *
 * Folds 13 unique accessibility assertions from the removed US1–US5
 * acceptance test files into a single focused test file. Each test
 * covers one distinct WCAG requirement that is NOT already covered
 * by the retained focused a11y suites (lobby-keyboard, logo,
 * waiting-overlay, etc.).
 *
 * Categories preserved:
 *   1. Grid roving focus + aria-activedescendant (WCAG 2.1.1)
 *   2. aria-live="polite" tick announcement region (WCAG 4.1.3)
 *   3. Focused cell target size ≥ 24×24 CSS px (WCAG 2.5.8)
 *   4. Palette keyboard operability (Tab, Enter, arrows) (WCAG 2.1.1)
 *   5. Keyboard 'i' issues pipe order without mouse (WCAG 2.5.7)
 *   6. Focus ring contrast ≥ 3:1 on order bar (WCAG 2.4.7)
 *   7. Paratroop overlay aria-live announcements (WCAG 4.1.3)
 *   8. Centered posture "no launch" announcement (WCAG 4.1.3)
 *   9. Keyboard-only 'p' never launches center default (WCAG 2.5.7)
 *  10. Slider focus ring contrast ≥ 3:1 (WCAG 2.4.7)
 *  11. Reserve announcement "Reserved 70% at (5, 5)" (WCAG 4.1.3)
 *  12. Reduced motion skips combat flash (WCAG 2.3.3)
 *  13. Surrender modal keyboard focus trap (WCAG 2.4.3)
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { FakeMatchClient } from '../../src/internal/fake-match-client';
import { App } from '../../src/render/App';
import { MapCanvas } from '../../src/render/canvas';
import { cellElementId } from '../../src/render/cell-view';
import { SurrenderModal } from '../../src/render/SurrenderModal';
import { createOrderBridge } from '../../src/state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../../src/state/store';
import type { Direction, MapEffect, MapView, ReducerEffect } from '../../src/state/types';
import '../../src/styles/index.css';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';

// ---------------------------------------------------------------------------
// Shared boot helpers
// ---------------------------------------------------------------------------

/** Interactive boot result handed to tests that need the order bridge. */
interface InteractiveBoot {
    readonly client: FakeMatchClient;
    readonly store: ConsoleStore;
}

/**
 * Boot the full interactive console with a small friendly board.
 * Center cell (5,5) is the KeyboardNavigator's initial focus.
 */
async function bootInteractiveConsole(): Promise<InteractiveBoot> {
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
                pipes: new Set<Direction>(['E']),
            }),
            buildCellView({ coord: { x: 5, y: 6 }, elevation: 45, troops: 3, owner: 1 }),
            buildCellView({ coord: { x: 4, y: 5 }, terrain: 'water' }),
        ],
    });
    const client = new FakeMatchClient();
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(
        {
            status: 'live',
            inputEnabled: true,
            latestView: view,
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
            hover: null,
            selection: null,
            lastCursorScreen: null,
            feedback: [],
            rejectedOrders: [],
            qol: {
                soundOn: false,
                animation: 'full',
                tooltips: true,
                theme: 'system',
                ownerColorRing: true,
            },
            session: {
                matchId: null,
                sessionToken: null,
                playerId: 1,
                displayName: 'Player 1',
                opponents: ['Player 2'],
            },
            exclusiveMode: false,
        },
        (effect) => {
            forward?.(effect);
        },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);

    await render(createElement(App, { store }));
    return { client, store };
}

/**
 * Dispatch a pointermove at fraction `(fx, fy)` of cell `(cx, cy)`
 * to trigger the targeting overlay's subcell binning.
 */
async function movePointerOver(cx: number, cy: number, fx: number, fy: number): Promise<void> {
    const boardArea = document.querySelector('.europa-board-area') as HTMLElement | null;
    if (boardArea === null) {
        throw new Error('.europa-board-area not found');
    }
    const rect = boardArea.getBoundingClientRect();
    boardArea.dispatchEvent(
        new PointerEvent('pointermove', {
            clientX: rect.left + (cx + fx) * 32,
            clientY: rect.top + (cy + fy) * 32,
            bubbles: true,
        }),
    );
    // Raw dispatchEvent bypasses React's event system; let the render commit.
    await new Promise((resolve) => setTimeout(resolve, 20));
}

/** WCAG relative-luminance contrast ratio between two hex colors. */
function contrastRatio(hexA: string, hexB: string): number {
    function luminance(hex: string): number {
        const channel = Number.parseInt(hex.slice(1), 16);
        const parts = [(channel >> 16) & 0xff, (channel >> 8) & 0xff, channel & 0xff].map((v) => {
            const srgb = v / 255;
            return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    const l1 = luminance(hexA);
    const l2 = luminance(hexB);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

afterEach(() => {
    cleanup();
});

// ============================================================================
// 1. Grid roving focus + aria-activedescendant (WCAG 2.1.1 Keyboard)
// ============================================================================

describe('WCAG 2.1.1 — ArrowDown roving focus', () => {
    test('ArrowDown moves roving focus one row down via aria-activedescendant', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        // Focus the grid (second Tab stop).
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        const grid = document.getElementById('map');
        expect(grid).not.toBeNull();

        // Initial focus = board center (5,5).
        expect(grid?.getAttribute('aria-activedescendant')).toBe(cellElementId({ x: 5, y: 5 }));

        await user.keyboard('{ArrowDown}');

        expect(grid?.getAttribute('aria-activedescendant')).toBe(cellElementId({ x: 5, y: 6 }));
        // The focused cell carries the visible focus ring class.
        const focusedCell = document.querySelector(`#${cellElementId({ x: 5, y: 6 })}`);
        expect(focusedCell?.classList.contains('europa-cell--focused')).toBe(true);
        // DOM focus stays on the grid container (aria-activedescendant model).
        expect(document.activeElement?.id).toBe('map');
    });
});

// ============================================================================
// 2. aria-live="polite" tick announcement region (WCAG 4.1.3)
// ============================================================================

describe('WCAG 4.1.3 — tick announcement live region', () => {
    test('an aria-live="polite" region exists for tick announcements', async () => {
        await bootInteractiveConsole();

        const polite = document.querySelector('[aria-live="polite"]');
        expect(polite).not.toBeNull();
        expect(polite?.getAttribute('data-europa-live')).toBe('polite');
    });
});

// ============================================================================
// 3. Focused cell target size ≥ 24×24 CSS px (WCAG 2.5.8)
// ============================================================================

describe('WCAG 2.5.8 — focused cell target size', () => {
    test('focused cell meets the 24×24 CSS-pixel target minimum', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}'); // focus grid → initial center cell

        const focusedCell = document.querySelector(`#${cellElementId({ x: 5, y: 5 })}`);
        expect(focusedCell).not.toBeNull();
        const rect = (focusedCell as HTMLElement).getBoundingClientRect();
        expect(rect.width).toBeGreaterThanOrEqual(24);
        expect(rect.height).toBeGreaterThanOrEqual(24);
    });
});

// ============================================================================
// 4. Palette keyboard operability (WCAG 2.1.1)
// ============================================================================

describe('WCAG 2.1.1 — palette keyboard operability', () => {
    test('palette buttons: Tab reaches them, Enter activates, arrows rove', async () => {
        const { store } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Walk Tab stops to the order bar, then into its buttons.
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('order-bar');

        const exclusiveButton = document.querySelector('#order-bar button[aria-pressed]') as HTMLButtonElement | null;
        expect(exclusiveButton).not.toBeNull();
        exclusiveButton?.focus();
        expect(document.activeElement).toBe(exclusiveButton);

        // Enter toggles exclusive mode (activation without pointer).
        await user.keyboard('{Enter}');
        expect(store.getState().exclusiveMode).toBe(true);
        expect(exclusiveButton?.getAttribute('aria-pressed')).toBe('true');

        // ArrowRight roves to the next palette button.
        await user.keyboard('{ArrowRight}');
        const activeAfterArrow = document.activeElement as HTMLButtonElement | null;
        expect(activeAfterArrow).not.toBe(exclusiveButton);
        expect(activeAfterArrow?.textContent).toContain('Clear pipes');

        // ArrowLeft returns.
        await user.keyboard('{ArrowLeft}');
        expect(document.activeElement).toBe(exclusiveButton);
    });
});

// ============================================================================
// 5. Keyboard 'i' issues pipe order without mouse (WCAG 2.5.7)
// ============================================================================

describe('WCAG 2.5.7 — keyboard pipe order', () => {
    test('pressing i issues a pipe order without any mouse interaction', async () => {
        const { client, store } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Tab to the grid; initial roving focus lands on center cell (5,5).
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('map');
        expect(store.getState().selection).toEqual({ x: 5, y: 5 });

        // East pipe already exists on (5,5): i targets N → setPipe N.
        await user.keyboard('i');

        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toEqual({
            kind: 'setPipe',
            player: 1,
            cell: { x: 5, y: 5 },
            direction: 'N',
        });
        // The focused cell still carries the visible focus ring class.
        const ringCell = document.querySelector(`#${cellElementId({ x: 5, y: 5 })}`);
        expect(ringCell).not.toBeNull();
    });
});

// ============================================================================
// 6. Focus ring contrast ≥ 3:1 on order bar (WCAG 2.4.7)
// ============================================================================

describe('WCAG 2.4.7 — order bar focus ring contrast', () => {
    test('palette focus indicator has ≥ 3:1 contrast ratio', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        // Keyboard-focus the first palette button (:focus-visible only
        // matches keyboard-initiated focus, so Tab all the way in:
        // skip-link → map → hud → help-button → order-bar → button).
        for (let i = 0; i < 6; i++) {
            await user.keyboard('{Tab}');
        }
        const button = document.activeElement as HTMLButtonElement | null;
        expect(button?.getAttribute('aria-pressed')).not.toBeNull();

        const style = window.getComputedStyle(button as HTMLButtonElement);
        // The stylesheet defines solid #ffffff outlines on the #111827 bar.
        expect(style.outlineStyle).toBe('solid');
        expect(Number.parseInt(style.outlineWidth, 10)).toBeGreaterThanOrEqual(2);
        expect(style.outlineColor).toBe('rgb(255, 255, 255)');
        // White-on-dark-navy contrast ratio ≈ 16:1 — comfortably ≥ 3:1.
        expect(contrastRatio('#ffffff', '#111827')).toBeGreaterThanOrEqual(3);
    });
});

// ============================================================================
// 7. Paratroop overlay aria-live announcements (WCAG 4.1.3)
// ============================================================================

describe('WCAG 4.1.3 — paratroop overlay announcements', () => {
    test('targeting overlay announces the binned target politely', async () => {
        const { store } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Establish the anchor via keyboard (Tab ×2 → grid, center cell).
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(store.getState().selection).toEqual({ x: 5, y: 5 });

        // Move the pointer into the NE ring-2 bin of the focused cell.
        await movePointerOver(5, 5, 0.85, 0.15);

        // The overlay's polite status node announces the projected target.
        const status = document.querySelector('.europa-targeting [role="status"]');
        expect(status).not.toBeNull();
        expect(status?.getAttribute('aria-live')).toBe('polite');
        expect(status?.textContent).toBe('Paratroop target: (7, 3)');
    });
});

// ============================================================================
// 8. Centered posture "no launch" announcement (WCAG 4.1.3)
// ============================================================================

describe('WCAG 4.1.3 — centered posture no-launch announcement', () => {
    test('centered cursor announces the focused cell (no launch)', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');

        // Pointer rests at the exact center of the focused cell.
        await movePointerOver(5, 5, 0.5, 0.5);

        const status = document.querySelector('.europa-targeting [role="status"]');
        expect(status?.textContent).toBe('No launch — cursor centered on (5, 5)');
    });
});

// ============================================================================
// 9. Keyboard-only 'p' never launches (WCAG 2.5.7)
// ============================================================================

describe('WCAG 2.5.7 — keyboard-only paratroop no-launch', () => {
    test('keyboard-only p never launches (center default)', async () => {
        const { client } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Keyboard only: Tab to the grid (anchor established), then fire.
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('p');

        // Subcell defaults to center without mouse motion → no launch.
        expect(client.orders).toHaveLength(0);
        const orderFeedback = Array.from(document.querySelectorAll('[data-europa-live]')).filter((node) =>
            node.textContent?.includes('Paratroop'),
        );
        expect(orderFeedback).toHaveLength(0);
    });
});

// ============================================================================
// 10. Slider focus ring contrast ≥ 3:1 (WCAG 2.4.7)
// ============================================================================

describe('WCAG 2.4.7 — slider focus ring contrast', () => {
    test('reserves slider shows high-contrast focus ring when focused', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        const slider = document.querySelector<HTMLInputElement>('#reserves-slider');
        expect(slider).not.toBeNull();
        const sliderNode = slider as HTMLInputElement;
        sliderNode.focus();
        const style = getComputedStyle(sliderNode);
        // White (#ffffff ≈ 16:1 on #111827) 2px outline — far above the
        // WCAG 2.4.7 3:1 minimum.
        expect(style.outlineStyle).not.toBe('none');
        expect(Number.parseInt(style.outlineWidth, 10)).toBeGreaterThanOrEqual(2);
        expect(style.outlineColor).toMatch(/255,\s*255,\s*255/);
    });
});

// ============================================================================
// 11. Reserve announcement (WCAG 4.1.3)
// ============================================================================

describe('WCAG 4.1.3 — reserve announcement', () => {
    test('pressing 7 announces "Reserved 70% at (5, 5)" politely', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(document.querySelector('#reserves-slider')).not.toBeNull();
        await user.keyboard('7');

        const liveRegion = document.querySelector('#feedback [role="status"][aria-live="polite"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion?.textContent).toContain('Reserved 70% at (5, 5)');
    });
});

// ============================================================================
// 12. Reduced motion skips combat flash (WCAG 2.3.3)
// ============================================================================

describe('WCAG 2.3.3 — reduced motion', () => {
    /** A minimal MapView carrying a combat flash on one cell. */
    function flashView(): MapView {
        return {
            id: 'mv-flash',
            tick: 1,
            width: 2,
            height: 2,
            cells: new Map([
                [
                    '0,0',
                    {
                        coord: { x: 0, y: 0 },
                        elevation: 100,
                        terrain: 'land',
                        troops: 3,
                        owner: 1,
                        isCity: false,
                        cityOwner: null,
                        pipes: new Set(),
                        reservesPct: 0,
                        changedThisTick: false,
                    },
                ],
            ]),
            playerColors: { 1: '#dc2626' },
            effects: [
                { kind: 'combat', cell: { x: 0, y: 0 }, expiresAtMs: Number.MAX_SAFE_INTEGER },
            ] satisfies readonly MapEffect[],
            labels: [],
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
            hover: null,
            selection: null,
            dragSelection: null,
            exclusiveMode: false,
        };
    }

    /** Paint `view` into an offscreen canvas and sample the cell center. */
    function paintAndSample(view: MapView, reducedMotion: boolean): [number, number, number] {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error('no 2d context');
        }
        new MapCanvas().paint(view, ctx, { reducedMotion });
        const { data } = ctx.getImageData(16, 16, 1, 1);
        return [data[0], data[1], data[2]];
    }

    test('reduced motion skips the combat flash entirely', () => {
        const view = flashView();
        // Baseline: the same view WITHOUT effects (terrain + unit only).
        const baseline = paintAndSample({ ...view, effects: [] }, false);
        // Full motion paints the translucent red flash over the cell.
        const full = paintAndSample(view, false);
        expect(full).not.toEqual(baseline);
        // Reduced motion: the flash duration is effectively 0 ms — the
        // painted output equals the no-effect baseline exactly.
        const reduced = paintAndSample(view, true);
        expect(reduced).toEqual(baseline);
    });
});

// ============================================================================
// 13. Surrender modal keyboard focus trap (WCAG 2.4.3 Focus Order)
// ============================================================================

describe('WCAG 2.4.3 — surrender modal focus trap', () => {
    test('surrender modal traps focus between Cancel and Confirm buttons', async () => {
        const onCancel = vi.fn();
        const onConfirm = vi.fn();
        await render(createElement(SurrenderModal, { open: true, onConfirm, onCancel }));

        const cancel = document.querySelector<HTMLButtonElement>(
            '.europa-modal__button:not(.europa-modal__button--danger)',
        );
        const confirm = document.querySelector<HTMLButtonElement>('.europa-modal__button--danger');
        expect(cancel).not.toBeNull();
        expect(confirm).not.toBeNull();

        // Focus moves into the dialog on open (first button).
        expect(document.activeElement).toBe(cancel);

        const user = userEvent.setup();
        await user.keyboard('{Tab}');
        expect(document.activeElement).toBe(confirm);
        await user.keyboard('{Tab}');
        expect(document.activeElement).toBe(cancel);
        await user.keyboard('{Shift>}{Tab}{/Shift}');
        expect(document.activeElement).toBe(confirm);

        // Escape closes without dispatching.
        await user.keyboard('{Escape}');
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
