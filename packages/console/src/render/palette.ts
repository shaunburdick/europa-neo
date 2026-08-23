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

/** Void (out-of-horizon) background — near-black space per fog FR-002. */
export const VOID_COLOR = '#05070d';

/** Water fill — Tailwind blue-700; reads unambiguously as blue. */
export const WATER_COLOR = '#1d4ed8';

/**
 * Land shading range by elevation (data-model.md §3: elevation 0..255
 * shades terrain). HSL lightness interpolates from 18% (sea level,
 * dark) to 62% (peaks, bright); hue/saturation fixed so elevation is
 * the only variable.
 */
export const LAND_HUE = 120;
export const LAND_SATURATION_PCT = 12;
export const LAND_MIN_LIGHTNESS_PCT = 18;
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
  const lightness = Math.round(
    LAND_MIN_LIGHTNESS_PCT + t * (LAND_MAX_LIGHTNESS_PCT - LAND_MIN_LIGHTNESS_PCT),
  );
  return `hsl(${LAND_HUE} ${LAND_SATURATION_PCT}% ${lightness}%)`;
}
