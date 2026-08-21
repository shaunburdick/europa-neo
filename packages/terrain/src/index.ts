/**
 * Public surface of the `@europa/terrain` package.
 *
 * This barrel re-exports the package's type contract, tunable
 * constants, the deterministic RNG adapter, the typed `GenerationError`,
 * and the foundational symmetry/settings helpers used by every
 * algorithm phase. The Phase 3+ algorithm functions (`generateBoard`,
 * `validateBoard`, `hashBoard`, `assertBoardMatchesConfig`) are
 * **forward-declared** here so consumers can import them by name, but
 * their implementations land in the `value-noise.ts`, `fbm.ts`,
 * `elevation.ts`, `water.ts`, `board.ts`, `validate.ts`, and
 * `generate.ts` modules (US1 / T026+ in the task list). Each forward
 * declaration throws a clear "not yet implemented" error so accidental
 * use in the meantime fails loudly instead of silently returning
 * garbage.
 *
 * The barrel is the only file a downstream package (feature 006
 * matchmaking) ever imports — the implementation details (which
 * `.ts` file each function lives in) are private to the terrain
 * package.
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule). The conceptual grouping lives in
 * the JSDoc above and in the source-of-truth contracts at
 * `src/contracts/`.
 */

import type { Board, Coord, MatchConfig, PlayerId } from '@europa/engine';

import type {
  GenerationSettings,
  Rng,
  TerrainGenerationRequest,
  TerrainGenerationResult,
  ValidationReport,
} from './contracts/terrain-types';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
//
// Re-exports of every public type from the local contract copies
// (`src/contracts/terrain-types.ts`, `src/contracts/terrain-api.ts`).
// The types are alphabetical; see the contracts for grouped
// documentation and FR references. Engine types (Board, Cell, etc.)
// are re-exported via `src/types.ts`.

export type {
  Board,
  Cell,
  CityPlacement,
  Coord,
  GenerationSettings,
  MapSeed,
  MapStats,
  PlayerId,
  Rng,
  SymmetryStrategy,
  TerrainConstants,
  TerrainGenerationRequest,
  TerrainGenerationResult,
  ValidationReport,
  Violation,
} from './types';

// ----------------------------------------------------------------------------
// Constants + version (single source of truth: src/constants.ts)
// ----------------------------------------------------------------------------

export {
  DEFAULT_GENERATION_SETTINGS,
  TERRAIN_API_VERSION,
  TERRAIN_CONSTANTS,
} from './constants';

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export { GenerationError } from './errors';

// ----------------------------------------------------------------------------
// RNG adapter (engine-PRNG passthrough — no separate PRNG instance)
// ----------------------------------------------------------------------------

export { deriveSubstream, mixSeed } from './rng-adapter';

// ----------------------------------------------------------------------------
// Settings helpers (resolve + validate shape; clamping lives in clamp.ts,
// US3 / T045)
// ----------------------------------------------------------------------------

export { resolveSettings, validateSettings } from './settings';

// ----------------------------------------------------------------------------
// Symmetry helpers
// ----------------------------------------------------------------------------

export { rotate180, rotate180Index } from './symmetry';

// ----------------------------------------------------------------------------
// Phase 3 algorithm functions (forward declarations; US1 implementation
// lands in T026–T032 of `.specify/features/003-procedural-terrain-generation/tasks.md`).
// ----------------------------------------------------------------------------
//
// Each declared function throws a clear "not yet implemented" error if
// invoked before its implementation lands. This is intentional: a
// missing implementation should fail loudly (caught by callers), not
// silently return undefined / a wrong shape.

/**
 * Phase 3 will implement: generate a deterministic, point-symmetric,
 * validated `Board` for a match.
 *
 * Algorithm (see plan.md §"Generation pipeline"):
 *   1. Seed-derive substreams from `req.rng`.
 *   2. Build elevation via fBm value noise.
 *   3. Enforce 180° point symmetry.
 *   4. Threshold-flood water pools.
 *   5. Place cities per player in spawn bands.
 *   6. Validate; retry on failure (bounded by
 *      `req.settings.maxRegenAttempts`).
 *   7. Return `{ board, effectiveSeed, startingCitiesByPlayer }`.
 *
 * @throws `GenerationError` when retries are exhausted or the request is invalid.
 */
export function generateBoard(_req: Readonly<TerrainGenerationRequest>): TerrainGenerationResult {
  throw phase3NotImplemented('generateBoard');
}

/**
 * Phase 3 will implement: assert that a `Board` matches the engine's
 * `MatchConfig`. Used by the engine as a defensive layer in
 * `createWorld` (see `engine-to-terrain.ts`).
 *
 * Throws on mismatch (square shape, boardSize match, city-on-land,
 * etc.). For US1 the city-on-land check is a no-op since US1 produces
 * `cities: []`.
 */
export function assertBoardMatchesConfig(
  _board: Readonly<Board>,
  _config: Readonly<MatchConfig>,
): void {
  throw phase3NotImplemented('assertBoardMatchesConfig');
}

/**
 * Phase 3 will implement: validate a `Board` against all 15 invariants
 * enumerated in `data-model.md` §11. Returns a `ValidationReport` with
 * the boolean result, any violations, and statistics about the map.
 *
 * Pure. Used by `generateBoard` internally (on each retry attempt)
 * and exposed for tests + feature 006 to pre-check loaded Boards.
 */
export function validateBoard(
  _board: Readonly<Board>,
  _settings: Readonly<GenerationSettings>,
  _playerCount: 2 | 3 | 4,
): ValidationReport {
  throw phase3NotImplemented('validateBoard');
}

/**
 * Phase 3 will implement: compute a stable hash of a `Board`'s static
 * parts (cells, cities). Used by `tests/determinism.test.ts` to
 * compare two generated Boards for byte-identity.
 *
 * Pure, integer-only, returns a 16-char hex string (FNV-1a-style
 * over the byte representation).
 */
export function hashBoard(_board: Readonly<Board>): string {
  throw phase3NotImplemented('hashBoard');
}

// ----------------------------------------------------------------------------
// Internal helpers (forward declarations; for testability per
// `contracts/terrain-api.ts`)
// ----------------------------------------------------------------------------

/**
 * @internal Phase 3 will implement: build a single elevation map (no
 * symmetry, no water, no cities). Used by `generateBoard` and by
 * `tests/unit/elevation.test.ts`.
 */
export function _generateElevationMap(
  _rng: Rng,
  _width: number,
  _height: number,
  _settings: Readonly<GenerationSettings>,
): Uint8Array {
  throw phase3NotImplemented('_generateElevationMap');
}

/**
 * @internal Phase 3 will implement: enforce 180° point symmetry on a
 * `Uint8Array` elevation map in place. Returns the same array for
 * chaining.
 */
export function _enforcePointSymmetry(_elev: Uint8Array, _width: number): Uint8Array {
  throw phase3NotImplemented('_enforcePointSymmetry');
}

/**
 * @internal Phase 3 will implement: classify cells as water or land by
 * threshold-flooding the lowest basins. Returns a parallel
 * `Uint8Array` of the same shape where `1` = water, `0` = land.
 */
export function _extractWater(
  _elev: Uint8Array,
  _width: number,
  _height: number,
  _waterRatio: number,
): Uint8Array {
  throw phase3NotImplemented('_extractWater');
}

/**
 * @internal Phase 3 will implement: place cities per player in spawn
 * bands, mirrored. Returns a flat array of `{ cell, owner }` suitable
 * for `Board.cities`.
 */
export function _placeCities(_args: {
  readonly elev: Uint8Array;
  readonly water: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly playerCount: 2 | 3 | 4;
  readonly settings: Readonly<GenerationSettings>;
  readonly rng: Rng;
}): ReadonlyArray<{ readonly cell: Coord; readonly owner: PlayerId }> {
  throw phase3NotImplemented('_placeCities');
}

// ----------------------------------------------------------------------------
// "Not yet implemented" sentinel
// ----------------------------------------------------------------------------

/**
 * Sentinel error constructor used by every Phase 3 forward
 * declaration. Throws an `Error` (NOT a `GenerationError` — the call
 * is structurally valid, it just hasn't landed yet) with a clear
 * "not yet implemented" message so accidental use fails loudly.
 */
function phase3NotImplemented(fn: string): Error {
  return new Error(
    `[@europa/terrain] ${fn} is not yet implemented (Phase 3 / US1, T026-T032 of .specify/features/003-procedural-terrain-generation/tasks.md). This is a forward declaration; the implementation lands in a later wave.`,
  );
}
