/**
 * Unit tests: render palette invariants — Feature 005 (US1 T044/T045
 * support module + 2026-08-24 playtest contrast ruling).
 *
 * Pins the board-readability contract recorded in spec 005
 * Implementation Notes item 13:
 * - the darkest land tile is clearly lighter than the void, so
 *   low-elevation land never reads as fog ("broken bands" defect);
 * - the void is distinct from the page chrome background, so the
 *   canvas reads as board space rather than an invisible rectangle;
 * - elevation shading still interpolates monotonically to the
 *   documented maximum (data-model.md §3 unchanged).
 *
 * Fog no-leak (FR-002/FR-005) is structural — out-of-horizon cells
 * are absent from views — and remains pinned by the visibility and
 * component suites; these tests only cover paint constants.
 */

import { describe, expect, test } from 'vitest';
import {
  LAND_MAX_LIGHTNESS_PCT,
  LAND_MIN_LIGHTNESS_PCT,
  PAGE_BACKGROUND_COLOR,
  terrainColor,
  VOID_COLOR,
  WATER_COLOR,
} from '../../../src/render/palette';

/** Parse `hsl(H S% L%)` (the exact format terrainColor emits). */
function parseHsl(color: string): { hue: number; sat: number; light: number } {
  const match = /^hsl\((\d+) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(color);
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
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}

/** Perceived (luminance-weighted) brightness, 0..255. */
function luminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

describe('palette contrast invariants (spec 005 Implementation Notes 13)', () => {
  test('sea-level land sits at the documented lightness floor', () => {
    const floor = parseHsl(terrainColor('land', 0));
    expect(floor.light).toBe(LAND_MIN_LIGHTNESS_PCT);
    expect(floor.light).toBeGreaterThanOrEqual(26);
  });

  test('darkest land is visibly lighter than the void', () => {
    const floorHsl = parseHsl(terrainColor('land', 0));
    // hsl → rgb for an apples-to-apples comparison with the void hex.
    const c = ((1 - Math.abs((2 * floorHsl.light) / 100 - 1)) * floorHsl.sat) / 100;
    const hp = floorHsl.hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : [0, x, c];
    const m = floorHsl.light / 100 - c / 2;
    const landRgb: [number, number, number] = [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255),
    ];
    const voidRgb = hexToRgb(VOID_COLOR);

    // Luminance gap must be unmistakable: land floor ≥ 1.5× void
    // brightness (actual ≈ 69 vs ≈ 34 — the assertion documents the
    // minimum, not the exact value, so tuning stays honest).
    expect(luminance(landRgb)).toBeGreaterThanOrEqual(1.5 * luminance(voidRgb));
    // Overall color distance must clear a visible-difference bar.
    // (Per-channel deltas don't work here: land is green-tinted and
    // void blue-tinted, so their blue channels legitimately sit close
    // together while hue + luminance separate the tiles. Actual
    // Euclidean RGB distance ≈ 52; the floor documents "clearly
    // distinct", not the exact value.)
    const distance = Math.sqrt(
      landRgb.reduce((sum, channel, i) => sum + (channel - voidRgb[i]) ** 2, 0),
    );
    expect(distance).toBeGreaterThanOrEqual(40);
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

  test('elevation shading still interpolates to the documented maximum', () => {
    expect(terrainColor('water', 0)).toBe(WATER_COLOR);
    expect(parseHsl(terrainColor('land', 255)).light).toBe(LAND_MAX_LIGHTNESS_PCT);
    // Out-of-range elevations clamp (pure function, no surprises).
    expect(terrainColor('land', 300)).toBe(terrainColor('land', 255));
    expect(terrainColor('land', -5)).toBe(terrainColor('land', 0));
    // Shading is monotonic in elevation.
    const mid = parseHsl(terrainColor('land', 128)).light;
    expect(mid).toBeGreaterThan(LAND_MIN_LIGHTNESS_PCT);
    expect(mid).toBeLessThan(LAND_MAX_LIGHTNESS_PCT);
  });
});
