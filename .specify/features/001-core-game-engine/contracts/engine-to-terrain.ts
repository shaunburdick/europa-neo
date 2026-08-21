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
 */

import type { Board, MatchConfig, PlayerId } from './engine-types';

/**
 * Inputs the engine hands to terrain when a match is created (feature
 * 006 → feature 003). Note: terrain does not import `MatchConfig`; this
 * is the engine-facing view of what terrain needs to know.
 */
export interface TerrainGenerationRequest {
  readonly boardSize: number;
  readonly playerCount: number;
  readonly seed: number;
  /** Optional knobs (water density, roughness). Engine passes defaults. */
  readonly options?: Readonly<Record<string, never>>; // v1: no options
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
 */
export declare function assertBoardMatchesConfig(
  board: Readonly<Board>,
  config: Readonly<MatchConfig>,
): void;
