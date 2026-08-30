/**
 * Informational mirror — `flowRateForDelta` (spec 001 FR-007, Clarifications v1.2)
 *
 * The single source of the elevation-gradient flow formula, exported
 * additively from `@europa/engine`. Consumed by:
 *   - `packages/engine/src/resolution/flow.ts` (the tick's flow phase)
 *   - the terrain reachable-land suite (spec 003 US4 AC-1 reads the
 *     stall threshold from `ENGINE_CONSTANTS` via this function)
 *   - the console slope drift test (spec 005 FR-013 pins the console
 *     mirror against it)
 *
 * This file is informational — the real implementation lives in the
 * engine package. Drift between this mirror and the shipped function
 * is a bug.
 *
 * ⚠️ R-1 (PM blocker): the formula below is the WORKING ASSUMPTION
 * (asymmetric cap — the cap bounds the downhill bonus only; the uphill
 * handicap is uncapped). It matches every rate listed in spec 001
 * v1.2 (downhill 8/9/10/11/12, flat 7, uphill 6/5/4/3/2/1, stall
 * Δ≥7) and the empirical 31.5%-stall figure in spec 003 v1.3. The
 * FR-007 text as literally written (symmetric cap) cannot produce
 * stalls at flowBase=7/cap=5. Confirm with the PM before finalizing
 * the flow tests.
 */

/**
 * Flow rate along one pipe for a given elevation change, in troops
 * per tick. Pure, integer arithmetic, deterministic (FR-017).
 *
 * @param delta     `destElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param constants Engine rule constants (`flowBase`,
 *                  `flowSlopeStep`, `flowSlopeDeltaCap`).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export declare function flowRateForDelta(delta: number, constants: {
    readonly flowBase: number;
    readonly flowSlopeStep: number;
    readonly flowSlopeDeltaCap: number;
}): number;

/**
 * Shipped constant values (spec 001 Clarifications v1.2).
 * Resulting per-tick rates: downhill 8/9/10/11/12 (Δ=1/2/3/4/≥5),
 * flat 7, uphill 6/5/4/3/2/1 (Δ=1..6), 0 (Δ≥7 — stall).
 */
export declare const FLOW_CONSTANTS: {
    readonly flowBase: 7;
    readonly flowSlopeStep: 1;
    readonly flowSlopeDeltaCap: 5;
};