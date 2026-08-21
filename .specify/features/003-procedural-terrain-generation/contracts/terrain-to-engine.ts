/**
 * Engine ↔ Terrain contract (proposed amendment to feature 001's
 * `engine-to-terrain.ts`).
 *
 * This file is **proposal** only. It restates the engine ↔ terrain
 * boundary with the two additive changes required to honor the prompt
 * mandate ("engine passes the same PRNG instance used to start the
 * match — do not introduce a separate PRNG"). If the PM accepts the
 * proposal, feature 001's `engine-to-terrain.ts` is amended in the
 * same change set to match this file verbatim (constitution Principle
 * IV: specs are documentation; drift is a bug).
 *
 * What this contract does:
 *   - Repeats the unchanged parts of `engine-to-terrain.ts` for the
 *     reader's convenience.
 *   - Calls out, with a `// PROPOSED:` comment, each additive change
 *     and its rationale.
 *   - Re-defines `generateBoard` and `assertBoardMatchesConfig` with
 *     the new signatures.
 *
 * Boundary rule (unchanged): terrain does NOT import anything from
 * `@europa/engine` at runtime — it produces plain data. The engine
 * treats the `Board` as fully opaque other than the `Board` type.
 *
 * What the engine needs from terrain (unchanged):
 *   - A square `Board` whose `width === height === config.boardSize`.
 *   - All cells with valid `terrain` and `elevation`.
 *   - At least one `CityPlacement` per player, on land cells, in
 *     symmetric positions (validated by terrain's own invariants; engine
 *     trusts it but still sanity-checks city-on-land on `createWorld`).
 */

import type { Board, MatchConfig, PlayerId } from '@europa/engine';
import type {
  GenerationSettings,
  Rng,
  TerrainGenerationResult,
  ValidationReport,
} from './terrain-types';

// ----------------------------------------------------------------------------
// PROPOSED AMENDMENT — TerrainGenerationRequest
// ----------------------------------------------------------------------------

/**
 * Inputs the engine hands to terrain when a match is created.
 *
 * **PROPOSED ADDITIVE CHANGE #1**: the `rng: Rng` field is new. The
 * current `engine-to-terrain.ts` has no PRNG parameter; the engine
 * must add this field and pass its live sfc32 instance.
 *
 * **PROPOSED ADDITIVE CHANGE #2**: the `settings: GenerationSettings`
 * field replaces the current placeholder
 * `options?: Readonly<Record<string, never>>` (the "v1: no options"
 * comment). The new field is required, not optional, with a default
 * available as `DEFAULT_GENERATION_SETTINGS` (from `./terrain-types`).
 *
 * `boardSize`, `playerCount`, and `seed` are unchanged.
 */
export interface TerrainGenerationRequest {
  readonly boardSize: number;
  readonly playerCount: 2 | 3 | 4;
  readonly seed: number;

  // PROPOSED ADDITIVE CHANGE #1: engine's live sfc32 instance.
  // Rationale: the prompt mandates "engine passes the same PRNG
  // instance used to start the match — do not introduce a separate
  // PRNG." Without this, terrain would have to construct its own,
  // violating the mandate.
  readonly rng: Rng;

  // PROPOSED ADDITIVE CHANGE #2: replace the placeholder
  // `options?: Readonly<Record<string, never>>`.
  // Rationale: spec FR-008 mandates configurable water density,
  // elevation roughness, and city count. The placeholder type
  // cannot express this.
  readonly settings: GenerationSettings;
}

// ----------------------------------------------------------------------------
// PROPOSED AMENDMENT — TerrainGenerationResult (unchanged shape)
// ----------------------------------------------------------------------------

/**
 * Outputs terrain hands back to the engine. Includes the effective
 * seed in case terrain regenerated internally to satisfy invariants
 * (FR-007).
 *
 * This type already exists in `engine-to-terrain.ts` and is unchanged.
 * Mirror here for self-containment.
 */
export interface TerrainGenerationResult_Amended extends TerrainGenerationResult {
  readonly board: Board;
  readonly effectiveSeed: number;
  readonly startingCitiesByPlayer: Readonly<Record<PlayerId, ReadonlyArray<{ x: number; y: number }>>>;
}

// ----------------------------------------------------------------------------
// PROPOSED AMENDMENT — generateBoard signature
// ----------------------------------------------------------------------------

/**
 * The function the engine (via feature 006 matchmaking) calls on
 * terrain. Terrain lives in `@europa/terrain`; this declaration is the
 * contract the engine relies on.
 *
 * **PROPOSED**: the `req` parameter is now `TerrainGenerationRequest`
 * (with the new `rng` and `settings` fields). See above.
 */
export declare function generateBoard(
  req: TerrainGenerationRequest,
): TerrainGenerationResult_Amended;

// ----------------------------------------------------------------------------
// PROPOSED AMENDMENT — assertBoardMatchesConfig (unchanged)
// ----------------------------------------------------------------------------

/**
 * Used by engine to assert that a `Board` it received is well-formed
 * before creating a world. Returns `true` if the board meets minimum
 * invariants. Terrain should already enforce these (SC-002), but the
 * engine re-checks as a defensive layer.
 *
 * Unchanged. The engine-side implementation can be a one-liner that
 * calls `terrain.validateBoard(board, settings, playerCount)` if
 * feature 006 wants to thread the settings through. (Otherwise the
 * engine re-implements the checks itself, which is fine — they're
 * cheap.)
 */
export declare function assertBoardMatchesConfig(
  board: Readonly<Board>,
  config: Readonly<MatchConfig>,
): void;

// ----------------------------------------------------------------------------
// Proposed: ValidationReport re-export (optional)
// ----------------------------------------------------------------------------

/**
 * Optional re-export. If the engine wants to surface a structured
 * failure (rather than a thrown `GenerationError`) when terrain
 * validation fails, the engine can catch `GenerationError` and read
 * `.lastReport`. This re-export is for documentation; it adds no
 * runtime surface to the engine.
 */
export type { ValidationReport };

// ----------------------------------------------------------------------------
// Open questions for the PM
// ----------------------------------------------------------------------------
//
// 1. Does the engine want to expose a callable `Rng` type, or accept
//    a "raw state + step function" pair? The former is cleaner; the
//    latter avoids one type addition to `engine-types.ts`. Both are
//    viable; terrain can support either. **Recommendation**: expose
//    `Rng` from `@europa/engine` (mirrors how `MatchConfig` is
//    exported today).
//
// 2. Should `assertBoardMatchesConfig` be re-implemented in the
//    engine or delegated to `terrain.validateBoard`? The prompt
//    didn't constrain this. **Recommendation**: the engine
//    re-implements its own minimal checks (square, board size, city-
//    on-land); the full 15-invariant suite is terrain's responsibility
//    (already enforced before `generateBoard` returns). This keeps
//    the engine package independent of the terrain package at
//    runtime.
//
// 3. Should `MatchConfig` gain any terrain-related fields? The
//    prompt suggested it might, but the engine's research.md §9
//    argues that all balance knobs belong in terrain. **Decision in
//    this plan**: NO change to `MatchConfig`. All new fields go on
//    `TerrainGenerationRequest`. If the PM wants `MatchConfig` to
//    carry these (e.g., for the matchmaking UI to display "water
//    density: 10%"), that becomes a spec change, not just a contract
//    change.
//
// 4. When the engine-side call is made, who constructs the
//    `GenerationSettings`? The engine (with `DEFAULT_GENERATION_*`
//    for now), or does feature 006 allow users to override? **Out of
//    scope for this plan**; defer to feature 006's plan. Terrain
//    accepts any valid `GenerationSettings` and clamps to safe
//    ranges; the engine/matchmaking layer decides what to pass.
// ----------------------------------------------------------------------------
