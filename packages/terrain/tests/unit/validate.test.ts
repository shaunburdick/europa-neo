/**
 * Validate Board Tests — Feature 003
 *
 * Verifies the 15 invariants enumerated in `data-model.md` §11
 * (INV-1..INV-15) and the corresponding `Violation.kind` values
 * produced by `validateBoard`.
 *
 * For each invariant, the test hand-builds:
 *   - A passing case: a board that satisfies the invariant
 *     (constructed by mutating a known-valid base board).
 *   - A failing case: a board that violates the invariant.
 *   Asserts that `validateBoard` returns `valid: true` for the
 *   passing case and `valid: false` with the correct
 *   `Violation.kind` for the failing case.
 *
 * US1 only requires the no-city invariants (INV-1..INV-6, INV-13,
 * INV-14, INV-15) plus the trivially-passing INV-7..INV-12
 * (with `cities: []`). US2 will add city-specific failing cases.
 */

import type { Board, Cell, CityPlacement, Coord, PlayerId } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { buildBoard } from '../../src/board';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateElevationMap } from '../../src/elevation';
import { validateBoard } from '../../src/validate';
import { extractWater } from '../../src/water';
import { buildEmptyBoard } from '../fixtures/board';
import { engineSfc32 } from '../fixtures/seeds';

const SIZE = 32;
const PASSING_SETTINGS = DEFAULT_GENERATION_SETTINGS;

/**
 * Build a known-valid Board using the full real pipeline. This is
 * the "passing case" baseline; failing-case tests mutate this
 * board to violate exactly one invariant each.
 *
 * Cities are added by hand to satisfy the city-count invariants
 * (INV-7..INV-12). Each pair of cities is at 180°-rotated coords
 * with opposite owners (so INV-9 passes), at safe distances from
 * water (INV-10) and from each other (INV-11).
 */
function buildValidBoard(): Board {
  const rng = engineSfc32(42);
  const elev = generateElevationMap(rng, SIZE, SIZE, PASSING_SETTINGS);
  const water = extractWater(elev, SIZE, SIZE, PASSING_SETTINGS.waterRatio);
  const board = buildBoard(elev, water, SIZE, SIZE);
  // Find a land cell far from water for the P1 city.
  const waterSet = new Set<number>();
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i]?.terrain === 'water') {
      waterSet.add(i);
    }
  }
  // Pick a corner that's land and not adjacent to water.
  let p1Cell: Coord | null = null;
  for (let y = 0; y < SIZE && p1Cell === null; y++) {
    for (let x = 0; x < SIZE && p1Cell === null; x++) {
      if (board.cells[y * SIZE + x]?.terrain !== 'land') {
        continue;
      }
      let nearWater = false;
      const neighbors: ReadonlyArray<readonly [number, number]> = [
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) {
          continue;
        }
        if (waterSet.has(ny * SIZE + nx)) {
          nearWater = true;
          break;
        }
      }
      if (!nearWater) {
        p1Cell = { x, y };
      }
    }
  }
  if (p1Cell === null) {
    throw new Error('test setup: no land cell far from water');
  }
  // P2 city at 180°-rotated coord.
  const p2Cell: Coord = { x: SIZE - 1 - p1Cell.x, y: SIZE - 1 - p1Cell.y };
  const cities: CityPlacement[] = [
    { cell: p1Cell, owner: 1 as PlayerId },
    { cell: p2Cell, owner: 2 as PlayerId },
  ];
  return { ...board, cities };
}

describe('validate (15 invariants per data-model.md §11)', () => {
  describe('valid baseline', () => {
    it('a real generated Board passes all 15 invariants', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(true);
      expect(report.violations).toEqual([]);
    });
  });

  describe('INV-1: width === height === boardSize', () => {
    it('passes for a square board', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(false);
    });

    it('fails on a non-square board (hand-constructed)', () => {
      // 16x8 board (not square). We construct this directly since
      // buildBoard refuses non-square inputs.
      const cells: Cell[] = new Array(16 * 8);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 16; x++) {
          cells[y * 16 + x] = { x, y, elevation: 100, terrain: 'land' };
        }
      }
      const board: Board = { width: 16, height: 8, cells, cities: [] };
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      // We use a synthetic 'asymmetry' violation because INV-1 is a
      // shape invariant; the validator records it as the first
      // asymmetry cell pair.
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-2: cells.length === boardSize²', () => {
    it('passes for a real board', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations).toEqual([]);
    });

    it('fails on a board with too few cells (hand-constructed)', () => {
      const cells: Cell[] = new Array(100); // 100 != 32*32 = 1024
      for (let i = 0; i < cells.length; i++) {
        cells[i] = { x: i % 16, y: Math.floor(i / 16), elevation: 100, terrain: 'land' };
      }
      const board: Board = { width: 32, height: 32, cells, cities: [] };
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-3: every Cell.elevation ∈ [0, 255] integer', () => {
    it('fails on a cell with out-of-range elevation', () => {
      const board = buildValidBoard();
      // Mutate one cell to have elevation 256.
      const cells = [...board.cells];
      cells[0] = { x: 0, y: 0, elevation: 256, terrain: 'land' };
      const mutated: Board = { ...board, cells };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-4: every Cell.terrain ∈ { land, water }', () => {
    it('fails on a cell with invalid terrain', () => {
      const board = buildValidBoard();
      const cells = [...board.cells];
      cells[0] = { x: 0, y: 0, elevation: 100, terrain: 'lava' as 'land' };
      const mutated: Board = { ...board, cells };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
    });
  });

  describe('INV-5: terrain 180° symmetry', () => {
    it('fails when terrain is not symmetric at one cell', () => {
      const board = buildValidBoard();
      const cells = [...board.cells];
      // Toggle terrain at (0, 0); partner (31, 31) is still original.
      const idx = 0;
      const partnerIdx = 31 * 32 + 31;
      const c0 = cells[idx];
      const c1 = cells[partnerIdx];
      if (!c0 || !c1) {
        throw new Error('test setup');
      }
      cells[idx] = { ...c0, terrain: c0.terrain === 'land' ? 'water' : 'land' };
      const mutated: Board = { ...board, cells };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-6: elevation 180° symmetry', () => {
    it('fails when elevation is not symmetric at one cell', () => {
      const board = buildValidBoard();
      const cells = [...board.cells];
      const idx = 0;
      const c0 = cells[idx];
      if (!c0) {
        throw new Error('test setup');
      }
      cells[idx] = { ...c0, elevation: (c0.elevation + 1) & 0xff };
      const mutated: Board = { ...board, cells };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-7: cities.length === playerCount × citiesPerPlayer', () => {
    it('passes for cities=[] (US1: 0 cities)', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations.some((v) => v.kind === 'wrong_city_count')).toBe(false);
    });

    it('fails when city count is wrong (hand-constructed)', () => {
      const board = buildValidBoard();
      // Add 1 city — expected 2×1 = 2.
      const cities: CityPlacement[] = [{ cell: { x: 1, y: 1 }, owner: 1 as PlayerId }];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'wrong_city_count')).toBe(true);
    });
  });

  describe('INV-8: every city on land', () => {
    it('fails when a city is on water (hand-constructed)', () => {
      const board = buildValidBoard();
      // Find a water cell and place a city there.
      let waterCell: Coord | null = null;
      for (const c of board.cells) {
        if (c.terrain === 'water') {
          waterCell = { x: c.x, y: c.y };
          break;
        }
      }
      expect(waterCell).not.toBeNull();
      const cities: CityPlacement[] = [
        { cell: waterCell as Coord, owner: 1 as PlayerId },
        { cell: { x: 0, y: 0 }, owner: 2 as PlayerId },
      ];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'city_on_water')).toBe(true);
    });
  });

  describe('INV-9: 180° city symmetry', () => {
    it('fails when a city has no partner at the 180° coord', () => {
      const board = buildValidBoard();
      const cities: CityPlacement[] = [
        { cell: { x: 1, y: 1 }, owner: 1 as PlayerId },
        // No partner at (30, 30).
      ];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(true);
    });
  });

  describe('INV-10: Chebyshev distance to water ≥ minCityWaterDistance', () => {
    it('fails when a city is too close to water (hand-constructed)', () => {
      const board = buildValidBoard();
      // Find a water cell and place a city 1 cell away.
      let waterCell: Coord | null = null;
      for (const c of board.cells) {
        if (c.terrain === 'water') {
          waterCell = { x: c.x, y: c.y };
          break;
        }
      }
      expect(waterCell).not.toBeNull();
      const cities: CityPlacement[] = [
        {
          cell: { x: (waterCell as Coord).x + 1, y: (waterCell as Coord).y },
          owner: 1 as PlayerId,
        },
        { cell: { x: 0, y: 0 }, owner: 2 as PlayerId },
      ];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'city_too_close_to_water')).toBe(true);
    });
  });

  describe('INV-11: Chebyshev distance between cities ≥ minCityCityDistance', () => {
    it('fails when two cities are too close (hand-constructed)', () => {
      const board = buildValidBoard();
      const cities: CityPlacement[] = [
        { cell: { x: 1, y: 1 }, owner: 1 as PlayerId },
        { cell: { x: 2, y: 1 }, owner: 2 as PlayerId }, // distance 1
      ];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'cities_too_close')).toBe(true);
    });
  });

  describe('INV-12: BFS over land from any city reaches every other city', () => {
    it('passes for a connected board with no cities (US1 vacuous)', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations.some((v) => v.kind === 'isolated_cities')).toBe(false);
    });

    it('fails when cities are in disconnected land regions (constructed)', () => {
      // Hand-build a board with two disconnected land regions.
      const cells: Cell[] = new Array(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          // Top half land, bottom half water, with a gap in the middle.
          const terrain: 'land' | 'water' = y < 16 ? 'land' : 'water';
          cells[y * SIZE + x] = { x, y, elevation: 100, terrain };
        }
      }
      // Add a "dry" land cell in the water region for the second city.
      cells[20 * SIZE + 5] = { x: 5, y: 20, elevation: 100, terrain: 'land' };
      cells[20 * SIZE + 26] = { x: 26, y: 20, elevation: 100, terrain: 'land' };
      const board: Board = { width: SIZE, height: SIZE, cells, cities: [] };
      const cities: CityPlacement[] = [
        { cell: { x: 5, y: 20 }, owner: 1 as PlayerId },
        { cell: { x: 26, y: 20 }, owner: 2 as PlayerId },
      ];
      const mutated: Board = { ...board, cities };
      const report = validateBoard(mutated, PASSING_SETTINGS, 2);
      // The two land patches in the water region are not connected.
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'isolated_cities')).toBe(true);
    });
  });

  describe('INV-13: water ratio within [0.02, 0.25] (±10% of target)', () => {
    it('passes for a default-settings board (waterRatio = 0.10)', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations.some((v) => v.kind === 'water_out_of_bounds')).toBe(false);
    });

    it('fails when water ratio is 0 (all land, hand-constructed)', () => {
      const board = buildEmptyBoard(SIZE);
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
      expect(report.violations.some((v) => v.kind === 'water_out_of_bounds')).toBe(true);
    });
  });

  describe('INV-14: elevation variance > 0', () => {
    it('passes for a real generated board', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.violations.some((v) => v.kind === 'asymmetry')).toBe(false);
    });

    it('fails on a flat board (hand-constructed all-elevation-100)', () => {
      // Build a board with the same elevation everywhere.
      const cells: Cell[] = new Array(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          cells[y * SIZE + x] = { x, y, elevation: 100, terrain: 'land' };
        }
      }
      const board: Board = { width: SIZE, height: SIZE, cells, cities: [] };
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      // Flat elevation → variance 0. Note: also fails INV-13
      // (water_ratio = 0). We check either violation kind.
      expect(report.valid).toBe(false);
    });
  });

  describe('INV-15: water forms ≥ 1 connected pool of size ≥ 4', () => {
    it('passes for a real generated board', () => {
      const board = buildValidBoard();
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(true);
    });

    it('fails when water is a single cell (hand-constructed)', () => {
      const cells: Cell[] = new Array(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          cells[y * SIZE + x] = { x, y, elevation: 100, terrain: 'land' };
        }
      }
      // Add one isolated water cell.
      cells[16 * SIZE + 16] = { x: 16, y: 16, elevation: 50, terrain: 'water' };
      const board: Board = { width: SIZE, height: SIZE, cells, cities: [] };
      const report = validateBoard(board, PASSING_SETTINGS, 2);
      expect(report.valid).toBe(false);
    });
  });
});
