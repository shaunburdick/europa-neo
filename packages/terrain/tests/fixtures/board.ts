/**
 * Test Board Builders — Feature 003
 *
 * Test-only helpers for constructing small, well-defined `Board`
 * values without invoking the generator. Mirrors the engine's
 * `packages/engine/tests/fixtures/board.ts` pattern, but tuned for
 * terrain tests:
 *
 *   - `buildEmptyBoard(size)` — square flat board, all `land`,
 *     elevation 0, no cities. The "blank canvas" used by tests that
 *     want to assemble a board piece-by-piece.
 *   - `buildFlatElevation(size, value)` — `Uint8Array` of the given
 *     value, all cells equal. Useful for invariant tests on a known
 *     uniform input.
 *   - `buildCellsFromElevation(elev, waterMask)` — convert the two
 *     flat arrays into the engine's `Cell[]` shape. Used by tests
 *     that want to feed specific elevation/water combinations into
 *     `buildBoardFromCells`.
 *   - `buildBoardFromCells(cells, size)` — wrap a `Cell[]` into a
 *     `Board` with the given square dimension.
 *
 * Builders validate inputs and throw on violations — fail fast, fail
 * loud, easy-to-diagnose test failures. They are NOT exported from
 * the terrain package barrel; fixtures live under `tests/` per the
 * vitest config and the package's `exports` map.
 */

import type { Board, Cell, Coord } from '@europa/engine';

/** Minimum board size used across the terrain's quickstart tests. */
const MIN_BOARD_SIZE = 8;

/**
 * Build a flat, all-land, elevation-0 board with no cities.
 *
 * @param size Square board dimension (≥ 8).
 * @returns Frozen `Board` ready to use as a blank canvas in tests.
 * @throws If `size < 8` or `size` is not an integer.
 */
export function buildEmptyBoard(size: number): Board {
    if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
        throw new Error(`buildEmptyBoard: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`);
    }
    const cells: Cell[] = new Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells[y * size + x] = { x, y, elevation: 0, terrain: 'land' };
        }
    }
    return Object.freeze({
        width: size,
        height: size,
        cells: Object.freeze(cells),
        cities: Object.freeze([]),
    });
}

/**
 * Build a `Uint8Array` of length `size * size` filled with `value`.
 *
 * @param size  Square board dimension (≥ 8).
 * @param value Integer in `[0, 255]` to fill every cell with.
 * @returns Fresh `Uint8Array` of length `size * size`, every entry
 *          equal to `value`.
 * @throws If `size < 8`, `size` is not an integer, or `value` is not
 *         an integer in `[0, 255]`.
 */
export function buildFlatElevation(size: number, value: number): Uint8Array {
    if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
        throw new Error(`buildFlatElevation: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`);
    }
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error(`buildFlatElevation: value must be an integer in [0, 255] (got ${String(value)})`);
    }
    const out = new Uint8Array(size * size);
    out.fill(value);
    return out;
}

/**
 * Convert a parallel `Uint8Array` of elevations and a parallel
 * `Uint8Array` of water masks into the engine's `Cell[]` shape.
 *
 * `waterMask[i] === 1` ⇒ cell `i` is water; `0` ⇒ land. (The
 * generator's own `_extractWater` returns this exact shape, so the
 * builder matches.)
 *
 * @param elev      Elevation map (length = width * height).
 * @param waterMask Water mask (same length). 1 = water, 0 = land.
 * @returns `Cell[]` of identical length, with `elevation` from `elev`
 *          and `terrain` derived from `waterMask`.
 * @throws If the two arrays differ in length, either is not a
 *         `Uint8Array`, or any elevation is outside `[0, 255]`.
 */
export function buildCellsFromElevation(elev: Uint8Array, waterMask: Uint8Array): Cell[] {
    if (!(elev instanceof Uint8Array) || !(waterMask instanceof Uint8Array)) {
        throw new Error('buildCellsFromElevation: both arguments must be Uint8Array');
    }
    if (elev.length !== waterMask.length) {
        throw new Error(
            `buildCellsFromElevation: length mismatch (elev=${String(elev.length)}, water=${String(waterMask.length)})`,
        );
    }
    const { length } = elev;
    // Square board: width === height === sqrt(length).
    const size = Math.sqrt(length);
    if (!Number.isInteger(size)) {
        throw new Error(`buildCellsFromElevation: length ${String(length)} is not a perfect square`);
    }
    const cells: Cell[] = new Array(length);
    for (let i = 0; i < length; i++) {
        const elevation = elev[i] ?? 0;
        const terrain: 'land' | 'water' = (waterMask[i] ?? 0) === 1 ? 'water' : 'land';
        const y = Math.floor(i / size);
        const x = i - y * size;
        cells[i] = { x, y, elevation, terrain };
    }
    return cells;
}

/**
 * Wrap a `Cell[]` into a `Board` with the given square dimension.
 *
 * @param cells `Cell[]` of length `size * size` (row-major).
 * @param size  Square board dimension (≥ 8). Must equal `sqrt(cells.length)`.
 * @returns Frozen `Board` with `cities: []`.
 * @throws If `size` is invalid, or `cells.length !== size * size`.
 */
export function buildBoardFromCells(cells: readonly Cell[], size: number): Board {
    if (!Number.isInteger(size) || size < MIN_BOARD_SIZE) {
        throw new Error(`buildBoardFromCells: size must be an integer ≥ ${MIN_BOARD_SIZE} (got ${size})`);
    }
    if (!Array.isArray(cells) || cells.length !== size * size) {
        throw new Error(
            `buildBoardFromCells: cells.length (${String(cells.length)}) must equal size² (${String(size * size)})`,
        );
    }
    return Object.freeze({
        width: size,
        height: size,
        cells: Object.freeze([...cells]),
        cities: Object.freeze([]),
    });
}

// Re-export `Coord` so test files can `import type { Coord }` from the
// fixtures module alongside the builders. (Type-only re-export —
// erased at runtime.)
export type { Coord };
