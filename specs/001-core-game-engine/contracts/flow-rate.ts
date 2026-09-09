/**
 * Informational mirror — `flowRateForDelta` (spec 001 FR-007, Clarifications v1.9)
 *
 * The single source of the elevation-gradient flow formula, exported
 * additively from `@europa/core`. Consumed by:
 *   - `packages/engine/src/resolution/flow.ts` (the tick's flow phase)
 *   - the terrain reachable-land suite (spec 003 US4 AC-1 reads the
 *     stall threshold from `ENGINE_CONSTANTS` via this function)
 *   - the console slope drift test (spec 005 FR-013 pins the console
 *     mirror against it)
 *
 * This file is informational — the real implementation lives in the
 * core package. Drift between this mirror and the shipped function
 * is a bug.
 *
 * Equal-split model (spec 001 Clarifications v1.9):
 *   The total outflow budget per cell per tick is the tunable constant
 *   `flowRate` (default 12). Each outgoing pipe receives an equal share:
 *     perPipe = floor(flowRate / numPipes)
 *   The elevation gradient modifies each pipe's share individually via
 *   `flowRateForDelta(delta, perPipe, constants)`.
 */

/**
 * Shipped constant values for pipe flow (spec 001 Clarifications v1.9).
 * `flowRate` is the total outflow budget per cell per tick, split
 * equally among outgoing pipes. Elevation gradient modifies each
 * pipe's share individually.
 */
export declare const FLOW_CONSTANTS: {
    readonly flowRate: 12;
    readonly flowDownhillStep: 1;
    readonly flowUphillStep: 1;
    readonly flowSlopeDeltaCap: 5;
};

/**
 * Elevation-modified per-pipe flow rate.
 *
 * Applies the elevation gradient to a base per-pipe share and returns
 * the effective troops moved per tick along one pipe.
 *
 * @param delta     `destElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param perPipe   Equal-share amount before elevation adjustment
 *                  (floor(flowRate / numPipes), adjusted for scarcity).
 * @param constants Engine rule constants (`flowRate`,
 *                  `flowDownhillStep`, `flowUphillStep`,
 *                  `flowSlopeDeltaCap`).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export declare function flowRateForDelta(
    delta: number,
    perPipe: number,
    constants: {
        readonly flowRate: number;
        readonly flowDownhillStep: number;
        readonly flowUphillStep: number;
        readonly flowSlopeDeltaCap: number;
    },
): number;
