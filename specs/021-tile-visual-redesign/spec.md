# Feature Specification: Tile Visual Redesign

**Feature Branch**: `issue-85-visual-redesign`

**Created**: 2026-09-06

**Status**: Implemented (2026-09-06)

**GitHub Issue**: #85

**Dependencies**: Feature 012 (Design System), Feature 005 (Client Console)

## Problem Statement

The current Canvas tile rendering uses flat, single-color fills for water and land terrain, a flat void background, and a simple city outline. The result is a visually flat board where elevation differences are hard to distinguish, water has no depth perception, and cities don't stand out from their surroundings. This reduces visual hierarchy and makes the board harder to read at a glance.

This feature enhances the Canvas rendering layer with depth, texture, and clearer visual hierarchy — water depth variants with gradient and wave texture, discrete land elevation bands with contour hints, city glow effects, and a radial void gradient. All enhancements are Canvas-only; the DOM overlay (a11y source of truth) remains unchanged.

## User Stories

### US1 — Water Tiles Show Depth (P1)

As a player, I want water tiles to show visual depth through color variants and subtle texture, so that shallow and deep water are distinguishable and the ocean feels more immersive.

**Why this priority**: Water covers a significant portion of the board; depth encoding improves readability and visual appeal.

**Independent Test**: Render a board with water cells at different positions. Verify that water tiles use gradient fills (not flat color), show subtle wave texture (vertical lines), and the base color comes from design tokens (no hex literals).

### US2 — Land Tiles Show Elevation Bands (P1)

As a player, I want land tiles to use discrete elevation bands instead of a smooth gradient, so that elevation differences are more visually distinct and the terrain feels layered.

**Why this priority**: Elevation is the primary terrain attribute; discrete bands improve visual separation over the current smooth interpolation.

**Independent Test**: Render a board with land cells at various elevations. Verify that cells quantize into 6 discrete bands (not smooth), each band has a distinct lightness, higher bands (3+) show contour line hints, and all land tiles have directional gradient + inner shadow.

### US3 — City Tiles Have Visual Prominence (P2)

As a player, I want city tiles to have a glow effect that makes them visually prominent on the board, so that cities are easy to spot at any zoom level.

**Why this priority**: Cities are key strategic locations; visual prominence improves gameplay readability.

**Independent Test**: Render a board with city cells. Verify that cities show a radial glow (semi-transparent amber), a glowing center dot (with shadow blur), and a border with glow effect.

### US4 — Void Uses Radial Gradient (P2)

As a player, I want the void (out-of-horizon fog) to use a subtle radial gradient instead of a flat fill, so that the board edge feels more natural and less like a hard cutoff.

**Why this priority**: Minor visual polish; the flat void reads as "broken board" (playtest ruling in palette.ts).

**Independent Test**: Render the board edge. Verify that void tiles use a radial gradient (lighter center, darker edges) instead of a flat `#1a2233`.

### US5 — Minimap Uses Canonical Colors (P2)

As a player, I want the minimap to use the canonical `terrainColor()` function instead of hardcoded hex values, so that the minimap stays in sync with the board's visual language.

**Why this priority**: The hardcoded `#3f4a35` is a design exception that should be cleaned up.

**Independent Test**: Render the minimap. Verify that terrain colors match the board's `terrainColor()` output (no hardcoded hex literals).

### US6 — Elevation Swatch Uses Discrete Bands (P3)

As a player, I want the elevation swatch component to use discrete bands matching the board's visual language, so that the swatch accurately represents how elevation appears on the board.

**Why this priority**: Consistency between the swatch and the board; the swatch is a reference UI element.

**Independent Test**: Render the elevation swatch. Verify that it uses the same 6 discrete bands as the board (not smooth interpolation).

## Requirements

### Functional Requirements

- **FR-001**: The Canvas renderer MUST draw water tiles with a gradient fill (linear gradient with 4 color stops adjusting brightness) and subtle wave texture (vertical lines at 4px spacing, 0.5px width, 4% white opacity).
- **FR-002**: The Canvas renderer MUST draw land tiles with discrete elevation bands (6 bands quantized from elevation 0–255), a directional gradient (top-left to bottom-right), inner shadow (1px dark top/left edge, 1px light bottom/right edge), and contour line hints on bands 3+ (diagonal lines at 6px spacing).
- **FR-003**: The Canvas renderer MUST draw city tiles with a radial glow (semi-transparent amber, 40% cell radius), a glowing center dot (with 6px shadow blur), and a border with glow (4px shadow blur).
- **FR-004**: The Canvas renderer MUST draw void tiles with a radial gradient (lighter center `#1e2940`, darker edges `#151c2a`) instead of a flat fill.
- **FR-005**: The design token table MUST include new tokens: `waterShallow` (lighter blue), `waterDeep` (darker blue), `landBandCount` (6), `landBandLightness` (array [18, 26, 34, 42, 50, 58]), `cityGlow` (semi-transparent amber), `cityGlowStrong` (stronger amber), `voidGradientCenter` (lighter void), `voidGradientEdge` (darker void). All derived from existing tokens — no new hex literals.
- **FR-006**: The palette module MUST export new functions: `waterDepthColor(depth)`, `landBandIndex(elevation)`, `landBandColor(band)`, `waterDepthForCell(elevation)`. All pure functions sourced from design tokens.
- **FR-007**: The minimap MUST use `terrainColor()` from the palette module instead of hardcoded hex values (`#1d4ed8`, `#3f4a35`).
- **FR-008**: The elevation swatch component MUST use discrete elevation bands (matching `landBandIndex`/`landBandColor`) instead of smooth interpolation.
- **FR-009**: The DOM overlay (`cell-view.tsx`) MUST remain unchanged — it continues to use `terrainColor()` as the a11y source of truth. Visual enhancements are Canvas-only.
- **FR-010**: All new colors MUST derive from existing `@europa/design` tokens. No new hex literals are introduced outside the token table.
- **FR-011**: The `adjustBrightness` helper MUST parse both hex and rgb/rgba formats, clamping channels to 0–255. It MUST be a pure private method on `MapCanvas`.

### Non-Functional Requirements

- **Performance**: The new rendering adds ~50-100 additional Canvas API calls per frame (gradient creation, texture lines, glow arcs). At 60fps with a 20×15 board (300 visible cells), this is well within budget. Gradient objects may be cached by (band, depth) pair if profiling shows issues.
- **Accessibility**: The DOM overlay is unaffected. Owner identity is never conveyed by color alone (constitution Principle VI). Land band contrast vs void is documented (bands 0–2 below 3:1 are acceptable because terrain is never the sole info carrier).
- **Backward Compatibility**: If `landBandLightness` is not yet added to tokens, palette functions fall back to existing smooth interpolation. The rollback plan reverts canvas.ts, minimap.tsx, and elevation-swatch.tsx; tokens stay (additive, no harm).

### Key Entities

- **Water Depth**: 0 (shallow), 1 (standard), 2 (deep) — currently all water returns depth 1 until board model provides depth data.
- **Land Band**: 0–5 discrete index quantized from elevation 0–255, each mapping to a distinct lightness value.
- **City Glow**: Radial semi-transparent amber overlay + glowing border + center dot.

## Acceptance Criteria

1. Water tiles render with gradient fill and wave texture (not flat color).
2. Land tiles render with 6 discrete elevation bands, directional gradient, inner shadow, and contour hints on bands 3+.
3. City tiles render with radial glow, glowing center dot, and glow border.
4. Void tiles render with radial gradient (not flat fill).
5. Minimap uses `terrainColor()` (no hardcoded hex).
6. Elevation swatch uses discrete bands.
7. All new colors derive from design tokens (zero new hex literals outside token table).
8. DOM overlay unchanged (a11y preserved).
9. Existing palette tests pass (void ≠ page, land > void, etc.).
10. New palette function tests pass (waterDepthColor, landBandIndex, landBandColor).
11. Canvas snapshot tests updated and passing.
12. Contrast: land bands 3+ meet WCAG 1.4.3 (≥3:1 vs void); bands 0–2 documented as acceptable.

## Out of Scope

- Water depth data from the board model (stub returns depth 1; real depth wiring is a future enhancement).
- Changes to the engine, terrain generation, fog, networking, or matchmaking packages.
- Changes to the DOM overlay (`cell-view.tsx`).
- New design tokens for CSS variable emission (tokens are TypeScript-only; CSS emitter update is a follow-up).
- Touch/mobile rendering optimizations.

## Edge Cases

- **Elevation out of range**: `landBandIndex` clamps negative values to band 0 and values >255 to band 5.
- **Unknown water depth**: `waterDepthForCell` returns 1 (standard) until board model provides depth data.
- **Canvas at extreme zoom**: Gradient and texture rendering scales with cell size; no special handling needed.
- **Reduced motion**: Wave texture and contour lines are static (not animated); no motion to suppress.
- **Hex vs rgb parsing in adjustBrightness**: Returns rgb/rgba strings as-is (can't adjust easily); only hex strings are adjusted.

## Clarifications

### v1.0 (2026-09-06) — Initial specification

Initial specification derived from GitHub issue #85 implementation guide. Key decisions:
- 6 discrete land bands (not 8 or 10) — balances visual separation with granularity.
- Wave texture is vertical lines (simple, cheap, recognizable).
- City glow uses amber family (consistent with existing city color token).
- Void gradient is radial (center lighter, edges darker) — subtle but noticeable.
- Elevation swatch change is included (FR-008) — the issue marked it optional, but consistency is worth the small effort.

## Implementation Notes

### v1.0 Implementation (2026-09-06)

1. **adjustBrightness is private on MapCanvas** (FR-011): The brightness adjustment helper is a private method on the `MapCanvas` class, not exported from the palette module. It parses `#rrggbb` and `#rrggbbaa` hex strings, adjusts R/G/B channels by percent, and clamps to 0–255. rgb/rgba strings pass through unchanged.

2. **waterDepthForCell is a stub** (out-of-scope note): The function always returns 1 (standard depth) until the board model provides depth data. This stub exists so the Canvas renderer can call it uniformly for all water cells; future depth wiring requires only updating this function's implementation.

3. **Void gradient center is canvas-center** (Decision 5): The radial gradient is centered on the canvas midpoint, not the board center. At extreme zoom/pan, the gradient center doesn't follow the viewport — the effect is "softer edges" rather than precise depth encoding.

4. **Contrast results**: Land bands 3+ (lightness 42, 50, 58) meet WCAG 1.4.3 (≥3:1 vs void). Bands 0–2 (lightness 18, 26, 34) are below 3:1 but acceptable because terrain is never the sole information carrier per constitution Principle VI — owner identity is conveyed by color + position + text, and terrain carries no gameplay-critical information on its own.
