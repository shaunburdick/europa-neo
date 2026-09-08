/**
 * Elevation-gradient pipe flow rate — shared foundation
 *
 * The single source of the pipe-flow formula and its tunable constants.
 * Both `@europa/engine` and `@europa/terrain` import from here so the
 * formula lives in exactly one place (constitution Principle V;
 * SC-005 "every numeric rule is defined in one tunable-constants
 * location").
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Subset of engine constants that govern pipe flow. Defined here
 * (in `@europa/core`) so terrain's INV-16 validator can compute
 * flow viability without depending on `@europa/engine` — which would
 * create a cyclic workspace dependency (engine has terrain as a
 * devDependency for tests).
 */
export interface FlowConstants {
    /** Base troops per tick moving along a flat pipe (FR-007). */
    readonly flowBase: number;
    /** Troops added/subtracted per unit of elevation change (FR-007). */
    readonly flowSlopeStep: number;
    /** Caps the downhill bonus (FR-007). */
    readonly flowSlopeDeltaCap: number;
}

/**
 * Shipped game-rule values for pipe flow. The engine's full
 * `ENGINE_CONSTANTS` object structurally satisfies `FlowConstants`
 * (same field names, same types), so callers can pass either.
 */
export const DEFAULT_FLOW_CONSTANTS: FlowConstants = {
    flowBase: 7,
    flowSlopeStep: 1,
    flowSlopeDeltaCap: 5,
} as const;

// ---------------------------------------------------------------------------
// Formula
// ---------------------------------------------------------------------------

/**
 * Troops moved per tick along one pipe for a given elevation change.
 *
 * @param delta     `dstElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param constants Flow-rule constants (defaults to `DEFAULT_FLOW_CONSTANTS`
 *                  when omitted).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function flowRateForDelta(delta: number, constants: FlowConstants = DEFAULT_FLOW_CONSTANTS): number {
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
