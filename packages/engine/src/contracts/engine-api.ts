/**
 * Engine Public API — Feature 001
 *
 * The full surface other packages depend on. Everything here is a pure
 * function with no I/O, no wall-clock reads, no unseeded randomness.
 * See `research.md` §7 for the rationale.
 *
 * Consumers:
 *   - 003 (terrain)        → calls `createWorld`.
 *   - 002 (fog)            → calls `getCell`, `tick`, `isTerminal`.
 *   - 004 (networking)     → calls `tick`, `serializeWorld`, `deserializeWorld`.
 *   - 005 (console)        → emits `Order` objects consumed by `applyCommand`.
 *   - 006 (matchmaking)    → drives lifecycle via `createWorld` and `isTerminal`.
 */

import type {
  Board,
  CellView,
  CommandResult,
  Coord,
  Direction,
  MatchConfig,
  MatchResult,
  Order,
  PlayerId,
  ReservesPct,
  TickResult,
  World,
} from './engine-types';

// ----------------------------------------------------------------------------
// World lifecycle
// ----------------------------------------------------------------------------

/**
 * Construct the initial `World` for a match. Pure.
 *
 * @param config Match-wide configuration (player count, seed, board size).
 * @param board  Terrain definition produced by feature 003 (procedural terrain).
 *               The board's width/height MUST equal `config.boardSize`.
 * @throws if `board` is not square, doesn't match `config.boardSize`, or
 *         has a city on a water cell.
 */
export declare function createWorld(config: MatchConfig, board: Board): World;

/**
 * Validate and stage an `Order` for the next tick. Pure. Does NOT
 * advance time; the staged state is consumed by the next `tick()` call.
 *
 * Invalid orders return `{ ok: false, reason }` and the world is
 * returned unchanged (FR-018).
 */
export declare function applyCommand(
  world: Readonly<World>,
  cmd: Order,
): { readonly world: World; readonly result: CommandResult };

/**
 * Advance the world by exactly one tick. Pure. Applies staged commands
 * in deterministic order (by PlayerId then kind), runs all resolution
 * phases, and returns the new world plus the events observed during
 * resolution.
 *
 * If the match ends on this tick, `terminal` is populated.
 * If the match had already ended, the returned world equals the input.
 */
export declare function tick(world: Readonly<World>): TickResult;

/**
 * Cheap terminal check (does not advance time).
 */
export declare function isTerminal(world: Readonly<World>): MatchResult | undefined;

// ----------------------------------------------------------------------------
// Read helpers
// ----------------------------------------------------------------------------

/**
 * Decode a single cell into a friendly `CellView`. Useful for UI/fog.
 * Slow path — prefer `WorldState` typed arrays in tick logic.
 */
export declare function getCell(world: Readonly<World>, x: number, y: number): CellView;

/**
 * Iterate every cell in row-major order, yielding `CellView`s. The
 * callback returns `false` to stop iteration early.
 */
export declare function forEachCell(
  world: Readonly<World>,
  visit: (view: CellView) => boolean | void,
): void;

/**
 * Get all cells within Chebyshev range `r` of `center`, inclusive of center.
 * Bounds-checked; out-of-board cells are omitted.
 */
export declare function cellsInRange(
  world: Readonly<World>,
  center: Coord,
  r: number,
): ReadonlyArray<Coord>;

/**
 * Return the four cardinal neighbors (if in-bounds), or an empty array
 * if all would be out of bounds.
 */
export declare function neighborsOf(
  world: Readonly<World>,
  coord: Coord,
): ReadonlyArray<{ readonly direction: Direction; readonly coord: Coord }>;

// ----------------------------------------------------------------------------
// Player helpers
// ----------------------------------------------------------------------------

export declare function getPlayer(world: Readonly<World>, id: PlayerId): World['players'][number];

export declare function alivePlayers(world: Readonly<World>): ReadonlyArray<PlayerId>;

// ----------------------------------------------------------------------------
// Validation (standalone, for use by callers that want to pre-validate)
// ----------------------------------------------------------------------------

/**
 * Validate an order against the world WITHOUT staging it. Returns
 * `null` if the order would be accepted, or a `ValidationError`.
 *
 * Note: `applyCommand` already performs this check; this helper is for
 * client-side preflight (feature 005) and protocol-level checks
 * (feature 004).
 */
export declare function validateCommand(
  world: Readonly<World>,
  cmd: Order,
): CommandResult;

// ----------------------------------------------------------------------------
// Serialization
// ----------------------------------------------------------------------------

/**
 * Encode the world for transport (snapshots, replays, tests). Versioned.
 * Pure.
 */
export declare function serializeWorld(world: Readonly<World>): Uint8Array;

/**
 * Decode a previously-serialized world. Validates the version header;
 * throws on mismatch.
 */
export declare function deserializeWorld(bytes: Uint8Array): World;

/**
 * Stable hash of the world's mutable parts (state, tick, players).
 * Used by SC-001 (byte-identical re-runs) and tests.
 */
export declare function hashWorld(world: Readonly<World>): string;

// ----------------------------------------------------------------------------
// Constants (single tunable-constants location, SC-005)
// ----------------------------------------------------------------------------

export interface EngineConstants {
  /** Troops produced per city per tick (FR-004). */
  readonly productionRate: number;
  /** Saturation capacity per city (FR-004). */
  readonly cityCapacity: number;
  /** Saturation capacity per non-city cell (FR-011). */
  readonly cellCapacity: number;
  /** Troops lost per tick when a cell is unfed (FR-009). */
  readonly decayPerTick: number;
  /** Base troops per tick moving along a flat pipe (FR-007). */
  readonly flowBase: number;
  /** Troops added/subtracted per unit of elevation change (FR-007). */
  readonly flowSlopeStep: number;
  /** Caps the downhill bonus (FR-007). */
  readonly flowSlopeDeltaCap: number;
  /** Troops spent per trooper landed via paratroop (FR-013). */
  readonly paratroopCost: number;
  /** Troops spent per gun shot (FR-014). */
  readonly gunCost: number;
  /** Troops lost per gun hit (FR-014). */
  readonly gunDamage: number;
  /** Sensor radius default (consumed by feature 002). */
  readonly visibilityRadiusDefault: number;
}

export declare const ENGINE_CONSTANTS: EngineConstants;
