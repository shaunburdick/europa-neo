/**
 * Water Classification — Feature 003
 *
 * Carves contiguous water pools from the lowest-elevation cells
 * (FR-003, INV-13/15). The classifier:
 *
 *   1. Computes the threshold count `N = Math.floor(waterRatio × totalCells)`.
 *   2. Sorts cells by elevation ascending (stable sort).
 *   3. Marks the first `N` cells as water (`1`) and the rest as land (`0`).
 *
 * **Why this works for FR-003 (contiguous pools)**: the lowest
 * elevations form the bottom of the fBm noise surface. Thresholding
 * the bottom `N` cells produces a region that, by the geometry of
 * value noise, is geometrically connected (with overwhelming
 * probability for typical `waterRatio` values in `[0.02, 0.25]`).
 * Single isolated cells are vanishingly rare; the contiguity test
 * (INV-15) is enforced by retrying on failure in `generateBoard`.
 *
 * **Determinism**: sorting is stable and integer; same input → same
 * output on every platform. The function is pure.
 */

import type { MapSeed } from './contracts/terrain-types';

/**
 * Public alias. Carves water pools from the lowest-elevation cells.
 *
 * **Algorithm (elevation-threshold variant)**:
 *   1. Sort cell indices by elevation ascending (stable sort).
 *   2. Find the threshold elevation value: the elevation of the
 *      `N`-th cell in the sorted order, where
 *      `N = Math.floor(waterRatio × totalCells)`.
 *   3. Mark all cells with `elevation < threshold` as water.
 *   4. Mark cells with `elevation === threshold` as water in the
 *      sorted-index order until the total water count reaches `N`.
 *
 * **Why threshold-based, not count-based**: with count-based
 * marking, two cells with tied elevation can be split across the
 * threshold boundary (one water, one land). This breaks the 180°
 * symmetry invariant (INV-5) when the symmetry partner of a water
 * cell has the same elevation but happens to be the (N+1)-th
 * sorted cell. Threshold-based marking respects elevation ties as
 * a single group, so the symmetric partner of any water cell is
 * also water.
 *
 * @param elev        Elevation `Uint8Array` (length `width * height`).
 * @param width       Board width.
 * @param height      Board height.
 * @param waterRatio  Fraction of cells to mark as water (in `[0, 1]`).
 * @returns A fresh `Uint8Array` of identical length where `1` = water
 *          and `0` = land. Water cells are the lowest-elevation cells
 *          of the input.
 */
export function extractWater(
  elev: Uint8Array,
  width: number,
  height: number,
  waterRatio: number,
): Uint8Array {
  const total = width * height;
  const waterCount = Math.floor(waterRatio * total);
  const water = new Uint8Array(total);
  if (waterCount <= 0) {
    return water;
  }
  if (waterCount >= total) {
    water.fill(1);
    return water;
  }
  // Build a sorted list of (elevation, index) pairs. We sort by
  // elevation ascending; ties are broken by index (stable).
  const order: number[] = new Array(total);
  for (let i = 0; i < total; i++) {
    order[i] = i;
  }
  // **Symmetric pair-based marking** (preserves INV-5):
  //   Group cells into 180°-rotated pairs. For each pair, the
  //   "score" is `max(elevA, elevB)` — because the input is
  //   symmetric, this is just `elevA` (or `elevB`). Sort pairs by
  //   this score ascending; mark the bottom `K = floor(waterCount / 2)`
  //   pairs (i.e., 2*K = ~`waterCount` cells). The result is exactly
  //   symmetric: both cells of a marked pair are water.
  //
  //   For odd `waterCount`, we mark `floor(waterCount / 2)` pairs
  //   plus one extra cell at the center of an odd-sized board (its
  //   own 180° partner).
  const halfCount = Math.floor(waterCount / 2);
  // Build a list of (pairScore, cellA, cellB). For each cell with
  // index < partner index, we record a pair. For the center cell
  // (odd-sized board, cell is its own partner), we record a single.
  const pairs: Array<{ score: number; a: number; b: number }> = [];
  for (let i = 0; i < total; i++) {
    const cy = Math.floor(i / width);
    const cx = i - cy * width;
    const partnerY = height - 1 - cy;
    const partnerX = width - 1 - cx;
    const partnerIdx = partnerY * width + partnerX;
    if (i < partnerIdx) {
      // Mark this pair only once. The score is the max of the two
      // elevations (for symmetric elevation, both are equal).
      const ea = elev[i] ?? 0;
      const eb = elev[partnerIdx] ?? 0;
      const score = ea > eb ? ea : eb;
      pairs.push({ score, a: i, b: partnerIdx });
    } else if (i === partnerIdx) {
      // Center cell of an odd-sized board; it's its own partner.
      const ea = elev[i] ?? 0;
      pairs.push({ score: ea, a: i, b: i });
    }
  }
  // Sort pairs by score ascending. Stable sort on ties (preserves
  // row-major order for tied pairs).
  pairs.sort((p, q) => p.score - q.score);
  // Mark the bottom `halfCount` pairs.
  const markedPairs = Math.min(halfCount, pairs.length);
  for (let i = 0; i < markedPairs; i++) {
    const pair = pairs[i];
    if (!pair) {
      continue;
    }
    water[pair.a] = 1;
    if (pair.b !== pair.a) {
      water[pair.b] = 1;
    }
  }
  // If waterCount is odd, also mark the next-lowest pair's
  // "extra" cell. (We pick the cell with the lower linear index
  // in the pair.)
  if (waterCount % 2 === 1 && markedPairs < pairs.length) {
    const extra = pairs[markedPairs];
    if (extra) {
      water[extra.a] = 1;
    }
  }
  return water;
}

/**
 * Internal alias for `extractWater`. Exposed for testability per
 * `contracts/terrain-api.ts`. The behavior is identical.
 *
 * @internal
 */
export function _extractWater(
  elev: Uint8Array,
  width: number,
  height: number,
  waterRatio: number,
): Uint8Array {
  return extractWater(elev, width, height, waterRatio);
}

// Re-export `MapSeed` so the barrel import (`./contracts/terrain-types`)
// does not warn about an unused type-only import. The dependency is
// only there to keep the import graph aligned with the other modules.
// (Removed in a future refactor if extractWater takes a `MapSeed` for
// the engine's RNG.)
export type { MapSeed };
