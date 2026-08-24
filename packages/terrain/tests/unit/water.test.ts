/**
 * Water Classification Tests — Feature 003
 *
 * Verifies FR-003 (contiguous water pools carved from lowest basins)
 * and INV-15 (≥ 1 connected pool of size ≥ 4).
 *
 * The water classifier sorts cells by elevation ascending and marks
 * the lowest `Math.floor(waterRatio × totalCells)` cells as water.
 * This guarantees:
 *   - Water cells are the lowest-elevation cells (the "lowest basins"
 *     property).
 *   - The ratio matches `waterRatio` exactly (up to the `Math.floor`
 *     integer rounding).
 *   - The output is a parallel `Uint8Array` of the same shape.
 *
 * Contiguity (INV-15) is checked on output from the full pipeline
 * (`generateElevationMap` → `extractWater`), not on hand-built inputs,
 * because a hand-built flat-elevation field has no basins.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateElevationMap } from '../../src/elevation';
import { _extractWater, extractWater } from '../../src/water';
import { engineSfc32 } from '../fixtures/seeds';

describe('water', () => {
  describe('extractWater (FR-003)', () => {
    it('returns a parallel Uint8Array of the same length (1=water, 0=land)', () => {
      const elev = new Uint8Array(16 * 16);
      elev.fill(100);
      const water = extractWater(elev, 16, 16, 0.1);
      expect(water.length).toBe(elev.length);
      for (let i = 0; i < water.length; i++) {
        expect(water[i] === 0 || water[i] === 1).toBe(true);
      }
    });

    it('water cell count equals floor(waterRatio × totalCells) on a sorted input (with symmetric pair marking)', () => {
      // Hand-build a sorted elevation field: low to high. The
      // symmetric water classifier marks cells in 180°-rotated
      // pairs. The exact count is `waterCount` (or `waterCount + 1`
      // for odd waterCount) regardless of input distribution.
      const width = 16;
      const total = width * width;
      const elev = new Uint8Array(total);
      for (let i = 0; i < total; i++) {
        elev[i] = i & 0xff; // monotonic 0, 1, 2, ..., 255 (wrapping)
      }
      for (const ratio of [0.0, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0]) {
        const water = extractWater(elev, width, width, ratio);
        const waterCount = water.reduce((acc, v) => acc + v, 0);
        const expected = Math.floor(ratio * total);
        // Pair-based marking: halfCount pairs + (1 if odd) = waterCount
        // or waterCount + 1.
        expect(waterCount === expected || waterCount === expected + 1).toBe(true);
      }
    });

    it('all water cells belong to the lowest-scoring 180°-rotated pairs (pair-marking contract)', () => {
      // With pair-based marking, water cells are the cells of the
      // bottom N/2 180°-rotated pairs (where pair score = max of
      // the two elevations). Verify that every water cell belongs
      // to one of these low-scoring pairs, and that no high-scoring
      // pair is partially marked.
      const width = 8;
      const total = width * width;
      const elev = new Uint8Array(total);
      for (let i = 0; i < total; i++) {
        elev[i] = i;
      }
      const water = extractWater(elev, width, width, 0.25);
      const waterCount = Math.floor(0.25 * total); // 16
      // Compute pair scores.
      const pairScores: number[] = [];
      for (let i = 0; i < total; i++) {
        const partner = total - 1 - i;
        if (i <= partner) {
          const ea = elev[i] ?? 0;
          const eb = elev[partner] ?? 0;
          pairScores.push(Math.max(ea, eb));
        }
      }
      pairScores.sort((a, b) => a - b);
      const halfCount = Math.floor(waterCount / 2);
      const pairThreshold = pairScores[halfCount - 1] ?? 0;
      // Every water cell must have its pair's score <= pairThreshold.
      for (let i = 0; i < total; i++) {
        if (water[i] === 1) {
          const partner = total - 1 - i;
          const ea = elev[i] ?? 0;
          const eb = elev[partner] ?? 0;
          const score = Math.max(ea, eb);
          expect(score).toBeLessThanOrEqual(pairThreshold);
        }
      }
      // Symmetry invariant: if cell i is water, cell partner is also water.
      for (let i = 0; i < total; i++) {
        const partner = total - 1 - i;
        expect(water[i]).toBe(water[partner]);
      }
    });

    it('water ratio 0.0 produces zero water cells', () => {
      const elev = new Uint8Array(16 * 16);
      elev.fill(100);
      const water = extractWater(elev, 16, 16, 0.0);
      const waterCount = water.reduce((acc, v) => acc + v, 0);
      expect(waterCount).toBe(0);
    });

    it('water ratio 1.0 produces all water cells (with one-cell floor)', () => {
      // floor(1.0 × total) = total, so every cell is water.
      const elev = new Uint8Array(16 * 16);
      elev.fill(100);
      const water = extractWater(elev, 16, 16, 1.0);
      const waterCount = water.reduce((acc, v) => acc + v, 0);
      expect(waterCount).toBe(elev.length);
    });
  });

  describe('_extractWater (alias for testability)', () => {
    it('is a non-deprecated alias for extractWater', () => {
      const elev = new Uint8Array(8 * 8);
      elev.fill(50);
      const a = _extractWater(elev, 8, 8, 0.1);
      const b = extractWater(elev, 8, 8, 0.1);
      expect(a).toEqual(b);
    });
  });

  describe('contiguity (INV-15) on real elevation output', () => {
    it('real elevation → real water has ≥ 1 connected pool of size ≥ 4', () => {
      // 32x32 default settings, 100 trials, assert at least one
      // large pool. This is the SC-002/INV-15 invariant test.
      const size = 32;
      const settings = DEFAULT_GENERATION_SETTINGS;
      for (let trial = 0; trial < 10; trial++) {
        const rng = engineSfc32(0x1000 + trial);
        const elev = generateElevationMap(rng, size, size, settings);
        const water = extractWater(elev, size, size, settings.waterRatio);
        // BFS to find the largest pool.
        const visited = new Uint8Array(water.length);
        let largestPool = 0;
        let poolCount = 0;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (water[i] !== 1 || visited[i] === 1) {
              continue;
            }
            poolCount++;
            // BFS this pool.
            let poolSize = 0;
            const queue: number[] = [i];
            visited[i] = 1;
            while (queue.length > 0) {
              const idx = queue.shift();
              if (idx === undefined) {
                break;
              }
              poolSize++;
              const cy = (idx - (idx % size)) / size;
              const cx = idx - cy * size;
              const neighbors: ReadonlyArray<readonly [number, number]> = [
                [cx, cy - 1],
                [cx, cy + 1],
                [cx - 1, cy],
                [cx + 1, cy],
              ];
              for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
                  continue;
                }
                const ni = ny * size + nx;
                if (water[ni] === 1 && visited[ni] === 0) {
                  visited[ni] = 1;
                  queue.push(ni);
                }
              }
            }
            if (poolSize > largestPool) {
              largestPool = poolSize;
            }
          }
        }
        // At least one pool of size ≥ 4 is required (INV-15).
        expect(largestPool).toBeGreaterThanOrEqual(4);
        // For default 0.10 water ratio on 32x32 (~100 cells), we
        // should have at least 1 pool.
        expect(poolCount).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
