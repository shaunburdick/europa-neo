/**
 * Engine Tunable Constants — Feature 001
 *
 * The single source of truth for every numeric rule in the engine
 * (constitution Principle V; spec SC-005 "every numeric rule is defined
 * in one tunable-constants location").
 *
 * The `EngineConstants` type and `ENGINE_CONSTANTS` value now live in
 * `@europa/core` (issue #96) to break the engine ↔ terrain devDependency
 * cycle. This file re-exports them for backward compatibility — all
 * engine-internal imports continue to work unchanged.
 *
 * If you find yourself wanting to add a `const FOO = 7` to a
 * resolution rule — stop. Add it to `@europa/core`'s `ENGINE_CONSTANTS`
 * instead. Downstream consumers (the server's matchmaker, scenario-test
 * scripts, future balance mod support) all import this one object.
 */

export type { EngineConstants } from '@europa/core';

/**
 * Engine rule constants. Imported by every resolution rule module.
 * Re-exported from `@europa/core` (issue #96). See core's
 * `flow-rate.ts` for the type contract and JSDoc per field.
 */
export { ENGINE_CONSTANTS } from '@europa/core';

/**
 * Default wall-clock tick interval. The engine itself is wall-clock-free
 * (research.md §8; spec FR-017). The server's `Scheduler` (feature 006)
 * drives `tick()` at this cadence. v1 ships 4 Hz, matching the original
 * Europa game's pace.
 */
export const DEFAULT_TICK_INTERVAL_MS = 250;
