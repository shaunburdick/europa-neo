/**
 * Unit tests: render palette invariants — Feature 024 (biome-based
 * terrain shading replacing 6-band grayscale).
 *
 * Pins the board-readability contract recorded in spec 024:
 * - 4 biome zones with distinct hue families (AC-001–AC-009);
 * - biomeZoneForElevation pure function (AC-020);
 * - terrainColor returns biome-zone HSL for land (AC-022);
 * - water/void distinctness invariants preserved (AC-017/AC-018);
 * - pipe outline color constant (AC-010);
 * - the documented terrain-contrast figures of the spec 017 A-03 sweep,
 *   asserted against `TOKENS.color.biomeZones` so a token change fails this
 *   test instead of rotting `DESIGN.md` (A-05);
 * - the relief mix-extreme tokens and their `DESIGN.md` § 1.1 rows (spec 017
 *   AC-007), which no running guard otherwise covers.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKENS } from '@europa/design';
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

/** Parse `hsl(H S% L%)` to RGB for contrast calculation. */
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

/** The dark biome zones 0–2, the pipe rows' worst-case terrain. */
const DARK_ZONES = TOKENS.color.biomeZones.slice(0, 3);

/** The lightest shipped Peaks shade: zone 3's configured lightness maximum. */
const PEAKS_CEILING_RGB = hslToRgb(
    TOKENS.color.biomeZones[3].hue,
    TOKENS.color.biomeZones[3].saturationPct,
    TOKENS.color.biomeZones[3].lightnessMax,
);

/** One biome zone's shipped configuration. */
type BiomeZone = (typeof TOKENS.color.biomeZones)[number];

/** The lightness `landBandColor` paints for a zone: the configured midpoint. */
function zoneMidpointLightness(zone: BiomeZone): number {
    return Math.round((zone.lightnessMin + zone.lightnessMax) / 2);
}

/** A zone's painted midpoint as sRGB bytes — the pipe rows' reference background. */
function zoneMidpointRgb(zone: BiomeZone): [number, number, number] {
    return hslToRgb(zone.hue, zone.saturationPct, zoneMidpointLightness(zone));
}

/** Hue of a `#rrggbb` token colour in degrees. */
function hexHue(hex: string): number {
    const [red, green, blue] = hexToRgb(hex);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const span = max - min;
    if (span === 0) {
        return 0;
    }
    const sector =
        max === red ? ((green - blue) / span) % 6 : max === green ? (blue - red) / span + 2 : (red - green) / span + 4;
    return (sector * 60 + 360) % 360;
}

/** WCAG contrast ratio between two sRGB byte triples. */
function ratio(a: [number, number, number], b: [number, number, number]): number {
    return contrastRatio(relativeLuminance(a), relativeLuminance(b));
}

/**
 * WCAG contrast ratio of a translucent `rgba()` overlay composited over a
 * background, to that background — the pipe outline's visibility on a tile.
 */
function compositedRatio(overlay: string, background: [number, number, number]): number {
    const match = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/.exec(overlay);
    if (match === null) {
        throw new Error(`not an rgba() palette colour: ${overlay}`);
    }
    const [, red = '0', green = '0', blue = '0', alpha = '0'] = match;
    const a = Number(alpha);
    const composited: [number, number, number] = [
        Math.round(a * Number(red) + (1 - a) * background[0]),
        Math.round(a * Number(green) + (1 - a) * background[1]),
        Math.round(a * Number(blue) + (1 - a) * background[2]),
    ];
    return ratio(composited, background);
}

/** Round to `places` decimals, the precision `DESIGN.md` states its figures at. */
function rounded(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

describe('biomeZoneForElevation (spec 024 FR-005, AC-020)', () => {
    test('elevation 0 → zone 0 (Smooth Ice)', () => {
        const result = biomeZoneForElevation(0);
        expect(result.zone).toBe(0);
        expect(result.hue).toBe(210);
        expect(result.saturationPct).toBe(65);
        expect(result.lightness).toBe(38);
    });

    test('elevation 80 → zone 0 max lightness', () => {
        const result = biomeZoneForElevation(80);
        expect(result.zone).toBe(0);
        expect(result.lightness).toBe(52);
    });

    test('elevation 81 → zone 1 (Fractured Ice)', () => {
        const result = biomeZoneForElevation(81);
        expect(result.zone).toBe(1);
        expect(result.hue).toBe(170);
        expect(result.saturationPct).toBe(55);
        expect(result.lightness).toBe(26);
    });

    test('elevation 160 → zone 1 max lightness', () => {
        const result = biomeZoneForElevation(160);
        expect(result.zone).toBe(1);
        expect(result.lightness).toBe(40);
    });

    test('elevation 161 → zone 2 (Rocky Outcrops)', () => {
        const result = biomeZoneForElevation(161);
        expect(result.zone).toBe(2);
        expect(result.hue).toBe(30);
        expect(result.saturationPct).toBe(55);
        expect(result.lightness).toBe(30);
    });

    test('elevation 208 → zone 2 max lightness', () => {
        const result = biomeZoneForElevation(208);
        expect(result.zone).toBe(2);
        expect(result.lightness).toBe(42);
    });

    test('elevation 209 → zone 3 (Ice Peaks)', () => {
        const result = biomeZoneForElevation(209);
        expect(result.zone).toBe(3);
        expect(result.hue).toBe(200);
        expect(result.saturationPct).toBe(15);
        expect(result.lightness).toBe(80);
    });

    test('elevation 255 → zone 3 max lightness', () => {
        const result = biomeZoneForElevation(255);
        expect(result.zone).toBe(3);
        expect(result.lightness).toBe(95);
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
        // Zone 0 midpoint: (38+52)/2 = 45
        const mid0 = biomeZoneForElevation(40);
        expect(mid0.lightness).toBeGreaterThanOrEqual(38);
        expect(mid0.lightness).toBeLessThanOrEqual(52);

        // Zone 1 midpoint: (26+40)/2 = 33
        const mid1 = biomeZoneForElevation(120);
        expect(mid1.lightness).toBeGreaterThanOrEqual(26);
        expect(mid1.lightness).toBeLessThanOrEqual(40);
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
    test('zone 0 has hue 210 (blue)', () => {
        const hsl = parseHsl(landBandColor(0));
        expect(hsl.hue).toBe(210);
    });

    test('zone 1 has hue 170 (teal)', () => {
        const hsl = parseHsl(landBandColor(1));
        expect(hsl.hue).toBe(170);
    });

    test('zone 2 has hue 30 (orange)', () => {
        const hsl = parseHsl(landBandColor(2));
        expect(hsl.hue).toBe(30);
    });

    test('zone 3 has hue 200 (light blue)', () => {
        const hsl = parseHsl(landBandColor(3));
        expect(hsl.hue).toBe(200);
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

    test('land at elevation 0 returns Smooth Ice hue', () => {
        const hsl = parseHsl(terrainColor('land', 0));
        expect(hsl.hue).toBe(210);
        expect(hsl.sat).toBe(65);
        expect(hsl.light).toBe(38);
    });

    test('land at elevation 255 returns Ice Peaks hue', () => {
        const hsl = parseHsl(terrainColor('land', 255));
        expect(hsl.hue).toBe(200);
        expect(hsl.sat).toBe(15);
        expect(hsl.light).toBe(95);
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
    test('Peaks zone (highest lightness) has sufficient contrast vs void', () => {
        const voidRgb = hexToRgb(VOID_COLOR);
        const voidLum = relativeLuminance(voidRgb);

        // Zone 3's darkest shade (L=80) is the weakest case for the lightest zone.
        const peaks = TOKENS.color.biomeZones[3];
        const peaksRgb = hslToRgb(peaks.hue, peaks.saturationPct, peaks.lightnessMin);
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

/**
 * Every figure `DESIGN.md`'s spec 017 A-03 sweep states, asserted here
 * instead of printed: the sweep transcribes this block's numbers, so a token
 * change fails this test before the prose can go stale (A-05, plan D9).
 */
describe('documented terrain contrast figures (A-03 sweep)', () => {
    const voidRgb = hexToRgb(VOID_COLOR);
    const waterRgb = hexToRgb(WATER_COLOR);
    const peaks = TOKENS.color.biomeZones[3];
    /** The lightest painted land tile: sub-pass 1c's Peaks gradient start. */
    const peaksLightEndRgb = zoneMidpointRgb(peaks);

    test('biome-zone hues and painted midpoint lightness', () => {
        const documented = [
            [80, 210, 45],
            [160, 170, 33],
            [208, 30, 36],
            [255, 200, 88],
        ];
        expect(
            TOKENS.color.biomeZones.map((zone) => [zone.elevationMax, zone.hue, zoneMidpointLightness(zone)]),
            'DESIGN.md § 1.1 biome-zones: elevationMax, hue, painted midpoint lightness',
        ).toEqual(documented);
    });

    test('pipe slope fills against the void and the dark biome midpoints', () => {
        const documented = [
            { name: 'downhill', fill: TOKENS.color.pipeDownhill, void: 4.22, darkZones: [1.3, 1.23, 1.5] },
            { name: 'flat', fill: TOKENS.color.pipeFlat, void: 7.4, darkZones: [2.29, 2.16, 2.63] },
            { name: 'uphill', fill: TOKENS.color.pipeUphill, void: 3.29, darkZones: [1.02, 1.04, 1.17] },
            { name: 'stalled', fill: TOKENS.color.pipeStalled, void: 6.26, darkZones: [1.93, 1.83, 2.23] },
        ];
        for (const row of documented) {
            const fill = hexToRgb(row.fill);
            expect(rounded(ratio(fill, voidRgb), 2), `${row.name} vs void-bg`).toBe(row.void);
            expect(
                DARK_ZONES.map((zone) => rounded(ratio(fill, zoneMidpointRgb(zone)), 2)),
                `${row.name} vs zones 0–2 midpoints`,
            ).toEqual(row.darkZones);
        }
    });

    test('pipe and terrain hue proximities', () => {
        const zone0Hue = TOKENS.color.biomeZones[0].hue;
        const zone1Hue = TOKENS.color.biomeZones[1].hue;
        const zone2Hue = TOKENS.color.biomeZones[2].hue;
        const downhillHue = hexHue(TOKENS.color.pipeDownhill);
        const flatHue = hexHue(TOKENS.color.pipeFlat);
        const stalledHue = hexHue(TOKENS.color.pipeStalled);

        expect([zone0Hue, zone1Hue, zone2Hue, peaks.hue], 'shipped zone hues').toEqual([210, 170, 30, 200]);
        expect(
            [downhillHue, flatHue, hexHue(TOKENS.color.pipeUphill), stalledHue].map((hue) => rounded(hue, 1)),
            'pipe fill hues',
        ).toEqual([161.4, 37.7, 0, 217.9]);
        expect(rounded(hexHue(TOKENS.color.city), 1), 'city — the 43° amber the pipe rows used to name').toBe(43.3);
        expect(rounded(Math.abs(downhillHue - zone1Hue), 1), 'downhill green vs zone 1').toBe(8.6);
        expect(rounded(Math.abs(flatHue - zone2Hue), 1), 'flat amber vs zone 2').toBe(7.7);
        expect(rounded(Math.abs(stalledHue - zone0Hue), 1), 'stalled grey vs zone 0').toBe(7.9);
    });

    test('water ratios name the shipped land ceiling as their referent', () => {
        expect(rounded(ratio(waterRgb, voidRgb), 2), 'water vs void-bg').toBe(2.37);
        expect(rounded(ratio(waterRgb, PEAKS_CEILING_RGB), 2), 'water vs the land ceiling hsl(200 15% 95%)').toBe(6.01);
    });

    test('N-3 water and darkest painted face figures', () => {
        // Sub-pass 1c paints the flat midpoint only; the retired gradient's
        // L=26 shade is no longer painted (017 v1.9 FR-005).
        const zone1 = TOKENS.color.biomeZones[1];
        expect(rounded(ratio(zoneMidpointRgb(zone1), voidRgb), 2), 'zone 1 flat face (L=33) vs void-bg').toBe(3.43);
    });

    test('the § 3 Peaks ceiling row states which shade it measures', () => {
        expect(rounded(ratio(PEAKS_CEILING_RGB, voidRgb), 2), 'shipped Peaks ceiling (L=95) vs void-bg').toBe(14.26);
        expect(rounded(ratio(peaksLightEndRgb, voidRgb), 2), 'painted flat Peaks face (L=88) vs void-bg').toBe(12.16);
    });

    test('the pipe outline against the painted land range', () => {
        expect(
            rounded(compositedRatio(TOKENS.color.pipeOutline, peaksLightEndRgb), 2),
            'outline over the lightest painted land tile (Peaks flat face, L=88)',
        ).toBe(7.49);
        expect(
            DARK_ZONES.map((zone) => rounded(compositedRatio(TOKENS.color.pipeOutline, zoneMidpointRgb(zone)), 2)),
            'outline over the dark zone midpoints',
        ).toEqual([3.25, 3.4, 2.91]);
    });
});

/**
 * Spec 017 AC-007's token-presence clause: no running guard reads `DESIGN.md`,
 * so a relief token added without its § 1.1 row — or a row dropped later —
 * has to fail here (G-01/G-02 are deferred per spec 012's Scope Note).
 */
describe('relief tokens and their DESIGN.md rows (spec 017 AC-007)', () => {
    test('relief mix extremes carry the documented values', () => {
        expect(TOKENS.color.reliefHighlight).toBe('#ffffff');
        expect(TOKENS.color.reliefShadow).toBe('#000000');
    });

    test('DESIGN.md § 1.1 documents both tokens, each on its own row', () => {
        const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
        const design = readFileSync(resolve(repositoryRoot, 'DESIGN.md'), 'utf8');
        const heading = '### 1.1 Colors';
        const start = design.indexOf(heading);
        expect(start, `DESIGN.md must carry the "${heading}" heading`).toBeGreaterThanOrEqual(0);
        const nextHeading = design.indexOf('\n### ', start + heading.length);
        expect(nextHeading, 'DESIGN.md § 1.1 must be followed by the next section heading').toBeGreaterThan(start);
        const rows = design.slice(start + heading.length, nextHeading).split('\n');
        expect(rows.length, 'DESIGN.md § 1.1 must carry rows').toBeGreaterThan(1);

        const documented = [
            ['TOKENS.color.reliefHighlight', TOKENS.color.reliefHighlight],
            ['TOKENS.color.reliefShadow', TOKENS.color.reliefShadow],
        ];
        for (const [name, value] of documented) {
            const row = rows.filter((line) => line.includes(name)).join('\n');
            expect(row, `${name} must have a § 1.1 row`).not.toBe('');
            expect(row, `${name}'s § 1.1 row must carry ${value}`).toContain(value);
        }
    });
});
