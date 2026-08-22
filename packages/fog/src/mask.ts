/**
 * Binary Mask Helpers — Feature 002
 *
 * The `FogMask` is a flat `Uint8Array` of length `width * height`
 * used as the working scratch buffer in `computeVisibleSet` (US1)
 * and `computePlayerView` (US1 + US3). Cells are marked `1` for
 * "visible" and `0` for "not visible" (or "unknown"). There is no
 * third "previously visible / recall" state — spec FR-004 / US2
 * explicitly forbid remembering previously seen terrain, and the
 * mask is allocated fresh every call to enforce that.
 *
 * Layout: row-major, `data[y * width + x]`. The row-major order
 * matches the engine's `cellsInRange` output and the engine's
 * `forEachCell` iteration; reusing the same order keeps fog's
 * output deterministic (constitution Principle II).
 *
 * Performance: `Uint8Array` is the typed-array type with the
 * smallest per-element size (1 byte) that still fits both sentinel
 * values (0 and 1). 32×32 = 1024 bytes per mask; trivial to
 * allocate per tick.
 *
 * This module is **internal to the fog package** — the public
 * `FogMask` *type* is declared in `contracts/fog-types.ts` (with
 * the `@internal` tag) and re-exported from `./types`. The
 * runtime helpers below are not re-exported by `./index.ts`; the
 * only caller of these helpers is `src/visibleSet.ts` (lands in
 * Phase 3 / US1).
 */

import { FOG_CONSTANTS } from './constants';
import type { FogMask } from './contracts/fog-types';

/**
 * Allocate a fresh, zero-initialized `FogMask` of the given
 * dimensions. The mask is **always zero-initialized** so that
 * `unionMasks` and `markVisible` operate against a known clean
 * state — there is no "fill" parameter because the no-memory rule
 * (spec FR-004) requires every mask to start in the all-unknown
 * state.
 *
 * Determinism: `Uint8Array` is zero-init by spec (no timing/PRNG
 * dependence). Identical `(width, height)` always returns a
 * `Uint8Array` whose contents are all `0`.
 *
 * @param width  Board width in cells. MUST be a positive integer.
 * @param height Board height in cells. MUST be a positive integer.
 * @returns A new `FogMask` whose `data` is length `width * height`,
 *         all-zero.
 * @throws If `width` or `height` is not a positive integer.
 */
export function createMask(width: number, height: number): FogMask {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`createMask: width must be a positive integer (got ${String(width)})`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`createMask: height must be a positive integer (got ${String(height)})`);
  }
  return {
    data: new Uint8Array(width * height),
    width,
    height,
  };
}

/**
 * Mark a single cell in a `FogMask` as visible. Out-of-bounds
 * coords are silently ignored (no throw) so callers can use the
 * same helper in tight loops without bounds-check overhead — the
 * engine's `cellsInRange` already bounds-clips, so this is purely
 * a safety net.
 *
 * Determinism: identical `(mask, x, y)` always writes the same
 * byte at the same index. There is no allocation in this function.
 *
 * @param mask  The mask to mutate.
 * @param x     Cell x-coordinate. Out-of-bounds values are ignored.
 * @param y     Cell y-coordinate. Out-of-bounds values are ignored.
 */
export function markVisible(mask: FogMask, x: number, y: number): void {
  const { data, width, height } = mask;
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }
  data[y * width + x] = FOG_CONSTANTS.maskVisible;
}

/**
 * Test whether a single cell in a `FogMask` is marked visible.
 * Out-of-bounds coords return `false` (a cell outside the mask
 * is by definition not in the player's horizon).
 *
 * Determinism: identical `(mask, x, y)` always returns the same
 * boolean. There is no allocation in this function.
 *
 * @param mask  The mask to query.
 * @param x     Cell x-coordinate. Out-of-bounds values return
 *              `false`.
 * @param y     Cell y-coordinate. Out-of-bounds values return
 *              `false`.
 * @returns     `true` iff `data[y * width + x] === 1`.
 */
export function isVisible(mask: FogMask, x: number, y: number): boolean {
  const { data, width, height } = mask;
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return false;
  }
  return data[y * width + x] === FOG_CONSTANTS.maskVisible;
}

/**
 * Compute the union of two masks, writing the result into `target`
 * in place. A cell is marked visible in `target` if it was marked
 * visible in either `target` or `source` (logical OR).
 *
 * Used by `computeVisibleSet` to merge the per-viewer horizons:
 * for each friendly stack, mark the cells in its Chebyshev
 * disk, then union the next stack's disk in. The union operation
 * is the only safe way to extend a mask in place without
 * accidentally clearing prior marks.
 *
 * Both masks must have the same `width` and `height`. A
 * mismatched-dimension call is a programmer error and throws.
 *
 * Determinism: identical `(target, source)` produces a byte-
 * identical `target` (in-place write; order of writes is
 * row-major). No allocation.
 *
 * @param target The mask to mutate (receives the union).
 * @param source The mask to union in. NOT modified.
 * @throws If `target.width !== source.width` or
 *         `target.height !== source.height`.
 */
export function unionMasks(target: FogMask, source: FogMask): void {
  if (target.width !== source.width || target.height !== source.height) {
    throw new Error(
      `unionMasks: dimension mismatch (target=${target.width}x${target.height}, ` +
        `source=${source.width}x${source.height})`,
    );
  }
  const t = target.data;
  const s = source.data;
  const visible = FOG_CONSTANTS.maskVisible;
  for (let i = 0; i < t.length; i++) {
    // Branchless OR: `s[i]` is 0 or 1, so addition suffices.
    // After OR, the cell is `1` if either was `1`; clamping to 1
    // is a defense against a non-canonical source value.
    const sum = (t[i] ?? 0) + (s[i] ?? 0);
    t[i] = sum > 0 ? visible : 0;
  }
}
