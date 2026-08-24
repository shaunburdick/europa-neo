/**
 * SC-002 Balance Integration Test — Feature 003 (T050)
 *
 * 200-map balance suite. For every generated Board, all of:
 *
 *   - Water ratio within ±10% of target (US3 AC-1 / FR-008).
 *   - Elevation variance > 100 (US3 AC-2 / INV-14).
 *   - City count exact: `playerCount × citiesPerPlayer` (INV-7).
 *   - Every pair of cities separated by ≥ `minCityCityDistance`
 *     (INV-11).
 *   - Every city separated from water by ≥ `minCityWaterDistance`
 *     (INV-10).
 *   - 180° point symmetry preserved across all layers (INV-5/6/9).
 *
 * Covers SC-002 (100% valid maps) and SC-004 (statistical suite).
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const TARGET_WATER_RATIO = DEFAULT_GENERATION_SETTINGS.waterRatio;
const WATER_RATIO_TOLERANCE = TARGET_WATER_RATIO * 0.1; // ±10% relative
const MIN_ELEVATION_VARIANCE = 100;
const TRIALS = 200;

describe('SC-002 / SC-004 balance (200 maps, every invariant must pass)', () => {
  it('all invariants hold on every trial', { timeout: 20_000 }, () => {
    const seeds = goldenSeeds(TRIALS);

    const failures: Array<{ seed: number; reason: string }> = [];

    for (const seed of seeds) {
      const req = {
        boardSize: 32,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
      };
      const { board } = generateBoard(req);
      const Size = board.width;

      // (a) Elevation variance > 100.
      let elevSum = 0;
      for (const cell of board.cells) {
        elevSum += cell.elevation;
      }
      const elevMean = elevSum / board.cells.length;
      let elevSqSum = 0;
      for (const cell of board.cells) {
        const d = cell.elevation - elevMean;
        elevSqSum += d * d;
      }
      const elevVar = elevSqSum / board.cells.length;
      if (elevVar <= MIN_ELEVATION_VARIANCE) {
        failures.push({ seed, reason: `elevVar=${elevVar.toFixed(2)}` });
        continue;
      }

      // (b) Water ratio within ±10% of target.
      let waterCount = 0;
      for (const cell of board.cells) {
        if (cell.terrain === 'water') {
          waterCount++;
        }
      }
      const waterRatio = waterCount / board.cells.length;
      if (Math.abs(waterRatio - TARGET_WATER_RATIO) > WATER_RATIO_TOLERANCE) {
        failures.push({ seed, reason: `waterRatio=${waterRatio.toFixed(4)}` });
        continue;
      }

      // (c) 180° symmetry on every cell (elevation + terrain).
      let symmetric = true;
      for (let y = 0; y < Size; y++) {
        for (let x = 0; x < Size; x++) {
          const cell = board.cells[y * Size + x];
          const partner = board.cells[(Size - 1 - y) * Size + (Size - 1 - x)];
          if (!cell || !partner) {
            symmetric = false;
            break;
          }
          if (cell.terrain !== partner.terrain || cell.elevation !== partner.elevation) {
            symmetric = false;
            break;
          }
        }
        if (!symmetric) {
          break;
        }
      }
      if (!symmetric) {
        failures.push({ seed, reason: 'asymmetry' });
        continue;
      }

      // (d) City count exactly `playerCount × citiesPerPlayer`.
      const expectedCities = req.playerCount * DEFAULT_GENERATION_SETTINGS.citiesPerPlayer;
      if (board.cities.length !== expectedCities) {
        failures.push({
          seed,
          reason: `cityCount=${board.cities.length} expected=${expectedCities}`,
        });
        continue;
      }

      // (e) Every pair of cities separated by ≥ minCityCityDistance.
      let citySpacingOk = true;
      for (let i = 0; i < board.cities.length; i++) {
        for (let j = i + 1; j < board.cities.length; j++) {
          const a = board.cities[i];
          const b = board.cities[j];
          if (!a || !b) {
            continue;
          }
          const d = Math.max(Math.abs(a.cell.x - b.cell.x), Math.abs(a.cell.y - b.cell.y));
          if (d < DEFAULT_GENERATION_SETTINGS.minCityCityDistance) {
            citySpacingOk = false;
            break;
          }
        }
        if (!citySpacingOk) {
          break;
        }
      }
      if (!citySpacingOk) {
        failures.push({ seed, reason: 'citySpacing' });
        continue;
      }

      // (f) Every city separated from water by ≥ minCityWaterDistance.
      // Build the water coord set once per board.
      const waterSet = new Set<string>();
      for (let i = 0; i < board.cells.length; i++) {
        const c = board.cells[i];
        if (c?.terrain === 'water') {
          waterSet.add(`${String(c.x)},${String(c.y)}`);
        }
      }
      let cityWaterOk = true;
      for (const city of board.cities) {
        // BFS up to minCityWaterDistance; if any water cell is found, fail.
        const minD = DEFAULT_GENERATION_SETTINGS.minCityWaterDistance;
        const visited = new Set<string>([`${String(city.cell.x)},${String(city.cell.y)}`]);
        const queue: Array<{ x: number; y: number; d: number }> = [
          { x: city.cell.x, y: city.cell.y, d: 0 },
        ];
        while (queue.length > 0) {
          const cur = queue.shift();
          if (!cur) {
            break;
          }
          if (cur.d >= minD) {
            continue;
          }
          for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ] as const) {
            const nx = cur.x + dx;
            const ny = cur.y + dy;
            if (nx < 0 || nx >= Size || ny < 0 || ny >= Size) {
              continue;
            }
            const key = `${String(nx)},${String(ny)}`;
            if (visited.has(key)) {
              continue;
            }
            visited.add(key);
            if (waterSet.has(key)) {
              cityWaterOk = false;
              break;
            }
            queue.push({ x: nx, y: ny, d: cur.d + 1 });
          }
          if (!cityWaterOk) {
            break;
          }
        }
        if (!cityWaterOk) {
          break;
        }
      }
      if (!cityWaterOk) {
        failures.push({ seed, reason: 'cityWaterDist' });
      }
    }

    // Failures array should be empty.
    if (failures.length > 0) {
      const sample = failures.slice(0, 5);
      throw new Error(
        `${String(failures.length)} of ${String(TRIALS)} trials failed invariants. First failures: ${JSON.stringify(sample)}`,
      );
    }
    expect(failures.length).toBe(0);
  });
});
