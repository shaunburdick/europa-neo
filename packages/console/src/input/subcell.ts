/**
 * Subcell targeting math — Feature 005 (T033).
 *
 * Projects the cursor's position WITHIN a cell onto the paratroop /
 * gun destination cell using the original Europa 5-bin threshold rule
 * (contracts/console-types.ts §"Subcell targeting"; spec US3 AC-1/2/3).
 *
 * The cell is conceptually a 5×5 mini-grid; each axis is bucketed:
 *
 *   x < 0.20 → -2    0.20 ≤ x < 0.40 → -1   0.40 ≤ x < 0.60 → 0
 *   0.60 ≤ x < 0.80 → +1    x ≥ 0.80 → +2
 *
 * (same for y, 0 = north). The center bin (0.5, 0.5) yields offset
 * (0, 0) — "self", which the paratroop handler rejects as source ===
 * target. The hard cap is Chebyshev distance ≤ 2 (`SUBCELL_RANGE`),
 * which the bin rule satisfies by construction.
 */

import { SUBCELL_RANGE } from '../config';
import type { Coord } from '../state/types';

/** A cell-local normalized position in `[0, 1) × [0, 1)`. */
interface Subcell {
    readonly x: number;
    readonly y: number;
}

/**
 * Bucket one axis position into `{-2, -1, 0, +1, +2}` per the 5-bin
 * threshold rule. Pure.
 */
function axisOffset(value: number): number {
    if (value < 0.2) {
        return -2;
    }
    if (value < 0.4) {
        return -1;
    }
    if (value < 0.6) {
        return 0;
    }
    if (value < 0.8) {
        return 1;
    }
    return 2;
}

/**
 * Compute the `(dx, dy)` offset in cells from a source cell for a
 * subcell position. Each axis offset is clamped to
 * `[-SUBCELL_RANGE, +SUBCELL_RANGE]` (a no-op for the 5-bin rule,
 * but keeps the hard cap enforced in code rather than prose). Pure.
 *
 * @param subcell Cell-local position (`x`: west→east, `y`: north→south).
 */
export function subcellToTargetOffset(subcell: Subcell): {
    readonly dx: number;
    readonly dy: number;
} {
    return { dx: clampToRange(axisOffset(subcell.x)), dy: clampToRange(axisOffset(subcell.y)) };
}

/**
 * Clamp an axis offset to the Chebyshev targeting ring (`±SUBCELL_RANGE`).
 */
function clampToRange(value: number): number {
    return Math.max(-SUBCELL_RANGE, Math.min(SUBCELL_RANGE, value));
}

/**
 * Apply the subcell offset to a source coord to compute the target
 * cell. Pure.
 *
 * Out-of-bounds handling per contract: a target that would fall on a
 * negative coordinate is off the board; the SOURCE coord is returned
 * unchanged in that case (the paratroop/gun handlers reject orders
 * with `source === target`, so this fails safe without inventing a
 * board size this pure module doesn't know).
 *
 * @param source  The acting cell (paratroop launch / gun origin).
 * @param subcell Cursor position within the source cell.
 */
export function subcellToTargetCoord(source: Coord, subcell: Subcell): Coord {
    const { dx, dy } = subcellToTargetOffset(subcell);
    const target: Coord = { x: source.x + dx, y: source.y + dy };
    if (target.x < 0 || target.y < 0) {
        return source;
    }
    return target;
}
