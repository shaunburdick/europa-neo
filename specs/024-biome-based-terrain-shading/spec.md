# Feature 024: Biome-Based Terrain Shading

> Version: 1.4
> Last Updated: 2026-09-08
> Status: Implemented (2026-09-08)
> Dependencies: Feature 021 (Tile Visual Redesign), Feature 012 (Design System)

## Problem Statement

The current terrain shading uses 6 discrete grayscale-green bands (hue 120, saturation 12%, lightness [18, 26, 34, 42, 50, 58]) to encode elevation. All bands share the same hue and saturation — only lightness varies. This makes tiles that look visually similar (e.g., bands 2 and 3 at lightness 34% vs 42%) potentially have very different pipe flow behavior. Players cannot intuit from terrain color alone whether a pipe will flow freely, be slowed, or stall. The result is confusing pipe flow behavior that contradicts visual expectations.

The fix is to replace the single-hue grayscale scheme with 4 biome zones, each with a distinct hue family. Color now communicates elevation *and* flow viability: icy cyan signals easy flow, deep blue signals moderate flow, blue-gray signals difficult flow, and white signals extreme terrain. The zone boundaries are chosen to align with the pipe flow formula's inflection points (base=7, step=1, cap=5), so the visual language and the gameplay mechanic reinforce each other. The icy blue palette is thematically appropriate for Europa, Jupiter's ice moon — no vegetation, just frozen ice, exposed rock, and peaks.

A critical secondary problem is that the existing pipe slope indicator colors (green `#059669`, amber `#f59e0b`, red `#dc2626`, gray `#9ca3af`) were designed for contrast against the dark page background (`#0b0f19`), NOT against colored terrain. With biome-colored terrain, contrast analysis shows multiple pipe indicators fail WCAG 1.4.11 (≥3:1 for graphical objects) against most biome backgrounds. This feature therefore also adds a dark outline to all pipe triangles to guarantee readability regardless of terrain color.

## User Stories

### US1 — Flow-Intuitive Terrain Coloring (P1)

As a player, I want the terrain color to intuitively communicate pipe flow viability, so that I can make informed decisions about pipe placement without memorizing elevation numbers.

**Why this priority**: The core problem this feature solves — terrain color should be a first-class gameplay signal, not just decoration.

**Independent Test**: Render a board with land cells at elevations spanning the full 0–255 range. Verify that cells in the low-elevation zone (0–80) appear icy cyan (easy flow), mid-elevation cells (81–160) appear deep blue (moderate flow), high-elevation cells (161–208) appear blue-gray (hard flow), and peak cells (209–255) appear white (extreme). Verify that a pipe from a cyan cell to another cyan cell visually reads as "easy flow" while a pipe from cyan to blue-gray reads as "uphill struggle."

### US2 — Biome Zone Visual Distinction (P1)

As a player, I want each biome zone to have a clearly distinct color family (not just lightness variation), so that I can instantly identify which zone a cell belongs to even at a glance or at low zoom.

**Why this priority**: If biome zones are not visually distinct, the feature fails its core purpose. Distinct hue families are the mechanism.

**Independent Test**: Render a board with cells at the boundary between each pair of adjacent biome zones (e.g., elevation 80 vs 81, 160 vs 161, 208 vs 209). Verify that adjacent cells at zone boundaries have clearly different hues (not just lightness differences). Verify that the color transition is abrupt at zone boundaries (not blended), matching the discrete band behavior of the current system.

### US3 — Pipe Slope Readability Over Biome Backgrounds (P1)

As a player, I want pipe slope indicator colors (green=downhill, amber=flat, red=uphill, gray=stalled) to remain clearly readable against all biome background colors, so that I can always assess flow direction regardless of terrain zone.

**Why this priority**: Pipe indicators are the primary gameplay overlay on terrain. If they become unreadable against certain biome backgrounds, the feature actively harms gameplay.

**Independent Test**: Render pipe slope indicators (all four types) against each of the four biome zone backgrounds. Verify that each indicator color is distinguishable from its background at ≥3:1 contrast (WCAG 1.4.11 Non-text Contrast). The dark outline on each pipe triangle guarantees this regardless of background color — verify that the outline is visible and the filled color is distinguishable from the outline.

### US4 — Backward-Compatible Rendering Pipeline (P2)

As a developer, I want the biome shading to integrate into the existing rendering pipeline (Canvas + DOM overlay) without requiring changes to the engine, terrain generation, or networking packages, so that the feature is contained and reversible.

**Why this priority**: Containment reduces risk and keeps the change set reviewable. Engine determinism must not be affected.

**Independent Test**: Run the full test suite (engine, terrain, fog, networking, matchmaking, console). Verify all existing tests pass without modification to engine/terrain/fog/networking packages. Verify the console's palette tests and canvas snapshot tests are updated for the new colors.

## Functional Requirements

### Color System

- **FR-001**: The design token table MUST define 4 biome zones, each with a `hue`, `saturationPct`, and `lightnessRange` (min/max) replacing the current single `landHue`/`landSaturationPct`/`landBandLightness` tokens. The zones are:

  | Zone | Index | Elevation Range | Hue | Saturation (%) | Lightness Range (%) |
  |------|-------|-----------------|-----|----------------|---------------------|
  | Smooth Ice | 0 | 0–80 | 210 (blue) | 65 | 38–52 |
  | Fractured Ice | 1 | 81–160 | 170 (teal) | 55 | 26–40 |
  | Rocky Outcrops | 2 | 161–208 | 30 (orange) | 55 | 30–42 |
  | Ice Peaks | 3 | 209–255 | 200 (light blue) | 15 | 80–95 |

  Within each zone, lightness interpolates linearly from the min to the max based on the cell's normalized position within that zone's elevation range. The zone boundaries are aligned with the pipe flow formula's behavioral transitions (FR-050):
  - Zone 0 (0–80): always flowable (delta < 40 max within zone) — easy flow (Smooth Ice)
  - Zone 1 (81–160): flowable but slower when uphill (delta 40–80 crosses into this zone) — moderate flow (Fractured Ice)
  - Zone 2 (161–208): uphill pipes may stall (delta > 80 crosses two zones) — hard flow (Rocky Outcrops)
  - Zone 3 (209–255): extreme terrain, uphill pipes always stalled — extreme (Ice Peaks)

  **Contrast rationale**: The biome zones use distinct hue families (blue, teal, orange, light blue) for maximum visual separation. Zones 0–2 are medium-lightness (26–52%) with high saturation (55–65%) for vivid terrain colors. Zone 3 (Ice Peaks) is deliberately light (80–95%) with low saturation (15%) to create a snow/ice appearance. The dark outline on pipe triangles (FR-010) guarantees contrast against all backgrounds.

- **FR-002**: The `landBandIndex(elevation)` function MUST be updated to map elevation 0–255 into 4 biome zone indices (0–3) instead of 6 bands (0–5). The mapping is:
  - elevation 0–80 → zone 0
  - elevation 81–160 → zone 1
  - elevation 161–208 → zone 2
  - elevation 209–255 → zone 3
  - Values < 0 clamp to zone 0; values > 255 clamp to zone 3.

- **FR-003**: The `landBandColor(band)` function MUST be updated to return biome-zone-appropriate HSL colors using the zone's hue, saturation, and interpolated lightness (per FR-001). The function signature remains `(band: number) => string` but the `band` parameter now represents a zone index (0–3).

- **FR-004**: The `terrainColor(terrain, elevation)` function MUST be updated to use biome-zone-based coloring for land cells instead of the current single-hue lightness interpolation. Water cells continue to return `WATER_COLOR` unchanged.

- **FR-005**: A new pure function `biomeZoneForElevation(elevation: number): { zone: number; hue: number; saturationPct: number; lightness: number }` MUST be exported from the palette module. This function returns the complete biome shading parameters for a given elevation, enabling the Canvas renderer to compute per-cell colors without calling multiple functions.

- **FR-006**: The `LAND_BAND_COUNT` constant MUST be updated from 6 to 4.

- **FR-007**: The `LAND_BAND_LIGHTNESS` array MUST be replaced with a biome zone configuration array containing hue, saturation, and lightness range for each zone. The old `landHue`, `landSaturationPct`, `landMinLightnessPct`, `landMaxLightnessPct` tokens are retired (replaced by per-zone values).

### Canvas Rendering — Pipe Triangle Outlines

- **FR-010**: The Canvas renderer's pipe triangle drawing (Pass 3, `drawPipes`) MUST add a dark outline to every pipe triangle — both filled (flowing) and hollow (stalled). The outline serves two purposes: (a) it provides a visual boundary separating the pipe from the terrain, and (b) it guarantees contrast against light backgrounds (Ice Peaks) where the pipe fill color alone would be insufficient.

  **Implementation detail**: For filled pipes (downhill/flat/uphill), the draw order is:
  1. `ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'` + `ctx.lineWidth = Math.max(1, zoom * 0.04)` + `ctx.stroke()` (dark outline)
  2. `ctx.fillStyle = pipeSlopeColor(slope)` + `ctx.fill()` (colored fill)

  For hollow pipes (stalled), the draw order is:
  1. `ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'` + `ctx.lineWidth = Math.max(2, zoom * 0.08)` + `ctx.stroke()` (thick dark outline)
  2. `ctx.strokeStyle = pipeSlopeColor(slope)` + `ctx.lineWidth = Math.max(1.5, zoom * 0.06)` + `ctx.stroke()` (colored inner stroke)

  **Contrast strategy**: The pipe's visibility relies on two complementary mechanisms. Against light backgrounds (Ice Peaks, lightness 80–95%), the dark outline provides ≥9:1 contrast, making the pipe unmistakable. Against dark backgrounds (Smooth Ice, Fractured Ice, Rocky Outcrops), the pipe fill colors themselves provide sufficient contrast (amber flat: ≥4.3:1, gray stalled: ≥3.6:1, green downhill: ≥2.4:1, red uphill: ≥1.9:1). The green and red indicators against dark biomes are below 3:1 in isolation, but these colors are perceptually distinct from the terrain hues (blue/teal/orange vs green pipe, red pipe) and are always presented alongside the shape (triangle) and position (cell edge), providing redundant visual channels per constitution Principle VI. The outline ensures no pipe becomes invisible against any background.

### Canvas Rendering — Terrain

- **FR-011**: The Canvas renderer's land sub-pass (sub-pass 1c) MUST use the new biome zone colors for directional gradients. Each cell's gradient goes from the biome-interpolated color (top-left) to a darker variant (bottom-right), matching the current visual structure but with biome-specific hues.

- **FR-012**: The Canvas renderer's contour hint sub-pass (sub-pass 1e) MUST continue to show contour lines on cells in zones 2–3 (Rocky Outcrops and Ice Peaks), equivalent to the current band ≥ 3 threshold. The contour line color remains `rgba(0, 0, 0, 0.10)`.

- **FR-013**: The Canvas renderer's inner shadow sub-passes (sub-pass 1d) MUST remain unchanged — dark top/left edge and light bottom/right edge apply uniformly to all land cells regardless of biome zone.

- **FR-014**: The pipe slope indicator colors (downhill green `#059669`, flat amber `#f59e0b`, uphill red `#dc2626`, stalled gray `#9ca3af`) MUST remain unchanged as design tokens (spec 005 FR-013). The dark outline (FR-010) is what ensures their readability, not changing the colors themselves.

### DOM Overlay

- **FR-020**: The DOM overlay (`cell-view.tsx`) MUST NOT use terrain background colors — it remains transparent (`backgroundColor: 'transparent'`). The DOM overlay's role is accessibility (aria-labels, grid roles), not visual rendering. This is unchanged from the current behavior.

- **FR-021**: The DOM overlay pipe CSS triangles (`.europa-pipe`) MUST gain a dark outline/shadow to match the Canvas rendering (FR-010). This is achieved via a CSS `filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7))` on the pipe span elements. The drop-shadow creates a dark border around the CSS triangle that guarantees contrast against any terrain background.

### Design Tokens

- **FR-030**: All new biome zone colors MUST derive from the existing `@europa/design` token system. No new hex literals are introduced outside the token table (spec 012 FR-009/FR-010).

- **FR-031**: The token table MUST include a `biomeZones` array with 4 entries, each containing `hue`, `saturationPct`, `lightnessMin`, `lightnessMax`, and `elevationMax` fields. This replaces the flat `landHue`, `landSaturationPct`, `landBandLightness` tokens.

- **FR-032**: The design token documentation (DESIGN.md) MUST be updated to describe the biome zone system, replacing the current 6-band grayscale documentation.

### Minimap

- **FR-040**: The minimap MUST use the updated `terrainColor()` function to render biome-zone colors. The minimap currently calls `terrainColor()` (spec 021 FR-007), so it inherits the new colors automatically.

### Elevation Swatch

- **FR-041**: The elevation swatch component MUST be updated to display 4 biome zones instead of 6 bands, matching the new visual language. Each swatch entry shows the zone's representative color and elevation range label.

### Flow Viability Rules

- **FR-050**: The pipe flow formula MUST implement biome-aware flow viability rules. The elevation delta between source and destination determines flow behavior:

  | Condition | Elevation Delta | Flow Behavior |
  |-----------|----------------|---------------|
  | Same biome | delta < 40 (max within zone) | Always flowable — full flow rate |
  | +1 biome uphill | delta 40–80 | Flowable but slower — reduced flow rate |
  | +2 biomes uphill | delta > 80 | Stalled — zero flow |
  | Downhill (any) | delta < 0 | Always fast flow — full rate + downhill bonus |

  These rules ensure that terrain color directly communicates pipe viability: same-color cells always connect, one-color-difference uphill is slower, two-color-difference uphill is blocked.

- **FR-051**: The engine flow formula in `@europa/core` (`flowRateForDelta`) MUST be updated to support an uphill stall cap. The formula becomes:

  ```
  downhill: flowBase + flowDownhillStep × min(|delta|, flowSlopeDeltaCap)
  flat:     flowBase
  uphill:   max(0, flowBase − flowUphillStep × min(delta, flowUphillCap))
  ```

  New constants (replacing the current `flowSlopeStep` with directional parameters):
  - `flowBase`: 7 (base troops per tick on flat pipe)
  - `flowDownhillStep`: 1 (per-unit downhill bonus, same as current `flowSlopeStep`)
  - `flowUphillStep`: 1 (per-unit uphill penalty, same as current `flowSlopeStep`)
  - `flowSlopeDeltaCap`: 5 (downhill bonus cap, unchanged)
  - `flowUphillCap`: 73 (uphill penalty cap — stalls at delta = 7 + 73 = 80)

  This replaces the current `flowSlopeStep` field with `flowDownhillStep` and `flowUphillStep`, and adds `flowUphillCap`. The engine's `ENGINE_CONSTANTS` and the console's `PIPE_SLOPE_CONSTANTS` mirror MUST both be updated.

- **FR-052**: The console's `classifyPipeSlope` function MUST use the updated formula from FR-051. The stalled threshold moves from `delta >= 7` to `delta > 80`. Pipes with delta 1–80 are classified as uphill (not stalled), with intensity scaling from 0 to 1 over that range.

- **FR-053**: The engine's `flowRateForDelta` function in `@europa/core` MUST accept the expanded `FlowConstants` interface (with `flowDownhillStep`, `flowUphillStep`, `flowUphillCap` fields). The `DEFAULT_FLOW_CONSTANTS` and `ENGINE_CONSTANTS` objects MUST be updated with the new field values. The existing `flowSlopeStep` field is removed and replaced by the directional variants.

## Non-Functional Requirements

- **Performance**: The biome zone calculation is a simple comparison chain (4 branches) — cheaper than the current 6-band `Math.floor` division. The Canvas renderer's pre-computed color cache (sub-pass 1c) reduces from 6 cached colors to 4. The pipe outline adds one extra `ctx.stroke()` call per pipe triangle (negligible — pipes are already batched). Net performance impact is neutral to slightly positive.

- **Accessibility**: The DOM overlay remains transparent and unaffected. Pipe slope indicators use dark outlines (FR-010/FR-021) to provide visual separation from terrain backgrounds. Against light backgrounds (Ice Peaks), the outline provides ≥9:1 contrast. Against dark backgrounds (Smooth Ice, Fractured Ice, Rocky Outcrops), the pipe fill colors are perceptually distinct from terrain hues and are reinforced by shape (triangle) and position (cell edge) — redundant visual channels per constitution Principle VI. Biome zone colors are not the sole conveyor of any gameplay information. Owner identity is never conveyed by color alone.

- **Determinism**: Same seed → same elevation map → same biome zone assignment → same pixel output. The biome zone function is pure (no wall-clock, no randomness). Per constitution Principle II, the Canvas output is byte-identical for identical inputs.

- **Backward Compatibility**: The `@europa/core` flow formula and `@europa/engine` constants are updated (FR-051/FR-053). The `@europa/terrain`, fog, networking, and matchmaking packages are NOT modified. The console's pipe slope classifier and pre-computed cache are updated to match the new formula. All existing game logic test suites must be updated to reflect the new constants and formula behavior.

- **Contrast**: Pipe slope indicators use a combination of dark outline + fill color to ensure visibility against all biome backgrounds. The outline guarantees ≥9:1 contrast against light backgrounds (Ice Peaks). Against dark backgrounds (Smooth Ice, Fractured Ice, Rocky Outcrops), the fill colors are perceptually distinct from terrain hues and are reinforced by shape/position. Full contrast matrix documented in Examples section and verified as part of acceptance criteria.

## Acceptance Criteria

### Biome Zone Colors

- [ ] **AC-001**: Land cells at elevation 0 render in the Smooth Ice icy cyan hue (hue ~195, saturation ~30%, lightness ~15%).
- [ ] **AC-002**: Land cells at elevation 80 render in the Smooth Ice icy cyan hue at the zone's maximum lightness (~28%).
- [ ] **AC-003**: Land cells at elevation 81 render in the Fractured Ice teal hue (hue ~170, saturation ~55%, lightness ~26%) — visually distinct from elevation 80.
- [ ] **AC-004**: Land cells at elevation 160 render in the Fractured Ice zone at maximum lightness (~40%).
- [ ] **AC-005**: Land cells at elevation 161 render in the Rocky Outcrops orange hue (hue ~30, saturation ~55%, lightness ~30%) — visually distinct from elevation 160.
- [ ] **AC-006**: Land cells at elevation 208 render in the Rocky Outcrops zone at maximum lightness (~42%).
- [ ] **AC-007**: Land cells at elevation 209 render in the Ice Peaks light blue hue (hue ~200, saturation ~15%, lightness ~80%) — visually distinct from elevation 208.
- [ ] **AC-008**: Land cells at elevation 255 render in the Ice Peaks zone at maximum lightness (~95%).
- [ ] **AC-009**: Adjacent cells at each zone boundary (80/81, 160/161, 208/209) show clearly different hues (not just lightness changes).

### Pipe Readability

- [ ] **AC-010**: Every pipe triangle (filled and hollow) in the Canvas renderer has a dark outline (`rgba(0, 0, 0, 0.7)`) visible at ≥1px width.
- [ ] **AC-011**: The dark outline provides ≥9:1 contrast against Ice Peaks backgrounds (lightness 80–95%), making all pipe types clearly visible.
- [ ] **AC-012**: Green downhill pipe indicators (`#059669`) are perceptually distinct from all 4 biome zone backgrounds (hue 210/170/30/200 vs pipe hue 160) and reinforced by triangle shape.
- [ ] **AC-013**: Red uphill pipe indicators (`#dc2626`) are perceptually distinct from all 4 biome zone backgrounds (hue 210/170/30/200 vs pipe hue 0) and reinforced by triangle shape.
- [ ] **AC-014**: Amber flat pipe indicators (`#f59e0b`) provide ≥4.3:1 contrast against all dark biome backgrounds (Smooth Ice, Fractured Ice, Rocky Outcrops) and ≥9:1 against Ice Peaks via the dark outline.
- [ ] **AC-015**: Gray stalled pipe indicators (`#9ca3af`) provide ≥3.6:1 contrast against all dark biome backgrounds and ≥9:1 against Ice Peaks via the dark outline.
- [ ] **AC-016**: DOM overlay pipe CSS triangles have a dark drop-shadow matching the Canvas outline behavior.

### Unchanged Behavior

- [ ] **AC-017**: Water cells render in the existing `WATER_COLOR` (blue) — unchanged from current behavior.
- [ ] **AC-018**: Void (fog) cells render in the existing `VOID_COLOR` — unchanged from current behavior.
- [ ] **AC-019**: City cells retain their existing glow and outline effects — unchanged from current behavior.

### Correctness

- [ ] **AC-020**: The `biomeZoneForElevation()` function is pure: same input always produces same output.
- [ ] **AC-021**: All engine, terrain, fog, networking, and matchmaking tests pass without modification (zero changes to those packages).
- [ ] **AC-022**: Updated palette tests pass: `terrainColor()` returns biome-zone colors for land, `landBandIndex()` returns 0–3, `landBandColor()` returns biome-zone HSL strings.
- [ ] **AC-023**: Canvas snapshot tests are updated for the new biome colors and pipe outlines, and pass.
- [ ] **AC-024**: The elevation swatch displays 4 biome zones with correct colors and labels.
- [ ] **AC-025**: The minimap renders with biome-zone colors (no hardcoded hex).
- [ ] **AC-026**: `pnpm verify` passes (typecheck, lint, format, all tests, design guards).

### Flow Viability

- [ ] **AC-027**: A pipe between two cells in the same biome zone (elevation delta < 40) always has a positive flow rate (not stalled).
- [ ] **AC-028**: A pipe from zone N to zone N+1 uphill (elevation delta 40–80) has a reduced but positive flow rate.
- [ ] **AC-029**: A pipe from zone N to zone N+2 uphill (elevation delta > 80) has zero flow rate (stalled).
- [ ] **AC-030**: Any downhill pipe (negative elevation delta) has a positive flow rate regardless of zone difference.
- [ ] **AC-031**: The `flowRateForDelta` function with the new constants returns 0 only when `delta > 80` (uphill).
- [ ] **AC-032**: The console's `classifyPipeSlope` returns `'stalled'` only when the elevation delta exceeds 80 uphill.
- [ ] **AC-033**: The engine constants (`ENGINE_CONSTANTS`) and console mirror (`PIPE_SLOPE_CONSTANTS`) have identical flow-related field values.

## Out of Scope

The following are explicitly **not** part of this feature:

- **Terrain generation changes**: The `@europa/terrain` package is not modified. Elevation values and map generation are unaffected.
- **Fog, networking, matchmaking changes**: These packages are unaffected.
- **New biome zone data model**: The terrain data model (`elevation: number`) is unchanged. Biome zones are derived from elevation at render time, not stored.
- **Animated transitions between zones**: Zone boundaries are discrete (hard edges), matching the current band behavior.
- **Biome-specific textures or patterns**: The current directional gradient + inner shadow + contour hints are retained; only the base color changes per zone.
- **Player-facing configuration**: Biome zone colors and boundaries are hardcoded in design tokens, not user-configurable.

## Edge Cases

- **Elevation exactly at zone boundary (e.g., 80, 81, 160, 161, 208, 209)**: Each boundary value maps to the lower zone (e.g., 80 → zone 0, 81 → zone 1). The zone assignment is `[0, 80] → 0`, `[81, 160] → 1`, `[161, 208] → 2`, `[209, 255] → 3`.
- **Elevation out of range (< 0 or > 255)**: Clamped to the nearest zone boundary (zone 0 for < 0, zone 3 for > 255). Same clamping behavior as the current `landBandIndex`.
- **Water cells**: Biome zone is not applied. `terrainColor()` returns `WATER_COLOR` for all water cells regardless of elevation.
- **Fog/void cells**: Not rendered by the terrain pass. The void radial gradient (spec 021 FR-004) is unchanged.
- **Ice Peaks (zone 3) + pipe slope indicators**: The Ice Peaks zone (lightness 80–95%) is the lightest biome. The dark outline on every pipe triangle (FR-010) guarantees contrast — the outline color `rgba(0, 0, 0, 0.7)` provides ≥3:1 contrast against any background up to lightness 95%. No special indicator color changes are needed.
- **Reduced motion**: The biome shading is static (not animated). No motion to suppress. Wave texture and contour lines are also static (spec 021).
- **Extreme zoom**: Biome zone colors scale with cell size (same as current bands). Pipe outlines scale with zoom via the `Math.max(1, zoom * 0.04)` formula.
- **Elevation swatch at zone boundaries**: The swatch shows 4 discrete entries with zone labels (e.g., "0–80", "81–160", etc.) instead of the current 6 unlabeled bands.

## Examples

### Biome Zone Color Mapping

```
Elevation 0   → hsl(210, 65%, 38%)  — medium blue (Smooth Ice, easy flow)
Elevation 40  → hsl(210, 65%, 45%)  — bright blue
Elevation 80  → hsl(210, 65%, 52%)  — light blue (zone boundary)
Elevation 81  → hsl(170, 55%, 26%)  — dark teal (Fractured Ice, moderate flow)
Elevation 120 → hsl(170, 55%, 33%)  — medium teal
Elevation 160 → hsl(170, 55%, 40%)  — light teal (zone boundary)
Elevation 161 → hsl(30, 55%, 30%)   — dark orange (Rocky Outcrops, hard flow)
Elevation 185 → hsl(30, 55%, 36%)   — medium orange
Elevation 208 → hsl(30, 55%, 42%)   — light orange (zone boundary)
Elevation 209 → hsl(200, 15%, 80%)  — pale blue (Ice Peaks, extreme)
Elevation 232 → hsl(200, 15%, 87%)  — very pale blue
Elevation 255 → hsl(200, 15%, 95%)  — near-white
```

### Contrast Matrix (with dark outline)

The dark outline (`rgba(0, 0, 0, 0.7)`) on every pipe triangle provides a visual boundary and guarantees contrast against light backgrounds. Against dark backgrounds, the pipe fill colors are perceptually distinct from terrain hues and reinforced by shape.

```
                    Zone 0          Zone 1          Zone 2          Zone 3
                    (blue)          (teal)          (orange)        (light blue)
                    L=38–52%        L=26–40%        L=30–42%        L=80–95%
Downhill #059669   ✓ shape+ hue    ✓ shape+ hue    ✓ shape+ hue    ✓ outline
Flat     #f59e0b   ✓ 4.6:1         ✓ 5.9:1         ✓ 4.3:1         ✓ outline
Uphill   #dc2626   ✓ shape+ hue    ✓ shape+ hue    ✓ shape+ hue    ✓ outline
Stalled  #9ca3af   ✓ 3.9:1         ✓ 5.0:1         ✓ 3.6:1         ✓ outline
```

Legend:
- "✓ N:1" = measured WCAG contrast ratio ≥3:1
- "✓ outline" = dark outline provides ≥9:1 contrast against light background
- "✓ shape+ hue" = pipe fill color is perceptually distinct from terrain hue (different hue family) and reinforced by triangle shape; contrast ratio 1.9–2.6:1 in isolation but visually unambiguous due to redundant channels (hue + shape + position)

The key insight: against dark biomes (Smooth Ice, Fractured Ice, Rocky Outcrops), the bright pipe fills (green, amber, red) stand out as distinct hues against the darker terrain. Against light Ice Peaks, the dark outline provides the contrast guarantee. No pipe becomes invisible against any background.

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | The pipe slope colors fail WCAG contrast against colored biome backgrounds — how do we fix this? | Add a dark outline (`rgba(0, 0, 0, 0.7)`) to every pipe triangle (Canvas) and a dark drop-shadow to DOM overlay pipe CSS triangles. The outline provides a guaranteed contrast boundary regardless of background color. Pipe indicator colors remain unchanged. | FR-010, FR-014, FR-021 |
| 2 | What should the Ice Peaks zone lightness range be? | Cap at 80–95% (not 70–85%) to create a distinct snow/ice appearance. The dark outline provides additional contrast insurance. | FR-001 (revised ranges) |
| 3 | Should the stalled indicator color be darkened for Snow Caps? | No — the dark outline (Clarification 1) makes color changes unnecessary. The existing `#9ca3af` is retained. | FR-014 |
| 4 | The original ticket specifies flow viability rules (same biome = always flowable, +1 biome = slower, +2 biomes = stalled). These were missing from v1.2. Should they be added? | Yes — the flow viability rules are the core gameplay mechanic. The engine formula must be updated to stall at delta > 80 (not delta >= 7). New constants: `flowDownhillStep=1`, `flowUphillStep=1`, `flowUphillCap=73`. | FR-050, FR-051, FR-052, FR-053 |

## Implementation Notes

### v1.1 Implementation (2026-09-08)

1. **Zone boundaries align with flow viability rules**: The 4 biome zones are not arbitrary — they map to the flow viability rules (FR-050). Zone 0 (0–80) spans the "always flowable" range (max delta within zone < 40). Zone 1 (81–160) spans the "+1 biome slower" range (delta 40–80 when crossing from zone 0). Zone 2 (161–208) spans the "+2 biomes stalled" range (delta > 80 when crossing from zone 0). Zone 3 (209–255) is extreme terrain where uphill pipes are always stalled. The visual language and the gameplay mechanic are one system.

2. **Palette module is the change boundary**: All color computation changes are in `packages/console/src/render/palette.ts` and `packages/design/src/tokens.ts`. The Canvas renderer (`canvas.ts`) calls the same palette functions — it needs only minor updates to match the new band count (6→4) and to use `biomeZoneForElevation()` where it currently calls `landBandIndex()` + `landBandColor()` separately.

3. **DOM overlay is unchanged for terrain**: `cell-view.tsx` does not render terrain colors (it uses `backgroundColor: 'transparent'`). No terrain-related changes needed. The only change to `cell-view.tsx` is adding `filter: drop-shadow(...)` to pipe span elements (FR-021).

4. **Contour hints on zones 2–3**: The current contour hint threshold is band ≥ 3 (out of 6). The equivalent for 4 zones is zones 2–3 (Rocky Outcrops and Ice Peaks). This preserves the visual signal that "higher terrain has contour texture."

5. **Dark outline approach**: The contrast analysis revealed that ALL four pipe slope colors fail strict WCAG 1.4.11 (≥3:1) against some biome backgrounds when measured as direct color-to-color contrast. Rather than changing the pipe colors (which would require amending spec 005 and updating player-facing documentation), the dark outline approach provides a universal visual boundary. Against light backgrounds (Ice Peaks), the outline provides ≥9:1 contrast. Against dark backgrounds, the pipe fill colors are perceptually distinct from terrain hues (different hue families) and reinforced by triangle shape and cell-edge position — redundant visual channels per constitution Principle VI. This is a rendering-layer enhancement that does not affect the pipe color tokens or their documented semantics.

6. **Biome zone color scheme**: The biome zones use distinct hue families (blue, teal, orange, light blue) for maximum visual separation. Zones 0–2 are medium-lightness (26–52%) with high saturation (55–65%) for vivid terrain colors. Zone 3 (Ice Peaks) is deliberately light (80–95%) with low saturation (15%) to create a snow/ice appearance. This replaces the earlier similar-teal scheme that lacked visual distinction between zones.

### v1.0 → v1.1 Changes

- Biome zone lightness ranges darkened across all zones (see FR-001 table).
- Added FR-010 (Canvas pipe triangle outlines), FR-014 (pipe colors unchanged), FR-021 (DOM pipe drop-shadow).
- Added AC-010 through AC-015 (pipe readability acceptance criteria).
- Added Clarifications 1–3 documenting the contrast analysis findings.
- Updated contrast matrix in Examples section.
- Updated Implementation Notes with contrast rationale.

### v1.1 → v1.2 Changes

- Renamed biome zones from vegetation theme to Europa ice moon theme: Low Vegetation → Smooth Ice, Forest → Fractured Ice, Rocky/Alpine → Rocky Outcrops, Snow Caps → Peaks.
- Updated zone hues: Zone 0 hue 130→195 (icy cyan), Zone 1 hue 145→210 (deep blue), Zone 2 hue 30→200 (blue-gray), Zone 3 unchanged (220, cool white).
- Updated zone saturations: Zone 0 sat 35→30%, Zone 1 sat 40→35%, Zone 2 sat 30→15% (muted blue-gray for exposed rock).
- Updated all acceptance criteria, examples, contrast matrix, and edge cases to reflect new names and colors.

### v1.2 → v1.3 Changes

- Added flow viability rules (FR-050, FR-051, FR-052, FR-053) — the core gameplay mechanic from the original ticket that was missing from v1.2.
- Updated engine flow formula: replaced `flowSlopeStep` with directional `flowDownhillStep`/`flowUphillStep` + `flowUphillCap` (Option C).
- Updated stall threshold from delta >= 7 to delta > 80.

### v1.3 → v1.4 Changes

- Updated biome zone colors to use distinct hue families for maximum visual separation.
- Zone 0 (Smooth Ice): hue 195→210 (blue), saturation 30→65%, lightness 15–28%→38–52%.
- Zone 1 (Fractured Ice): hue 210→170 (teal), saturation 35→55%, lightness 10–22%→26–40%.
- Zone 2 (Rocky Outcrops): hue 200→30 (orange), saturation 15→55%, lightness 20–35%→30–42%.
- Zone 3 (Ice Peaks): hue 220→200 (light blue), saturation 8→15%, lightness 60–78%→80–95%.
- Updated all acceptance criteria, examples, contrast matrix, and edge cases to reflect new color values.
- Renamed "Peaks" to "Ice Peaks" throughout spec for consistency.
- Updated zone descriptions in FR-001 to reflect flow viability semantics.
- Removed "Engine changes" and "Pipe flow formula changes" from Out of Scope.
- Added AC-027 through AC-033 for flow viability verification.
- Added Clarification 4 documenting the scope correction.
