/**
 * Elevation Generator — Feature 003
 *
 * Builds the shared elevation field (FR-002, FR-004, INV-5/6) used
 * by every downstream phase (water classification, city placement,
 * validation, statistics).
 *
 * The field is computed in two steps:
 *
 *   1. **fBm sampling**: every cell `(x, y)` gets a uint8 elevation
 *      from `fbm(x, y, seed, settings.octaves, settings.roughness)`.
 *      The seed is the same uint32 the engine uses for the match
 *      (passed in via the `Rng` parameter).
 *
 *   2. **Point symmetry enforcement**: `_enforcePointSymmetry` mirrors
 *      the right half onto the left half so the field is invariant
 *      under 180° rotation. The math is integer-only and exact — no
 *      averaging or smoothing at the seam.
 *
 * **Determinism invariants** (constitution Principle II):
 *   - No `Math.random`, no `Date.now`, no `Math.sin` / `Math.cos`.
 *   - All entropy comes from the supplied `Rng` instance.
 *   - Same `(rng-state, width, height, settings)` → identical field.
 *
 * **Square board invariant**: terrain only generates square boards
 * (`width === height === boardSize`), so the symmetry helper is
 * always called with a square shape. We keep `width` and `height`
 * as separate parameters for testability and defensive correctness.
 */

import type { GenerationSettings, Rng } from './contracts/terrain-types';
import { fbm } from './fbm';

/**
 * Enforce 180° point symmetry on an elevation `Uint8Array` in place.
 *
 * For each cell `(x, y)`, the partner is `(width - 1 - x, height - 1 - y)`.
 * Both cells must end up with the same value. The implementation
 * mirrors the right half to the left (one direction only, to avoid
 * double-writes):
 *
 *   for y in [0, height):
 *     for x in [0, width):
 *       target = (height - 1 - y) * width + (width - 1 - x)
 *       elev[target] = elev[y * width + x]
 *
 * For a square board of size N, the full pass touches every cell
 * once and sets its partner to the same value. The "center" of an
 * odd-sized board is its own partner (single write — no-op).
 *
 * @param elev   Elevation `Uint8Array` of length `width * height`.
 *               Mutated in place.
 * @param width  Buffer width (square; `width` is used in lieu of
 *               `height` for a square board).
 * @returns The same `Uint8Array` reference (for chaining).
 */
export function _enforcePointSymmetry(elev: Uint8Array, width: number): Uint8Array {
  const height = width; // terrain only generates square boards
  for (let y = 0; y < height; y++) {
    const yRow = y * width;
    const partnerY = height - 1 - y;
    const partnerRow = partnerY * width;
    for (let x = 0; x < width; x++) {
      const partnerX = width - 1 - x;
      const value = elev[yRow + x] ?? 0;
      elev[partnerRow + partnerX] = value;
    }
  }
  return elev;
}

/**
 * Build a symmetric elevation map for the given board size.
 *
 * Steps:
 *   1. Derive a substream from the supplied `rng` so the elevation
 *      field is isolated from other phases (water, cities).
 *   2. Sample fBm at every cell `(x, y)`, producing a uint8.
 *   3. Enforce 180° point symmetry.
 *
 * @param rng      The engine's live sfc32 instance. Advanced by
 *                 exactly one substream derivation (which advances
 *                 the parent by one step).
 * @param width    Board width (square; `width === height`).
 * @param height   Board height (must equal `width` for terrain).
 * @param settings Generation settings (octaves, roughness).
 * @returns A fresh `Uint8Array` of length `width * height` with
 *          180° point-symmetric integer values in `[0, 255]`.
 */
export function generateElevationMap(
  rng: Rng,
  width: number,
  height: number,
  settings: Readonly<GenerationSettings>,
): Uint8Array {
  // Derive a substream for elevation. The parent's first uint32
  // becomes the seed for the elevation-phase fBm. This advances
  // the parent exactly once (per the rng-adapter contract).
  const noiseSeed = rng();
  // Use the lower 32 bits as a uint32 seed (already uint32 but
  // explicit for clarity).
  const seed = noiseSeed >>> 0;
  const elev = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      elev[row + x] = fbm(x, y, seed, settings.octaves, settings.roughness);
    }
  }
  return _enforcePointSymmetry(elev, width);
}
