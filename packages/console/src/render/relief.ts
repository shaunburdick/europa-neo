/**
 * Land-tile relief bevels — feature 017. Pure mapping from one tile side
 * to its bevel: the face is flat, one light stands at the map's NW
 * corner, so tone comes from the side alone and width from how far this
 * tile rises above the neighbour. No clock, no randomness, no view
 * knowledge (FR-010).
 */

import { RELIEF_HIGHLIGHT_COLOR, RELIEF_SHADOW_COLOR } from './palette';

/** Bevel width as a fraction of the tile size for Δ = 1, 2, 3+ (capped at 10 %). */
export const RELIEF_WIDTH_RATIOS = [0.04, 0.07, 0.1] as const;

/** Tone mix toward the lit/shaded token per Δ step; saturates with the width. */
export const RELIEF_TONE_MIXES = [0.74, 0.79, 0.84] as const;

/** The four tile sides, in paint order. */
export const RELIEF_SIDES = ['N', 'E', 'S', 'W'] as const;

/** One tile side. */
export type ReliefSide = (typeof RELIEF_SIDES)[number];

/** Δ at which both width and tone stop growing. */
export const RELIEF_MAX_STEP = RELIEF_WIDTH_RATIOS.length;

/** The lit (north/west) and shaded (south/east) extremes, as sRGB bytes. */
const LIT_TARGET = hexToBytes(RELIEF_HIGHLIGHT_COLOR);
const SHADED_TARGET = hexToBytes(RELIEF_SHADOW_COLOR);

/**
 * The Δ ladder step: 0 for no positive delta, otherwise 1, 2 or 3+.
 *
 * @param delta Positive elevation drop (`own − neighbour`).
 */
export function reliefStep(delta: number): number {
    return Math.max(0, Math.min(RELIEF_MAX_STEP, Math.trunc(delta)));
}

/**
 * Bevel width as a fraction of the tile size; 0 when there is no drop.
 *
 * @param delta Positive elevation drop (`own − neighbour`).
 */
export function reliefWidthRatio(delta: number): number {
    const step = reliefStep(delta);
    return step === 0 ? 0 : (RELIEF_WIDTH_RATIOS[step - 1] ?? 0);
}

/**
 * Bevel width in CSS px for a tile of `size` px.
 *
 * @param size Tile side length in CSS px.
 * @param delta Positive elevation drop (`own − neighbour`).
 */
export function reliefBandWidth(size: number, delta: number): number {
    return size * reliefWidthRatio(delta);
}

/**
 * The tone's mix toward its token extreme; 0 when there is no drop.
 *
 * @param delta Positive elevation drop (`own − neighbour`).
 */
export function reliefToneMix(delta: number): number {
    const step = reliefStep(delta);
    return step === 0 ? 0 : (RELIEF_TONE_MIXES[step - 1] ?? 0);
}

/**
 * The single light stands at the NW corner: a north- or west-facing
 * bevel is lit, a south- or east-facing one is shaded.
 *
 * @param side Tile side the bevel faces.
 */
export function reliefSideIsLit(side: ReliefSide): boolean {
    return side === 'N' || side === 'W';
}

/**
 * The three lit and three shaded bevel colours for one flat face — the
 * per-zone pre-computation the painter uses, so no band re-parses an
 * `hsl()` string.
 *
 * @param faceHsl The flat zone face as `hsl(H, S%, L%)`.
 */
export function reliefToneColours(faceHsl: string): {
    readonly lit: readonly [string, string, string];
    readonly shaded: readonly [string, string, string];
} {
    const face = hslToBytes(faceHsl);
    const litTone = (mix: number): string => mixedHex(face, LIT_TARGET, mix);
    const shadedTone = (mix: number): string => mixedHex(face, SHADED_TARGET, mix);
    return {
        lit: [litTone(RELIEF_TONE_MIXES[0]), litTone(RELIEF_TONE_MIXES[1]), litTone(RELIEF_TONE_MIXES[2])],
        shaded: [shadedTone(RELIEF_TONE_MIXES[0]), shadedTone(RELIEF_TONE_MIXES[1]), shadedTone(RELIEF_TONE_MIXES[2])],
    };
}

/**
 * The bevel colour for one side at one positive delta: the face mixed
 * toward the lit or shaded token by the Δ step's factor. Orientation
 * alone chooses the tone; the drop only sets its strength (FR-002/003).
 *
 * @param faceHsl The flat zone face as `hsl(H, S%, L%)`.
 * @param delta Positive elevation drop (`own − neighbour`).
 * @param side Tile side the bevel faces.
 */
export function reliefToneColor(faceHsl: string, delta: number, side: ReliefSide): string {
    const step = reliefStep(delta);
    if (step === 0) {
        return mixedHex(hslToBytes(faceHsl), hslToBytes(faceHsl), 0);
    }
    const tones = reliefToneColours(faceHsl);
    return (reliefSideIsLit(side) ? tones.lit : tones.shaded)[step - 1] ?? faceHsl;
}

/** One sRGB channel byte (0–255) as a linear-light value (0–1). */
export function srgbToLinear(channelByte: number): number {
    const s = Math.max(0, Math.min(255, channelByte)) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an sRGB byte triple. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** Per-channel sRGB mix of `base` toward `target` by `mix`, as `#rrggbb`. */
function mixedHex(
    base: readonly [number, number, number],
    target: readonly [number, number, number],
    mix: number,
): string {
    const channel = (index: 0 | 1 | 2): string =>
        Math.round(base[index] + (target[index] - base[index]) * mix)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Parse a `#rrggbb` token value to sRGB bytes. */
function hexToBytes(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * An `hsl(H, S%, L%)` triple as sRGB bytes — the conversion the browser
 * applies to the flat face strings the painter emits.
 */
function hslToBytes(hslColor: string): readonly [number, number, number] {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i.exec(hslColor.trim());
    if (match === null) {
        throw new Error(`relief: expected an "hsl(H, S%, L%)" colour, received "${hslColor}"`);
    }
    const hue = Number(match[1]);
    const saturation = Number(match[2]) / 100;
    const lightness = Number(match[3]) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const offset = lightness - chroma / 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hue < 60) {
        red = chroma;
        green = second;
    } else if (hue < 120) {
        red = second;
        green = chroma;
    } else if (hue < 180) {
        green = chroma;
        blue = second;
    } else if (hue < 240) {
        green = second;
        blue = chroma;
    } else if (hue < 300) {
        red = second;
        blue = chroma;
    } else {
        red = chroma;
        blue = second;
    }
    return [Math.round((red + offset) * 255), Math.round((green + offset) * 255), Math.round((blue + offset) * 255)];
}
