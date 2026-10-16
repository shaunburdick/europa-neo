/**
 * Delta-based terrain relief bands — feature 017 (T002). Pure mapping
 * from an edge's elevation delta to the band colour that sub-pass 1d in
 * `canvas.ts` paints: no clock, no randomness, no zone table (FR-003)
 * and no knowledge of the view (FR-010).
 */

import { RELIEF_HIGHLIGHT_COLOR, RELIEF_SHADOW_COLOR } from './palette';

/**
 * FR-002's fixed sign constant: `true` puts the highlight (lighter)
 * treatment on an edge toward a *lower* neighbour, so a higher
 * neighbour always renders darker. Forced, not chosen: on Peaks' light
 * gradient end white caps a highlight at 1.31:1, under FR-006b's floor.
 */
export const RELIEF_HIGHLIGHT_IS_DOWNHILL = true;

/** FR-003's normaliser — the largest possible `|Δelevation|`. */
export const RELIEF_MAX_DELTA = 255;

/** Band thickness as a fraction of the cell size (3 px at zoom 32). */
export const RELIEF_BAND_RATIO = 0.08;

/** Floor that keeps the band measurable at the smallest zoom step. */
export const RELIEF_MIN_BAND_PX = 2;

/**
 * Fixed paint order of the four edges. Bands are opaque and stay inside
 * their own tile, so this order only resolves the corner overlaps
 * between one tile's own bands.
 */
export const RELIEF_DIRECTIONS = ['N', 'E', 'S', 'W'] as const;

/**
 * Edge band thickness in CSS px at `zoom`: proportional to the cell size
 * with a floor, so a band stays visible at the 32 px minimum (005
 * FR-017).
 *
 * @param zoom Cell size in CSS px.
 */
export function reliefBandThickness(zoom: number): number {
    return Math.max(RELIEF_MIN_BAND_PX, Math.round(zoom * RELIEF_BAND_RATIO));
}

/** One sRGB channel byte (0–255) as a linear-light value (0–1). */
export function srgbToLinear(channelByte: number): number {
    const s = Math.max(0, Math.min(255, channelByte)) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/**
 * The mix extremes, read from the tokens the bands mix toward (FR-009):
 * white's luminance is 1.0 and black's is 0.0, which is what makes
 * {@link reliefTargetLuminance}'s fraction identity exact.
 */
const HIGHLIGHT_EXTREME_LINEAR = hexToLinearTriple(RELIEF_HIGHLIGHT_COLOR);
const SHADOW_EXTREME_LINEAR = hexToLinearTriple(RELIEF_SHADOW_COLOR);

/** WCAG 2.x relative luminance of an sRGB byte triple. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** WCAG 2.x relative luminance of an already-linear-light triple. */
function linearLuminance(linear: readonly [number, number, number]): number {
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The linear-light triple of one of the painter's own `hsl(H, S%, L%)`
 * gradient ends — the per-zone base of FR-002. Throws on any other form:
 * the only callers pass the painter's own gradient ends.
 *
 * @param hslColor Colour string as `landBandColor` emits it.
 */
export function linearTriple(hslColor: string): readonly [number, number, number] {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i.exec(hslColor.trim());
    if (match === null) {
        throw new Error(`relief: expected an "hsl(H, S%, L%)" colour, received "${hslColor}"`);
    }
    const [red, green, blue] = hslToBytes(Number(match[1]), Number(match[2]), Number(match[3]));
    return [srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue)];
}

/**
 * The delta's magnitude as a fraction of {@link RELIEF_MAX_DELTA},
 * clamped to 0–1.
 *
 * @param delta Signed elevation delta; the sign is handled by the caller.
 */
export function reliefFraction(delta: number): number {
    return Math.min(Math.abs(delta), RELIEF_MAX_DELTA) / RELIEF_MAX_DELTA;
}

/**
 * The relative luminance a band at `fraction` of `baseLuminance`
 * reaches: `L + f·(1 − L)` toward white, `L·(1 − f)/(1 + 20·f·L)`
 * toward black. Both are normalised by that base's reachable maximum,
 * so one `|Δ|` is the same fraction of every zone's treatment (FR-003)
 * without a per-zone magnitude constant.
 *
 * @param baseLuminance Relative luminance of the zone's gradient end.
 * @param fraction Magnitude as a fraction of {@link RELIEF_MAX_DELTA}.
 * @param highlight `true` for the highlight (toward white) treatment.
 */
export function reliefTargetLuminance(baseLuminance: number, fraction: number, highlight: boolean): number {
    const f = Math.max(0, Math.min(1, fraction));
    return highlight
        ? baseLuminance + f * (1 - baseLuminance)
        : (baseLuminance * (1 - f)) / (1 + 20 * f * baseLuminance);
}

/**
 * The band colour: `baseLinear` mixed per channel toward the sign's token
 * extreme, returned as a computed `#rrggbb`. The mix factor lands the
 * luminance exactly on {@link reliefTargetLuminance}, so the only drift
 * is the channels' 8-bit rounding.
 *
 * @param baseLinear Linear-light triple of the zone's gradient end.
 * @param fraction Magnitude as a fraction of {@link RELIEF_MAX_DELTA}.
 * @param highlight `true` for the highlight (toward white) treatment.
 */
export function reliefBandColor(
    baseLinear: readonly [number, number, number],
    fraction: number,
    highlight: boolean,
): string {
    const f = Math.max(0, Math.min(1, fraction));
    const baseLuminance = linearLuminance(baseLinear);
    const k = highlight ? f : (f * (1 + 20 * baseLuminance)) / (1 + 20 * f * baseLuminance);
    const extreme = highlight ? HIGHLIGHT_EXTREME_LINEAR : SHADOW_EXTREME_LINEAR;
    return hexColor(
        linearToChannel((1 - k) * baseLinear[0] + k * extreme[0]),
        linearToChannel((1 - k) * baseLinear[1] + k * extreme[1]),
        linearToChannel((1 - k) * baseLinear[2] + k * extreme[2]),
    );
}

/** Parse a `#rrggbb` token value to its linear-light triple. */
function hexToLinearTriple(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [srgbToLinear((value >> 16) & 0xff), srgbToLinear((value >> 8) & 0xff), srgbToLinear(value & 0xff)];
}

/**
 * An `hsl(H, S%, L%)` triple as sRGB bytes — the conversion the browser
 * applies to the gradient end strings 1c paints.
 */
function hslToBytes(hue: number, saturationPct: number, lightnessPct: number): readonly [number, number, number] {
    const s = saturationPct / 100;
    const l = lightnessPct / 100;
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

/** A linear-light channel back to its sRGB byte, clamped and rounded. */
function linearToChannel(linear: number): number {
    const c = Math.max(0, Math.min(1, linear));
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(s * 255);
}

/** Format three sRGB bytes as a `#rrggbb` string. */
function hexColor(red: number, green: number, blue: number): string {
    const byte = (value: number): string => value.toString(16).padStart(2, '0');
    return `#${byte(red)}${byte(green)}${byte(blue)}`;
}
