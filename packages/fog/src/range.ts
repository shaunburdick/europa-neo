/**
 * Chebyshev Range Helpers — Feature 002
 *
 * Chebyshev distance is `max(|dx|, |dy|)`. It is the same metric
 * the engine's `cellsInRange` uses (per `engine-to-fog.ts:113` and
 * the engine's `read.ts`), so reusing it here keeps fog's
 * visibility rule consistent with the rest of the engine. A
 * Chebyshev "ball" of radius `r` around `(cx, cy)` is the
 * `(2r+1) × (2r+1)` square centered on the viewer, with out-of-
 * board cells clipped.
 *
 * The spec explicitly mandates "no line-of-sight; radius alone
 * determines visibility" (spec Assumptions; matches the original
 * Europa's flat satellite display). Chebyshev range expansion is
 * the right primitive: O((2r+1)²) per viewer, 32×32 = trivial.
 *
 * This module is **internal to the fog package** — the helpers
 * are not re-exported by `./index.ts`. The only callers are
 * `src/visibleSet.ts` (lands in Phase 3 / US1) and the
 * `tests/fixtures/view.ts` test helper.
 *
 * Determinism: row-major iteration everywhere. No `Set`/`Map`
 * iteration. No `Math.random` / `Date.now` / `performance.now`
 * (constitution Principle II).
 */

import type { Coord } from '@europa/engine';

/**
 * Chebyshev distance between two cells: `max(|dx|, |dy|)`. Both
 * coordinates are integers.
 *
 * Determinism: pure integer math; no floats.
 *
 * @param x1 First cell x.
 * @param y1 First cell y.
 * @param x2 Second cell x.
 * @param y2 Second cell y.
 * @returns Non-negative integer Chebyshev distance.
 */
export function chebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
  // `Math.abs` is safe here — coords are non-negative, but
  // differences may be negative. Trivially deterministic.
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  return dx > dy ? dx : dy;
}

/**
 * Generate the cells in the Chebyshev ball of radius `r` around
 * `center`, bounds-clipped to `width × height`. The iteration
 * order is **row-major** (y outer, x inner), matching the
 * engine's `cellsInRange` order and the fog package's row-major
 * output discipline.
 *
 * Chebyshev ball = the `((2r+1) × (2r+1))` square, with each cell
 * satisfying `chebyshevDistance(cx, cy, x, y) ≤ r`. Out-of-board
 * cells are omitted.
 *
 * Implementation note: returns a plain `Coord[]` (not a generator)
 * so callers that need indexed random access (tests, the
 * `expectedChebyshevDisk` fixture) can do `arr[idx]`. The
 * allocation cost is small (≤ 1024 cells on 32×32) and amortized
 * well by V8.
 *
 * Determinism: identical `(center, r, width, height)` produces a
 * byte-identical array. Iteration is row-major; no Set/Map.
 *
 * @param center The viewer's `(x, y)`. MUST be in-bounds.
 * @param r      Non-negative integer radius.
 * @param width  Board width (cells).
 * @param height Board height (cells).
 * @returns Row-major `Coord[]` of all in-bounds cells within
 *         Chebyshev distance `r` of `center`.
 * @throws If `r`, `width`, or `height` is negative.
 */
export function chebyshevDisk(center: Coord, r: number, width: number, height: number): Coord[] {
  if (!Number.isInteger(r) || r < 0) {
    throw new Error(`chebyshevDisk: r must be a non-negative integer (got ${String(r)})`);
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`chebyshevDisk: width must be a positive integer (got ${String(width)})`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`chebyshevDisk: height must be a positive integer (got ${String(height)})`);
  }
  // Compute the rectangular sweep: [xMin..xMax] × [yMin..yMax],
  // then clip to [0..width) × [0..height). Each cell in the
  // clipped rectangle is automatically within Chebyshev distance
  // `r` of the center (by construction).
  const xMinRaw = center.x - r;
  const yMinRaw = center.y - r;
  const xMaxRaw = center.x + r;
  const yMaxRaw = center.y + r;
  const xMin = xMinRaw < 0 ? 0 : xMinRaw;
  const yMin = yMinRaw < 0 ? 0 : yMinRaw;
  const xMax = xMaxRaw >= width ? width - 1 : xMaxRaw;
  const yMax = yMaxRaw >= height ? height - 1 : yMaxRaw;

  const out: Coord[] = [];
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      out.push({ x, y });
    }
  }
  return out;
}
