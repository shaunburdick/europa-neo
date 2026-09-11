/**
 * Flow-rate formula tests — Feature 001 FR-007
 *
 * Validates the elevation-gradient pipe-flow formula (`flowRateForDelta`)
 * and the shipped constant values (`DEFAULT_FLOW_CONSTANTS`,
 * `ENGINE_CONSTANTS`) defined in `@europa/core`.
 *
 * Covers every branch in `flowRateForDelta`:
 *   - delta < 0 (downhill): bonus capped at flowSlopeDeltaCap
 *   - delta = 0 (flat):     returns perPipe unchanged
 *   - delta > 0 (uphill):   penalty scales with climb; stall at 0
 *
 * Also asserts the exact shipped constant values so any accidental
 * mutation is caught immediately (SC-005).
 */

import { describe, expect, it } from 'vitest';
import type { FlowConstants } from '../../src/index';
import { DEFAULT_FLOW_CONSTANTS, ENGINE_CONSTANTS, flowRateForDelta } from '../../src/index';

// ---------------------------------------------------------------------------
// Constant value assertions (SC-005 — every numeric rule is defined in
// one tunable-constants location; these pin the shipped values)
// ---------------------------------------------------------------------------

describe('DEFAULT_FLOW_CONSTANTS — shipped values', () => {
    it('has flowRate = 12', () => {
        expect(DEFAULT_FLOW_CONSTANTS.flowRate).toBe(12);
    });

    it('has flowDownhillStep = 1', () => {
        expect(DEFAULT_FLOW_CONSTANTS.flowDownhillStep).toBe(1);
    });

    it('has flowUphillStep = 1', () => {
        expect(DEFAULT_FLOW_CONSTANTS.flowUphillStep).toBe(1);
    });

    it('has flowSlopeDeltaCap = 5', () => {
        expect(DEFAULT_FLOW_CONSTANTS.flowSlopeDeltaCap).toBe(5);
    });
});

describe('ENGINE_CONSTANTS — shared constants structurally satisfy FlowConstants', () => {
    it('has all FlowConstants fields with matching values', () => {
        expect(ENGINE_CONSTANTS.flowRate).toBe(DEFAULT_FLOW_CONSTANTS.flowRate);
        expect(ENGINE_CONSTANTS.flowDownhillStep).toBe(DEFAULT_FLOW_CONSTANTS.flowDownhillStep);
        expect(ENGINE_CONSTANTS.flowUphillStep).toBe(DEFAULT_FLOW_CONSTANTS.flowUphillStep);
        expect(ENGINE_CONSTANTS.flowSlopeDeltaCap).toBe(DEFAULT_FLOW_CONSTANTS.flowSlopeDeltaCap);
    });

    it('has engine-specific fields', () => {
        expect(ENGINE_CONSTANTS.productionRate).toBe(1);
        expect(ENGINE_CONSTANTS.cityCapacity).toBe(30);
        expect(ENGINE_CONSTANTS.cellCapacity).toBe(30);
        expect(ENGINE_CONSTANTS.decayPerTick).toBe(1);
        expect(ENGINE_CONSTANTS.paratroopCost).toBe(10);
        expect(ENGINE_CONSTANTS.gunCost).toBe(5);
        expect(ENGINE_CONSTANTS.gunDamage).toBe(2);
        expect(ENGINE_CONSTANTS.visibilityRadiusDefault).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// flowRateForDelta — downhill branch (delta < 0)
// ---------------------------------------------------------------------------

describe('flowRateForDelta — downhill (delta < 0)', () => {
    it('adds bonus proportional to the drop', () => {
        // delta = -3, perPipe = 5, bonus = 1 × min(3, 5) = 3 → 8
        expect(flowRateForDelta(-3, 5)).toBe(8);
    });

    it('caps bonus at flowSlopeDeltaCap', () => {
        // delta = -10 (exceeds cap of 5), perPipe = 5
        // bonus = 1 × min(10, 5) = 5 → 10
        expect(flowRateForDelta(-10, 5)).toBe(10);
    });

    it('exactly at the cap boundary', () => {
        // delta = -5, perPipe = 3, bonus = 1 × min(5, 5) = 5 → 8
        expect(flowRateForDelta(-5, 3)).toBe(8);
    });

    it('just below the cap boundary', () => {
        // delta = -4, perPipe = 3, bonus = 1 × min(4, 5) = 4 → 7
        expect(flowRateForDelta(-4, 3)).toBe(7);
    });

    it('single-unit downhill', () => {
        // delta = -1, perPipe = 12, bonus = 1 → 13
        expect(flowRateForDelta(-1, 12)).toBe(13);
    });

    it('perPipe = 0 with downhill still produces bonus', () => {
        // delta = -2, perPipe = 0, bonus = 2 → 2
        expect(flowRateForDelta(-2, 0)).toBe(2);
    });

    it('works with custom constants (higher step)', () => {
        const c: FlowConstants = {
            flowRate: 12,
            flowDownhillStep: 2,
            flowUphillStep: 1,
            flowSlopeDeltaCap: 3,
        };
        // delta = -2, perPipe = 4, bonus = 2 × min(2, 3) = 4 → 8
        expect(flowRateForDelta(-2, 4, c)).toBe(8);
    });

    it('works with custom constants (cap limits bonus)', () => {
        const c: FlowConstants = {
            flowRate: 12,
            flowDownhillStep: 2,
            flowUphillStep: 1,
            flowSlopeDeltaCap: 3,
        };
        // delta = -10, perPipe = 4, bonus = 2 × min(10, 3) = 6 → 10
        expect(flowRateForDelta(-10, 4, c)).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// flowRateForDelta — flat branch (delta === 0)
// ---------------------------------------------------------------------------

describe('flowRateForDelta — flat (delta = 0)', () => {
    it('returns perPipe unchanged', () => {
        expect(flowRateForDelta(0, 5)).toBe(5);
    });

    it('returns 0 when perPipe is 0', () => {
        expect(flowRateForDelta(0, 0)).toBe(0);
    });

    it('returns full perPipe for typical equal-split value', () => {
        // 2 pipes → perPipe = floor(12/2) = 6
        expect(flowRateForDelta(0, 6)).toBe(6);
    });
});

// ---------------------------------------------------------------------------
// flowRateForDelta — uphill branch (delta > 0)
// ---------------------------------------------------------------------------

describe('flowRateForDelta — uphill (delta > 0)', () => {
    it('subtracts penalty proportional to the climb', () => {
        // delta = 3, perPipe = 5, penalty = 1 × 3 = 3 → 2
        expect(flowRateForDelta(3, 5)).toBe(2);
    });

    it('stalls at 0 when penalty exceeds perPipe', () => {
        // delta = 10, perPipe = 5, penalty = 10 → 0
        expect(flowRateForDelta(10, 5)).toBe(0);
    });

    it('stalls exactly when penalty equals perPipe', () => {
        // delta = 5, perPipe = 5, penalty = 5 → 0
        expect(flowRateForDelta(5, 5)).toBe(0);
    });

    it('just above stall threshold', () => {
        // delta = 6, perPipe = 5, penalty = 6 → max(0, -1) = 0
        expect(flowRateForDelta(6, 5)).toBe(0);
    });

    it('just below stall threshold', () => {
        // delta = 4, perPipe = 5, penalty = 4 → 1
        expect(flowRateForDelta(4, 5)).toBe(1);
    });

    it('single-unit uphill', () => {
        // delta = 1, perPipe = 12, penalty = 1 → 11
        expect(flowRateForDelta(1, 12)).toBe(11);
    });

    it('perPipe = 0 with uphill stays at 0', () => {
        expect(flowRateForDelta(1, 0)).toBe(0);
    });

    it('works with custom constants (higher step)', () => {
        const c: FlowConstants = {
            flowRate: 12,
            flowDownhillStep: 1,
            flowUphillStep: 2,
            flowSlopeDeltaCap: 5,
        };
        // delta = 3, perPipe = 7, penalty = 2 × 3 = 6 → 1
        expect(flowRateForDelta(3, 7, c)).toBe(1);
    });

    it('works with custom constants (stalls sooner)', () => {
        const c: FlowConstants = {
            flowRate: 12,
            flowDownhillStep: 1,
            flowUphillStep: 3,
            flowSlopeDeltaCap: 5,
        };
        // delta = 3, perPipe = 5, penalty = 9 → 0
        expect(flowRateForDelta(3, 5, c)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Edge cases and integer arithmetic invariants
// ---------------------------------------------------------------------------

describe('flowRateForDelta — edge cases', () => {
    it('always returns an integer (no float drift)', () => {
        const values = [
            flowRateForDelta(-3, 5),
            flowRateForDelta(0, 7),
            flowRateForDelta(4, 5),
            flowRateForDelta(-100, 0),
            flowRateForDelta(100, 20),
        ];
        for (const v of values) {
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    it('never returns a negative value', () => {
        // Uphill with extreme delta
        expect(flowRateForDelta(1000, 5)).toBe(0);
        // Uphill with zero perPipe
        expect(flowRateForDelta(1, 0)).toBe(0);
    });

    it('downhill result is always ≥ perPipe', () => {
        for (const delta of [-1, -5, -100]) {
            const result = flowRateForDelta(delta, 10);
            expect(result).toBeGreaterThanOrEqual(10);
        }
    });

    it('uphill result is always ≤ perPipe', () => {
        for (const delta of [1, 5, 100]) {
            const result = flowRateForDelta(delta, 10);
            expect(result).toBeLessThanOrEqual(10);
        }
    });

    it('flat result always equals perPipe', () => {
        for (const perPipe of [0, 1, 5, 12, 100]) {
            expect(flowRateForDelta(0, perPipe)).toBe(perPipe);
        }
    });
});
