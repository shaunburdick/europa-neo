/**
 * Hotkey UI-zoom layer tests — issue #76 (T108, FR-018).
 *
 * The `HotkeyController` gains a distinct UI-zoom path that runs
 * BEFORE the order table:
 *   · `+` / `=` zoom in one step (× ZOOM_WHEEL_STEP, board-center
 *     anchored — same pure helpers as the wheel + sidebar buttons);
 *   · `-` / `_` zoom out one step;
 *   · `Home` resets to 100% (camera.minZoom = fitZoom).
 *
 * PM ruling: `0` is NOT a zoom shortcut — it stays the `reserve0`
 * digit key (the engine's reserves domain owns 0–9). The zoom layer
 * shares the existing focus guard (`shouldIgnoreKeyEvent`): keys are
 * ignored while focus is inside interactive chrome, and browser-level
 * modifier combos (Ctrl/Meta/Alt) are never hijacked.
 */

import { describe, expect, test } from 'vitest';
import { HotkeyController } from '../../../src/qol/hotkeys';
import { ZOOM_WHEEL_STEP } from '../../../src/qol/zoom';
import { createOrderBridge } from '../../../src/state/order-actions';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { Direction, ReducerEffect } from '../../../src/state/types';
import { FakeMatchClient } from '../../fixtures/fake-match-client';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

/** Live store around an 8×8 board with a default camera. */
function makeStore(): { readonly store: ConsoleStore; readonly client: FakeMatchClient } {
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
                pipes: new Set<Direction>(['N']),
            }),
        ],
    });
    const client = new FakeMatchClient();
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore({ ...createLiveConsoleState(view), selection: { x: 4, y: 4 } }, (effect) => {
        forward?.(effect);
    });
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);
    return { store, client };
}

/** Dispatch a keydown on the document (happy-dom). */
function pressKey(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

describe('HotkeyController UI-zoom layer (FR-018)', () => {
    test('+ and = zoom in one step from the default camera', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        const before = store.getState().camera.zoom;
        pressKey('+');
        expect(store.getState().camera.zoom).toBeCloseTo(before * ZOOM_WHEEL_STEP);
        const afterPlus = store.getState().camera.zoom;
        pressKey('=');
        expect(store.getState().camera.zoom).toBeCloseTo(afterPlus * ZOOM_WHEEL_STEP);
        controller.dispose();
    });

    test('- and _ zoom out one step (clamped at minZoom when at default)', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        // With minZoom = 32 (default), zooming out from the
        // default camera immediately hits the floor.
        pressKey('-');
        expect(store.getState().camera.zoom).toBe(store.getState().camera.minZoom);
        controller.dispose();
    });

    test('Home resets to 100% (camera.minZoom) from any zoom', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        pressKey('+');
        pressKey('+');
        const minZoom = store.getState().camera.minZoom;
        expect(store.getState().camera.zoom).toBeGreaterThan(minZoom);
        pressKey('Home');
        expect(store.getState().camera.zoom).toBe(minZoom);
        controller.dispose();
    });

    test('zoom clamps at the contractual min and max', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        for (let i = 0; i < 20; i += 1) {
            pressKey('-');
        }
        expect(store.getState().camera.zoom).toBe(store.getState().camera.minZoom);
        for (let i = 0; i < 40; i += 1) {
            pressKey('+');
        }
        expect(store.getState().camera.zoom).toBe(store.getState().camera.maxZoom);
        controller.dispose();
    });

    test('zoom keys are suppressed while focus is inside interactive chrome', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        const before = store.getState().camera.zoom;
        button.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
        expect(store.getState().camera.zoom).toBe(before);
        button.remove();
        controller.dispose();
    });

    test('0 still routes to reserve0 — it is NOT a zoom shortcut (PM ruling)', () => {
        const { store, client } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        const before = store.getState().camera.zoom;
        pressKey('0');
        expect(store.getState().camera.zoom).toBe(before);
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 0 });
        controller.dispose();
    });

    test('Ctrl/Meta/Alt modifier combos are never hijacked', () => {
        const { store } = makeStore();
        const controller = new HotkeyController(store);
        controller.attach();
        const before = store.getState().camera.zoom;
        pressKey('+', { ctrlKey: true });
        pressKey('+', { metaKey: true });
        pressKey('+', { altKey: true });
        expect(store.getState().camera.zoom).toBe(before);
        controller.dispose();
    });

    test('no zoom dispatch without a board view', () => {
        const store = createConsoleStore();
        const controller = new HotkeyController(store);
        controller.attach();
        const before = store.getState().camera.zoom;
        pressKey('+');
        expect(store.getState().camera.zoom).toBe(before);
        controller.dispose();
    });
});
