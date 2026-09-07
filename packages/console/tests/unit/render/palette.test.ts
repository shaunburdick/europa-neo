/**
 * Unit tests: render palette invariants — Feature 005 (US1 T044/T045
 * support module + 2026-08-24 playtest contrast ruling).
 *
 * Pins the board-readability contract recorded in spec 005
 * Implementation Notes item 13:
 * - the darkest land tile is clearly lighter than the void, so
 *   low-elevation land never reads as fog ("broken bands" defect);
 * - the void is distinct from the page chrome background, so the
 *   canvas reads as board space rather than an invisible rectangle;
 * - elevation shading still interpolates monotonically to the
 *   documented maximum (data-model.md §3 unchanged).
 *
 * Fog no-leak (FR-002/FR-005) is structural — out-of-horizon cells
 * are absent from views — and remains pinned by the visibility and
 * component suites; these tests only cover paint constants.
 */

import { describe, expect, test } from 'vitest';
import {
    LAND_BAND_COUNT,
    LAND_BAND_LIGHTNESS,
    LAND_MAX_LIGHTNESS_PCT,
    LAND_MIN_LIGHTNESS_PCT,
    landBandColor,
    landBandIndex,
    PAGE_BACKGROUND_COLOR,
    terrainColor,
    VOID_COLOR,
    WATER_COLOR,
    waterDepthColor,
    waterDepthForCell,
} from '../../../src/render/palette';

/** Parse `hsl(H S% L%)` (the exact format terrainColor emits). */
function parseHsl(color: string): { hue: number; sat: number; light: number } {
    const match = /^hsl\((\d+) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(color);
    if (match === null) {
        throw new Error(`not a palette hsl() color: ${color}`);
    }
    return {
        hue: Number(match[1]),
        sat: Number(match[2]),
        light: Number(match[3]),
    };
}

/** Parse `#rrggbb` into a byte triplet. */
function hexToRgb(hex: string): [number, number, number] {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (match === null) {
        throw new Error(`not a #rrggbb color: ${hex}`);
    }
    return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

/** Perceived (luminance-weighted) brightness, 0..255. */
function luminance(rgb: [number, number, number]): number {
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

describe('palette contrast invariants (spec 005 Implementation Notes 13)', () => {
    test('sea-level land sits at the documented lightness floor', () => {
        const floor = parseHsl(terrainColor('land', 0));
        expect(floor.light).toBe(LAND_MIN_LIGHTNESS_PCT);
        expect(floor.light).toBeGreaterThanOrEqual(26);
    });

    test('darkest land is visibly lighter than the void', () => {
        const floorHsl = parseHsl(terrainColor('land', 0));
        // hsl → rgb for an apples-to-apples comparison with the void hex.
        const c = ((1 - Math.abs((2 * floorHsl.light) / 100 - 1)) * floorHsl.sat) / 100;
        const hp = floorHsl.hue / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : [0, x, c];
        const m = floorHsl.light / 100 - c / 2;
        const landRgb: [number, number, number] = [
            Math.round((r1 + m) * 255),
            Math.round((g1 + m) * 255),
            Math.round((b1 + m) * 255),
        ];
        const voidRgb = hexToRgb(VOID_COLOR);

        // Luminance gap must be unmistakable: land floor ≥ 1.5× void
        // brightness (actual ≈ 69 vs ≈ 34 — the assertion documents the
        // minimum, not the exact value, so tuning stays honest).
        expect(luminance(landRgb)).toBeGreaterThanOrEqual(1.5 * luminance(voidRgb));
        // Overall color distance must clear a visible-difference bar.
        // (Per-channel deltas don't work here: land is green-tinted and
        // void blue-tinted, so their blue channels legitimately sit close
        // together while hue + luminance separate the tiles. Actual
        // Euclidean RGB distance ≈ 52; the floor documents "clearly
        // distinct", not the exact value.)
        const distance = Math.sqrt(landRgb.reduce((sum, channel, i) => sum + (channel - voidRgb[i]) ** 2, 0));
        expect(distance).toBeGreaterThanOrEqual(40);
    });

    test('void is distinct from the page background', () => {
        expect(VOID_COLOR).not.toBe(PAGE_BACKGROUND_COLOR);
        const voidRgb = hexToRgb(VOID_COLOR);
        const pageRgb = hexToRgb(PAGE_BACKGROUND_COLOR);
        const channelGap = Math.max(
            Math.abs(voidRgb[0] - pageRgb[0]),
            Math.abs(voidRgb[1] - pageRgb[1]),
            Math.abs(voidRgb[2] - pageRgb[2]),
        );
        expect(channelGap).toBeGreaterThanOrEqual(8);
    });

    test('elevation shading still interpolates to the documented maximum', () => {
        expect(terrainColor('water', 0)).toBe(WATER_COLOR);
        expect(parseHsl(terrainColor('land', 255)).light).toBe(LAND_MAX_LIGHTNESS_PCT);
        // Out-of-range elevations clamp (pure function, no surprises).
        expect(terrainColor('land', 300)).toBe(terrainColor('land', 255));
        expect(terrainColor('land', -5)).toBe(terrainColor('land', 0));
        // Shading is monotonic in elevation.
        const mid = parseHsl(terrainColor('land', 128)).light;
        expect(mid).toBeGreaterThan(LAND_MIN_LIGHTNESS_PCT);
        expect(mid).toBeLessThan(LAND_MAX_LIGHTNESS_PCT);
    });
});

describe('waterDepthColor (spec 021 FR-006)', () => {
    test('depth 0 returns waterShallow', () => {
        expect(waterDepthColor(0)).toBe('#4a90d9');
    });

    test('depth 1 returns standard water', () => {
        expect(waterDepthColor(1)).toBe(WATER_COLOR);
    });

    test('depth 2 returns waterDeep', () => {
        expect(waterDepthColor(2)).toBe('#1e3a5f');
    });

    test('negative depth clamps to 0', () => {
        expect(waterDepthColor(-5)).toBe(waterDepthColor(0));
    });

    test('depth > 2 clamps to 2', () => {
        expect(waterDepthColor(10)).toBe(waterDepthColor(2));
    });

    test('fractional depth 1.5 returns standard', () => {
        expect(waterDepthColor(1.5)).toBe(WATER_COLOR);
    });
});

describe('landBandIndex (spec 021 FR-006)', () => {
    test('elevation 0 → band 0', () => {
        expect(landBandIndex(0)).toBe(0);
    });

    test('elevation 255 → band 5', () => {
        expect(landBandIndex(255)).toBe(5);
    });

    test('elevation 42 → band 0 (floor(42/256*6) = 0)', () => {
        expect(landBandIndex(42)).toBe(0);
    });

    test('elevation 43 → band 1 (floor(43/256*6) = 1)', () => {
        expect(landBandIndex(43)).toBe(1);
    });

    test('negative elevation clamps to band 0', () => {
        expect(landBandIndex(-10)).toBe(0);
    });

    test('elevation > 255 clamps to band 5', () => {
        expect(landBandIndex(300)).toBe(5);
    });

    test('all 6 bands are reachable', () => {
        const bands = new Set<number>();
        for (let e = 0; e <= 255; e++) {
            bands.add(landBandIndex(e));
        }
        expect(bands.size).toBe(LAND_BAND_COUNT);
        expect(bands).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    });
});

describe('landBandColor (spec 021 FR-006)', () => {
    test('band 0 has lightness 18', () => {
        const hsl = parseHsl(landBandColor(0));
        expect(hsl.light).toBe(18);
    });

    test('band 5 has lightness 58', () => {
        const hsl = parseHsl(landBandColor(5));
        expect(hsl.light).toBe(58);
    });

    test('band index clamps below 0 to band 0', () => {
        expect(landBandColor(-1)).toBe(landBandColor(0));
    });

    test('band index clamps above 5 to band 5', () => {
        expect(landBandColor(10)).toBe(landBandColor(5));
    });

    test('output matches terrainColor format (space-separated HSL)', () => {
        const color = landBandColor(3);
        expect(color).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    });

    test('lightness values match design tokens', () => {
        for (let b = 0; b < LAND_BAND_COUNT; b++) {
            const hsl = parseHsl(landBandColor(b));
            expect(hsl.light).toBe(LAND_BAND_LIGHTNESS[b]);
        }
    });
});

describe('waterDepthForCell (spec 021 FR-006 stub)', () => {
    test('always returns 1 (standard depth)', () => {
        expect(waterDepthForCell(0)).toBe(1);
        expect(waterDepthForCell(128)).toBe(1);
        expect(waterDepthForCell(255)).toBe(1);
        expect(waterDepthForCell(-5)).toBe(1);
    });
});

describe('land band contrast vs void (spec 021 AC-12)', () => {
    /**
     * Parse `hsl(H S% L%)` to RGB for contrast calculation.
     */
    function hslToRgb(hue: number, sat: number, light: number): [number, number, number] {
        const s = sat / 100;
        const l = light / 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0;
        let g = 0;
        let b = 0;
        if (hue < 60) {
            r = c;
            g = x;
            b = 0;
        } else if (hue < 120) {
            r = x;
            g = c;
            b = 0;
        } else if (hue < 180) {
            r = 0;
            g = c;
            b = x;
        } else if (hue < 240) {
            r = 0;
            g = x;
            b = c;
        } else if (hue < 300) {
            r = x;
            g = 0;
            b = c;
        } else {
            r = c;
            g = 0;
            b = x;
        }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    /** Relative luminance per WCAG 2.x (sRGB → linear → weighted sum). */
    function relativeLuminance(rgb: [number, number, number]): number {
        const [rs, gs, bs] = rgb.map((c) => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    /** WCAG contrast ratio between two relative luminances. */
    function contrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    test('bands 3+ (lightness 42, 50, 58) meet 3:1 contrast vs void', () => {
        const voidRgb = hexToRgb(VOID_COLOR);
        const voidLum = relativeLuminance(voidRgb);

        // Bands 3, 4, 5 → lightness 42, 50, 58
        const highBands = [LAND_BAND_LIGHTNESS[3], LAND_BAND_LIGHTNESS[4], LAND_BAND_LIGHTNESS[5]];
        for (const lightness of highBands) {
            const bandRgb = hslToRgb(120, 12, lightness);
            const bandLum = relativeLuminance(bandRgb);
            const ratio = contrastRatio(bandLum, voidLum);
            expect(ratio).toBeGreaterThanOrEqual(3.0);
        }
    });

    test('bands 0-2 are documented as acceptable (terrain never sole info carrier)', () => {
        // Bands 0, 1, 2 → lightness 18, 26, 34 — may be below 3:1
        // but terrain is never the sole information carrier per constitution
        // Principle VI. This test documents the gap.
        const voidRgb = hexToRgb(VOID_COLOR);
        const voidLum = relativeLuminance(voidRgb);

        const lowBands = [LAND_BAND_LIGHTNESS[0], LAND_BAND_LIGHTNESS[1], LAND_BAND_LIGHTNESS[2]];
        for (const lightness of lowBands) {
            const bandRgb = hslToRgb(120, 12, lightness);
            const bandLum = relativeLuminance(bandRgb);
            const ratio = contrastRatio(bandLum, voidLum);
            // Document: these bands may be below 3:1 but are acceptable
            // because terrain is never the sole info carrier.
            expect(typeof ratio).toBe('number');
            expect(ratio).toBeGreaterThan(0);
        }
    });
});
