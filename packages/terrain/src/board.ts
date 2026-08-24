/**
 * Board Builder — Feature 003
 *
 * Converts the flat `Uint8Array` intermediates (elevation + water
 * mask) into the engine's `Cell[]` shape and wraps it in a
 * `Board` value. The builder is the boundary between terrain
 * internals and the engine's type contract (`@europa/engine`).
 *
 * INV-1..INV-4 are enforced by the builder (verified by the unit
 * tests in `tests/unit/board.test.ts`):
 *   - `width === height === boardSize` (square)
 *   - `cells.length === boardSize²`
 *   - every `Cell.elevation` is integer in `[0, 255]`
 *   - every `Cell.terrain` is `'land' | 'water'`
 *
 * `assertBoardMatchesConfig` mirrors the engine-side check: it
 * throws on any structural mismatch (used as a defensive layer by
 * `createWorld` and by feature 006 when loading a stored Board).
 */

import type { Board, Cell, MatchConfig } from '@europa/engine';
import { TERRAIN_CONSTANTS } from './constants';

/**
 * Build a `Board` from the two flat intermediates produced by the
 * elevation and water phases.
 *
 * @param elev   Elevation `Uint8Array` of length `width * height`.
 *               Each entry is a uint8 in `[0, 255]`.
 * @param water  Water-mask `Uint8Array` of identical length.
 *               `1` = water, `0` = land.
 * @param width  Board width.
 * @param height Board height. Terrain only generates square boards,
 *               so `width === height` is expected.
 * @returns A frozen `Board` with `cities: []` (cities are added by
 *          the US2 city-placement phase).
 */
export function buildBoard(
  elev: Uint8Array,
  water: Uint8Array,
  width: number,
  height: number,
): Board {
  if (elev.length !== water.length) {
    throw new Error(
      `buildBoard: elev.length (${String(elev.length)}) must equal water.length (${String(water.length)})`,
    );
  }
  if (elev.length !== width * height) {
    throw new Error(
      `buildBoard: elev.length (${String(elev.length)}) must equal width × height (${String(width * height)})`,
    );
  }
  const cells: Cell[] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const elevation = elev[idx] ?? 0;
      const terrain: 'land' | 'water' = (water[idx] ?? 0) === 1 ? 'water' : 'land';
      cells[idx] = { x, y, elevation, terrain };
    }
  }
  return Object.freeze({
    width,
    height,
    cells: Object.freeze(cells),
    cities: Object.freeze([]),
  });
}

/**
 * Assert that a `Board` is structurally compatible with the engine's
 * `MatchConfig`. Throws on any mismatch (square shape, boardSize
 * match, cell count, every cell's `terrain` is a valid string,
 * every `CityPlacement` is on land).
 *
 * This is a defensive layer. The engine's own `createWorld` performs
 * similar checks; this function lets feature 006 (matchmaking)
 * pre-validate a Board it has loaded from storage (e.g., a replay)
 * before handing it to `createWorld`.
 *
 * @param board  The `Board` to validate.
 * @param config The `MatchConfig` to check against.
 * @throws If the board does not match the config.
 */
export function assertBoardMatchesConfig(
  board: Readonly<Board>,
  config: Readonly<MatchConfig>,
): void {
  // Square shape.
  if (board.width !== board.height) {
    throw new Error(
      `assertBoardMatchesConfig: board is not square (width=${String(board.width)}, height=${String(board.height)})`,
    );
  }
  // boardSize match.
  if (board.width !== config.boardSize) {
    throw new Error(
      `assertBoardMatchesConfig: board.width (${String(board.width)}) !== config.boardSize (${String(config.boardSize)})`,
    );
  }
  // Cell count.
  if (board.cells.length !== config.boardSize * config.boardSize) {
    throw new Error(
      `assertBoardMatchesConfig: board.cells.length (${String(board.cells.length)}) !== config.boardSize² (${String(config.boardSize * config.boardSize)})`,
    );
  }
  // Every cell has a valid terrain.
  for (let i = 0; i < board.cells.length; i++) {
    const cell = board.cells[i];
    if (!cell) {
      throw new Error(`assertBoardMatchesConfig: board.cells[${String(i)}] is missing`);
    }
    if (cell.terrain !== 'land' && cell.terrain !== 'water') {
      throw new Error(
        `assertBoardMatchesConfig: cell at (${String(cell.x)},${String(cell.y)}) has invalid terrain '${String(cell.terrain)}'`,
      );
    }
    if (
      !Number.isInteger(cell.elevation) ||
      cell.elevation < TERRAIN_CONSTANTS.minElevation ||
      cell.elevation > TERRAIN_CONSTANTS.maxElevation
    ) {
      throw new Error(
        `assertBoardMatchesConfig: cell at (${String(cell.x)},${String(cell.y)}) has invalid elevation ${String(cell.elevation)}`,
      );
    }
  }
  // Every city is on a land cell.
  for (const city of board.cities) {
    const idx = city.cell.y * board.width + city.cell.x;
    const cell = board.cells[idx];
    if (!cell) {
      throw new Error(
        `assertBoardMatchesConfig: city at (${String(city.cell.x)},${String(city.cell.y)}) is outside the board`,
      );
    }
    if (cell.terrain !== 'land') {
      throw new Error(
        `assertBoardMatchesConfig: city at (${String(city.cell.x)},${String(city.cell.y)}) is on a '${cell.terrain}' cell (must be 'land')`,
      );
    }
  }
}
