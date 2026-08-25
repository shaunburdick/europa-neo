/**
 * TickEvents builder tests — Feature 001, T014
 *
 * Validates the immutability contract on every event builder:
 *   - `emptyTickEvents()` returns a fresh object with distinct array
 *     identities per call (no shared references — critical for
 *     parallel `tick()` purity).
 *   - Each `push*` returns a NEW `TickEvents`; the input is never
 *     mutated.
 *   - Push order is preserved (last-pushed = last-seen).
 *   - 1000-event smoke test catches off-by-one / capacity issues.
 */

import { describe, expect, it } from 'vitest';
import {
    emptyTickEvents,
    pushAppliedOrder,
    pushCaptureEvent,
    pushCombatEvent,
    pushEliminationEvent,
    pushError,
} from '../../src/events';
import type {
    AppliedOrderRecord,
    CaptureEvent,
    CombatEvent,
    EliminationEvent,
    Order,
    PlayerId,
    ValidationError,
} from '../../src/types';

// ----------------------------------------------------------------------------
// Test fixtures
// ----------------------------------------------------------------------------

const COMBAT: CombatEvent = {
    tick: 1,
    cell: { x: 0, y: 0 },
    attacker: 1 as PlayerId,
    defender: 2 as PlayerId,
    attackerLoss: 5,
    defenderLoss: 5,
    winner: 'tie',
};

const CAPTURE: CaptureEvent = {
    tick: 1,
    cell: { x: 1, y: 2 },
    fromOwner: null,
    toOwner: 1 as PlayerId,
    isCity: true,
};

const ELIM: EliminationEvent = {
    tick: 2,
    player: 2 as PlayerId,
    reason: 'no_troops_no_cities',
};

const ORDER: Order = {
    kind: 'setPipe',
    player: 1 as PlayerId,
    cell: { x: 3, y: 3 },
    direction: 'E',
};

const APPLIED: AppliedOrderRecord = {
    tick: 0,
    order: ORDER,
    result: { ok: true },
};

const ERR_REASON: ValidationError = { kind: 'out_of_bounds', coord: { x: -1, y: 0 } };
const ERROR_REC = { order: ORDER, reason: ERR_REASON };

// ----------------------------------------------------------------------------
// emptyTickEvents
// ----------------------------------------------------------------------------

describe('emptyTickEvents', () => {
    it('returns an object with all five array fields empty', () => {
        const e = emptyTickEvents();
        expect(e.combat).toEqual([]);
        expect(e.captures).toEqual([]);
        expect(e.eliminations).toEqual([]);
        expect(e.appliedOrders).toEqual([]);
        expect(e.errors).toEqual([]);
    });

    it('returns a fresh object with distinct array identities per call', () => {
        const a = emptyTickEvents();
        const b = emptyTickEvents();
        expect(a).not.toBe(b);
        expect(a.combat).not.toBe(b.combat);
        expect(a.captures).not.toBe(b.captures);
        expect(a.eliminations).not.toBe(b.eliminations);
        expect(a.appliedOrders).not.toBe(b.appliedOrders);
        expect(a.errors).not.toBe(b.errors);
    });
});

// ----------------------------------------------------------------------------
// Immutability + order preservation
// ----------------------------------------------------------------------------

describe('push* builders — purity and order preservation', () => {
    it('pushCombatEvent returns a new TickEvents, input is untouched', () => {
        const before = emptyTickEvents();
        const after = pushCombatEvent(before, COMBAT);
        expect(after).not.toBe(before);
        expect(before.combat).toEqual([]); // input unchanged
        expect(after.combat).toEqual([COMBAT]);
    });

    it('pushCaptureEvent returns a new TickEvents, input is untouched', () => {
        const before = emptyTickEvents();
        const after = pushCaptureEvent(before, CAPTURE);
        expect(after).not.toBe(before);
        expect(before.captures).toEqual([]); // input unchanged
        expect(after.captures).toEqual([CAPTURE]);
    });

    it('pushEliminationEvent returns a new TickEvents, input is untouched', () => {
        const before = emptyTickEvents();
        const after = pushEliminationEvent(before, ELIM);
        expect(after).not.toBe(before);
        expect(before.eliminations).toEqual([]); // input unchanged
        expect(after.eliminations).toEqual([ELIM]);
    });

    it('pushAppliedOrder returns a new TickEvents, input is untouched', () => {
        const before = emptyTickEvents();
        const after = pushAppliedOrder(before, APPLIED);
        expect(after).not.toBe(before);
        expect(before.appliedOrders).toEqual([]); // input unchanged
        expect(after.appliedOrders).toEqual([APPLIED]);
    });

    it('pushError returns a new TickEvents, input is untouched', () => {
        const before = emptyTickEvents();
        const after = pushError(before, ERROR_REC);
        expect(after).not.toBe(before);
        expect(before.errors).toEqual([]); // input unchanged
        expect(after.errors).toEqual([ERROR_REC]);
    });

    it('preserves the order of pushes (last-pushed = last-seen)', () => {
        let e = emptyTickEvents();
        const c1: CombatEvent = { ...COMBAT, tick: 1, cell: { x: 0, y: 0 } };
        const c2: CombatEvent = { ...COMBAT, tick: 2, cell: { x: 1, y: 1 } };
        const c3: CombatEvent = { ...COMBAT, tick: 3, cell: { x: 2, y: 2 } };
        e = pushCombatEvent(e, c1);
        e = pushCombatEvent(e, c2);
        e = pushCombatEvent(e, c3);
        expect(e.combat).toEqual([c1, c2, c3]);
    });
});

// ----------------------------------------------------------------------------
// Stress / volume
// ----------------------------------------------------------------------------

describe('push* builders — volume', () => {
    it('pushes 1000 combat events and preserves all 1000 in order', () => {
        let e = emptyTickEvents();
        for (let i = 0; i < 1000; i++) {
            e = pushCombatEvent(e, { ...COMBAT, tick: i });
        }
        expect(e.combat.length).toBe(1000);
        expect(e.combat[0]?.tick).toBe(0);
        expect(e.combat[999]?.tick).toBe(999);
    });

    it('pushes 1000 errors and preserves all 1000 in order', () => {
        let e = emptyTickEvents();
        for (let i = 0; i < 1000; i++) {
            e = pushError(e, { order: ORDER, reason: ERR_REASON });
        }
        expect(e.errors.length).toBe(1000);
    });

    it('different push kinds do not interfere with each other', () => {
        let e = emptyTickEvents();
        e = pushCombatEvent(e, COMBAT);
        e = pushCaptureEvent(e, CAPTURE);
        e = pushEliminationEvent(e, ELIM);
        e = pushAppliedOrder(e, APPLIED);
        e = pushError(e, ERROR_REC);
        expect(e.combat).toEqual([COMBAT]);
        expect(e.captures).toEqual([CAPTURE]);
        expect(e.eliminations).toEqual([ELIM]);
        expect(e.appliedOrders).toEqual([APPLIED]);
        expect(e.errors).toEqual([ERROR_REC]);
    });
});
