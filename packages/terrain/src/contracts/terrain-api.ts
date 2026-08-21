/**
 * LOCAL COPY — Terrain Public API (Feature 003)
 *
 * Source of truth:
 *   `.specify/features/003-procedural-terrain-generation/contracts/terrain-api.ts`
 *
 * This file is a verbatim copy of the spec contract, mirrored at
 * `packages/terrain/src/contracts/terrain-api.ts` so the TypeScript
 * compiler can resolve imports inside the package's `rootDir: "./src"`
 * boundary. Drift between this local copy and the spec is a bug; copy
 * the authoritative file to the other side in the same change set.
 * The spec wins.
 *
 * Per AGENTS.md and the Wave 2B-2 PM handoff, this local-copy pattern
 * is the chosen mitigation for `tsc rootDir` violations when the source
 * package needs to import from the spec contracts. Same pattern is
 * used by `@europa/engine`.
 *
 * The full surface other packages depend on. Everything here is a pure
 * function with no I/O, no wall-clock reads, no unseeded randomness.
 * The only source of randomness is the `Rng` instance passed in.
 *
 * Consumers:
 *   - 006 (matchmaking)    → calls `generateBoard`.
 *   - 001 (engine)         → receives the `Board` produced by `generateBoard`.
 *   - tests                → call `validateBoard` directly to test invariants.
 *
 * See `research.md` for the algorithm rationale and `data-model.md` for
 * the field-level contracts.
 *
 * =============================================================================
 * PROPOSED ADDITIVE CHANGES TO FEATURE 001
 * =============================================================================
 *
 * The current `engine-to-terrain.ts` (already committed) declares
 * `generateBoard(req: TerrainGenerationRequest): TerrainGenerationResult`
 * with no PRNG parameter. The prompt explicitly mandates: "engine
 * passes the same PRNG instance used to start the match — do not
 * introduce a separate PRNG." This requires two additive changes to
 * the engine ↔ terrain contract:
 *
 *   #1. Add `rng: Rng` to `TerrainGenerationRequest`.
 *       Rationale: terrain needs to advance the engine's sfc32 to
 *       produce deterministic maps. The engine currently constructs
 *       and owns the sfc32 instance (feature 001 research.md §5); if
 *       terrain constructs its own, the "same PRNG" mandate is
 *       violated. The engine must therefore pass its instance in.
 *       The engine also needs to expose the sfc32 type (currently
 *       only its state is exposed as `Uint32Array` in
 *       `engine-types.ts:158`).
 *
 *   #2. Replace `options?: Readonly<Record<string, never>>` (the
 *       "v1: no options" placeholder) with `settings:
 *       GenerationSettings` (required, see `terrain-types.ts`).
 *       Rationale: spec FR-008 mandates configurable water density,
 *       roughness, and city count. The placeholder type cannot
 *       express this. The new `GenerationSettings` is a discriminated
 *       closed type, so the change is type-safe.
 *
 * The `MatchConfig` type in `engine-types.ts` is **NOT** proposed to
 * change. Terrain balance knobs are terrain-internal, not engine
 * concerns. They belong on `TerrainGenerationRequest`, not on
 * `MatchConfig`.
 *
 * If the PM accepts changes #1 and #2, the engine plan should be
 * amended in the same change set (constitution Principle IV: stale
 * specs are bugs). The new shape of `engine-to-terrain.ts` would be
 * verbatim this file's `generateBoard` signature.
 *
 * Until amended, the implementer can satisfy the prompt's intent by
 * having the engine-side caller construct the sfc32 and call
 * `generateBoard({ ..., rng, settings })` directly. The typescript
 * types would diverge from `engine-to-terrain.ts` until the PM
 * mediates, but the runtime behavior would be correct.
 * =============================================================================
 */

import type {
  Board,
  Coord,
  PlayerId,
} from '@europa/engine';

import type {
  GenerationSettings,
  MapSeed,
  Rng,
  TerrainGenerationRequest,
  TerrainGenerationResult,
  ValidationReport,
} from './terrain-types';

// ----------------------------------------------------------------------------
// World lifecycle
// ----------------------------------------------------------------------------

/**
 * Generate a `Board` for a new match. Pure (modulo PRNG state advance).
 *
 * Algorithm (see `research.md` §1):
 *   1. Seed-derive: split `req.rng` into noise / water / cities sub-streams.
 *   2. Build elevation map via fBm value noise (FR-002).
 *   3. Enforce 180° point symmetry (FR-004, US1 AC-1).
 *   4. Threshold-flood the lowest basins into water (FR-003, US3 AC-1).
 *   5. Place cities per player in spawn bands, mirrored (FR-005, US1 AC-2).
 *   6. Validate all 15 invariants (FR-007); retry up to
 *      `req.settings.maxRegenAttempts` with derived seeds on failure.
 *   7. Return the validated `Board` + the effective seed.
 *
 * Determinism: identical `(req, rng-state)` → byte-identical output.
 * Verified by `tests/determinism.test.ts` (1000 trials per SC-001).
 *
 * @param req The generation request. `req.rng` MUST be the engine's live
 *            sfc32 instance; the engine will keep using it after this
 *            function returns. `req.settings` MUST be a complete
 *            `GenerationSettings` (use `DEFAULT_GENERATION_SETTINGS`
 *            from `terrain-types.ts` if no overrides).
 * @returns The generated `Board` and supporting metadata.
 * @throws `GenerationError` when retries are exhausted or the request
 *         is invalid (e.g., unknown `symmetryStrategy`, `boardSize < 8`).
 */
export declare function generateBoard(
  req: Readonly<TerrainGenerationRequest>,
): TerrainGenerationResult;

// ----------------------------------------------------------------------------
// Validation helpers (testable, optional for production callers)
// ----------------------------------------------------------------------------

/**
 * Validate a `Board` against the 15 invariants enumerated in
 * `data-model.md` §11. Does not modify the input. Pure.
 *
 * Exposed primarily for tests, but feature 006 may use it to
 * pre-validate a Board it has loaded from storage (e.g., a replay).
 *
 * @param board The Board to validate. Must be a fully-formed
 *              `Board` (not partial).
 * @returns A `ValidationReport` with the boolean result, any
 *          violations, and statistics about the map.
 */
export declare function validateBoard(
  board: Readonly<Board>,
  settings: Readonly<GenerationSettings>,
  playerCount: 2 | 3 | 4,
): ValidationReport;

/**
 * Compute a stable hash of a `Board`'s static parts (cells, cities).
 * Used by `tests/determinism.test.ts` to compare two generated boards
 * for byte-identity.
 *
 * Pure, integer-only, returns a 16-char hex string (FNV-1a-style
 * over the byte representation).
 */
export declare function hashBoard(board: Readonly<Board>): string;

// ----------------------------------------------------------------------------
// Internal helpers exposed for testability
// ----------------------------------------------------------------------------
//
// These are NOT part of the stable public API. They are exported only
// so the unit tests can exercise individual pipeline phases in
// isolation. Feature 006 must NOT call these; it should only call
// `generateBoard`.
// ----------------------------------------------------------------------------

/**
 * @internal
 * Generate a single elevation map (no symmetry, no water, no cities).
 * Used by `generateBoard` and by `unit/noise.test.ts`.
 */
export declare function _generateElevationMap(
  rng: Rng,
  width: number,
  height: number,
  settings: Readonly<GenerationSettings>,
): Uint8Array;

/**
 * @internal
 * Enforce 180° point symmetry on a `Uint8Array` elevation map in place.
 * Returns the same array for chaining.
 */
export declare function _enforcePointSymmetry(elev: Uint8Array, width: number): Uint8Array;

/**
 * @internal
 * Classify cells as water or land by threshold-flooding the lowest
 * basins. Returns a parallel `Uint8Array` of the same shape where
 * `1` = water, `0` = land.
 */
export declare function _extractWater(
  elev: Uint8Array,
  width: number,
  height: number,
  waterRatio: number,
): Uint8Array;

/**
 * @internal
 * Place cities per player in spawn bands, mirrored. Returns a flat
 * array of `{ cell, owner }` suitable for `Board.cities`.
 */
export declare function _placeCities(args: {
  readonly elev: Uint8Array;
  readonly water: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly playerCount: 2 | 3 | 4;
  readonly settings: Readonly<GenerationSettings>;
  readonly rng: Rng;
}): ReadonlyArray<{ readonly cell: Coord; readonly owner: PlayerId }>;

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/**
 * All tunable constants for terrain generation. Mirrors the engine's
 * `ENGINE_CONSTANTS` discipline (feature 001 research.md §9). Stored
 * in `packages/terrain/src/constants.ts` and re-exported here.
 */
export interface TerrainConstants {
  /** Default elevation value range. */
  readonly minElevation: 0;
  readonly maxElevation: 255;
  /** Default settings. Mirrors `DEFAULT_GENERATION_SETTINGS`. */
  readonly defaultSettings: GenerationSettings;
  /** Minimum supported board size. Below this, playability breaks. */
  readonly minBoardSize: 8;
  /** Maximum supported board size (test ceiling). */
  readonly maxBoardSize: 128;
}

export declare const TERRAIN_CONSTANTS: TerrainConstants;

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * The current terrain API version. Re-exported from `terrain-types.ts`.
 * Consumers can `import { TERRAIN_API_VERSION } from '@europa/terrain'`
 * to pin-check at startup.
 */
export declare const TERRAIN_API_VERSION: typeof import('./terrain-types').TERRAIN_API_VERSION;
