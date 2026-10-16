/**
 * Unit tests: the pure relief mapping (spec 017 T003; FR-002, FR-003,
 * FR-010). Everything here runs against the pure functions — the
 * realised pixels are the browser readback suite's half.
 */

import { describe, expect, test } from 'vitest';
import { landBandColor, RELIEF_HIGHLIGHT_COLOR, RELIEF_SHADOW_COLOR } from '../../../src/render/palette';
import {
    linearTriple,
    relativeLuminance,
    reliefBandColor,
    reliefFraction,
    reliefTargetLuminance,
} from '../../../src/render/relief';

/** `|Δ|` sampled by AC-002's sweep — 1 and 2 both sampled, so a floored mapping fails. */
const SAMPLED_DELTAS = [1, 2, 16, 64, 128, 192, 255];

/** Biome zone indices, in elevation order. */
const ZONES = [0, 1, 2, 3];

/** Both delta signs, as the `highlight` flag `reliefBandColor` takes. */
const SIGNS = [true, false];

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

/** Format three sRGB bytes as `#rrggbb`. */
function rgbToHex(rgb: readonly [number, number, number]): string {
    const byte = (value: number): string => value.toString(16).padStart(2, '0');
    return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/** WCAG contrast ratio between two relative luminances, lighter first. */
function contrastOf(luminanceA: number, luminanceB: number): number {
    return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

/** The relative luminance of a zone's gradient end, as 1c paints it. */
function zoneLuminance(zone: number): number {
    return relativeLuminance(hslToRgb(landBandColor(zone)));
}

/** Assert each value rises (or falls) strictly from the one before it. */
function expectStrictlyOrdered(values: readonly number[], direction: 'rising' | 'falling'): void {
    let previous: number | undefined;
    for (const value of values) {
        if (previous !== undefined) {
            if (direction === 'rising') {
                expect(value).toBeGreaterThan(previous);
            } else {
                expect(value).toBeLessThan(previous);
            }
        }
        previous = value;
    }
}

describe('reliefFraction (FR-003)', () => {
    test('is 0 at Δ = 0, linear in |Δ|, clamped at the 255 normaliser', () => {
        expect(reliefFraction(0)).toBe(0);
        for (const delta of SAMPLED_DELTAS) {
            expect(reliefFraction(delta)).toBe(delta / 255);
        }
        expect(reliefFraction(255)).toBe(1);
        expect(reliefFraction(510)).toBe(1);
        expect(reliefFraction(-64)).toBe(64 / 255);
    });
});

describe('reliefTargetLuminance (AC-002, pure function)', () => {
    test('is strictly monotone across the sampled sweep and keeps 255 above each sampled quarter', () => {
        for (const zone of ZONES) {
            const baseLuminance = zoneLuminance(zone);
            for (const highlight of SIGNS) {
                const luminances: number[] = [];
                const samples: { delta: number; magnitude: number }[] = [];
                for (const delta of SAMPLED_DELTAS) {
                    const luminance = reliefTargetLuminance(baseLuminance, reliefFraction(delta), highlight);
                    luminances.push(luminance);
                    samples.push({ delta, magnitude: contrastOf(luminance, baseLuminance) });
                }
                // Toward white the band brightens, toward black it darkens;
                // either way the treatment against the control grows.
                expectStrictlyOrdered(luminances, highlight ? 'rising' : 'falling');
                expectStrictlyOrdered(
                    samples.map(({ magnitude }) => magnitude),
                    'rising',
                );
                const top = samples.find(({ delta }) => delta === 255);
                expect(top).toBeDefined();
                for (const sample of samples) {
                    if (top !== undefined && sample.delta !== 255) {
                        expect(top.magnitude).toBeGreaterThan(sample.magnitude);
                    }
                }
            }
        }
    });
});

describe('reliefTargetLuminance fraction identity (AC-002 zone invariance)', () => {
    test('reaches the same fraction of each base\u2019s maximum treatment, exactly', () => {
        for (const zone of ZONES) {
            const baseLuminance = zoneLuminance(zone);
            for (const highlight of SIGNS) {
                const cap = contrastOf(baseLuminance, reliefTargetLuminance(baseLuminance, 1, highlight));
                for (const delta of [1, 2, 64, 160, 255]) {
                    const fraction = reliefFraction(delta);
                    const band = contrastOf(baseLuminance, reliefTargetLuminance(baseLuminance, fraction, highlight));
                    // Algebraic, so the only error is floating point noise
                    // (the ratio is a quotient of rounded sums) — not a
                    // measurement allowance.
                    expect((band - 1) / (cap - 1)).toBeCloseTo(fraction, 12);
                }
            }
        }
    });
});

describe('reliefBandColor (FR-002, FR-003)', () => {
    test('rounds a band to within half an 8-bit step of its modelled luminance (Peaks light base)', () => {
        const baseLinear = linearTriple(landBandColor(3));
        const baseLuminance = zoneLuminance(3);
        for (const highlight of SIGNS) {
            for (const fraction of [0.05, 0.5, 0.82, 1]) {
                const painted = relativeLuminance(hexToRgb(reliefBandColor(baseLinear, fraction, highlight)));
                const modelled = reliefTargetLuminance(baseLuminance, fraction, highlight);
                expect(Math.abs(painted - modelled)).toBeLessThanOrEqual(0.0045);
            }
        }
    });

    test('is the base colour at |Δ| = 0 and each sign\u2019s token extreme at |Δ| = 255', () => {
        for (const zone of ZONES) {
            const baseLinear = linearTriple(landBandColor(zone));
            const baseHex = rgbToHex(hslToRgb(landBandColor(zone)));
            for (const highlight of SIGNS) {
                expect(reliefBandColor(baseLinear, reliefFraction(0), highlight)).toBe(baseHex);
                expect(reliefBandColor(baseLinear, reliefFraction(255), highlight)).toBe(
                    highlight ? RELIEF_HIGHLIGHT_COLOR : RELIEF_SHADOW_COLOR,
                );
            }
        }
    });
});

describe('neutral edges (FR-004)', () => {
    test('a zero delta and every non-land neighbour yield no treatment', () => {
        // Δ = 0 is the only neutral input the module sees: water, an
        // absent neighbour, and off-board are skipped by the caller's
        // guard before the call (plan D1), and the readback suite
        // asserts those three on pixels.
        for (const zone of ZONES) {
            const baseLinear = linearTriple(landBandColor(zone));
            const baseHex = rgbToHex(hslToRgb(landBandColor(zone)));
            const baseLuminance = zoneLuminance(zone);
            expect(reliefFraction(0)).toBe(0);
            for (const highlight of SIGNS) {
                const band = reliefBandColor(baseLinear, reliefFraction(0), highlight);
                expect(band).toBe(baseHex);
                expect(contrastOf(relativeLuminance(hexToRgb(band)), baseLuminance)).toBeCloseTo(1, 10);
            }
        }
    });
});
