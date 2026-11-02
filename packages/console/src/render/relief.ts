/**
 * Land-tile relief bevels — feature 017. Pure mapping from one tile side
 * to its bevel: one light stands at the map's NW corner, so tone comes
 * from the side alone and width from how far this tile rises above the
 * neighbour. The face texture carries no elevation (FR-005), so the
 * bevels are the sole relief cue. No clock, no randomness, no view
 * knowledge (FR-010).
 */

import { RELIEF_HIGHLIGHT_COLOR, RELIEF_SHADOW_COLOR } from './palette';

/** Bevel width as a fraction of the tile size for step 1, 2, 3 (capped at 10 %). */
/** @lintignore Test seam: relief tests pin the width ladder. */
export const RELIEF_WIDTH_RATIOS = [0.04, 0.07, 0.1] as const;

/**
 * The largest drop in each ladder step: Δ 1–4 → step 1, 5–9 → step 2,
 * 10+ → step 3.
 *
 * Measured over five seeds at both shipped board sizes (32 and 48 —
 * 28,594 adjacent land pairs, `@europa/terrain`): p25 = 2, p50 = 4,
 * p75 = 7, p90 = 10, p99 = 15, max = 27. These cut the positive drops
 * 51 % / 40 % / 8 %, so a typical board spreads across all three steps
 * and only an unusually large drop reaches the 10 % cap. Re-pin them
 * if the terrain generator's relief changes.
 */
/** @lintignore Test seam: relief tests pin the step thresholds. */
export const RELIEF_STEP_THRESHOLDS = [4, 9] as const;

/**
 * Share of the face's remaining lightness headroom a lit (N/W) bevel
 * gains per step. Hue and saturation are kept exactly, so the band stays
 * the same material; only its lightness moves toward the lit anchor.
 */
/** @lintignore Test seam: relief tests pin lit lightness steps. */
export const RELIEF_LIT_LIGHTNESS_STEPS = [0.74, 0.79, 0.84] as const;

/**
 * Share of the face's own lightness a shaded (S/E) bevel gives up per
 * step. Separate from the lit ladder because the faces' lightnesses
 * differ: a pale Peaks face must lose enough lightness to clear the
 * tone floor, while a dark zone's shade would reach black under the
 * same share.
 */
/** @lintignore Test seam: relief tests pin shaded lightness steps. */
export const RELIEF_SHADED_LIGHTNESS_STEPS = [0.4, 0.5, 0.6] as const;

/** The four tile sides, in paint order. */
export const RELIEF_SIDES = ['N', 'E', 'S', 'W'] as const;

/** One tile side. */
export type ReliefSide = (typeof RELIEF_SIDES)[number];

/** Step at which both width and tone stop growing. */
const RELIEF_MAX_STEP = RELIEF_WIDTH_RATIOS.length;

/** The lit and shaded lightness anchors, taken from the token extremes. */
const LIT_ANCHOR_LIGHTNESS = hexLightness(RELIEF_HIGHLIGHT_COLOR);
const SHADED_ANCHOR_LIGHTNESS = hexLightness(RELIEF_SHADOW_COLOR);

/**
 * The Δ ladder step: 0 for no positive delta, otherwise 1, 2 or 3.
 *
 * @param delta Positive elevation drop (`own − neighbour`).
 */
export function reliefStep(delta: number): number {
    if (delta < 1) {
        return 0;
    }
    const threshold = RELIEF_STEP_THRESHOLDS.findIndex((max) => delta <= max);
    return threshold === -1 ? RELIEF_MAX_STEP : threshold + 1;
}

/**
 * Bevel width as a fraction of the tile size; 0 when there is no drop.
 *
 * @param delta Positive elevation drop (`own − neighbour`).
 */
/** @lintignore Test seam: relief tests pin the width-ratio mapping. */
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
 * The single light stands at the NW corner: a north- or west-facing
 * bevel is lit, a south- or east-facing one is shaded.
 *
 * @param side Tile side the bevel faces.
 */
export function reliefSideIsLit(side: ReliefSide): boolean {
    return side === 'N' || side === 'W';
}

/**
 * The three lit and three shaded bevel colours for one zone face — the
 * per-zone pre-computation the painter uses, so no band re-parses an
 * `hsl()` string. Each tone keeps the face's hue and saturation and
 * moves only its lightness toward the token extreme (FR-002/FR-003).
 *
 * @param faceHsl The flat zone face as `hsl(H, S%, L%)`.
 */
export function reliefToneColours(faceHsl: string): {
    readonly lit: readonly [string, string, string];
    readonly shaded: readonly [string, string, string];
} {
    const face = parseHsl(faceHsl);
    const litTone = (share: number): string => lightnessShift(face, share, LIT_ANCHOR_LIGHTNESS);
    const shadedTone = (share: number): string => lightnessShift(face, share, SHADED_ANCHOR_LIGHTNESS);
    return {
        lit: [
            litTone(RELIEF_LIT_LIGHTNESS_STEPS[0]),
            litTone(RELIEF_LIT_LIGHTNESS_STEPS[1]),
            litTone(RELIEF_LIT_LIGHTNESS_STEPS[2]),
        ],
        shaded: [
            shadedTone(RELIEF_SHADED_LIGHTNESS_STEPS[0]),
            shadedTone(RELIEF_SHADED_LIGHTNESS_STEPS[1]),
            shadedTone(RELIEF_SHADED_LIGHTNESS_STEPS[2]),
        ],
    };
}

/** An `hsl()` colour's components, saturation and lightness in 0–1. */
interface Hsl {
    readonly hue: number;
    readonly saturation: number;
    readonly lightness: number;
}

/** Parse an `hsl(H, S%, L%)` string. */
function parseHsl(hslColor: string): Hsl {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i.exec(hslColor.trim());
    if (match === null) {
        throw new Error(`relief: expected an "hsl(H, S%, L%)" colour, received "${hslColor}"`);
    }
    return {
        hue: Number(match[1]),
        saturation: Number(match[2]) / 100,
        lightness: Number(match[3]) / 100,
    };
}

/** The same face colour with lightness moved `share` of the way to `anchorLightness`. */
function lightnessShift(face: Hsl, share: number, anchorLightness: number): string {
    const lightness = face.lightness + (anchorLightness - face.lightness) * share;
    return bytesToHex(hslToBytes(face.hue, face.saturation, lightness));
}

/** The HSL lightness of a `#rrggbb` token value, in 0–1. */
function hexLightness(hex: string): number {
    const [red, green, blue] = hexToBytes(hex);
    return (Math.max(red, green, blue) + Math.min(red, green, blue)) / 2 / 255;
}

/** Parse a `#rrggbb` token value to sRGB bytes. */
function hexToBytes(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** sRGB bytes as `#rrggbb`. */
function bytesToHex([red, green, blue]: readonly [number, number, number]): string {
    const channel = (value: number): string => value.toString(16).padStart(2, '0');
    return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * An HSL triple as sRGB bytes — the conversion the browser applies to
 * the face strings the painter emits.
 */
function hslToBytes(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
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
