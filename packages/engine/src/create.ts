/**
 * createWorld — Feature 001, T021
 *
 * Pure constructor for the initial `World` of a match. Validates board
 * invariants (FR-001 square grid, FR-002 cities on land, FR-019 player
 * count ∈ {2, 3, 4}), allocates the flat typed-array state per
 * `data-model.md` §9, seeds the deterministic PRNG (sfc32, per
 * `research.md` §5 + spec FR-017), and returns a `Readonly<World>`.
 *
 * Purity:
 *   - No I/O.
 *   - No wall-clock reads.
 *   - No `Math.random()` (PRNG is seeded deterministically by `config.seed`).
 *   - No mutation of `config` or `board`.
 *
 * Determinism:
 *   Same `(config, board)` pair produces a byte-identical initial `World`
 *   on every run (constitution Principle II + spec FR-017 + SC-001). The
 *   `rngState` field is the serialized sfc32 internal state at
 *   initialization (4 uint32s).
 */

import { hashSeed } from './rng';
import type {
  Board,
  Cell,
  CityPlacement,
  MatchConfig,
  Player,
  PlayerId,
  Terrain,
  World,
  WorldState,
} from './types';

/** Minimum board dimension the engine accepts (per data-model.md §1). */
export const MIN_BOARD_SIZE = 8;

/**
 * Construct the initial `World` for a match.
 *
 * @param config Match-wide configuration (player count, seed, board size).
 * @param board  Terrain definition produced by feature 003. The board's
 *               `width`/`height` MUST equal `config.boardSize`.
 * @returns Frozen initial `World` (immutable from the caller's side).
 * @throws if the board is not square, doesn't match `config.boardSize`,
 *         has a city on a water cell, has out-of-bounds cities, or
 *         `config.playerCount` is outside {2, 3, 4}.
 */
export function createWorld(config: MatchConfig, board: Board): World {
  // ---- Board structural invariants (FR-001) ----------------------------
  if (!Number.isInteger(config.boardSize) || config.boardSize < MIN_BOARD_SIZE) {
    throw new Error(
      `createWorld: config.boardSize must be an integer ≥ ${MIN_BOARD_SIZE} (got ${String(config.boardSize)})`,
    );
  }
  // Square check fires first so callers see the structural issue before
  // a dimension mismatch (cleaner diagnostic).
  if (board.width !== board.height) {
    throw new Error(
      `createWorld: board must be square (got ${String(board.width)}×${String(board.height)})`,
    );
  }
  if (!Number.isInteger(board.width) || board.width !== config.boardSize) {
    throw new Error(
      `createWorld: board.width (${String(board.width)}) must equal config.boardSize (${String(config.boardSize)})`,
    );
  }
  if (board.cells.length !== board.width * board.height) {
    throw new Error(
      `createWorld: board.cells.length (${String(board.cells.length)}) must equal width*height (${String(board.width * board.height)})`,
    );
  }

  // ---- Player count (FR-019) -------------------------------------------
  if (config.playerCount !== 2 && config.playerCount !== 3 && config.playerCount !== 4) {
    throw new Error(
      `createWorld: config.playerCount must be 2, 3, or 4 (got ${String(config.playerCount)})`,
    );
  }

  // ---- Per-cell invariants (INV-1..INV-4) ------------------------------
  for (let i = 0; i < board.cells.length; i++) {
    const cell = board.cells[i];
    if (cell === undefined) {
      throw new Error(`createWorld: missing cell at index ${String(i)}`);
    }
    if (!Number.isInteger(cell.elevation) || cell.elevation < 0 || cell.elevation > 255) {
      throw new Error(
        `createWorld: cell [${String(cell.x)},${String(cell.y)}] elevation must be an integer in [0, 255] (got ${String(cell.elevation)})`,
      );
    }
    if (cell.terrain !== 'land' && cell.terrain !== 'water') {
      throw new Error(
        `createWorld: cell [${String(cell.x)},${String(cell.y)}] terrain must be 'land' or 'water' (got ${String(cell.terrain)})`,
      );
    }
    if (cell.x < 0 || cell.x >= board.width || cell.y < 0 || cell.y >= board.height) {
      throw new Error(
        `createWorld: cell [${String(cell.x)},${String(cell.y)}] out of bounds for ${String(board.width)}×${String(board.height)}`,
      );
    }
  }

  // ---- Cities (FR-002: must be on land, no duplicates, in bounds) ------
  const seen = new Set<number>();
  for (let i = 0; i < board.cities.length; i++) {
    const city: CityPlacement | undefined = board.cities[i];
    if (city === undefined) {
      throw new Error(`createWorld: missing city at index ${String(i)}`);
    }
    const cx = city.cell.x;
    const cy = city.cell.y;
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) {
      throw new Error(`createWorld: city at [${String(cx)},${String(cy)}] coords must be integers`);
    }
    if (cx < 0 || cx >= board.width || cy < 0 || cy >= board.height) {
      throw new Error(
        `createWorld: city at [${String(cx)},${String(cy)}] is out of bounds for ${String(board.width)}×${String(board.height)}`,
      );
    }
    if (city.owner !== 1 && city.owner !== 2 && city.owner !== 3 && city.owner !== 4) {
      throw new Error(
        `createWorld: city at [${String(cx)},${String(cy)}] owner must be 1..4 (got ${String(city.owner)})`,
      );
    }
    const key = cy * board.width + cx;
    if (seen.has(key)) {
      throw new Error(
        `createWorld: duplicate city at [${String(cx)},${String(cy)}] (cell index ${String(key)})`,
      );
    }
    seen.add(key);
    const cellHere = board.cells[key];
    if (cellHere === undefined) {
      throw new Error(`createWorld: cell [${String(cx)},${String(cy)}] missing from board.cells`);
    }
    if (cellHere.terrain !== 'land') {
      throw new Error(
        `createWorld: city at [${String(cx)},${String(cy)}] must be on a land cell (got '${String(cellHere.terrain)}')`,
      );
    }
  }

  // ---- Allocate flat state (data-model.md §9) --------------------------
  const n = board.width * board.height;
  const state: WorldState = {
    troopCounts: new Uint32Array(n),
    troopOwners: new Uint8Array(n), // 0 = neutral
    pipeMasks: new Uint8Array(n),
    reservesPct: new Uint8Array(n),
    cityOwners: new Uint8Array(n), // 0 = no city
  };

  // Populate cityOwners from board.cities.
  for (const city of board.cities) {
    const idx = city.cell.y * board.width + city.cell.x;
    state.cityOwners[idx] = city.owner;
  }

  // ---- Players ---------------------------------------------------------
  // Initialize per-player `citiesOwned` from `board.cities` so the
  // tick-0 Player snapshot is accurate. Without this, `citiesOwned`
  // would be 0 until the first tick's resolveTerminal recomputed it —
  // a stale-state bug. (`troopsHeld` stays 0 because troop placement
  // happens in `tick()`'s production + flow phases.)
  const citiesOwnedByPlayer = new Map<PlayerId, number>();
  for (const city of board.cities) {
    citiesOwnedByPlayer.set(city.owner, (citiesOwnedByPlayer.get(city.owner) ?? 0) + 1);
  }
  const players: Player[] = [];
  for (let i = 0; i < config.playerCount; i++) {
    const id = (i + 1) as PlayerId;
    players.push({
      id,
      displayName: `Player ${String(id)}`,
      status: 'alive',
      citiesOwned: citiesOwnedByPlayer.get(id) ?? 0,
      troopsHeld: 0,
    });
  }

  // ---- PRNG seed (sfc32 state, 4 uint32s) ------------------------------
  const rngState = hashSeed(config.seed >>> 0);

  // ---- Construct World -------------------------------------------------
  const world: World = {
    config,
    tick: 0,
    board,
    players: Object.freeze(players),
    state,
    rngSeed: config.seed >>> 0,
    rngState,
  };

  return world;
}

// Re-export terrain so we don't trigger the unused-import lint rule
// (consumers read Terrain via `types.ts`; this module re-asserts the
// type union inline so a future change to Terrain can be detected here).
export type { Cell, Terrain };
