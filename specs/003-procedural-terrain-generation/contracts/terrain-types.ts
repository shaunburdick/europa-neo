/**
 * Terrain Package Type Contracts — Feature 003
 *
 * The public type surface of the `@europa/terrain` package. Re-exported
 * via `@europa/terrain` (packages/terrain/src/index.ts).
 *
 * Source-of-truth engine types are imported **type-only** from
 * `@europa/engine`. They are not duplicated here.
 *
 * Consumers (downstream features):
 *   - 006 (matchmaking)    → constructs `TerrainGenerationRequest`,
 *                            consumes `TerrainGenerationResult`.
 *   - 001 (engine)         → re-reads `TerrainGenerationResult.board`
 *                            and passes it to `createWorld`.
 *   - 002 (fog)            → reads `Board` cells (via engine).
 *   - 004 (networking)     → serializes `Board` over wire (via engine).
 *   - 005 (console)        → reads `Board` cells for rendering.
 *
 * Versioning: breaking changes bump `TERRAIN_API_VERSION` and update
 * downstream consumers in the same change set (constitution Principle
 * IV: specs as documentation; stale contracts are bugs).
 *
 * Rules for this file:
 *   - All types are readonly outside terrain internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Numbers that represent counts/indices/capacities are integers
 *     (see engine-types.ts and the engine's research.md §6 for rationale).
 */

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * Current terrain API version. Increment on any breaking change to the
 * public surface (types or functions in terrain-api.ts).
 *
 * Mirrors the engine's `ENGINE_API_VERSION` discipline: every consumer
 * pin-check at startup, incrementing forces a coordinated update.
 */
export const TERRAIN_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Engine types (re-exported for convenience, not re-defined)
// ----------------------------------------------------------------------------

// `import type` ensures these are erased at runtime; terrain does not
// depend on the engine's compiled code. Split into type-only imports
// (erased) and a value import for `ENGINE_API_VERSION` (needed as a
// runtime const re-exported on line 64; see the bug-fix comment below).
import type {
  Board,
  Cell,
  CityPlacement,
  Coord,
  PlayerId,
} from '@europa/engine';
import { ENGINE_API_VERSION as _ENGINE_API_VERSION_REF } from '@europa/engine';

/**
 * The engine API version terrain was built against. If the engine
 * version pin in feature 001's contracts ever drifts, this re-export
 * lets a single `import { ENGINE_API_VERSION } from '@europa/terrain'`
 * catch the drift.
 *
 * Bug-fix note (PM-mediated, terrain Phase 2 implementation surfaced
 * under `verbatimModuleSyntax: true`): `ENGINE_API_VERSION` is a
 * runtime `const` in the engine, so the original `import type { ... }`
 * stripped it at compile time, making `ENGINE_API_VERSION_REF`
 * `undefined` at runtime. Fixed by splitting into a value import.
 */
export const ENGINE_API_VERSION_REF = _ENGINE_API_VERSION_REF;

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/**
 * Symmetry strategy for the generated map. v1 only supports `'point'`
 * (180° rotational), as mandated by spec FR-004. The union is closed
 * for now but typed as a literal so a future expansion (e.g., `'mirror'`,
 * `'rotational90'`) can be added without a breaking type change.
 */
export type SymmetryStrategy = 'point';

/**
 * A uint32 seed. The type alias documents the contract; the engine's
 * `MatchConfig.seed` is the same shape. We don't brand this as a
 * nominal type because passing raw numbers between the engine and
 * terrain is part of the API surface (a brand would force ugly
 * conversion code at every call site).
 */
export type MapSeed = number;

/**
 * Engine sfc32 PRNG type. Re-exported from `@europa/engine` (the
 * canonical location) so terrain consumers can import it from either
 * package — the engine owns the PRNG, terrain consumes the engine's
 * instance (see `engine-to-terrain.ts` `TerrainGenerationRequest.rng`).
 *
 * The type lives in `engine-types.ts` so the dependency direction is
 * terrain → engine (one-way). If the engine ever changes `Rng`'s shape,
 * both packages update in the same change set.
 *
 * Bug-fix note (PM-mediated, terrain Phase 2 implementation surfaced
 * under `verbatimModuleSyntax: true`): `Rng` is used locally in
 * `TerrainGenerationRequest.rng: Rng` (line 222), so we need an
 * `import type` for local use IN ADDITION to the `export type` for
 * re-export. The original `export type { Rng } from '@europa/engine'`
 * re-exports but doesn't import for local use, breaking compilation.
 */
import type { Rng } from '@europa/engine';
export type { Rng };

// ----------------------------------------------------------------------------
// GenerationSettings (FR-008: configurable with safe clamping)
// ----------------------------------------------------------------------------

/**
 * Tunable knobs for the generator. Every field has a default and a
 * safe range; out-of-range values are **clamped** (per FR-008), not
 * rejected. The clamped values are exposed in `ValidationReport.stats`
 * so callers can see what was actually used.
 *
 * `GenerationSettings` is the *complete* shape; partial inputs are
 * merged with `DEFAULT_GENERATION_SETTINGS` before being passed to
 * `generateBoard`.
 */
export interface GenerationSettings {
  /**
   * Fraction of cells classified as water. Default 0.10 (10%).
   * Spec US3 AC-1: "water coverage ... falls within the configured
   * range (default 5–15%)". Safe range: `[0.02, 0.25]`.
   */
  readonly waterRatio: number;

  /**
   * Persistence of fBm noise. Default 0.5. Lower = smoother hills;
   * higher = more dramatic peaks/valleys. Safe range: `[0.1, 0.9]`.
   */
  readonly roughness: number;

  /**
   * Number of fBm octaves. Default 4. Safe range: `[1, 6]`. More
   * octaves = more detail at the cost of generation time.
   */
  readonly octaves: number;

  /**
   * Per-player starting city count. Default 1 (matches the original
   * Europa). Safe range: `[1, 4]`. Spec FR-005: "equal number of
   * starting cities per player at symmetric positions."
   */
  readonly citiesPerPlayer: number;

  /**
   * Symmetry strategy. v1 only supports `'point'`. Default `'point'`.
   * Field is here for forward compatibility; passing anything else
   * throws `GenerationError` at the top of `generateBoard`.
   */
  readonly symmetryStrategy: SymmetryStrategy;

  /**
   * Minimum Chebyshev distance from a city to any water cell.
   * Default 3. Safe range: `[1, 6]`. Spec FR-005: "minimum spacing
   * from water."
   */
  readonly minCityWaterDistance: number;

  /**
   * Minimum Chebyshev distance between any two cities. Default 5.
   * Safe range: `[2, 10]`. Spec FR-005: "minimum spacing ... from
   * each other."
   */
  readonly minCityCityDistance: number;

  /**
   * Maximum number of regeneration attempts on validation failure.
   * Default 5. Safe range: `[1, 10]`. Spec FR-007: "bounded
   * retries."
   */
  readonly maxRegenAttempts: number;

  /**
   * Number of deterministic post-process smoothing passes applied to
   * the elevation field (FR-010). Default 4. Safe range: `[0, 8]`.
   * `0` = no smoothing (byte-identical to pre-smoothing output); each
   * pass replaces every cell's elevation with the round-half-up mean
   * of its 3×3 neighborhood (coordinates clamped to the board edge),
   * reducing adjacent-cell elevation differences so pipe networks gain
   * more viable cross-map routes.
   */
  readonly terrainSmoothing: number;
}

/**
 * The default settings used when `GenerationSettings` is omitted. Mirrors
 * the values documented in the per-field docs above. Stored in a single
 * constant so the engine can compare a user-supplied settings object
 * against this reference.
 */
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  waterRatio: 0.10,
  roughness: 0.5,
  octaves: 4,
  citiesPerPlayer: 1,
  symmetryStrategy: 'point',
  minCityWaterDistance: 3,
  minCityCityDistance: 5,
  maxRegenAttempts: 5,
  terrainSmoothing: 4,
} as const;

// ----------------------------------------------------------------------------
// TerrainGenerationRequest
// ----------------------------------------------------------------------------

/**
 * Input to `generateBoard`. The engine (via feature 006) constructs
 * this and passes it in.
 *
 * **Proposed additive change to `engine-to-terrain.ts`** (the current
 * engine-to-terrain contract has a placeholder
 * `options?: Readonly<Record<string, never>>` and no PRNG field). The
 * two changes are:
 *
 *   1. `rng: Rng` — the engine's live sfc32 instance. Without this,
 *      the prompt's mandate ("do not introduce a separate PRNG")
 *      cannot be satisfied. See `terrain-api.ts` §"Proposed additive
 *      changes to feature 001" #1.
 *
 *   2. `settings: GenerationSettings` (required) — replaces the
 *      placeholder `options` field. `GenerationSettings` is a
 *      discriminated closed type, so the change is type-safe.
 *      See `terrain-api.ts` §"Proposed additive changes to feature
 *      001" #2.
 *
 * `boardSize`, `playerCount`, and `seed` already exist in
 * `engine-to-terrain.ts`'s `TerrainGenerationRequest` and are
 * unchanged.
 */
export interface TerrainGenerationRequest {
  /** Square board dimension. Must match `MatchConfig.boardSize`. */
  readonly boardSize: number;
  /** Player count. v1 ships 2; engine supports 2–4. */
  readonly playerCount: 2 | 3 | 4;
  /** Starting seed (uint32). The engine's sfc32 is already seeded from this. */
  readonly seed: MapSeed;
  /** The engine's live sfc32 PRNG. See proposed change #1. */
  readonly rng: Rng;
  /** Tunable knobs. See proposed change #2. */
  readonly settings: GenerationSettings;
}

// ----------------------------------------------------------------------------
// TerrainGenerationResult
// ----------------------------------------------------------------------------

/**
 * Output of `generateBoard`. The engine consumes `board` via
 * `createWorld`; `effectiveSeed` is persisted with the match record
 * (FR-009); `startingCitiesByPlayer` is a redundant view of
 * `board.cities` provided for symmetry verification.
 *
 * This type already exists in `engine-to-terrain.ts` and is unchanged.
 * The shape is mirrored here so `@europa/terrain` consumers can import
 * from either package.
 */
export interface TerrainGenerationResult {
  /** The engine-ready Board. Pass directly to `createWorld`. */
  readonly board: Board;
  /**
   * The seed actually used to produce the board. May differ from
   * `TerrainGenerationRequest.seed` if internal retries happened.
   * FR-009: "the generator MUST emit the final effective seed
   * alongside the map so matches can record and share it."
   */
  readonly effectiveSeed: MapSeed;
  /**
   * Per-player city coordinates. Redundant with `board.cities` but
   * exposed for symmetry checks and for tests. Index is `PlayerId - 1`.
   */
  readonly startingCitiesByPlayer: Readonly<
    Record<PlayerId, ReadonlyArray<Coord>>
  >;
  /**
   * The `GenerationSettings` actually used by the generator after
   * out-of-range fields were clamped to their safe ranges per FR-008.
   * Callers can compare this against their input to detect when
   * clamping changed a value. Always equal to the `effectiveSettings`
   * inside the same generator's `ValidationReport.stats.effectiveSettings`.
   *
   * Added in T046 (PM-approved additive change, see tasks.md §"PM
   * Handoff" item #2). Mirrors the `effectiveSeed` pattern — every
   * result exposes what was *actually used* so callers (matchmaking,
   * tests, ops logging) can verify their assumptions.
   */
  readonly effectiveSettings: GenerationSettings;
}

// ----------------------------------------------------------------------------
// ValidationReport (side-channel; not part of generateBoard's return)
// ----------------------------------------------------------------------------

/**
 * Discriminated union of validation failures. Used by `validateBoard`
 * (a helper exposed for tests and for feature 006 to pre-check stored
 * Boards) and included in `GenerationError` on retry exhaustion.
 */
export type Violation =
  | { readonly kind: 'asymmetry'; readonly cellA: Coord; readonly cellB: Coord }
  | { readonly kind: 'city_on_water'; readonly coord: Coord }
  | {
      readonly kind: 'cities_too_close';
      readonly coordA: Coord;
      readonly coordB: Coord;
      readonly distance: number;
    }
  | {
      readonly kind: 'city_too_close_to_water';
      readonly coord: Coord;
      readonly nearestWater: Coord;
      readonly distance: number;
    }
  | { readonly kind: 'wrong_city_count'; readonly expected: number; readonly got: number }
  | {
      readonly kind: 'isolated_cities';
      readonly component: ReadonlyArray<Coord>;
    }
  | {
      readonly kind: 'water_out_of_bounds';
      readonly waterRatio: number;
      readonly min: number;
      readonly max: number;
    };

/**
 * Statistics about a generated map. Included in `ValidationReport` so
 * tests and feature 006 can assert on the actual map characteristics
 * (not just the boolean `valid`).
 */
export interface MapStats {
  /** Actual water ratio (0..1). */
  readonly waterRatio: number;
  /** Sample variance of elevation values. */
  readonly elevationVariance: number;
  /** Size in cells of the largest connected water region. */
  readonly largestWaterPool: number;
  /** Number of distinct water regions. */
  readonly numWaterPools: number;
  /** Total cities placed across all players. */
  readonly numCities: number;
  /** Min Chebyshev distance between any pair of cities, in cells. */
  readonly minCitySeparation: number;
  /** Min Chebyshev distance from any city to any water cell, in cells. */
  readonly minCityWaterSeparation: number;
  /**
   * The `GenerationSettings` actually used by the generator after
   * out-of-range fields were clamped to their safe ranges per FR-008.
   * Callers can compare this against their input to detect when
   * clamping changed a value (e.g., a server logs the difference for
   * ops visibility). Always present (never `undefined`).
   *
   * Added in T046 (PM-approved additive change, see tasks.md §"PM
   * Handoff" item #2). Without this field, FR-008's "callers can see
   * what was actually used" requirement is unverifiable.
   */
  readonly effectiveSettings: GenerationSettings;
}

/**
 * Result of validating a Board against all generator invariants. Returned
 * by `validateBoard` (a test-side helper) and by the generator's internal
 * self-check.
 */
export interface ValidationReport {
  /** `true` iff all 15 invariants (see data-model.md §11) pass. */
  readonly valid: boolean;
  /** Empty when `valid === true`. */
  readonly violations: ReadonlyArray<Violation>;
  /** Number of generation attempts before the final map (≥ 1). */
  readonly attemptsUsed: number;
  /** The seed of the attempt that produced the validated Board. */
  readonly finalSeed: MapSeed;
  /** Statistics about the final map. */
  readonly stats: MapStats;
}

// ----------------------------------------------------------------------------
// Error type (thrown on retry exhaustion)
// ----------------------------------------------------------------------------

/**
 * Thrown by `generateBoard` when `maxRegenAttempts` retries are
 * exhausted without producing a valid map, or when the request is
 * invalid (e.g., unknown `symmetryStrategy`).
 *
 * Throwing rather than returning a `Result` is a deliberate choice
 * (see data-model.md §6): the loudest possible signal that something
 * is wrong, and the only caller (feature 006) can catch and surface a
 * meaningful error to the matchmaker.
 */
export class GenerationError extends Error {
  readonly kind: 'attempts_exhausted' | 'invalid_request';
  readonly attempts: number;
  readonly lastReport: ValidationReport | null;
  constructor(
    message: string,
    options: {
      kind: 'attempts_exhausted' | 'invalid_request';
      attempts: number;
      lastReport: ValidationReport | null;
    },
  ) {
    super(message);
    this.name = 'GenerationError';
    this.kind = options.kind;
    this.attempts = options.attempts;
    this.lastReport = options.lastReport;
  }
}

// ----------------------------------------------------------------------------
// Public re-exports of engine types
// ----------------------------------------------------------------------------

/**
 * Re-export the engine types that terrain's public surface depends on,
 * so consumers can `import { Board, Cell, Coord, PlayerId } from
 * '@europa/terrain'` without taking a direct dependency on
 * `@europa/engine` for read-only types.
 */
export type { Board, Cell, CityPlacement, Coord, PlayerId };
