/**
 * Elevation-gradient pipe flow rate — shared foundation
 *
 * The single source of the pipe-flow formula and its tunable constants.
 * Both `@europa/engine` and `@europa/terrain` import from here so the
 * formula lives in exactly one place (constitution Principle V;
 * SC-005 "every numeric rule is defined in one tunable-constants
 * location").
 *
 * Formula (spec 024 v1.3 FR-051 — separate uphill/downhill slopes):
 *   delta < 0 (downhill): flowBase + flowDownhillStep × min(|delta|, flowSlopeDeltaCap)
 *   delta = 0 (flat):     flowBase
 *   delta > 0 (uphill):   ceil(flowBase × (flowUphillCap − delta) / flowUphillCap)
 *
 * The cap bounds the DOWNHILL bonus; the uphill handicap scales linearly
 * from flowBase (at delta=1) to 0 (at delta=flowUphillCap). Pipes stall
 * (return 0) at delta ≥ flowUphillCap (80 with the shipped constants),
 * aligning with the biome zone flow-viability rules (spec 024 FR-050).
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
    /** Per-unit downhill bonus multiplier (replaces `flowSlopeStep`). */
    readonly flowDownhillStep: number;
    /** Per-unit uphill penalty multiplier (replaces `flowSlopeStep`). */
    readonly flowUphillStep: number;
    /** Caps the downhill bonus, in elevation steps (FR-007). */
    readonly flowSlopeDeltaCap: number;
    /** Maximum flowable uphill delta; pipes stall at delta ≥ this value (spec 024 FR-051). */
    readonly flowUphillCap: number;
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
    flowBase: 7,
    flowDownhillStep: 1,
    flowUphillStep: 1,
    flowSlopeDeltaCap: 5,
    flowUphillCap: 80,
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
    // FR-007: elevation-gradient pipe flow.
    flowBase: 7,
    flowDownhillStep: 1,
    flowUphillStep: 1,
    flowSlopeDeltaCap: 5,
    flowUphillCap: 80,
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
 * Troops moved per tick along one pipe for a given elevation change.
 *
 * @param delta     `dstElev − srcElev` (negative = downhill,
 *                  zero = flat, positive = uphill).
 * @param constants Flow-rule constants (defaults to `DEFAULT_FLOW_CONSTANTS`
 *                  when omitted).
 * @returns Troops moved per tick along the pipe (≥ 0; 0 = stall).
 */
export function flowRateForDelta(delta: number, constants: FlowConstants = DEFAULT_FLOW_CONSTANTS): number {
    const { flowBase, flowDownhillStep, flowSlopeDeltaCap, flowUphillCap } = constants;
    if (delta < 0) {
        // Downhill: bonus scales with the drop, capped at flowSlopeDeltaCap.
        return flowBase + flowDownhillStep * Math.min(-delta, flowSlopeDeltaCap);
    }
    if (delta > 0) {
        // Uphill: linear scale from flowBase to 0 over [1, flowUphillCap].
        // Pipes stall (return 0) at delta ≥ flowUphillCap.
        if (delta >= flowUphillCap) {
            return 0;
        }
        return Math.ceil((flowBase * (flowUphillCap - delta)) / flowUphillCap);
    }
    return flowBase;
}
