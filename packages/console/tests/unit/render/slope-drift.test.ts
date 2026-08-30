/**
 * Drift test: console slope mirror vs engine — Feature 005 FR-013
 * (issue #30).
 *
 * The console `src/` graph may not runtime-import `@europa/engine`
 * (features 001/004 boundary rule), so `src/render/pipe-slope.ts`
 * carries its own mirror of the flow constants + formula. This test
 * pins the mirror against the engine's single source of truth
 * (`ENGINE_CONSTANTS` / `flowRateForDelta`) so a future retune of the
 * engine constants fails loudly in the console suite (spec 005
 * Clarifications v1.2: "a drift test importing `@europa/engine`
 * constants pins the mirror"). Runtime engine imports in `tests/` are
 * sanctioned by that same clarification.
 */

import { ENGINE_CONSTANTS, flowRateForDelta } from '@europa/engine';
import { describe, expect, test } from 'vitest';
import { PIPE_SLOPE_CONSTANTS, pipeFlowRate } from '../../../src/render/pipe-slope';

describe('slope mirror drift vs engine (005 FR-013)', () => {
    test('PIPE_SLOPE_CONSTANTS mirrors the three ENGINE_CONSTANTS fields', () => {
        expect(PIPE_SLOPE_CONSTANTS.flowBase).toBe(ENGINE_CONSTANTS.flowBase);
        expect(PIPE_SLOPE_CONSTANTS.flowSlopeStep).toBe(ENGINE_CONSTANTS.flowSlopeStep);
        expect(PIPE_SLOPE_CONSTANTS.flowSlopeDeltaCap).toBe(ENGINE_CONSTANTS.flowSlopeDeltaCap);
    });

    test('pipeFlowRate agrees with flowRateForDelta across the delta sweep', () => {
        // Δ ∈ {−10..10} spans downhill (capped bonus), flat, uphill
        // flowing, and the stall boundary (Δ = 7).
        for (let delta = -10; delta <= 10; delta++) {
            expect(pipeFlowRate(delta, PIPE_SLOPE_CONSTANTS), `delta=${delta}`).toBe(
                flowRateForDelta(delta, ENGINE_CONSTANTS),
            );
        }
    });

    test('the stall boundary (Δ = 7) is pinned on both sides', () => {
        expect(pipeFlowRate(6, PIPE_SLOPE_CONSTANTS)).toBe(flowRateForDelta(6, ENGINE_CONSTANTS));
        expect(pipeFlowRate(7, PIPE_SLOPE_CONSTANTS)).toBe(flowRateForDelta(7, ENGINE_CONSTANTS));
        expect(pipeFlowRate(7, PIPE_SLOPE_CONSTANTS)).toBe(0);
    });
});
