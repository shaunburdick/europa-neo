# Tasks: Tile Visual Redesign

**Spec**: `specs/021-tile-visual-redesign/spec.md`
**Branch**: `issue-85-visual-redesign`

## Phase 1: Design Tokens (Foundation)

- [x] T-001: Add new token entries to `packages/design/src/tokens.ts` — `waterShallow`, `waterDeep`, `landBandCount`, `landBandLightness`, `cityGlow`, `cityGlowStrong`, `voidGradientCenter`, `voidGradientEdge`. All in `TOKENS.color` group, alphabetically sorted. Verify type inference is correct (tuple for landBandLightness).

## Phase 2: Palette Functions (Core Logic)

- [x] T-002: Add new palette functions to `packages/console/src/render/palette.ts` — `waterDepthColor(depth)`, `landBandIndex(elevation)`, `landBandColor(band)`, `waterDepthForCell(elevation)`. All pure functions sourcing from design tokens. Update JSDoc module header to document new exports.
- [x] T-003: [P] Add unit tests for new palette functions in `packages/console/tests/unit/render/palette.test.ts` — test clamping, boundary values, band index quantization, color output format, and the waterDepthForCell stub behavior.

## Phase 3: adjustBrightness Helper

- [x] T-004: Add `adjustBrightness` private method to `MapCanvas` class in `packages/console/src/render/canvas.ts`. Parse `#rrggbb` and `#rrggbbaa` hex, adjust R/G/B by percent, clamp to 0–255. Return rgb/rgba strings unchanged.
- [x] T-005: [P] Add unit tests for `adjustBrightness` in `packages/console/tests/unit/render/adjust-brightness.test.ts` — test hex parsing, brightness adjustment, channel clamping, rgb/rgba passthrough, edge cases (empty string, malformed hex).

## Phase 4: Canvas Terrain Enhancements

- [x] T-006: Enhance `drawTerrain` water rendering in `canvas.ts` — gradient fill (linear, top-left to bottom-right, 4 color stops using adjustBrightness) + wave texture (vertical lines at 4px spacing, 0.5px width, 4% white opacity). Import new palette functions.
- [x] T-007: Enhance `drawTerrain` land rendering in `canvas.ts` — discrete band lookup via `landBandIndex` + `landBandColor` + directional gradient (2 stops: band color + adjustBrightness(band, -15)) + inner shadow (1px dark top/left, 1px light bottom/right) + contour hints on bands 3+ (diagonal lines, 6px spacing, 10% black opacity).
- [x] T-008: Enhance `drawTerrain` city rendering in `canvas.ts` — add radial glow (createRadialGradient, 40% cell radius, cityGlowStrong → transparent) + center dot with shadowBlur 6px + border stroke with shadowBlur 4px. Keep existing city border stroke.
- [x] T-009: Replace void flat fill with radial gradient in `canvas.ts` paint method — createRadialGradient centered on canvas midpoint, outer radius to corner, color stops: voidGradientCenter → voidGradientEdge.

## Phase 5: Minimap & Swatch Updates

- [x] T-010: Update `packages/console/src/qol/minimap.tsx` paintMinimap — replace hardcoded `#1d4ed8` and `#3f4a35` with `terrainColor(info.terrain, info.elevation)`. Add `terrainColor` to palette import. Remove the "design-exception: canvas fallback" comments on those lines.
- [x] T-011: Update `packages/design/src/components/game/elevation-swatch.tsx` — replace smooth `lightnessFor` interpolation with discrete band lookup using `landBandLightness[landBandIndex(elevation * 255 / 100)]`. Import `landBandLightness` from tokens.

## Phase 6: Test Updates

- [x] T-012: [P] Update elevation swatch tests in `packages/design/tests/components/game/elevation-swatch.test.tsx` — verify discrete band colors at boundary elevations (0, 42, 43, 85, 86, 128, 129, 170, 171, 213, 214, 255). Update `expectedHsl` helper to use band lookup.
- [x] T-013: [P] Add canvas terrain rendering tests in `packages/console/tests/unit/render/canvas-terrain.test.ts` — test drawTerrain for water (gradient fill, wave lines), land (discrete bands, inner shadow, contour hints), city (glow, center dot), void (radial gradient). Use mock CanvasRenderingContext2D.
- [x] T-014: Update minimap tests in `packages/console/tests/component/qol/minimap.test.tsx` — verify terrain colors match `terrainColor()` output (no hardcoded hex assertions). Add test that `terrainColor` is called for each cell.

## Phase 7: Contrast & Documentation

- [x] T-015: Add contrast verification test in `palette.test.ts` — verify land bands 3+ (lightness 42, 50, 58) meet WCAG 1.4.3 (≥3:1 vs void). Document bands 0–2 as acceptable (terrain never sole info carrier per constitution Principle VI).
- [x] T-016: Update spec 021 status to Implemented and add Implementation Notes documenting: (1) adjustBrightness is private on MapCanvas per FR-011, (2) waterDepthForCell is a stub returning 1 per out-of-scope note, (3) void gradient center is canvas-center not board-center per design decision, (4) contrast results for all 6 bands.

## Phase 8: Verification

- [x] T-017: Run full verification suite — `pnpm verify` or `pnpm verify:changed` targeting console + design packages. Verify all tests pass, typecheck clean, lint clean, no new hex literals outside token table (grep audit).
