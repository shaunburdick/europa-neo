/**
 * Elevation-gradient flow rate — Feature 001, FR-007 (issue #30)
 *
 * The single source of the pipe-flow formula. `resolveFlow` (the tick's
 * flow phase) consumes this function, and downstream consumers (the
 * terrain reachable-land suite, the console slope drift test) import it
 * from the package barrel so the formula lives in exactly one place.
 *
 * Formula (PM-confirmed ruling R-1 — asymmetric cap):
 *   delta < 0 (downhill): flowBase + flowSlopeStep × min(|delta|, flowSlopeDeltaCap)
 *   delta = 0 (flat):     flowBase
 *   delta > 0 (uphill):   max(0, flowBase − flowSlopeStep × |delta|)
 *
 * The cap bounds the DOWNHILL bonus only; the uphill handicap is
 * uncapped, so an uphill pipe stalls (returns 0) at
 * delta ≥ flowBase / flowSlopeStep (7 with the shipped constants).
 * A stalled pipe remains laid and legal (US1 AC-5).
 *
 * Pure, integer arithmetic, deterministic (FR-017).
 */

import type { EngineConstants } from './contracts/engine-api';

/**
 * Troops moved per tick along one pipe for a given elevation change.
 *
 * @param delta     `dstElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param constants Engine rule constants (`flowBase`, `flowSlopeStep`,
 *                  `flowSlopeDeltaCap`).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function flowRateForDelta(delta: number, constants: EngineConstants): number {
    const { flowBase, flowSlopeStep, flowSlopeDeltaCap } = constants;
    if (delta < 0) {
        // Downhill: bonus scales with the drop, capped at flowSlopeDeltaCap.
        return flowBase + flowSlopeStep * Math.min(-delta, flowSlopeDeltaCap);
    }
    if (delta > 0) {
        // Uphill: uncapped handicap; stalls at delta ≥ flowBase / flowSlopeStep.
        return Math.max(0, flowBase - flowSlopeStep * delta);
    }
    return flowBase;
}