/**
 * Corner composition of the relief bevels — spec 017 FR-001 / FR-002.
 *
 * The four vertex cases, pinned as exact geometry: a same-tile corner
 * splits its `w × v` rect on the outer→inner diagonal (rule 1), a
 * collinear same-tone pair butts to full width (rule 2), a perpendicular
 * diagonal pair keeps both tapers (rule 3), and an unpaired end keeps
 * its taper (rule 4). Each band reads back as an axis-aligned body plus
 * one taper wedge per diagonal end.
 */

import { describe, expect, test } from 'vitest';
import type { ReliefSide } from '../../../src/render/relief';
import { type ReliefBand, reliefGeometry } from '../../../src/render/relief-caps';

const LIT = '#aaaaaa';
const SHADED = '#333333';

/** A 100 px band; only the side, width and colour matter here. */
function band(x: number, y: number, side: ReliefSide, width: number, colour: string): ReliefBand {
    return { x, y, size: 100, side, width, colour };
}

describe('same-tile corner, equal widths', () => {
    test('splits the w × v rect on the exact 45° outer→inner diagonal', () => {
        const geometry = reliefGeometry([band(0, 0, 'N', 10, LIT), band(0, 0, 'W', 10, SHADED)]);

        // The horizontal band's body covers the corner; the vertical
        // band's wedge is the triangle touching the vertical edge.
        expect(geometry.bodies.get(LIT)).toEqual([0, 0, 90, 10]);
        expect(geometry.bodies.get(SHADED)).toEqual([0, 10, 10, 80]);
        expect(geometry.tapers.get(SHADED)).toEqual([0, 0, 0, 10, 10, 10, 0, 100, 0, 90, 10, 90]);
        expect(geometry.tapers.get(LIT)).toEqual([100, 0, 90, 0, 90, 10]);
    });
});

describe('same-tile corner, unequal widths', () => {
    test('runs the diagonal from the outer corner to the inner one', () => {
        const geometry = reliefGeometry([band(0, 0, 'N', 4, LIT), band(0, 0, 'W', 10, SHADED)]);

        // The wedge stops at the horizontal band's 4 px, so the seam is
        // the 10 × 4 rect's diagonal — not the vertical band's own width.
        expect(geometry.bodies.get(LIT)).toEqual([0, 0, 96, 4]);
        expect(geometry.bodies.get(SHADED)).toEqual([0, 4, 10, 86]);
        expect(geometry.tapers.get(SHADED)).toEqual([0, 0, 0, 4, 10, 4, 0, 100, 0, 90, 10, 90]);
        expect(geometry.tapers.get(LIT)).toEqual([100, 0, 96, 0, 96, 4]);
    });
});

describe('collinear pair', () => {
    test('butts both ends at full width', () => {
        const geometry = reliefGeometry([band(0, 0, 'N', 10, LIT), band(100, 0, 'N', 10, LIT)]);

        expect(geometry.bodies.get(LIT)).toEqual([10, 0, 90, 10, 100, 0, 90, 10]);
        expect(geometry.tapers.get(LIT)).toEqual([0, 0, 10, 0, 10, 10, 200, 0, 190, 0, 190, 10]);
    });
});

describe('perpendicular pair', () => {
    test('leaves both ends tapered', () => {
        // Tile (0,0)'s S band and tile (100,100)'s W band meet at (100,100)
        // from diagonally opposite quadrants around the low tile.
        const geometry = reliefGeometry([band(0, 0, 'S', 10, SHADED), band(100, 100, 'W', 10, LIT)]);

        expect(geometry.bodies.get(SHADED)).toEqual([10, 90, 80, 10]);
        expect(geometry.bodies.get(LIT)).toEqual([100, 110, 10, 80]);
        expect(geometry.tapers.get(SHADED)).toEqual([0, 100, 10, 100, 10, 90, 100, 100, 90, 100, 90, 90]);
        expect(geometry.tapers.get(LIT)).toEqual([100, 100, 100, 110, 110, 110, 100, 200, 100, 190, 110, 190]);
    });

    test('adjacent quadrants of one tone are not a collinear pair', () => {
        // Tile (0,0)'s E band and tile (100,0)'s S band share a side of
        // the vertex but run perpendicular: the same tone must not butt
        // them into square ends.
        const geometry = reliefGeometry([band(0, 0, 'E', 10, LIT), band(100, 0, 'S', 10, LIT)]);

        expect(geometry.bodies.get(LIT)).toEqual([90, 10, 10, 80, 110, 90, 80, 10]);
        expect(geometry.tapers.get(LIT)).toEqual([
            100, 0, 100, 10, 90, 10, 100, 100, 100, 90, 90, 90, 100, 100, 110, 100, 110, 90, 200, 100, 190, 100, 190,
            90,
        ]);
    });
});
