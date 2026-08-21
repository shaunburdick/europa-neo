/**
 * Engine Tunable Constants — Feature 001
 *
 * The single source of truth for every numeric rule in the engine
 * (constitution Principle V; spec SC-005 "every numeric rule is defined
 * in one tunable-constants location").
 *
 * If you find yourself wanting to add a `const FOO = 7` to a resolution
 * rule — stop. Add it here instead. Downstream consumers (the server's
 * matchmaker, scenario-test scripts, future balance mod support) all
 * import this one object.
 *
 * Values are sourced from:
 *   - spec.md functional requirements (FR-004, FR-007, FR-009, FR-011,
 *     FR-012, FR-013, FR-014) — cited inline below
 *   - data-model.md (city / cell capacity, decay, reserves step)
 *   - research.md §8 (tick rate)
 *
 * All values are integers in JS `number` (safe up to 2^53; we never
 * approach that on a 32×32 board — see `research.md` §6).
 */

import type { EngineConstants } from './contracts/engine-api';

/**
 * Engine rule constants. Imported by every resolution rule module.
 * See `contracts/engine-api.ts` `EngineConstants` for the type contract
 * and JSDoc per field.
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
  // FR-007: slope-modified pipe flow. Multipliers applied to the base
  // flow count per tick. The product `flowBase * <factor>` is the
  // troops moved along that pipe per tick. v1: downhill = base, flat
  // = base, uphill = 0 (so gravity drives flow, flat still flows).
  // flowBase = 1 so pipe flow is functional out-of-the-box (Wave 2B-2
  // bumped from 0; Q-003 slope-flow test was the only path that
  // exercised non-zero destination counts with a synthetic base).
  flowDownhillFactor: 1,
  flowUphillFactor: 0,
  flowBase: 1,
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
};

/**
 * Default wall-clock tick interval. The engine itself is wall-clock-free
 * (research.md §8; spec FR-017). The server's `Scheduler` (feature 006)
 * drives `tick()` at this cadence. v1 ships 4 Hz, matching the original
 * Europa game's pace.
 */
export const DEFAULT_TICK_INTERVAL_MS = 250;
