/**
 * Pure mappings for feature 018 — grain bounds and determinism, coast
 * width, the seam token's contrast floor, and the contour interval.
 * Rendered truth lives in `tests/component/render/surface.test.tsx`.
 */

import { describe, expect, test } from 'vitest';
import { CONTOUR_COLOR, landBandColor, SEAM_COLOR } from '../../../src/render/palette';
import { reliefToneColours } from '../../../src/render/relief';
import {
    COAST_WIDTH_RATIO,
    CONTOUR_INTERVAL,
    CONTOUR_WIDTH_PX,
    coastBandWidth,
    contourCrosses,
    elevationBand,
    grainOffsetIndex,
    LAND_FACE_GRAIN_OFFSETS,
    landFaceGrainOffset,
    SEAM_WIDTH_PX,
} from '../../../src/render/surface';
import { relativeLuminance } from '../../fixtures/contrast';

function hexToRgb(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function contrast(first: readonly [number, number, number], second: readonly [number, number, number]): number {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('surface mappings (018 FR-001…FR-003)', () => {
    test('the coast band is 4 % of the cell at every zoom', () => {
        expect(COAST_WIDTH_RATIO).toBe(0.04);
        expect(coastBandWidth(32)).toBeCloseTo(1.28);
        expect(coastBandWidth(96)).toBeCloseTo(3.84);
    });

    test('grain offsets stay within 0 to −2 and offer four distinct values', () => {
        const seen = new Set(LAND_FACE_GRAIN_OFFSETS);
        expect(seen.size).toBe(4);
        for (const offset of LAND_FACE_GRAIN_OFFSETS) {
            expect(offset).toBeLessThanOrEqual(0);
            expect(offset).toBeGreaterThanOrEqual(-2);
        }
    });

    test('grain depends on coordinates alone and spans all four values', () => {
        const seen = new Set<number>();
        for (let y = 0; y < 32; y += 1) {
            for (let x = 0; x < 32; x += 1) {
                expect(grainOffsetIndex({ x, y })).toBe(grainOffsetIndex({ x, y }));
                expect(landFaceGrainOffset({ x, y })).toBe(LAND_FACE_GRAIN_OFFSETS[grainOffsetIndex({ x, y })]);
                seen.add(grainOffsetIndex({ x, y }));
            }
        }
        expect(seen.size).toBe(4);
    });

    test('the seam is one pixel and clears 1.2:1 against every bevel tone', () => {
        expect(SEAM_WIDTH_PX).toBe(1);
        const seam = hexToRgb(SEAM_COLOR);
        for (const zone of [0, 1, 2, 3]) {
            const tones = reliefToneColours(landBandColor(zone));
            for (const tone of [...tones.lit, ...tones.shaded]) {
                expect(contrast(seam, hexToRgb(tone)), `zone ${zone} tone ${tone}`).toBeGreaterThanOrEqual(1.2);
            }
        }
    });

    test('contours mark a 28-level band boundary and are one pixel wide (FR-004)', () => {
        expect(CONTOUR_INTERVAL).toBe(28);
        expect(CONTOUR_WIDTH_PX).toBe(1);
        expect(elevationBand(0)).toBe(0);
        expect(elevationBand(27)).toBe(0);
        expect(elevationBand(28)).toBe(1);
        expect(elevationBand(255)).toBe(9);

        expect(contourCrosses(139, 140)).toBe(true);
        expect(contourCrosses(140, 139)).toBe(true);
        expect(contourCrosses(140, 145)).toBe(false);
        expect(contourCrosses(100, 100)).toBe(false);
        expect(contourCrosses(64, 96)).toBe(true);
    });

    test('the contour ink is a neutral 20 % black', () => {
        expect(CONTOUR_COLOR).toBe('rgba(0, 0, 0, 0.2)');
    });
});
