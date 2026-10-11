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
 * Encode the world for transport (snapshots, replays, tests). Pure.
 *
 * Two independent versions guard the bytes: the ASCII header carries
 * `ENGINE_API_VERSION` (public type surface) and the first payload byte
 * carries `SERIALIZE_FORMAT_VERSION` (wire layout; bumped to 2 by spec
 * 001 v1.16 for per-cell terrain). Encoding is lossless — every `World`
 * field, including per-cell `elevation` and `terrain`, round-trips — and
 * fails loudly with `EngineSerializationError` on any value the wire
 * cannot represent, never by truncating (FR-026).
 */
export declare function serializeWorld(world: Readonly<World>): Uint8Array;

/**
 * Decode a previously-serialized world — the pure inverse of
 * `serializeWorld`.
 *
 * Throws `EngineVersionMismatchError` when the header's
 * `ENGINE_API_VERSION` differs, `EngineFormatVersionMismatchError` when
 * the payload layout version differs, and `EngineFormatError` on any
 * malformed field (FR-025: strict, never coerced or defaulted). The
 * result is a self-contained `World`: tickable, with terrain intact
 * (FR-026).
 */
export declare function deserializeWorld(bytes: Uint8Array): World;

/**
 * Stable FNV-1a hash of the serialized bytes, formatted as 8 lowercase
 * hex chars. It covers the full payload — terrain included since wire
 * v2 (FR-026) — so any state or layout change surfaces here; SC-001
 * byte-identity and the replay fixtures key off it.
 */
export declare function hashWorld(world: Readonly<World>): string;

// ----------------------------------------------------------------------------
// Constants (single tunable-constants location, SC-005)
//
// `EngineConstants` type and `ENGINE_CONSTANTS` value now live in
// `@europa/core` (issue #96) to break the engine ↔ terrain devDependency
// cycle. Re-exported here for backward compatibility.
// ----------------------------------------------------------------------------

import type { EngineConstants } from '@europa/core';

export type { EngineConstants } from '@europa/core';

export declare const ENGINE_CONSTANTS: EngineConstants;
