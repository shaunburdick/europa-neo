/**
 * Test World Builders — Feature 002
 *
 * Test-only helpers for constructing small, well-defined `World`
 * values without invoking feature 003 (terrain generation). Mirrors
 * the engine's `packages/engine/tests/fixtures/board.ts` pattern
 * but produces a full `World` (not just a `Board`) so the fog
 * tests can exercise `computeVisibleSet` / `computePlayerView`
 * end-to-end.
 *
 * Builders:
 *   - `buildSmallWorld` — square flat board (all land, elevation
 *     0), no cities, no troops, no players (player count is
 *     passed to set the config so the engine's `World.players`
 *     array is populated correctly). Cheapest default.
 *   - `buildWorldWithTroops` — same as `buildSmallWorld` but
 *     with explicit troop placements. Used by US1 (visibility
 *     horizon), US2 (no memory), and Q-F01 (lone stack).
 *   - `buildWorldWithCities` — same as `buildSmallWorld` but
 *     with explicit city placements. Used by US1's city
 *     projection test (Q-F04, Q-F08's "cities alone do not
 *     project vision" assertion) and any test that needs the
 *     engine's city-ownership semantics to be active.
 *
 * State discipline: troop placement mutates `state.troopCounts`
 * and `state.troopOwners` directly. The engine's `createWorld`
 * returns `state` with non-frozen typed arrays (engine
 * `create.ts:148-152`), so element-level mutation is safe. We
 * clone the typed arrays first so a test that mutates the
 * returned world doesn't leak into the engine's internal
 * copies. City ownership lives in `state.cityOwners` and is
 * already populated by `createWorld` from the input `board`.
 */

import {
  type Board,
  type Cell,
  type CityPlacement,
  type Coord,
  createWorld,
  ENGINE_CONSTANTS,
  type MatchConfig,
  type Player,
  type PlayerId,
  type World,
  type WorldState,
} from '@europa/engine';

/** Minimum board size used across the fog's quickstart tests. */
const MIN_BOARD_SIZE = 8;

/**
 * Build a flat, all-land, elevation-0 `Board` with the given
 * city placements. The shape mirrors the engine's
 * `buildSmallBoard`; duplicated here so the fog fixture doesn't
 * take a private dependency on the engine's `tests/` directory.
 *
 * @param size   Square board dimension (≥ 8). Cities MUST be
 *               in-bounds.
 * @param cities Each tuple: `[x, y, owner]`. All owners must
 *               be valid `PlayerId` (1..4). Duplicate placements
 *               on the same cell are rejected.
 * @returns Frozen `Board` ready to pass to `createWorld`.
 * @throws If `size < 8`, any city is out of bounds, any owner
 *         is not a valid `PlayerId`, or two cities share a
 *         cell.
 */
function buildFlatBoard(
  size: number,
  cities: ReadonlyArray<readonly [x: number, y: number, owner: PlayerId]>,
): Board {
  if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
    throw new Error(`buildFlatBoard: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`);
  }

  const cellToCity = new Map<number, readonly [number, number, number]>();
  for (const [cx, cy, owner] of cities) {
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) {
      throw new Error(
        `buildFlatBoard: city coords must be integers (got [${String(cx)}, ${String(cy)}])`,
      );
    }
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) {
      throw new Error(`buildFlatBoard: city [${cx}, ${cy}] out of bounds for size ${size}`);
    }
    if (owner !== 1 && owner !== 2 && owner !== 3 && owner !== 4) {
      throw new Error(`buildFlatBoard: city owner must be 1..4 (got ${String(owner)})`);
    }
    const key = cy * size + cx;
    if (cellToCity.has(key)) {
      throw new Error(`buildFlatBoard: duplicate city at [${cx}, ${cy}] (cell index ${key})`);
    }
    cellToCity.set(key, [cx, cy, owner]);
  }

  const cells: Cell[] = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells[y * size + x] = { x, y, elevation: 0, terrain: 'land' };
    }
  }

  const cityPlacements: CityPlacement[] = cities.map(([x, y, owner]) => ({
    cell: { x, y },
    owner,
  }));

  return {
    width: size,
    height: size,
    cells: Object.freeze(cells),
    cities: Object.freeze(cityPlacements),
  };
}

/**
 * Build a minimal `MatchConfig` for tests. Defaults match the
 * engine's `ENGINE_CONSTANTS` and the spec Assumptions (32×32
 * board, 4 Hz tick rate, visibility radius 4).
 *
 * @param size         Square board dimension. Must equal
 *                     `width` and `height` in the board passed
 *                     to `createWorld`.
 * @param playerCount  Player count (2, 3, or 4 per engine
 *                     FR-019). v1 ships 2-player end-to-end.
 * @param seed         PRNG seed. Defaults to 42 (the engine's
 *                     conventional "magic" seed).
 * @returns Frozen `MatchConfig` ready to pass to `createWorld`.
 */
function buildMatchConfig(size: number, playerCount: 2 | 3 | 4, seed = 42): MatchConfig {
  return Object.freeze({
    boardSize: size,
    playerCount,
    tickIntervalMs: 250,
    seed,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
  });
}

/**
 * Place explicit troop stacks on a fresh `WorldState` clone.
 * Returns a new `WorldState` (does not mutate the input).
 * Cities are not touched.
 *
 * @param state  The `WorldState` to clone and modify.
 * @param width  Board width (for bounds checks).
 * @param size   Square board dimension (= width = height).
 * @param troops Each tuple: `[x, y, playerId, count]`.
 *               `count` MUST be a positive integer; `count = 0`
 *               is rejected (a "zero-troop" stack is by
 *               definition not a viewer and is the spec's "no
 *               memory" test edge case — see Q-F03).
 * @returns New `WorldState` with the same arrays as `state`
 *         except `troopCounts` and `troopOwners` mutated to
 *         reflect the placements.
 */
function placeTroops(
  state: WorldState,
  size: number,
  troops: ReadonlyArray<readonly [x: number, y: number, player: PlayerId, count: number]>,
): WorldState {
  const newCounts = new Uint32Array(state.troopCounts);
  const newOwners = new Uint8Array(state.troopOwners);

  for (const [tx, ty, player, count] of troops) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
      throw new Error(
        `placeTroops: troop coords must be integers (got [${String(tx)}, ${String(ty)}])`,
      );
    }
    if (tx < 0 || tx >= size || ty < 0 || ty >= size) {
      throw new Error(`placeTroops: troop [${tx}, ${ty}] out of bounds for size ${size}`);
    }
    if (player !== 1 && player !== 2 && player !== 3 && player !== 4) {
      throw new Error(`placeTroops: troop player must be 1..4 (got ${String(player)})`);
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(
        `placeTroops: troop count must be a positive integer (got ${String(count)} at [${tx}, ${ty}])`,
      );
    }
    const idx = ty * size + tx;
    newCounts[idx] = count;
    newOwners[idx] = player;
  }

  return {
    troopCounts: newCounts,
    troopOwners: newOwners,
    pipeMasks: new Uint8Array(state.pipeMasks),
    reservesPct: new Uint8Array(state.reservesPct),
    cityOwners: new Uint8Array(state.cityOwners),
  };
}

/**
 * Build a fresh `World` with a flat board, no cities, no
 * troops, and the requested player count. Cheapest default for
 * fog tests that don't care about the board's contents.
 *
 * The returned `World` is a *new* `World` object (not the
 * engine's frozen one) so tests can mutate `state` freely
 * without affecting other tests.
 *
 * @param size         Square board dimension (≥ 8).
 * @param playerCount  Player count (2, 3, or 4).
 * @param seed         PRNG seed. Defaults to 42.
 * @returns Frozen-ish `World` with empty state.
 */
export function buildSmallWorld(size: number, playerCount: 2 | 3 | 4, seed = 42): World {
  const config = buildMatchConfig(size, playerCount, seed);
  const board = buildFlatBoard(size, []);
  return createWorld(config, board);
}

/**
 * Build a `World` with explicit troop stacks placed on a flat
 * board (no cities). The state's `troopCounts` and
 * `troopOwners` typed arrays are populated from the `troops`
 * argument. Other state arrays (pipes, reserves, cityOwners)
 * are cloned from the empty `World` returned by `createWorld`.
 *
 * The engine's `createWorld` is used as the source of truth
 * for the `World` shape (players, config, board, rng state).
 * The state arrays are then re-allocated to a fresh, mutable
 * copy with the troop placements applied. This is the same
 * pattern the engine's own tests use to script deterministic
 * scenarios (see `packages/engine/tests/unit/production.test.ts`).
 *
 * @param size         Square board dimension (≥ 8).
 * @param troops       Each tuple: `[x, y, playerId, count]`.
 *                     `count` MUST be a positive integer.
 * @param playerCount  Player count (2, 3, or 4). Defaults to
 *                     2 (the v1 v1-shipped scenario).
 * @param seed         PRNG seed. Defaults to 42.
 * @returns A `World` with the troop placements applied.
 * @throws If `size < 8`, any troop coord is out of bounds, any
 *         playerId is invalid, or any count is ≤ 0.
 */
export function buildWorldWithTroops(
  size: number,
  troops: ReadonlyArray<readonly [x: number, y: number, player: PlayerId, count: number]>,
  playerCount: 2 | 3 | 4 = 2,
  seed = 42,
): World {
  const base = buildSmallWorld(size, playerCount, seed);
  const newState = placeTroops(base.state, size, troops);
  return {
    ...base,
    state: newState,
  };
}

/**
 * Build a `World` with explicit city placements on a flat
 * board (no troops). The cities are encoded into both the
 * `board.cities` field (for engine read helpers like `getCell`)
 * and the `state.cityOwners` flat array (for fog's `forEachCell`
 * / `getCell` consumers).
 *
 * The returned world is otherwise empty (no troops, no pipes,
 * no reserves) so the test can script its own state from
 * scratch.
 *
 * @param size         Square board dimension (≥ 8).
 * @param cities       Each tuple: `[x, y, playerId]`. All
 *                     owners must be valid `PlayerId`.
 * @param playerCount  Player count (2, 3, or 4). Defaults to
 *                     2.
 * @param seed         PRNG seed. Defaults to 42.
 * @returns A `World` with the city placements applied.
 * @throws If `size < 8`, any city is out of bounds, or any
 *         playerId is invalid.
 */
export function buildWorldWithCities(
  size: number,
  cities: ReadonlyArray<readonly [x: number, y: number, player: PlayerId]>,
  playerCount: 2 | 3 | 4 = 2,
  seed = 42,
): World {
  const config = buildMatchConfig(size, playerCount, seed);
  const board = buildFlatBoard(size, cities);
  return createWorld(config, board);
}

/**
 * Build a `World` whose board is all land EXCEPT the given water
 * cells (`terrain: 'water'`). Used by Q-F08's viewer-on-water edge
 * case: vision is computed from troop positions only — water does
 * NOT block Chebyshev range expansion (spec Assumptions).
 *
 * @param size        Square board dimension (≥ 8).
 * @param waterCells  Coords to mark as water. Must be in-bounds;
 *                    duplicates are rejected.
 * @param troops      Optional troop placements
 *                    (`[x, y, playerId, count][]`), applied after
 *                    the board is built.
 * @param playerCount Player count (2, 3, or 4). Defaults to 2.
 * @param seed        PRNG seed. Defaults to 42.
 * @returns A `World` with the water cells (and optional troops).
 * @throws If `size < 8`, any coord is out of bounds or duplicated,
 *         or any troop placement is invalid.
 */
export function buildWorldWithWater(
  size: number,
  waterCells: readonly Coord[],
  troops: readonly (readonly [x: number, y: number, player: PlayerId, count: number])[] = [],
  playerCount: 2 | 3 | 4 = 2,
  seed = 42,
): World {
  if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
    throw new Error(
      `buildWorldWithWater: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`,
    );
  }
  const seen = new Set<number>();
  for (const coord of waterCells) {
    if (coord.x < 0 || coord.x >= size || coord.y < 0 || coord.y >= size) {
      throw new Error(
        `buildWorldWithWater: water cell [${String(coord.x)}, ${String(coord.y)}] out of bounds for size ${size}`,
      );
    }
    const key = coord.y * size + coord.x;
    if (seen.has(key)) {
      throw new Error(
        `buildWorldWithWater: duplicate water cell [${String(coord.x)}, ${String(coord.y)}]`,
      );
    }
    seen.add(key);
  }

  const config = buildMatchConfig(size, playerCount, seed);
  const cells: Cell[] = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells[y * size + x] = seen.has(y * size + x)
        ? { x, y, elevation: 0, terrain: 'water' }
        : { x, y, elevation: 0, terrain: 'land' };
    }
  }
  const board: Board = {
    width: size,
    height: size,
    cells: Object.freeze(cells),
    cities: Object.freeze([]),
  };
  const base = createWorld(config, board);
  if (troops.length === 0) {
    return base;
  }
  const newState = placeTroops(base.state, size, troops);
  return { ...base, state: newState };
}

/**
 * Return a copy of `world` whose match config declares the given
 * visibility radius. Used by quickstart scenarios that pin a
 * specific scenario radius (e.g., Q-F01's Chebyshev range 3) while
 * the default fixture config carries the engine default (4).
 *
 * The input world is not mutated; `computePlayerView` /
 * `computeVisibleSet` read the radius from `world.config`, so the
 * returned copy drives both functions consistently.
 *
 * @param world  The source world.
 * @param radius The visibility radius for the copy's config.
 * @returns A new `World` with the overridden config.
 */
export function withVisibilityRadius(world: World, radius: number): World {
  return {
    ...world,
    config: Object.freeze({
      boardSize: world.config.boardSize,
      playerCount: world.config.playerCount,
      tickIntervalMs: world.config.tickIntervalMs,
      seed: world.config.seed,
      visibilityRadius: radius,
    }),
  };
}

/**
 * Re-export the engine's `Player`, `Coord`, and `Cell` types
 * for fixture consumers that need them. Centralizing the
 * re-exports here keeps the fixture file's import surface
 * compact (test files can `import { ... } from
 * './fixtures/world'`).
 */
export type { Coord, Player };
