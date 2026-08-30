/**
 * Pipe slope classification — Feature 005, FR-013 (issue #30)
 *
 * Console-side mirror of the engine's flow constants + formula
 * (feature 001 FR-007) plus the slope classification the renderer
 * consumes. The console `src/` graph may NOT runtime-import
 * `@europa/engine` (features 001/004 boundary rule), so this module
 * is the console's own mirror — pinned by the drift test
 * (`tests/unit/render/slope-drift.test.ts`), which imports
 * `ENGINE_CONSTANTS` + `flowRateForDelta` from `@europa/engine` and
 * asserts equality. A future retune of the engine constants fails
 * loudly in the console suite (spec 005 Clarifications v1.2).
 *
 * Formula (PM-confirmed ruling R-1 — asymmetric cap):
 *   delta < 0 (downhill): flowBase + flowSlopeStep × min(|delta|, flowSlopeDeltaCap)
 *   delta = 0 (flat):     flowBase
 *   delta > 0 (uphill):   max(0, flowBase − flowSlopeStep × |delta|)
 *
 * The cap bounds the DOWNHILL bonus only; the uphill handicap is
 * uncapped, so an uphill pipe stalls (rate 0) at
 * delta ≥ flowBase / flowSlopeStep (7 with the shipped constants).
 * A stalled pipe remains laid and legal (feature 001 US1 AC-5).
 *
 * Pure, integer arithmetic, deterministic.
 */

/**
 * Slope classification for one pipe direction.
 *
 * - `'downhill'` — destination elevation < source (green).
 * - `'flat'`     — equal elevation, or destination outside the
 *                  visibility horizon (fog fallback — no slope claim).
 * - `'uphill'`   — destination elevation > source (red).
 * - `'stalled'`  — uphill with flow rate 0 under the engine formula
 *                  (hollow/outline-only triangle in the stalled color).
 */
export type PipeSlope = 'downhill' | 'flat' | 'uphill' | 'stalled';

/**
 * Console-side mirror of the engine's flow constants. Plain readonly
 * object (NOT `EngineConstants`) so no `@europa/engine` import enters
 * the console src graph. Pinned by the slope drift test.
 */
export interface PipeSlopeConstants {
    /** Base troops moved per tick on a flat pipe (engine `flowBase`). */
    readonly flowBase: number;
    /** Per-elevation-step rate change (engine `flowSlopeStep`). */
    readonly flowSlopeStep: number;
    /** Cap on the downhill bonus, in elevation steps (engine `flowSlopeDeltaCap`). */
    readonly flowSlopeDeltaCap: number;
}

/**
 * Shipped mirror values. MUST equal the three `ENGINE_CONSTANTS`
 * fields; the drift test asserts equality.
 */
export const PIPE_SLOPE_CONSTANTS: PipeSlopeConstants = {
    flowBase: 7,
    flowSlopeStep: 1,
    flowSlopeDeltaCap: 5,
};

/**
 * Troops moved per tick along one pipe for a given elevation change.
 * Mirrors `flowRateForDelta` (feature 001 FR-007) exactly.
 *
 * @param delta     `dstElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param constants The console-side constants mirror.
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function pipeFlowRate(delta: number, constants: PipeSlopeConstants): number {
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

/**
 * Classify one pipe's slope from the source and destination
 * elevations (005 FR-013).
 *
 * @param srcElev   Source cell elevation (always known — the pipe's
 *                  owner sees its own cell).
 * @param dstElev   Destination cell elevation, or `null` when the
 *                  destination is outside the visibility horizon
 *                  (fog fallback → `'flat'`, no slope claim).
 * @param constants The console-side constants mirror.
 * @returns The slope classification for rendering.
 */
export function classifyPipeSlope(
    srcElev: number,
    dstElev: number | null,
    constants: PipeSlopeConstants,
): PipeSlope {
    if (dstElev === null) {
        // Fog edge case (005 v1.2): unknown destination elevation —
        // render flat without claiming a slope.
        return 'flat';
    }
    const delta = dstElev - srcElev;
    if (delta < 0) {
        return 'downhill';
    }
    if (delta > 0) {
        // Uphill with flow rate 0 (delta ≥ flowBase / flowSlopeStep)
        // is a stalled pipe — visually distinct hollow treatment.
        return pipeFlowRate(delta, constants) === 0 ? 'stalled' : 'uphill';
    }
    return 'flat';
}