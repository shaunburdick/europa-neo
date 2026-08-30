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
 * Terrain shading (HSL interpolation by elevation) remains console-owned
 * history/rendering logic; the hue/saturation/lightness anchors are the
 * token literals from design. Contrast notes (WCAG 1.4.3) are documented in
 * `DESIGN.md` and pinned by `palette.test.ts`; owner identity is never
 * conveyed by color alone (constitution Principle VI).
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
 * Land shading range by elevation (data-model.md §3: elevation 0..255
 * shades terrain). HSL lightness interpolates from the token floor
 * (sea level, dark) to the token ceiling (peaks, bright); hue and
 * saturation are fixed so elevation is the only variable. The floor
 * keeps the darkest land clearly lighter than {@link VOID_COLOR} so low
 * elevation never reads as fog.
 */
export const LAND_HUE = TOKENS.color.landHue;
export const LAND_SATURATION_PCT = TOKENS.color.landSaturationPct;
export const LAND_MIN_LIGHTNESS_PCT = TOKENS.color.landMinLightnessPct;
export const LAND_MAX_LIGHTNESS_PCT = TOKENS.color.landMaxLightnessPct;

/** City outline + pipe indicator color — amber family. */
export const CITY_COLOR = TOKENS.color.city;
export const PIPE_COLOR = TOKENS.color.accent;

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
 * Terrain background for one cell as a CSS color string. Pure.
 *
 * - water → {@link WATER_COLOR}
 * - land → HSL with lightness interpolated by elevation per
 *   data-model.md §3 ("Renderer shades terrain by this").
 *
 * Land anchors (hue/saturation/min/max lightness) are sourced from
 * `TOKENS.color.land*` so the single-source rule holds; the
 * interpolation itself stays console-owned.
 *
 * @param terrain Cell terrain classification.
 * @param elevation Elevation 0..255.
 */
export function terrainColor(terrain: 'land' | 'water', elevation: number): string {
    if (terrain === 'water') {
        return WATER_COLOR;
    }
    const clamped = Math.max(0, Math.min(255, elevation));
    const t = clamped / 255;
    const lightness = Math.round(LAND_MIN_LIGHTNESS_PCT + t * (LAND_MAX_LIGHTNESS_PCT - LAND_MIN_LIGHTNESS_PCT));
    return `hsl(${LAND_HUE} ${LAND_SATURATION_PCT}% ${lightness}%)`;
}
