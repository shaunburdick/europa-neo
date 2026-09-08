/**
 * Render palette — Feature 005 (US1: T044/T045 support module).
 *
 * Thin re-export layer over `@europa/design` tokens. Every color the board
 * renderer uses is sourced from `TOKENS` so the DOM cell layer
 * (`cell-view.tsx`) and the Canvas 2D painter (`canvas.ts`) share one
 * canonical value (research.md §2: canvas = visual source of truth, DOM
 * overlay = a11y source of truth; they must agree). No hex/rgba literal
 * lives in this file — the single source is `packages/design/src/tokens.ts`
 * (FR-009, contracts §3).
 *
 * Terrain shading uses 4 biome zones (spec 024 FR-001) with distinct hue
 * families replacing the retired single-hue 6-band system. Each zone maps
 * a contiguous elevation range to icy cyan / deep blue / blue-gray / cool
 * white, so terrain color communicates both elevation and pipe flow viability.
 * Contrast notes (WCAG 1.4.3/1.4.11) are documented in `DESIGN.md` and
 * pinned by `palette.test.ts`; owner identity is never conveyed by color
 * alone (constitution Principle VI).
 */

import { TOKENS } from '@europa/design';

/**
 * Void (out-of-horizon fog) background — dark slate per fog FR-002.
 *
 * Playtest ruling (2026-08-24): the old near-black void read as
 * "broken board" against the page chrome. This value is deliberately
 * visible as "board space" yet unmistakably darker/flatter than any
 * land tile. Zero terrain information: fog cells are structurally
 * absent from views (FR-002/FR-005 no-leak), so this is paint-only.
 * Must never equal {@link PAGE_BACKGROUND_COLOR}.
 */
export const VOID_COLOR = TOKENS.color.voidBg;

/**
 * Page chrome background (mirrors `body` in styles/index.css; CSS
 * stays the styling source of truth). Kept here so the void-vs-page
 * distinctness invariant is testable — see palette.test.ts.
 */
export const PAGE_BACKGROUND_COLOR = TOKENS.color.pageBg;

/** Water fill — reads unambiguously as blue. */
export const WATER_COLOR = TOKENS.color.water;

/**
 * Biome zone configuration (spec 024 FR-001/FR-031).
 *
 * 4 zones replacing the retired single-hue 6-band land shading.
 * Each zone has a distinct hue family aligned with the pipe flow
 * formula's behavioral transitions.
 */
export const BIOME_ZONES = TOKENS.color.biomeZones;

/**
 * Look up a biome zone config by index, returning the first zone as fallback.
 * Safe accessor for `noUncheckedIndexedAccess` tsconfig.
 */
function biomeZoneAt(index: number): (typeof BIOME_ZONES)[number] {
    // BIOME_ZONES always has 4 elements (spec 024 FR-001); the fallback
    // handles the noUncheckedIndexedAccess case.
    return BIOME_ZONES.at(index) ?? BIOME_ZONES[0];
}

/**
 * Dark outline color for pipe triangles — guarantees contrast against
 * all biome backgrounds (spec 024 FR-010, FR-021).
 *
 * Against light backgrounds (Peaks, L=60–78%), provides ≥9:1 contrast.
 * Against dark backgrounds (Ice Plains, Fractured Ice, Rocky Outcrops),
 * the pipe fill colors themselves are perceptually distinct from terrain
 * hues and reinforced by triangle shape and cell-edge position.
 */
export const PIPE_OUTLINE_COLOR = TOKENS.color.pipeOutline;

/** City outline + pipe indicator color — amber family. */
export const CITY_COLOR = TOKENS.color.city;
export const PIPE_COLOR = TOKENS.color.accent;

/**
 * Pipe slope indicator colors (005 FR-013) — downhill green, flat
 * amber, uphill red, stalled gray. Thin re-exports of the design
 * tokens (FR-009): the canvas painter reads these per direction from
 * `CellRenderInfo.pipeSlopes`; no hex literal lives here.
 */
export const PIPE_DOWNHILL_COLOR = TOKENS.color.pipeDownhill;
export const PIPE_FLAT_COLOR = TOKENS.color.pipeFlat;
export const PIPE_UPHILL_COLOR = TOKENS.color.pipeUphill;
export const PIPE_STALLED_COLOR = TOKENS.color.pipeStalled;

/** Water shallow variant (design token). */
export const WATER_SHALLOW_COLOR = TOKENS.color.waterShallow;

/** Water deep variant (design token). */
export const WATER_DEEP_COLOR = TOKENS.color.waterDeep;

/**
 * Biome zone count (4 zones replacing 6 bands).
 * Retained as `LAND_BAND_COUNT` for backward compatibility with
 * canvas.ts cache loops, but now equals 4.
 */
export const LAND_BAND_COUNT = BIOME_ZONES.length;

/**
 * Land band lightness values — indexed by biome zone 0–3.
 * Each zone has a single representative lightness (the zone's midpoint).
 * Retained for backward compatibility; prefer `biomeZoneForElevation()`
 * for per-cell lightness computation.
 */
export const LAND_BAND_LIGHTNESS = [
    Math.round((biomeZoneAt(0).lightnessMin + biomeZoneAt(0).lightnessMax) / 2),
    Math.round((biomeZoneAt(1).lightnessMin + biomeZoneAt(1).lightnessMax) / 2),
    Math.round((biomeZoneAt(2).lightnessMin + biomeZoneAt(2).lightnessMax) / 2),
    Math.round((biomeZoneAt(3).lightnessMin + biomeZoneAt(3).lightnessMax) / 2),
] as const;

/** City glow color (semi-transparent amber overlay). */
export const CITY_GLOW_COLOR = TOKENS.color.cityGlow;

/** City glow strong color (center dot + border glow). */
export const CITY_GLOW_STRONG_COLOR = TOKENS.color.cityGlowStrong;

/** Void gradient center (lighter void). */
export const VOID_GRADIENT_CENTER = TOKENS.color.voidGradientCenter;

/** Void gradient edge (darker void). */
export const VOID_GRADIENT_EDGE = TOKENS.color.voidGradientEdge;

/** Chip background for troop counts / reserve badges / labels. */
export const CHIP_BACKGROUND = TOKENS.color.chipBg;
export const CHIP_TEXT = TOKENS.color.chipText;

/** Focus ring (keyboard selection) — pure white for max contrast. */
export const FOCUS_RING_COLOR = TOKENS.color.focusRing;

/** Combat flash / capture ring effect colors (Canvas layer). */
export const COMBAT_EFFECT_COLOR = TOKENS.color.combatEffect;
export const CAPTURE_EFFECT_COLOR = TOKENS.color.captureEffect;
export const GENERIC_EFFECT_COLOR = TOKENS.color.genericEffect;

/**
 * Compute the complete biome shading parameters for a given elevation.
 *
 * Pure function: same elevation always returns the same zone, hue,
 * saturation, and interpolated lightness. Used by the Canvas renderer
 * to compute per-cell colors without calling multiple functions.
 *
 * @param elevation Integer 0–255. Values < 0 clamp to zone 0; values > 255 clamp to zone 3.
 * @returns Biome zone index (0–3), hue, saturation percentage, and interpolated lightness.
 */
export function biomeZoneForElevation(elevation: number): {
    zone: number;
    hue: number;
    saturationPct: number;
    lightness: number;
} {
    const clamped = Math.max(0, Math.min(255, elevation));
    let zoneIndex = 0;
    for (let i = 0; i < BIOME_ZONES.length; i++) {
        const zone = BIOME_ZONES.at(i);
        if (zone !== undefined && clamped <= zone.elevationMax) {
            zoneIndex = i;
            break;
        }
    }
    const zone = biomeZoneAt(zoneIndex);
    const prevMax = zoneIndex === 0 ? 0 : biomeZoneAt(zoneIndex - 1).elevationMax;
    const zoneSpan = zone.elevationMax - prevMax;
    const t = zoneSpan === 0 ? 0 : (clamped - prevMax) / zoneSpan;
    const lightness = Math.round(zone.lightnessMin + t * (zone.lightnessMax - zone.lightnessMin));
    return { zone: zoneIndex, hue: zone.hue, saturationPct: zone.saturationPct, lightness };
}

/**
 * Terrain background for one cell as a CSS color string. Pure.
 *
 * - water → {@link WATER_COLOR}
 * - land → HSL with biome-zone-based coloring per spec 024 FR-004.
 *
 * Each land cell's hue, saturation, and lightness are derived from
 * the biome zone that contains its elevation (spec 024 FR-001).
 *
 * @param terrain Cell terrain classification.
 * @param elevation Elevation 0..255.
 */
export function terrainColor(terrain: 'land' | 'water', elevation: number): string {
    if (terrain === 'water') {
        return WATER_COLOR;
    }
    const { hue, saturationPct, lightness } = biomeZoneForElevation(elevation);
    return `hsl(${hue}, ${saturationPct}%, ${lightness}%)`;
}

/**
 * Return the water color for a given depth level.
 *
 * @param depth 0 (shallow), 1 (standard), 2 (deep). Clamped to [0, 2].
 * @returns Hex color string from design tokens.
 */
export function waterDepthColor(depth: number): string {
    const clamped = Math.max(0, Math.min(2, depth));
    if (clamped <= 0) return WATER_SHALLOW_COLOR;
    if (clamped >= 2) return WATER_DEEP_COLOR;
    return WATER_COLOR;
}

/**
 * Quantize elevation 0–255 into a discrete biome zone index 0–3.
 *
 * Zone boundaries (spec 024 FR-002):
 *   elevation 0–80   → zone 0 (Ice Plains)
 *   elevation 81–160  → zone 1 (Fractured Ice)
 *   elevation 161–208 → zone 2 (Rocky Outcrops)
 *   elevation 209–255 → zone 3 (Peaks)
 *
 * @param elevation Integer 0–255. Negative values clamp to zone 0; values > 255 clamp to zone 3.
 * @returns Zone index 0–3.
 */
export function landBandIndex(elevation: number): number {
    return biomeZoneForElevation(elevation).zone;
}

/**
 * Return the HSL color for a given biome zone index.
 *
 * @param band Index 0–3. Clamped to [0, 3].
 * @returns HSL color string: `hsl(H, S%, L%)`
 */
export function landBandColor(band: number): string {
    const clamped = Math.max(0, Math.min(3, Math.round(band)));
    const zone = biomeZoneAt(clamped);
    const lightness = Math.round((zone.lightnessMin + zone.lightnessMax) / 2);
    return `hsl(${zone.hue}, ${zone.saturationPct}%, ${lightness}%)`;
}

/**
 * Map cell elevation to water depth (stub for future depth data).
 *
 * Currently always returns 1 (standard depth). Will be enhanced
 * when the board model provides depth information.
 *
 * @param elevation Integer 0–255.
 * @returns Water depth: 0 (shallow), 1 (standard), or 2 (deep).
 */
export function waterDepthForCell(_elevation: number): number {
    return 1;
}
