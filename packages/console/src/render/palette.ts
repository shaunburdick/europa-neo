/**
 * Render palette — Feature 005 (US1: T044/T045 support module).
 *
 * Single location for every color the board renderer uses, shared by
 * the DOM cell layer (`cell-view.tsx`) and the Canvas 2D painter
 * (`canvas.ts`) so both visual layers stay pixel-consistent
 * (research.md §2: canvas = visual source of truth, DOM overlay =
 * a11y source of truth; they must agree).
 *
 * Contrast notes (WCAG 1.4.3): every TEXT color pairs with a
 * background of ≥ 4.5:1 (troop/reserve chips are white on `#111827`
 * ≈ 15:1). Owner identity is never conveyed by color alone — the
 * accessible name carries "Player N" (Q-A01; constitution Principle
 * VI "no reliance on color alone").
 */

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
export const VOID_COLOR = '#1a2233';

/**
 * Page chrome background (mirrors `body` in styles/index.css; CSS
 * stays the styling source of truth). Kept here so the void-vs-page
 * distinctness invariant is testable — see palette.test.ts.
 */
export const PAGE_BACKGROUND_COLOR = '#0b0f19';

/** Water fill — Tailwind blue-700; reads unambiguously as blue. */
export const WATER_COLOR = '#1d4ed8';

/**
 * Land shading range by elevation (data-model.md §3: elevation 0..255
 * shades terrain). HSL lightness interpolates from 26% (sea level,
 * dark) to 62% (peaks, bright); hue/saturation fixed so elevation is
 * the only variable. The 26% floor (playtest 2026-08-24) keeps the
 * darkest land clearly lighter than {@link VOID_COLOR} so low
 * elevation never reads as fog.
 */
export const LAND_HUE = 120;
export const LAND_SATURATION_PCT = 12;
export const LAND_MIN_LIGHTNESS_PCT = 26;
export const LAND_MAX_LIGHTNESS_PCT = 62;

/** City outline + pipe indicator color — amber-400 family. */
export const CITY_COLOR = '#fbbf24';
export const PIPE_COLOR = '#f59e0b';

/** Chip background for troop counts / reserve badges / labels. */
export const CHIP_BACKGROUND = '#111827';
export const CHIP_TEXT = '#f9fafb';

/** Focus ring (keyboard selection) — pure white for max contrast. */
export const FOCUS_RING_COLOR = '#ffffff';

/** Combat flash / capture ring effect colors (Canvas layer). */
export const COMBAT_EFFECT_COLOR = 'rgba(239, 68, 68, 0.55)';
export const CAPTURE_EFFECT_COLOR = 'rgba(16, 185, 129, 0.55)';
export const GENERIC_EFFECT_COLOR = 'rgba(148, 163, 184, 0.45)';

/**
 * Terrain background for one cell as a CSS color string. Pure.
 *
 * - water → {@link WATER_COLOR}
 * - land → HSL with lightness interpolated by elevation per
 *   data-model.md §3 ("Renderer shades terrain by this").
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
