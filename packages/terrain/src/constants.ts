/**
 * Terrain Tunable Constants — Feature 003
 *
 * The single source of truth for every numeric rule in the terrain
 * generator (constitution Principle V; spec SC-005 "every numeric rule
 * is defined in one tunable-constants location"). Mirrors the engine's
 * `ENGINE_CONSTANTS` discipline (feature 001 `packages/engine/src/constants.ts`).
 *
 * If you find yourself wanting to add a `const FOO = 7` to a generator
 * rule — stop. Add it here instead. Downstream consumers (feature 006
 * matchmaking, scenario-test scripts, future balance mod support) all
 * import this one object.
 *
 * Values are sourced from:
 *   - spec.md functional requirements (FR-001, FR-003, FR-005, FR-008)
 *   - data-model.md §2 (GenerationSettings field ranges)
 *   - `contracts/terrain-api.ts` `TerrainConstants` interface
 *
 * All values are integers in JS `number` (safe up to 2^53; we never
 * approach that on a 32×32 board — see engine `research.md` §6).
 */

import type { TerrainConstants } from './contracts/terrain-api';
import { DEFAULT_GENERATION_SETTINGS } from './contracts/terrain-types';

/** Minimum and maximum supported player counts. */
export const MIN_PLAYER_COUNT = 2;

/** Player count and identifier used by the three-player layout. */
export const THREE_PLAYER_COUNT = 3;
export const THIRD_PLAYER_ID = 3;

/** Player identifiers used by the four-player layout. */
export const FOUR_PLAYER_COUNT = 4;
export const FOURTH_PLAYER_ID = 4;

/** Generation and validation bounds that are part of the terrain contract. */
export const MIN_GENERATION_BOARD_SIZE = 8;
export const MAX_GENERATION_BOARD_SIZE = 128;
export const MIN_WATER_POOL_SIZE = 4;
export const WATER_RATIO_MIN = 0.02;
export const WATER_RATIO_MAX = 0.25;
export const WATER_RATIO_EPSILON = 1e-9;

/**
 * Terrain rule constants. Imported by every generator module. See
 * `contracts/terrain-api.ts` `TerrainConstants` for the type contract
 * and JSDoc per field.
 */
export const TERRAIN_CONSTANTS: TerrainConstants = {
  // FR-001: elevation stored as uint8 (`Uint8Array`).
  minElevation: 0,
  maxElevation: 255,
  // spec Assumptions / data-model.md §1: playable boards are 16..64.
  // Generation accepts `[8, 128]` per data-model §2; tests use 16 and
  // 32, default play is 32.
  minBoardSize: MIN_GENERATION_BOARD_SIZE,
  maxBoardSize: MAX_GENERATION_BOARD_SIZE,
  // Mirrors `DEFAULT_GENERATION_SETTINGS` from `contracts/terrain-types.ts`.
  // The interface uses the same reference so consumers can compare.
  defaultSettings: DEFAULT_GENERATION_SETTINGS,
};

// Re-export the terrain API version from the single source-of-truth
// location (the contract). Importing the version through the constants
// file lets consumers do `import { TERRAIN_API_VERSION } from
// '@europa/terrain'` regardless of which barrel path they hit first.
export { DEFAULT_GENERATION_SETTINGS, TERRAIN_API_VERSION } from './contracts/terrain-types';
