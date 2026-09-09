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
 * Equal-split formula (spec 001 Clarifications v1.9):
 *   The total outflow budget per cell per tick is the tunable constant
 *   `flowRate` (default 12). Each outgoing pipe receives an equal share:
 *     perPipe = floor(flowRate / numPipes)
 *
 *   The elevation gradient modifies each pipe's share individually:
 *     delta < 0 (downhill): perPipe + flowDownhillStep × min(|delta|, flowSlopeDeltaCap)
 *     delta = 0 (flat):     perPipe
 *     delta > 0 (uphill):   max(0, perPipe − flowUphillStep × |delta|)
 *
 *   Pipes stall (return 0) when the formula produces 0; the stall
 *   threshold is `perPipe / flowUphillStep` (varies by pipe count).
 *   A stalled pipe remains laid and legal (feature 001 US1 AC-5).
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
    /** Total outflow budget per cell per tick, split equally among outgoing pipes (engine `flowRate`). */
    readonly flowRate: number;
    /** Per-unit downhill bonus multiplier (engine `flowDownhillStep`). */
    readonly flowDownhillStep: number;
    /** Per-unit uphill penalty multiplier (engine `flowUphillStep`). */
    readonly flowUphillStep: number;
    /** Cap on the downhill bonus, in elevation steps (engine `flowSlopeDeltaCap`). */
    readonly flowSlopeDeltaCap: number;
}

/**
 * Shipped mirror values. MUST equal the engine's `FlowConstants`
 * fields; the drift test asserts equality.
 */
export const PIPE_SLOPE_CONSTANTS: PipeSlopeConstants = {
    flowRate: 12,
    flowDownhillStep: 1,
    flowUphillStep: 1,
    flowSlopeDeltaCap: 5,
};

/**
 * Troops moved per tick along one pipe for a given elevation change.
 * Mirrors `flowRateForDelta` (feature 001 FR-007, Clarifications v1.9) exactly.
 *
 * @param delta     `dstElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param perPipe   Equal-share amount before elevation adjustment.
 * @param constants The console-side constants mirror.
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function pipeFlowRate(delta: number, perPipe: number, constants: PipeSlopeConstants): number {
    const { flowDownhillStep, flowUphillStep, flowSlopeDeltaCap } = constants;
    if (delta < 0) {
        // Downhill: bonus scales with the drop, capped at flowSlopeDeltaCap.
        return perPipe + flowDownhillStep * Math.min(-delta, flowSlopeDeltaCap);
    }
    if (delta > 0) {
        // Uphill: penalty scales with the climb; stall at 0.
        return Math.max(0, perPipe - flowUphillStep * delta);
    }
    return perPipe;
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
export function classifyPipeSlope(srcElev: number, dstElev: number | null, constants: PipeSlopeConstants): PipeSlope {
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
        // Uphill with flow rate 0 is a stalled pipe — visually
        // distinct hollow treatment.  For single-pipe classification
        // perPipe = flowRate, so stall at delta ≥ flowRate.
        return pipeFlowRate(delta, constants.flowRate, constants) === 0 ? 'stalled' : 'uphill';
    }
    return 'flat';
}

/**
 * Compute normalized intensity (0–1) for a pipe direction (issue #43).
 *
 * Intensity encodes how steep the elevation gradient is, scaled to
 * the maximum meaningful delta for each slope class:
 *   - Downhill: |Δ| / flowSlopeDeltaCap (capped at 1).
 *   - Uphill:   Δ / flowRate (capped at 1).
 *   - Flat/stalled/fog: 0 (no visual intensity — flat pipes have
 *     no gradient signal; stalled pipes use the hollow treatment
 *     as their signal instead).
 *
 * @param srcElev   Source cell elevation.
 * @param dstElev   Destination cell elevation, or `null` when outside
 *                  the visibility horizon (fog fallback → 0).
 * @param slope     Pre-classified slope (avoids re-classification).
 * @param constants The console-side constants mirror.
 * @returns Normalized intensity in [0, 1].
 */
export function pipeIntensity(
    srcElev: number,
    dstElev: number | null,
    slope: PipeSlope,
    constants: PipeSlopeConstants,
): number {
    if (slope === 'flat' || slope === 'stalled' || dstElev === null) {
        return 0;
    }
    const delta = dstElev - srcElev;
    if (slope === 'downhill') {
        // |Δ| normalized by the downhill cap; saturates at 1.
        return Math.min(Math.abs(delta), constants.flowSlopeDeltaCap) / constants.flowSlopeDeltaCap;
    }
    // slope === 'uphill': Δ normalized by flowRate; saturates at 1.
    return Math.min(delta, constants.flowRate) / constants.flowRate;
}
