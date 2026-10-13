import { describe, expect, it } from 'vitest';
import { resolveTwoWayAttrition } from '../../src/resolution/attrition';

const CAP = 30;

describe('resolveTwoWayAttrition — winner determination', () => {
    it('attacker wins with the difference when it has the higher total', () => {
        // Non-canonical owner bytes (attacker > defender): the helper must
        // never reorder roles.
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 3,
            attackerTotal: 20,
            defenderOwner: 1,
            defenderTotal: 5,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 3, winnerCount: 15, damage: 5 });
    });

    it('defender wins with the difference when it has the higher total', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 5,
            defenderOwner: 2,
            defenderTotal: 20,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 2, winnerCount: 15, damage: 5 });
    });
});

describe('resolveTwoWayAttrition — FR-011 capacity clamping boundary', () => {
    it('keeps a winner remaining one below capacity unclamped (cap - 1)', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 39,
            defenderOwner: 2,
            defenderTotal: 10,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 1, winnerCount: 29, damage: 10 });
    });

    it('keeps a winner remaining exactly at capacity (cap)', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 40,
            defenderOwner: 2,
            defenderTotal: 10,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 1, winnerCount: 30, damage: 10 });
    });

    it('clamps a winner remaining above capacity to cap (cap + 1)', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 41,
            defenderOwner: 2,
            defenderTotal: 10,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 1, winnerCount: 30, damage: 10 });
    });
});

describe('resolveTwoWayAttrition — tie and zero-force edges', () => {
    it('equal totals annihilate: owner 0, count 0, damage = the total', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 10,
            defenderOwner: 2,
            defenderTotal: 10,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 0, winnerCount: 0, damage: 10 });
    });

    it('both totals zero is a tie with no damage', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 0,
            defenderOwner: 2,
            defenderTotal: 0,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 0, winnerCount: 0, damage: 0 });
    });

    it('an empty attacker loses nothing: defender survives intact', () => {
        const outcome = resolveTwoWayAttrition({
            attackerOwner: 1,
            attackerTotal: 0,
            defenderOwner: 2,
            defenderTotal: 5,
            cellCapacity: CAP,
        });
        expect(outcome).toEqual({ winnerOwner: 2, winnerCount: 5, damage: 0 });
    });
});
