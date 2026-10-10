/**
 * OrderDraftController integration-ish unit tests — Feature 005
 * (US2/US3 keyboard path, T097 coverage).
 *
 * Drives the real document-level keydown controller in happy-dom:
 * attach → dispatch KeyboardEvents → assert store orders. Covers the
 * stale-cursor posture (centered subcell = no launch), preflight
 * rejections surfacing as local ignores, and idempotent attach.
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_CAMERA } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { OrderDraftController } from '../../../src/input/order-draft';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { createOrderBridge } from '../../../src/state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { createConsoleStore } from '../../../src/state/store';
import type { ConsoleState, CursorTarget, ReducerEffect } from '../../../src/state/types';
import { buildPlayerView } from '../../fixtures/player-view';

/** Live 16×16 state with one owned troop cell at (5,8). */
function live(): ConsoleState {
    const view = buildPlayerView({
        width: 16,
        tick: 1,
        visibleCells: [
            {
                coord: { x: 5, y: 8 },
                cell: { x: 5, y: 8, elevation: 10, terrain: 'land' },
                troopCount: 20,
                troopOwner: 1,
                pipes: new Set(),
                reservesPercent: 0,
                cityOwner: null,
            },
            {
                coord: { x: 7, y: 8 },
                cell: { x: 7, y: 8, elevation: 20, terrain: 'land' },
                troopCount: 0,
                troopOwner: null,
                pipes: new Set(),
                reservesPercent: 0,
                cityOwner: null,
            },
        ],
    });
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: view,
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
    };
}

describe('OrderDraftController (keyboard → store)', () => {
    it('translates keydown into pipe orders through the live store', () => {
        const store = createConsoleStore(live());
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });
        const controller = new OrderDraftController(store);
        controller.attach();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
        expect(store.getState().feedback.length).toBeGreaterThan(0);
        expect(store.getState().feedback.at(-1)?.text).toMatch(/[Pp]ipe/);

        controller.dispose();
        const after = store.getState().feedback.length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
        expect(store.getState().feedback.length).toBe(after); // detached
    });

    it('is idempotent across attach calls', () => {
        const store = createConsoleStore(live());
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });
        const controller = new OrderDraftController(store);
        controller.attach();
        controller.attach();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
        // Exactly ONE order confirmation — a double-attached listener
        // would have produced two.
        expect(store.getState().feedback).toHaveLength(1);
    });

    it('keys over non-live states are dropped silently', () => {
        const store = createConsoleStore({ ...live(), status: 'idle', inputEnabled: false });
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });
        const controller = new OrderDraftController(store);
        controller.attach();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
        expect(store.getState().feedback).toHaveLength(0);
    });

    it('stale cursors aim at the cell center (no paratroop launch)', () => {
        const store = createConsoleStore(live());
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });
        const controller = new OrderDraftController(store);
        const target: CursorTarget = { coord: { x: 5, y: 8 }, subcell: { x: 0.95, y: 0.5 } };
        controller.notePointer(target, performance.now() - 10_000); // stale
        controller.attach();
        const before = store.getState().feedback.length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
        expect(store.getState().feedback.length).toBe(before); // center = no launch
    });

    it('fresh cursors issue aimed paratroops within range', () => {
        const store = createConsoleStore(live());
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });
        const controller = new OrderDraftController(store);
        const target: CursorTarget = { coord: { x: 5, y: 8 }, subcell: { x: 0.95, y: 0.5 } };
        controller.notePointer(target, performance.now());
        controller.attach();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
        // Aim lands two cells east of the source (subcell x=0.95 → +2).
        expect(store.getState().feedback.at(-1)?.text).toContain('(7, 8)');
    });

    it('suppresses orders sampled in an exterior margin but keeps local navigation usable', () => {
        const client = new FakeMatchClient();
        const effects: ReducerEffect[] = [];
        let forward: ((effect: ReducerEffect) => void) | null = null;
        const store = createConsoleStore(live(), (effect) => {
            effects.push(effect);
            forward?.(effect);
        });
        const bridge = createOrderBridge({ client, store });
        forward = (effect) => bridge.handleEffect(effect);
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 8 } });

        const marginTarget = hitTest({ x: 10, y: 320 }, DEFAULT_CAMERA, 16, { x: -64, y: -64 });
        expect(marginTarget.cell).toBeNull();

        const controller = new OrderDraftController(store);
        controller.notePointer(marginTarget, performance.now());
        controller.attach();
        const dispatch = vi.spyOn(store, 'dispatch');
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));

            expect(dispatch).not.toHaveBeenCalled();
            expect(store.getState().selection).toEqual({ x: 5, y: 8 });
            expect(effects).toHaveLength(0);
            expect(client.orders).toHaveLength(0);

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

            expect(dispatch).toHaveBeenCalledOnce();
            expect(store.getState().selection).toEqual({ x: 6, y: 8 });
            expect(effects).toHaveLength(0);
            expect(client.orders).toHaveLength(0);
        } finally {
            dispatch.mockRestore();
            controller.dispose();
            bridge.dispose();
        }
    });
});
