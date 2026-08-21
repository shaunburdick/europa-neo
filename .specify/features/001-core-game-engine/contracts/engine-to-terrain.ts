/**
 * Engine ↔ Terrain contract (feature 001 ↔ feature 003).
 *
 * Feature 003 (procedural terrain generation) produces a `Board`. The
 * engine consumes it via `createWorld`. No other coupling.
 *
 * Boundary rule: terrain generation does NOT import anything from
 * `@europa/engine` at runtime — it produces plain data. The engine
 * treats the `Board` as fully opaque other than the `Board` type.
 *
 * What the engine needs from terrain:
 *   - A square `Board` whose `width === height === config.boardSize`.
 *   - All cells with valid `terrain` and `elevation`.
 *   - At least one `CityPlacement` per player, on land cells, in
 *     symmetric positions (validated by terrain's own SC-001/002; engine
 *     trusts it but still sanity-checks city-on-land on `createWorld`).
 *
 * AMENDMENT (committed with feature 003 planning):
 *   - Added `Rng` to `engine-types.ts` (canonical PRNG type, owned by
 *     engine since engine owns the sfc32 instance).
 *   - Added `rng: Rng` field to `TerrainGenerationRequest` so the engine
 *     passes its live sfc32 instance to terrain (per constitution
 *     Principle II: one PRNG per match; same seed → same board).
 *   - Replaced placeholder `options?: Readonly<Record<string, never>>`
 *     with `settings: GenerationSettings` to support spec FR-008
 *     (configurable water density, roughness, city count, symmetry).
 *   - All changes are additive (no fields removed, no existing semantics
 *     changed) — no `ENGINE_API_VERSION` bump required.
 *   - `MatchConfig` is unchanged; balance knobs are terrain-internal.
 */

import type { Board, MatchConfig, PlayerId, Rng } from './engine-types';
// Type-only import: engine has no runtime dependency on terrain, only
// type knowledge of its settings shape. Erased by the TypeScript compiler.
import type { GenerationSettings } from '@europa/terrain';

/**
 * Inputs the engine hands to terrain when a match is created (feature
 * 006 → feature 003). Note: terrain does not import `MatchConfig`; this
 * is the engine-facing view of what terrain needs to know.
 */
export interface TerrainGenerationRequest {
  readonly boardSize: number;
  readonly playerCount: 2 | 3 | 4;
  readonly seed: number;
  /**
   * The engine's live sfc32 instance (engine owns the PRNG; see
   * `engine-types.ts` `Rng`). Terrain consumes from this — it does not
   * construct its own. Required for cross-feature determinism.
   */
  readonly rng: Rng;
  /**
   * Tunable balance knobs (water ratio, roughness, octaves, city
   * count, min spacings, symmetry strategy, max retries). Owned by
   * terrain; the engine passes either matchmaking-supplied overrides
   * or `DEFAULT_GENERATION_SETTINGS` for v1 defaults.
   */
  readonly settings: GenerationSettings;
}

/**
 * Outputs terrain hands back to the engine. Includes the effective
 * seed in case terrain regenerated internally to satisfy invariants
 * (feature 003 FR-007).
 */
export interface TerrainGenerationResult {
  readonly board: Board;
  readonly effectiveSeed: number;
  /** Cities pre-assigned to players; terrain enforces symmetry. */
  readonly startingCitiesByPlayer: Readonly<Record<PlayerId, ReadonlyArray<{ x: number; y: number }>>>;
}

/**
 * The function the engine (via feature 006 matchmaking) calls on
 * terrain. Terrain lives in `@europa/terrain`; this declaration is the
 * contract the engine relies on.
 */
export declare function generateBoard(req: TerrainGenerationRequest): TerrainGenerationResult;

/**
 * Used by engine to assert that a `Board` it received is well-formed
 * before creating a world. Returns `true` if the board meets minimum
 * invariants. Terrain should already enforce these (SC-002), but the
 * engine re-checks as a defensive layer.
 *
 * Engine re-implements minimal checks (square, board size, city-on-land)
 * locally so the engine package has no runtime dependency on terrain.
 * The full 15-invariant suite is terrain's responsibility.
 */
export declare function assertBoardMatchesConfig(
  board: Readonly<Board>,
  config: Readonly<MatchConfig>,
): void;
