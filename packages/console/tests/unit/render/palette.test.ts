/**
 * Unit tests: render palette invariants — Feature 024 (biome-based
 * terrain shading replacing 6-band grayscale).
 *
 * Pins the board-readability contract recorded in spec 024:
 * - 4 biome zones with distinct hue families (AC-001–AC-009);
 * - biomeZoneForElevation pure function (AC-020);
 * - terrainColor returns biome-zone HSL for land (AC-022);
 * - water/void distinctness invariants preserved (AC-017/AC-018);
 * - pipe outline color constant (AC-010).
 */

import { describe, expect, test } from 'vitest';
import {
    biomeZoneForElevation,
    LAND_BAND_COUNT,
    LAND_BAND_LIGHTNESS,
    landBandColor,
    landBandIndex,
    PAGE_BACKGROUND_COLOR,
    PIPE_OUTLINE_COLOR,
    terrainColor,
    VOID_COLOR,
    WATER_COLOR,
    waterDepthColor,
    waterDepthForCell,
} from '../../../src/render/palette';

/** Parse `hsl(H, S%, L%)` (the format terrainColor/landBandColor emit). */
function parseHsl(color: string): { hue: number; sat: number; light: number } {
    const match = /^hsl\((\d+),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)$/.exec(color);
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

describe('biomeZoneForElevation (spec 024 FR-005, AC-020)', () => {
    test('elevation 0 → zone 0 (Ice Plains)', () => {
        const result = biomeZoneForElevation(0);
        expect(result.zone).toBe(0);
        expect(result.hue).toBe(195);
        expect(result.saturationPct).toBe(30);
        expect(result.lightness).toBe(15);
    });

    test('elevation 80 → zone 0 max lightness', () => {
        const result = biomeZoneForElevation(80);
        expect(result.zone).toBe(0);
        expect(result.lightness).toBe(28);
    });

    test('elevation 81 → zone 1 (Fractured Ice)', () => {
        const result = biomeZoneForElevation(81);
        expect(result.zone).toBe(1);
        expect(result.hue).toBe(210);
        expect(result.saturationPct).toBe(35);
        expect(result.lightness).toBe(10);
    });

    test('elevation 160 → zone 1 max lightness', () => {
        const result = biomeZoneForElevation(160);
        expect(result.zone).toBe(1);
        expect(result.lightness).toBe(22);
    });

    test('elevation 161 → zone 2 (Rocky Outcrops)', () => {
        const result = biomeZoneForElevation(161);
        expect(result.zone).toBe(2);
        expect(result.hue).toBe(200);
        expect(result.saturationPct).toBe(15);
        expect(result.lightness).toBe(20);
    });

    test('elevation 208 → zone 2 max lightness', () => {
        const result = biomeZoneForElevation(208);
        expect(result.zone).toBe(2);
        expect(result.lightness).toBe(35);
    });

    test('elevation 209 → zone 3 (Peaks)', () => {
        const result = biomeZoneForElevation(209);
        expect(result.zone).toBe(3);
        expect(result.hue).toBe(220);
        expect(result.saturationPct).toBe(8);
        expect(result.lightness).toBe(60);
    });

    test('elevation 255 → zone 3 max lightness', () => {
        const result = biomeZoneForElevation(255);
        expect(result.zone).toBe(3);
        expect(result.lightness).toBe(78);
    });

    test('negative elevation clamps to zone 0', () => {
        const result = biomeZoneForElevation(-10);
        expect(result.zone).toBe(0);
    });

    test('elevation > 255 clamps to zone 3', () => {
        const result = biomeZoneForElevation(300);
        expect(result.zone).toBe(3);
    });

    test('pure function: same input always produces same output', () => {
        for (const e of [0, 42, 80, 81, 120, 160, 161, 185, 208, 209, 232, 255]) {
            const a = biomeZoneForElevation(e);
            const b = biomeZoneForElevation(e);
            expect(a).toEqual(b);
        }
    });

    test('lightness interpolates linearly within each zone', () => {
        // Zone 0 midpoint: (15+28)/2 = 21.5 → 22
        const mid0 = biomeZoneForElevation(40);
        expect(mid0.lightness).toBeGreaterThanOrEqual(15);
        expect(mid0.lightness).toBeLessThanOrEqual(28);

        // Zone 1 midpoint: (10+22)/2 = 16
        const mid1 = biomeZoneForElevation(120);
        expect(mid1.lightness).toBeGreaterThanOrEqual(10);
        expect(mid1.lightness).toBeLessThanOrEqual(22);
    });
});

describe('landBandIndex (spec 024 FR-002)', () => {
    test('elevation 0 → zone 0', () => {
        expect(landBandIndex(0)).toBe(0);
    });

    test('elevation 80 → zone 0', () => {
        expect(landBandIndex(80)).toBe(0);
    });

    test('elevation 81 → zone 1', () => {
        expect(landBandIndex(81)).toBe(1);
    });

    test('elevation 160 → zone 1', () => {
        expect(landBandIndex(160)).toBe(1);
    });

    test('elevation 161 → zone 2', () => {
        expect(landBandIndex(161)).toBe(2);
    });

    test('elevation 208 → zone 2', () => {
        expect(landBandIndex(208)).toBe(2);
    });

    test('elevation 209 → zone 3', () => {
        expect(landBandIndex(209)).toBe(3);
    });

    test('elevation 255 → zone 3', () => {
        expect(landBandIndex(255)).toBe(3);
    });

    test('negative elevation clamps to zone 0', () => {
        expect(landBandIndex(-10)).toBe(0);
    });

    test('elevation > 255 clamps to zone 3', () => {
        expect(landBandIndex(300)).toBe(3);
    });

    test('all 4 zones are reachable', () => {
        const zones = new Set<number>();
        for (let e = 0; e <= 255; e++) {
            zones.add(landBandIndex(e));
        }
        expect(zones.size).toBe(LAND_BAND_COUNT);
        expect(zones).toEqual(new Set([0, 1, 2, 3]));
    });
});

describe('landBandColor (spec 024 FR-003)', () => {
    test('zone 0 has hue 195 (icy cyan)', () => {
        const hsl = parseHsl(landBandColor(0));
        expect(hsl.hue).toBe(195);
    });

    test('zone 1 has hue 210 (deep blue)', () => {
        const hsl = parseHsl(landBandColor(1));
        expect(hsl.hue).toBe(210);
    });

    test('zone 2 has hue 200 (blue-gray)', () => {
        const hsl = parseHsl(landBandColor(2));
        expect(hsl.hue).toBe(200);
    });

    test('zone 3 has hue 220 (cool white)', () => {
        const hsl = parseHsl(landBandColor(3));
        expect(hsl.hue).toBe(220);
    });

    test('band index clamps below 0 to zone 0', () => {
        expect(landBandColor(-1)).toBe(landBandColor(0));
    });

    test('band index clamps above 3 to zone 3', () => {
        expect(landBandColor(10)).toBe(landBandColor(3));
    });

    test('output matches terrainColor format (comma-separated HSL)', () => {
        const color = landBandColor(2);
        expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
    });

    test('lightness values match zone midpoints', () => {
        for (let b = 0; b < LAND_BAND_COUNT; b++) {
            const hsl = parseHsl(landBandColor(b));
            expect(hsl.light).toBe(LAND_BAND_LIGHTNESS[b]);
        }
    });
});

describe('terrainColor (spec 024 FR-004, AC-022)', () => {
    test('water returns WATER_COLOR regardless of elevation', () => {
        expect(terrainColor('water', 0)).toBe(WATER_COLOR);
        expect(terrainColor('water', 255)).toBe(WATER_COLOR);
    });

    test('land at elevation 0 returns Ice Plains hue', () => {
        const hsl = parseHsl(terrainColor('land', 0));
        expect(hsl.hue).toBe(195);
        expect(hsl.sat).toBe(30);
        expect(hsl.light).toBe(15);
    });

    test('land at elevation 255 returns Peaks hue', () => {
        const hsl = parseHsl(terrainColor('land', 255));
        expect(hsl.hue).toBe(220);
        expect(hsl.sat).toBe(8);
        expect(hsl.light).toBe(78);
    });

    test('out-of-range elevations clamp', () => {
        expect(terrainColor('land', 300)).toBe(terrainColor('land', 255));
        expect(terrainColor('land', -5)).toBe(terrainColor('land', 0));
    });

    test('shading is monotonic within each zone', () => {
        // Zone 0: elevations 0, 40, 80
        const z0Low = parseHsl(terrainColor('land', 0)).light;
        const z0Mid = parseHsl(terrainColor('land', 40)).light;
        const z0High = parseHsl(terrainColor('land', 80)).light;
        expect(z0Low).toBeLessThan(z0Mid);
        expect(z0Mid).toBeLessThan(z0High);
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

describe('waterDepthForCell (spec 021 FR-006 stub)', () => {
    test('always returns 1 (standard depth)', () => {
        expect(waterDepthForCell(0)).toBe(1);
        expect(waterDepthForCell(128)).toBe(1);
        expect(waterDepthForCell(255)).toBe(1);
        expect(waterDepthForCell(-5)).toBe(1);
    });
});

describe('PIPE_OUTLINE_COLOR (spec 024 FR-010, AC-010)', () => {
    test('is defined and valid rgba', () => {
        expect(PIPE_OUTLINE_COLOR).toBe('rgba(0, 0, 0, 0.7)');
    });
});

describe('biome zone contrast vs void (spec 024)', () => {
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

    test('Peaks zone (highest lightness) has sufficient contrast vs void', () => {
        const voidRgb = hexToRgb(VOID_COLOR);
        const voidLum = relativeLuminance(voidRgb);

        // Peaks zone: lightness 60–78%, hue 220, sat 8%
        const peaksRgb = hslToRgb(220, 8, 60);
        const peaksLum = relativeLuminance(peaksRgb);
        const ratio = contrastRatio(peaksLum, voidLum);
        expect(ratio).toBeGreaterThanOrEqual(3.0);
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
});
