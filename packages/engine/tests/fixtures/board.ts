/**
 * Test Board Builders — Feature 001
 *
 * Test-only helpers for constructing small, well-defined `Board` values
 * without invoking feature 003 (terrain generation). NOT exported from
 * the engine package barrel — fixtures live under `tests/` per the
 * vitest config and the package's `exports` map.
 *
 * Two flavors:
 *   - `buildSmallBoard` — flat board (all land, elevation 0). Cheap
 *     default for tests that don't care about slope (US1 production,
 *     US2 combat, US3 decay in flat-edge cases).
 *   - `buildBoardWithElevation` — same shape but with per-cell
 *     elevation, cycling through a caller-supplied map. Used by US1
 *     slope-flow tests (Q-003) and anywhere FR-007's elevation delta
 *     matters.
 *
 * Both builders validate inputs and throw on violations — fail fast,
 * fail loud, easy-to-diagnose test failures.
 */

import type { Board, Cell, CityPlacement, PlayerId } from '../../src/types';

/** Minimum board size used across the engine's quickstart tests. */
const MIN_BOARD_SIZE = 8;

/**
 * Build a flat, all-land, elevation-0 board with the given city
 * placements. Use for tests that don't exercise slope.
 *
 * @param size   Square board dimension (≥ 8). Cities MUST be in-bounds.
 * @param cities Each tuple: `[x, y, owner]`. All owners must be valid
 *               PlayerId (1..4). Duplicate placements on the same cell
 *               are rejected.
 * @returns Frozen `Board` ready to pass to `createWorld`.
 * @throws If `size < 8`, any city is out of bounds, any owner is not
 *         a valid PlayerId, or two cities share a cell.
 */
export function buildSmallBoard(
  size: number,
  cities: ReadonlyArray<readonly [x: number, y: number, owner: PlayerId]>,
): Board {
  if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
    throw new Error(`buildSmallBoard: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`);
  }

  // Validate cities before building any cells.
  const cellToCity = new Map<number, [number, number, number]>();
  for (const [cx, cy, owner] of cities) {
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) {
      throw new Error(`buildSmallBoard: city coords must be integers (got [${cx}, ${cy}])`);
    }
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) {
      throw new Error(`buildSmallBoard: city [${cx}, ${cy}] out of bounds for size ${size}`);
    }
    if (owner !== 1 && owner !== 2 && owner !== 3 && owner !== 4) {
      throw new Error(`buildSmallBoard: city owner must be 1..4 (got ${String(owner)})`);
    }
    const key = cy * size + cx;
    if (cellToCity.has(key)) {
      throw new Error(`buildSmallBoard: duplicate city at [${cx}, ${cy}] (cell index ${key})`);
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

  return Object.freeze({
    width: size,
    height: size,
    cells: Object.freeze(cells),
    cities: Object.freeze(cityPlacements),
  });
}

/**
 * Build a board with per-cell elevation, cycling through `elevationMap`.
 * All cells are land (water rejection is a separate concern tested
 * elsewhere; these fixtures never include water so test scenarios stay
 * focused). Use for slope-flow tests (Q-003, FR-007).
 *
 * @param size         Square board dimension (≥ 8).
 * @param elevationMap Non-empty list of integer elevations (typically
 *                     0..255 per `data-model.md` §2). The map is
 *                     cycled cell-by-cell in row-major order, so
 *                     `[0, 1, 2]` produces a 3-step staircase.
 * @param cities       City placements in the same `[x, y, owner]` form
 *                     as `buildSmallBoard`.
 * @returns Frozen `Board` with per-cell elevations.
 * @throws Same conditions as `buildSmallBoard`, plus an empty
 *         `elevationMap`.
 */
export function buildBoardWithElevation(
  size: number,
  elevationMap: ReadonlyArray<readonly [number, number]>,
  cities: ReadonlyArray<readonly [x: number, y: number, owner: PlayerId]>,
): Board {
  if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
    throw new Error(
      `buildBoardWithElevation: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`,
    );
  }
  if (elevationMap.length === 0) {
    throw new Error('buildBoardWithElevation: elevationMap must be non-empty');
  }

  const cellToCity = new Map<number, [number, number, number]>();
  for (const [cx, cy, owner] of cities) {
    if (!Number.isInteger(cx) || !Number.isInteger(cy)) {
      throw new Error(`buildBoardWithElevation: city coords must be integers (got [${cx}, ${cy}])`);
    }
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) {
      throw new Error(
        `buildBoardWithElevation: city [${cx}, ${cy}] out of bounds for size ${size}`,
      );
    }
    if (owner !== 1 && owner !== 2 && owner !== 3 && owner !== 4) {
      throw new Error(`buildBoardWithElevation: city owner must be 1..4 (got ${String(owner)})`);
    }
    const key = cy * size + cx;
    if (cellToCity.has(key)) {
      throw new Error(
        `buildBoardWithElevation: duplicate city at [${cx}, ${cy}] (cell index ${key})`,
      );
    }
    cellToCity.set(key, [cx, cy, owner]);
  }

  // Build a fresh `cells` array. We don't reuse `buildSmallBoard`'s
  // result because we need per-cell elevation (not the flat 0). The
  // 2-tuple shape of `elevationMap` is `[elevation, _reserved]` —
  // the second slot is for future extension (terrain flags, etc.)
  // and is currently ignored; the prompt guarantees "all land".
  const cells: Cell[] = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const elevPair = elevationMap[idx % elevationMap.length];
      const elevation = elevPair ? (elevPair[0] ?? 0) : 0;
      cells[idx] = { x, y, elevation, terrain: 'land' };
    }
  }

  const cityPlacements: CityPlacement[] = cities.map(([x, y, owner]) => ({
    cell: { x, y },
    owner,
  }));

  return Object.freeze({
    width: size,
    height: size,
    cells: Object.freeze(cells),
    cities: Object.freeze(cityPlacements),
  });
}
