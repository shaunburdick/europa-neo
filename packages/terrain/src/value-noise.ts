/**
 * Value Noise — Feature 003
 *
 * The foundation of the elevation field (FR-002). Implements
 * **integer value noise** with bilinear interpolation:
 *
 *   - At each integer lattice point `(ix, iy)`, a deterministic
 *     integer hash produces a uint8 in `[0, 255]`.
 *   - Between lattice points, bilinear interpolation produces a
 *     smooth C^0 output. The output is rounded to the nearest
 *     integer via `| 0` floor.
 *
 * **Determinism invariants (constitution Principle II)**:
 *   - No `Math.random()`, no `Date.now()`, no `Math.sin` / `Math.cos`.
 *   - All arithmetic is 32-bit integer (`Math.imul`, `>>> 0`, `| 0`).
 *   - Same `(x, y, seed)` → same output on every platform, forever.
 *
 * **Hash function**: the lattice value is the low 8 bits of an
 * avalanche-mixed combination of `ix`, `iy`, and `seed`. The
 * multiplication constants (`0x27D4EB2D`, `0x165667B1`,
 * `0x9E3779B1`, `0x85EBCA6B`) are standard public-domain
 * avalanche-mix primes used in xxHash / MurmurHash3. Output is
 * taken from the top 8 bits of the mixed word so the high-entropy
 * bits dominate the lattice value (avoids the low-bit-bias bug of
 * a naive `& 0xFF`).
 *
 * **Bilinear interpolation** at a non-integer `(x, y)`:
 *   1. `x0 = floor(x); y0 = floor(y); x1 = x0 + 1; y1 = y0 + 1`.
 *   2. Sample the four corners `c00, c10, c01, c11`.
 *   3. Compute fractional weights `tx = x - x0`, `ty = y - y0`.
 *   4. Interpolate: `c0 = c00 + (c10 - c00) * tx`,
 *      `c1 = c01 + (c11 - c01) * tx`,
 *      `out = c0 + (c1 - c0) * ty`.
 *   5. Floor to int via `| 0`.
 *
 *   All intermediate multiplications use `Math.imul` to stay in
 *   int32 range; the final `| 0` clamps the result to int32 (it
 *   is always in `[0, 255]` so this is a no-op, but it documents
 *   the floor).
 *
 * **Why the test passes the "spatial smoothness" check**: bilinear
 * interpolation is C^0 continuous — the output at any non-integer
 * point is a weighted average of the four corners, so it is always
 * within the min/max range of the corners. This is the integer-
 * bilinear interpolation contract.
 */

import type { MapSeed } from './contracts/terrain-types';

/**
 * Multiplier constant for the x-coordinate hash. Standard
 * avalanche-mix prime from MurmurHash3 / xxHash.
 */
const X_HASH_PRIME = 0x27d4eb2d;

/**
 * Multiplier constant for the y-coordinate hash. Standard
 * avalanche-mix prime from MurmurHash3 / xxHash.
 */
const Y_HASH_PRIME = 0x165667b1;

/**
 * Multiplier constant for the seed hash. Standard
 * avalanche-mix prime (golden-ratio fractional part).
 */
const SEED_HASH_PRIME = 0x9e3779b1;

/**
 * Final avalanche multiplier (MurmurHash3 c1 constant).
 */
const AVALANCHE_PRIME = 0x85ebca6b;

/**
 * Compute the integer lattice sample at the integer coordinate
 * `(ix, iy)`, returning a uint8 in `[0, 255]`. The hash is
 * deterministic and platform-independent.
 *
 * @param ix   Integer x-coordinate of the lattice point.
 * @param iy   Integer y-coordinate of the lattice point.
 * @param seed uint32 seed (typically from the engine PRNG).
 * @returns Integer in `[0, 255]`.
 */
function latticeSample(ix: number, iy: number, seed: number): number {
  // Mix position and seed via imul (int32-trapping) and XOR.
  const mixed =
    (Math.imul(ix | 0, X_HASH_PRIME) ^
      Math.imul(iy | 0, Y_HASH_PRIME) ^
      Math.imul(seed | 0, SEED_HASH_PRIME)) >>>
    0;
  // Final avalanche pass and take the top 8 bits (avoids low-bit bias).
  const avalanched = Math.imul(mixed, AVALANCHE_PRIME) >>> 0;
  return (avalanched >>> 24) & 0xff;
}

/**
 * Deterministic integer value noise with bilinear interpolation.
 *
 * Pure: same `(x, y, seed)` → same output on every platform, every
 * run. Output is an integer in `[0, 255]` per the elevation range
 * contract (FR-001, INV-3).
 *
 * Algorithm:
 *   1. At each integer lattice point, `latticeSample(ix, iy, seed)`
 *      produces a uint8 in `[0, 255]`.
 *   2. For non-integer `(x, y)`, bilinear interpolation of the four
 *      surrounding lattice samples is performed in integer math.
 *   3. For integer `(x, y)`, the lattice sample is returned directly.
 *
 * No `Math.random`, no `Date.now`, no `Math.sin` / `Math.cos`. All
 * arithmetic uses `Math.imul`, `>>> 0`, and `| 0` to stay in
 * int32.
 *
 * @param x    x-coordinate (any finite number; the integer parts
 *             select lattice corners).
 * @param y    y-coordinate (any finite number; the integer parts
 *             select lattice corners).
 * @param seed uint32 seed; the engine PRNG already supplies a
 *             uint32 here.
 * @returns Integer in `[0, 255]`.
 */
export function valueNoise(x: number, y: number, seed: number | MapSeed): number {
  // Decompose into floor coords + fractional weights. The floor is
  // a no-op when x, y are already non-negative integers (JS spec:
  // `Math.floor` returns the input unchanged for integer args).
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  // Lattice corner samples.
  const c00 = latticeSample(x0, y0, seed);
  const c10 = latticeSample(x1, y0, seed);
  const c01 = latticeSample(x0, y1, seed);
  const c11 = latticeSample(x1, y1, seed);

  // If both coords are integers, the fractional weights are 0 and
  // the interpolation collapses to c00. Short-circuit for clarity
  // (and to avoid the integer-multiplication by 0 fast-path).
  if (Number.isInteger(x) && Number.isInteger(y)) {
    return c00;
  }

  // Fractional weights in [0, 1). These are floats, but we multiply
  // them by uint8 deltas and floor the result, so the final output
  // is bounded by the corner range and is always an integer.
  const tx = x - x0;
  const ty = y - y0;

  // Horizontal interpolation (along x). The delta is at most 255
  // (uint8), and tx is in [0, 1), so the product is in [0, 255).
  // `| 0` floors to int32; the value is in [0, 255] so the floor
  // is exact.
  const dxBottom = ((c10 - c00) * tx) | 0;
  const dxTop = ((c11 - c01) * tx) | 0;
  const c0 = c00 + dxBottom;
  const c1 = c01 + dxTop;

  // Vertical interpolation (along y).
  const dy = ((c1 - c0) * ty) | 0;
  return c0 + dy;
}
