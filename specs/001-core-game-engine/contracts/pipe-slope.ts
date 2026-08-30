/**
 * Informational mirror — console pipe-slope classification (spec 005 FR-013)
 *
 * The console's `src/render/pipe-slope.ts` module: a src-boundary-safe
 * mirror of the engine's flow constants + formula plus the slope
 * classification the renderer consumes. The console `src/` graph may
 * not runtime-import `@europa/engine` (features 001/004 boundary
 * rule), so the mirror is the console's own module; a drift test in
 * `tests/` pins it against `ENGINE_CONSTANTS` / `flowRateForDelta`.
 *
 * This file is informational — the real implementation lives in the
 * console package. Drift between this mirror and the shipped module
 * is a bug.
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
    readonly flowBase: number;
    readonly flowSlopeStep: number;
    readonly flowSlopeDeltaCap: number;
}

/**
 * Console-side mirror of the engine's flow formula (spec 001 FR-007).
 * Must agree with `flowRateForDelta` for every delta (drift-pinned).
 */
export declare function pipeFlowRate(delta: number, constants: PipeSlopeConstants): number;

/**
 * Classify one pipe's slope from the source and destination
 * elevations.
 *
 * @param srcElev   Source cell elevation (always known — the pipe's
 *                  owner sees its own cell).
 * @param dstElev   Destination cell elevation, or `null` when the
 *                  destination is outside the visibility horizon
 *                  (fog fallback → `'flat'`, no slope claim).
 * @param constants The console-side constants mirror.
 * @returns The slope classification for rendering.
 */
export declare function classifyPipeSlope(
    srcElev: number,
    dstElev: number | null,
    constants: PipeSlopeConstants,
): PipeSlope;

/**
 * Shipped mirror values (must equal the three `ENGINE_CONSTANTS`
 * fields; drift test asserts equality).
 */
export declare const PIPE_SLOPE_CONSTANTS: PipeSlopeConstants;