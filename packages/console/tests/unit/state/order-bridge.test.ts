/**
 * Order bridge + store unit tests — Feature 005 (T056/T028, T097
 * coverage).
 *
 * The bridge is the ONLY console code that talks to the network
 * client: `sendOrder` effects go out; inbound envelopes come back as
 * reducer dispatches. The store publishes state before invoking its
 * effect sink (contract ordering).
 */

import { describe, expect, it } from 'vitest';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { createOrderBridge } from '../../../src/state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { createConsoleStore } from '../../../src/state/store';
import type {
    ConsoleState,
    NetworkPayload,
    ProtocolEnvelope,
    ReducerEffect,
    SequenceNumber,
} from '../../../src/state/types';

const NOW = 5000;

/** Fog view used for tick broadcasts. */
function emptyView(): ConsoleState['latestView'] {
    return {
        player: 1,
        tick: 1,
        visibleCells: [],
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: { boardSize: 16, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
    };
}

/** Live seated state so gestures produce orders. */
function live(): ConsoleState {
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: {
            player: 1,
            tick: 1,
            visibleCells: [],
            events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
            config: { boardSize: 16, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
        },
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
    };
}

describe('createConsoleStore (T028)', () => {
    it('publishes the next state BEFORE running effects', () => {
        const observed: { readonly gridlines: boolean | undefined; readonly effectKind?: string }[] = [];
        const store = createConsoleStore(live(), (effect) => {
            observed.push({
                gridlines: store.getState().qol.gridlines,
                effectKind: effect.kind,
            });
        });
        // setQol produces a persistQol effect — perfect for ordering checks.
        store.dispatch({ kind: 'setQol', patch: { gridlines: false } }, { nowMs: NOW });
        expect(observed).toEqual([{ gridlines: false, effectKind: 'persistQol' }]);
        expect(store.getState().qol.gridlines).toBe(false);
    });

    it('defaults nowMs via performance.now when options omitted', () => {
        const store = createConsoleStore();
        expect(() => store.dispatch({ kind: 'selectCell', cell: { x: 1, y: 1 } })).not.toThrow();
        expect(store.getState().selection).toEqual({ x: 1, y: 1 });
    });

    it('honours rngSeed pass-through without altering behaviour', () => {
        const store = createConsoleStore(live());
        store.dispatch({ kind: 'selectCell', cell: null }, { nowMs: NOW, rngSeed: 7 });
        expect(store.getState().selection).toBeNull();
    });
});

describe('createOrderBridge (T056)', () => {
    it('forwards sendOrder effects to the client and ignores other kinds', async () => {
        const client = new FakeMatchClient();
        const store = createConsoleStore(live(), () => undefined);
        const bridge = createOrderBridge({ store, client });

        const effects: ReducerEffect[] = [
            { kind: 'sendOrder', actionId: 5, order: { kind: 'surrender', player: 1 } },
            { kind: 'announce', text: 'x', politeness: 'polite' },
            { kind: 'persistQol', settings: INITIAL_CONSOLE_STATE.qol },
            { kind: 'playSound', clip: 'capture' },
            { kind: 'scheduleReconnect', delayMs: 100 },
        ];
        for (const effect of effects) {
            bridge.handleEffect(effect);
        }
        await Promise.resolve();
        expect(client.sent).toHaveLength(1);
        expect(client.sent[0]?.actionId).toBe(5);
        bridge.dispose();
    });

    it('dispatches inbound envelopes as NetEvents with live correlation', () => {
        const client = new FakeMatchClient();
        const store = createConsoleStore(live(), () => undefined);
        createOrderBridge({ store, client });

        // Stamp a wire seq by sending through the fake directly.
        void client.sendOrder(42, { kind: 'surrender', player: 1 });
        const [seq] = [...client.seqToActionId.entries()].find(([, id]) => id === 42) ?? [];

        client.emit({
            type: 'orderAck',
            version: '',
            seq: seq as SequenceNumber,
            payload: { seq: seq as SequenceNumber, result: { ok: true } },
        } as unknown as ProtocolEnvelope<NetworkPayload>);
        expect(store.getState().feedback.at(-1)?.text).toContain('acknowledged');

        client.emit({
            type: 'tick',
            version: '',
            seq: 99 as SequenceNumber,
            payload: { tick: 40, view: { ...(live().latestView ?? emptyView()), tick: 40 } },
        } as unknown as ProtocolEnvelope<NetworkPayload>);
        expect(store.getState().latestView?.tick).toBe(40);
    });

    it('dispose() unsubscribes from envelopes (idempotent)', () => {
        const client = new FakeMatchClient();
        const store = createConsoleStore(live(), () => undefined);
        const bridge = createOrderBridge({ store, client });
        bridge.dispose();
        bridge.dispose();
        const before = store.getState().feedback.length;
        client.emit({
            type: 'error',
            version: '',
            seq: 1 as SequenceNumber,
            payload: { code: 'internal_error', message: 'x' },
        } as unknown as ProtocolEnvelope<NetworkPayload>);
        expect(store.getState().feedback.length).toBe(before);
    });
});
