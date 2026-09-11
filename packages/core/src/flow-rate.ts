/**
 * Elevation-gradient pipe flow rate — shared foundation (equal-split model)
 *
 * The single source of the pipe-flow formula and its tunable constants.
 * Both `@europa/engine` and `@europa/terrain` import from here so the
 * formula lives in exactly one place (constitution Principle V;
 * SC-005 "every numeric rule is defined in one tunable-constants
 * location").
 *
 * Equal-split model (spec 001 Clarifications v1.9):
 *   The total outflow budget per cell per tick is the tunable constant
 *   `flowRate` (default 12). Each outgoing pipe receives an equal share:
 *     perPipe = floor(flowRate / numPipes)
 *
 *   When the source has fewer troops than `flowRate` (scarcity), troops
 *   are split equally across pipes:
 *     each pipe receives min(perPipe, available / remainingPipes)
 *   where `available = srcCount − reserveFloor` and `remainingPipes`
 *   decreases after each pipe is processed.
 *
 *   The elevation gradient modifies each pipe's share individually:
 *     delta < 0 (downhill): perPipe + flowDownhillStep × min(|delta|, flowSlopeDeltaCap)
 *     delta = 0 (flat):     perPipe
 *     delta > 0 (uphill):   max(0, perPipe − flowUphillStep × |delta|)
 *
 *   Pipes stall (return 0) when the formula produces 0; the stall
 *   threshold is `perPipe / flowUphillStep` (varies by pipe count).
 *   A stalled pipe remains laid and legal (US1 AC-5).
 *
 * Pure integer arithmetic, deterministic (FR-017).
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
    /**
     * Total outflow budget per cell per tick, split equally among
     * outgoing pipes (FR-007, Clarifications v1.9). Default 12.
     */
    readonly flowRate: number;
    /** Per-unit downhill bonus multiplier. */
    readonly flowDownhillStep: number;
    /** Per-unit uphill penalty multiplier. */
    readonly flowUphillStep: number;
    /** Caps the downhill bonus, in elevation steps (FR-007). */
    readonly flowSlopeDeltaCap: number;
}

/**
 * Full set of engine tunable constants. Extends `FlowConstants` with
 * engine-specific fields (production, capacity, decay, combat, fog).
 *
 * Defined here in `@europa/core` to break the engine ↔ terrain
 * devDependency cycle (issue #96): terrain's integration tests need
 * `ENGINE_CONSTANTS` to compute flow viability, but importing from
 * `@europa/engine` creates a cyclic workspace dependency.
 *
 * `@europa/engine` re-exports this type and its value from its own
 * barrel, so downstream consumers continue importing from
 * `@europa/engine` as before.
 */
export interface EngineConstants extends FlowConstants {
    /** Troops produced per city per tick (FR-004). */
    readonly productionRate: number;
    /** Saturation capacity per city (FR-004). */
    readonly cityCapacity: number;
    /** Saturation capacity per non-city cell (FR-011). */
    readonly cellCapacity: number;
    /** Troops lost per tick when a cell is unfed (FR-009). */
    readonly decayPerTick: number;
    /** Troops spent per trooper landed via paratroop (FR-013). */
    readonly paratroopCost: number;
    /** Troops spent per gun shot (FR-014). */
    readonly gunCost: number;
    /** Troops lost per gun hit (FR-014). */
    readonly gunDamage: number;
    /** Sensor radius default (consumed by feature 002). */
    readonly visibilityRadiusDefault: number;
}

/**
 * Shipped game-rule values for pipe flow. The engine's full
 * `ENGINE_CONSTANTS` object structurally satisfies `FlowConstants`
 * (same field names, same types), so callers can pass either.
 */
export const DEFAULT_FLOW_CONSTANTS: FlowConstants = {
    flowRate: 12,
    flowDownhillStep: 1,
    flowUphillStep: 1,
    flowSlopeDeltaCap: 5,
} as const;

/**
 * Engine rule constants. The single source of truth for every numeric
 * rule in the engine (constitution Principle V; SC-005).
 *
 * Defined here in `@europa/core` to break the engine ↔ terrain
 * devDependency cycle (issue #96). `@europa/engine` re-exports this
 * value from its own barrel.
 *
 * If you find yourself wanting to add a `const FOO = 7` to a
 * resolution rule — stop. Add it here instead. Downstream consumers
 * (the server's matchmaker, scenario-test scripts, future balance
 * mod support) all import this one object.
 */
export const ENGINE_CONSTANTS: EngineConstants = {
    // FR-004: each owned city adds `productionRate` troops per tick until
    // the city cell is saturated at `cityCapacity`.
    productionRate: 1,
    cityCapacity: 30,
    // FR-011: non-city cells cap at `cellCapacity` (saturation cap on
    // flow / combat accumulations). v1 sets this equal to cityCapacity.
    cellCapacity: 30,
    // FR-009: troops lost per tick when a cell is unfed (no friendly
    // inflow AND no city source).
    decayPerTick: 1,
    // FR-007: elevation-gradient pipe flow (equal-split model, v1.9).
    // `flowRate` is the total outflow budget per cell per tick, split
    // equally among outgoing pipes. Elevation gradient modifies each
    // pipe's share individually.
    flowRate: 12,
    flowDownhillStep: 1,
    flowUphillStep: 1,
    flowSlopeDeltaCap: 5,
    // FR-013: paratroop cost is `2 × N` at the source, `N` lands at the
    // target. We model the per-trooper cost; the `2×` ratio is the
    // resolution rule (multiply by 2 at use-site).
    paratroopCost: 10,
    // FR-014: gun cost (per shot) and damage (per hit). Costs come off
    // the source; damage comes off target occupants regardless of owner.
    gunCost: 5,
    gunDamage: 2,
    // Consumed by feature 002 (fog). Chebyshev radius in cells.
    visibilityRadiusDefault: 4,
} as const;

// ---------------------------------------------------------------------------
// Formula
// ---------------------------------------------------------------------------

/**
 * Elevation-modified per-pipe flow rate.
 *
 * Applies the elevation gradient to a base per-pipe share and returns
 * the effective troops moved per tick along one pipe.
 *
 * @param delta    `dstElev − srcElev` (negative = downhill,
 *                 zero = flat, positive = uphill).
 * @param perPipe  Equal-share amount before elevation adjustment.
 * @param constants Flow-rule constants (defaults to `DEFAULT_FLOW_CONSTANTS`
 *                  when omitted).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function flowRateForDelta(
    delta: number,
    perPipe: number,
    constants: FlowConstants = DEFAULT_FLOW_CONSTANTS,
): number {
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
