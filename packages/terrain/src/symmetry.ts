/**
 * Symmetry Helpers — Feature 003
 *
 * The generator enforces **180° point symmetry** across all layers
 * (elevation, water, city placement) per spec FR-004. This module
 * exposes the two pure helpers used everywhere a mirror operation is
 * needed:
 *
 *   - `rotate180(x, y, width, height)` — coord form. Returns the
 *     180°-rotated coordinate `{ x: width - 1 - x, y: height - 1 - y }`.
 *   - `rotate180Index(index, width, height)` — linear-index form.
 *     Faster when iterating `Uint8Array` storage because it avoids
 *     the divmod per call.
 *
 * Both helpers are **pure** and **integer-only** (no floats, no
 * `Math.floor` of a non-integer). They are the building block for:
 *
 *   - `elevation.ts` `_enforcePointSymmetry` (mirrors left half onto
 *     right half after fBm).
 *   - `water.ts` symmetry validation (each water cell's partner must
 *     also be water).
 *   - `cities.ts` `enforceCitySymmetry` (player-1 city ↔ player-2 city
 *     at the rotated coord).
 *
 * **Round-trip invariant**: `rotate180(rotate180(c)) === c` for any
 * valid `c`. Tested in `tests/unit/symmetry.test.ts`.
 */

/**
 * Compute the 180°-rotated coordinate of `(x, y)` on a board of the
 * given dimensions. Pure integer math; the result is always a valid
 * coord pair.
 *
 * @param x      The x coordinate (must be in `[0, width)`).
 * @param y      The y coordinate (must be in `[0, height)`).
 * @param width  Board width.
 * @param height Board height.
 * @returns The 180°-rotated coord `{ x: width - 1 - x, y: height - 1 - y }`.
 */
export function rotate180(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: width - 1 - x, y: height - 1 - y };
}

/**
 * Compute the 180°-rotated *linear index* of `index` on a `width × height`
 * row-major buffer. Faster than `rotate180` + divmod when iterating
 * a flat `Uint8Array` because the math collapses to a single
 * arithmetic expression.
 *
 * The formula derives directly from `rotate180`: given a linear
 * index `i = y * width + x`, the rotated coord is `(width - 1 - x,
 * height - 1 - y)`. The corresponding linear index is
 * `(height - 1 - y) * width + (width - 1 - x)`.
 *
 * @param index  The linear (row-major) index of the source cell.
 * @param width  Buffer width.
 * @param height Buffer height.
 * @returns The linear index of the 180°-rotated cell.
 */
export function rotate180Index(index: number, width: number, height: number): number {
  const y = Math.floor(index / width);
  const x = index % width;
  // For a square board (the only kind terrain generates) `width ===
  // height`, but we keep the asymmetry for defensive correctness.
  return (height - 1 - y) * width + (width - 1 - x);
}
