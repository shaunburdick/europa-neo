/**
 * Unit tests: the pure relief mapping (spec 017; FR-002, FR-003, FR-010).
 * The realised pixels are the browser readback suite's half.
 */

import { describe, expect, test } from 'vitest';
import { landBandColor } from '../../../src/render/palette';
import {
    RELIEF_LIT_LIGHTNESS_STEPS,
    RELIEF_SHADED_LIGHTNESS_STEPS,
    RELIEF_STEP_THRESHOLDS,
    RELIEF_WIDTH_RATIOS,
    relativeLuminance,
    reliefBandWidth,
    reliefSideIsLit,
    reliefStep,
    reliefToneColor,
    reliefToneColours,
    reliefWidthRatio,
} from '../../../src/render/relief';

/** Biome zone indices, in elevation order. */
const ZONES = [0, 1, 2, 3];

/** One delta per ladder step, plus one that must cap at step 3. */
const WIDTH_DELTAS = [1, 5, 10, 255];

/** Parse `hsl(H, S%, L%)` to sRGB bytes — the browser's own conversion. */
function hslToRgb(hsl: string): readonly [number, number, number] {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/.exec(hsl);
    if (match === null) {
        throw new Error(`not an "hsl(H, S%, L%)" colour: ${hsl}`);
    }
    const s = Number(match[2]) / 100;
    const l = Number(match[3]) / 100;
    const hue = Number(match[1]);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hue < 60) {
        red = c;
        green = x;
    } else if (hue < 120) {
        red = x;
        green = c;
    } else if (hue < 180) {
        green = c;
        blue = x;
    } else if (hue < 240) {
        green = x;
        blue = c;
    } else if (hue < 300) {
        red = x;
        blue = c;
    } else {
        red = c;
        blue = x;
    }
    return [Math.round((red + m) * 255), Math.round((green + m) * 255), Math.round((blue + m) * 255)];
}

/** Parse `#rrggbb` to sRGB bytes. */
function hexToRgb(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** WCAG contrast ratio between two colours, lighter first. */
function contrastOf(first: string, second: string): number {
    const a = relativeLuminance(hexToRgb(first));
    const b = relativeLuminance(hexToRgb(second));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The face's colour as `#rrggbb`, for contrast against the tones. */
function faceHex(zone: number): string {
    const [red, green, blue] = hslToRgb(landBandColor(zone));
    const byte = (value: number): string => value.toString(16).padStart(2, '0');
    return `#${byte(red)}${byte(green)}${byte(blue)}`;
}

describe('reliefStep, width and tone ladder (FR-003)', () => {
    test('the width ladder is 4 / 7 / 10 % and caps at 10 %', () => {
        expect(RELIEF_WIDTH_RATIOS).toEqual([0.04, 0.07, 0.1]);
        expect(RELIEF_STEP_THRESHOLDS).toEqual([4, 9]);
        for (const delta of WIDTH_DELTAS) {
            expect(reliefStep(delta)).toBe(delta <= 4 ? 1 : delta <= 9 ? 2 : 3);
        }
        expect(reliefStep(0)).toBe(0);
        expect(reliefWidthRatio(0)).toBe(0);
        expect(reliefWidthRatio(1)).toBe(0.04);
        expect(reliefWidthRatio(4)).toBe(0.04);
        expect(reliefWidthRatio(5)).toBe(0.07);
        expect(reliefWidthRatio(9)).toBe(0.07);
        expect(reliefWidthRatio(10)).toBe(0.1);
        expect(reliefWidthRatio(255)).toBe(0.1);
        for (const delta of WIDTH_DELTAS) {
            expect(reliefBandWidth(96, delta)).toBeCloseTo(96 * reliefWidthRatio(delta), 12);
        }
    });

    test('the tone ladder rises with Δ and saturates at step 3', () => {
        expect(RELIEF_LIT_LIGHTNESS_STEPS).toEqual([0.74, 0.79, 0.84]);
        expect(RELIEF_SHADED_LIGHTNESS_STEPS).toEqual([0.4, 0.5, 0.6]);
        for (const zone of ZONES) {
            const face = landBandColor(zone);
            for (const side of ['N', 'S'] as const) {
                expect(reliefToneColor(face, 9, side)).not.toBe(reliefToneColor(face, 10, side));
                expect(reliefToneColor(face, 10, side)).toBe(reliefToneColor(face, 255, side));
            }
        }
    });
    test('every tone stays in its face hue family (FR-002/FR-003)', () => {
        const channelOrder = (rgb: readonly [number, number, number]): string => {
            const [red, green, blue] = rgb;
            return `${red >= green && red >= blue ? 'r' : green >= blue ? 'g' : 'b'}${red <= green && red <= blue ? 'r' : green <= blue ? 'g' : 'b'}`;
        };
        for (const zone of ZONES) {
            const faceOrder = channelOrder(hexToRgb(faceHex(zone)));
            const tones = reliefToneColours(landBandColor(zone));
            for (const colour of [...tones.lit, ...tones.shaded]) {
                expect(channelOrder(hexToRgb(colour))).toBe(faceOrder);
            }
        }
    });
});

describe('tone depends on orientation alone (FR-002)', () => {
    test('north and west are lit; south and east are shaded', () => {
        expect(reliefSideIsLit('N')).toBe(true);
        expect(reliefSideIsLit('W')).toBe(true);
        expect(reliefSideIsLit('S')).toBe(false);
        expect(reliefSideIsLit('E')).toBe(false);
    });

    test('opposite sides of one drop share their tone, independent of the delta', () => {
        for (const zone of ZONES) {
            const face = landBandColor(zone);
            expect(reliefToneColor(face, 5, 'N')).toBe(reliefToneColor(face, 5, 'W'));
            expect(reliefToneColor(face, 5, 'S')).toBe(reliefToneColor(face, 5, 'E'));
            // The tone is a function of the step, never of the raw drop.
            expect(reliefToneColor(face, 10, 'N')).toBe(reliefToneColor(face, 255, 'N'));
            expect(reliefToneColor(face, 10, 'S')).toBe(reliefToneColor(face, 255, 'S'));
        }
    });

    test('the ladder brightens a lit bevel and darkens a shaded one, still at step 3', () => {
        for (const zone of ZONES) {
            const tones = reliefToneColours(landBandColor(zone));
            const lit = tones.lit.map((colour) => relativeLuminance(hexToRgb(colour)));
            const shaded = tones.shaded.map((colour) => relativeLuminance(hexToRgb(colour)));
            expect(lit[1]).toBeGreaterThan(lit[0] ?? 0);
            expect(lit[2]).toBeGreaterThan(lit[1] ?? 0);
            expect(shaded[1]).toBeLessThan(shaded[0] ?? 0);
            expect(shaded[2]).toBeLessThan(shaded[1] ?? 0);
        }
    });
});

describe('bevel visibility and distinguishability per zone (FR-006)', () => {
    test('lit and shaded bevels are ≥ 3:1 apart at Δ1 in every zone', () => {
        for (const zone of ZONES) {
            const tones = reliefToneColours(landBandColor(zone));
            expect(contrastOf(tones.lit[0], tones.shaded[0])).toBeGreaterThanOrEqual(3);
        }
    });

    test('each Δ1 bevel is ≥ 1.2:1 against its zone face', () => {
        for (const zone of ZONES) {
            const face = faceHex(zone);
            const tones = reliefToneColours(landBandColor(zone));
            expect(contrastOf(face, tones.lit[0])).toBeGreaterThanOrEqual(1.2);
            expect(contrastOf(face, tones.shaded[0])).toBeGreaterThanOrEqual(1.2);
        }
    });

    test('a zero or negative drop returns the face colour', () => {
        for (const zone of ZONES) {
            const face = landBandColor(zone);
            expect(reliefToneColor(face, 0, 'N')).toBe(faceHex(zone));
            expect(reliefToneColor(face, -4, 'S')).toBe(faceHex(zone));
        }
    });
});

describe('purity (FR-010)', () => {
    test('identical inputs give identical colours', () => {
        for (const zone of ZONES) {
            const face = landBandColor(zone);
            expect(reliefToneColours(face)).toEqual(reliefToneColours(face));
            for (const side of ['N', 'E', 'S', 'W'] as const) {
                expect(reliefToneColor(face, 7, side)).toBe(reliefToneColor(face, 7, side));
            }
        }
    });
});
