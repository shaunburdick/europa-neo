/**
 * Balance Integration Test — Feature 003
 *
 * SC-002 / SC-004 statistical suite. 100 trials using `goldenSeeds(100)`.
 *
 * For each seed, `generateBoard` is called and the result is checked
 * against:
 *   (a) INV-14: elevation variance > 100
 *   (b) US3 AC-1 / FR-008: water ratio within ±10% of target
 *   (c) FR-004 / INV-5/6: every cell is 180°-symmetric to its partner
 *       (both elevation and terrain)
 *   (d) FR-003 / INV-15: largest water pool >= 4
 *
 * For US1 (`cities: []`), city-specific assertions are deferred
 * to Phase 4 (US2).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const TARGET_WATER_RATIO = DEFAULT_GENERATION_SETTINGS.waterRatio;
const TOLERANCE = 0.1; // ±10% of target (US3 AC-1)

describe('balance (SC-002 / SC-004)', () => {
  it('100 trials: every generated Board satisfies the balance invariants', () => {
    const seeds = goldenSeeds(100);
    let elevationVarianceFailures = 0;
    let waterRatioFailures = 0;
    let symmetryFailures = 0;
    let waterPoolFailures = 0;

    for (const seed of seeds) {
      const req = {
        boardSize: 32,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
      };
      const result = generateBoard(req);
      const board = result.board;
      const SIZE = board.width;

      // (a) INV-14: elevation variance > 100.
      let elevSum = 0;
      for (const cell of board.cells) elevSum += cell.elevation;
      const elevMean = elevSum / board.cells.length;
      let elevSqSum = 0;
      for (const cell of board.cells) {
        const d = cell.elevation - elevMean;
        elevSqSum += d * d;
      }
      const elevVar = elevSqSum / board.cells.length;
      if (elevVar <= 100) elevationVarianceFailures++;

      // (b) US3 AC-1 / INV-13: water ratio within ±10% of target.
      let waterCount = 0;
      for (const cell of board.cells) {
        if (cell.terrain === 'water') waterCount++;
      }
      const waterRatio = waterCount / board.cells.length;
      if (Math.abs(waterRatio - TARGET_WATER_RATIO) > TOLERANCE * TARGET_WATER_RATIO) {
        waterRatioFailures++;
      }

      // (c) FR-004 / INV-5/6: 180° symmetry on every cell.
      let symmetric = true;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const cell = board.cells[y * SIZE + x];
          const partner = board.cells[(SIZE - 1 - y) * SIZE + (SIZE - 1 - x)];
          if (!cell || !partner) {
            symmetric = false;
            break;
          }
          if (cell.terrain !== partner.terrain || cell.elevation !== partner.elevation) {
            symmetric = false;
            break;
          }
        }
        if (!symmetric) break;
      }
      if (!symmetric) symmetryFailures++;

      // (d) INV-15: largest water pool >= 4.
      const visited = new Uint8Array(board.cells.length);
      let largestPool = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const cell = board.cells[i];
          if (cell?.terrain !== 'water' || visited[i] === 1) continue;
          let poolSize = 0;
          const queue: number[] = [i];
          visited[i] = 1;
          while (queue.length > 0) {
            const idx = queue.shift();
            if (idx === undefined) break;
            poolSize++;
            const cy = Math.floor(idx / SIZE);
            const cx = idx - cy * SIZE;
            const neighbors: ReadonlyArray<readonly [number, number]> = [
              [cx, cy - 1],
              [cx, cy + 1],
              [cx - 1, cy],
              [cx + 1, cy],
            ];
            for (const [nx, ny] of neighbors) {
              if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
              const ni = ny * SIZE + nx;
              const ncell = board.cells[ni];
              if (ncell?.terrain === 'water' && visited[ni] === 0) {
                visited[ni] = 1;
                queue.push(ni);
              }
            }
          }
          if (poolSize > largestPool) largestPool = poolSize;
        }
      }
      if (largestPool < 4) waterPoolFailures++;
    }

    // All four invariants must hold on EVERY trial.
    expect(elevationVarianceFailures).toBe(0);
    expect(waterRatioFailures).toBe(0);
    expect(symmetryFailures).toBe(0);
    expect(waterPoolFailures).toBe(0);
  });
});
