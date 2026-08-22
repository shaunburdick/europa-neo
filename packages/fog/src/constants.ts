/**
 * Fog Tunable Constants — Feature 002
 *
 * The single source of truth for every numeric rule in the fog
 * package (constitution Principle V; spec SC-005 "every numeric rule
 * is defined in one tunable-constants location"). Mirrors the
 * engine's `ENGINE_CONSTANTS` discipline (feature 001
 * `packages/engine/src/constants.ts`) and the terrain's
 * `TERRAIN_CONSTANTS` discipline (feature 003
 * `packages/terrain/src/constants.ts`).
 *
 * If you find yourself wanting to add a `const FOO = 7` to a fog
 * rule — stop. Add it here instead. Downstream consumers (feature
 * 004 networking, feature 005 console, scenario-test scripts,
 * future balance mod support) all import this one object.
 *
 * Values are sourced from:
 *   - spec.md functional requirements (FR-001..FR-008) — cited
 *     inline below
 *   - `contracts/fog-api.ts` `FogConstants` interface
 *
 * All values are integers in JS `number` (safe up to 2^53; we never
 * approach that on a 32×32 board — see engine `research.md` §6).
 */

import { ENGINE_CONSTANTS } from '@europa/engine';

import type { FogConstants } from './contracts/fog-api';
import { FOG_API_VERSION } from './contracts/fog-types';

/**
 * Fog rule constants. Imported by every fog module. See
 * `contracts/fog-api.ts` `FogConstants` for the type contract and
 * JSDoc per field.
 *
 * The `defaultRadiusFallback` mirrors the engine's
 * `ENGINE_CONSTANTS.visibilityRadiusDefault` (currently `4`). The
 * engine guarantees `world.config.visibilityRadius` is populated;
 * this fallback exists for test fixtures and defensive callers
 * that may not populate it.
 */
export const FOG_CONSTANTS: FogConstants = {
  // Sentinel for "cell not visible" in the FogMask (Uint8Array value).
  // Mirrors `FOG_MASK_UNKNOWN` in `contracts/fog-types.ts`.
  maskUnknown: 0,
  // Sentinel for "cell visible" in the FogMask (Uint8Array value).
  // Mirrors `FOG_MASK_VISIBLE` in `contracts/fog-types.ts`.
  maskVisible: 1,
  // Defensive fallback for `visibilityRadius` if
  // `world.config.visibilityRadius` is missing. The engine
  // guarantees this field; this is a safety net for test fixtures
  // that may not populate it. Matches the engine's
  // `ENGINE_CONSTANTS.visibilityRadiusDefault` (4 cells).
  defaultRadiusFallback: ENGINE_CONSTANTS.visibilityRadiusDefault,
  // Default sensor radius used by quickstart scenarios and tests
  // where the engine's default is not the value under test.
  // Matches the original Europa's radius (a few cells in each
  // direction). Documented in spec SC-004 / quickstart Q-F01.
  testRadius: 4,
};

// Re-export the fog API version from the single source-of-truth
// location (the contract). Importing the version through the
// constants file lets consumers do `import { FOG_API_VERSION }
// from '@europa/fog'` regardless of which barrel path they hit
// first.
export { FOG_API_VERSION };
