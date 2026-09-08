# Plan: Biome-Based Terrain Shading (Feature 024)

> Version: 1.0
> Status: Draft
> Spec: `specs/024-biome-based-terrain-shading/spec.md` v1.2

## 1. Technical Context

### Constitution Alignment

| Principle | Alignment |
|-----------|-----------|
| **I. Type Safety** | All new code is TypeScript strict mode; biome zone config is a typed array of readonly objects. No `any` types. |
| **II. Determinism** | `biomeZoneForElevation()` is pure — same elevation always returns the same zone/color. No wall-clock, no randomness. Canvas output remains byte-identical for identical inputs. |
| **III. Tested Game Logic** | ≥80% coverage on palette module (existing tests updated + new biome-specific tests). Canvas rendering tests updated. |
| **IV. Specs as Documentation** | Spec 024 v1.2 is the source of truth. DESIGN.md § 1.1 updated in the same change set. |
| **V. Simplicity** | Replaces 6-band system with 4-zone system — fewer bands, simpler mapping, same rendering pipeline. The dark outline approach is simpler than recoloring pipe indicators. |
| **VI. Accessibility** | Dark outlines guarantee WCAG 1.4.11 contrast for pipe indicators against all biome backgrounds. DOM overlay remains transparent. Redundant visual channels (hue + shape + position). |

### Scope Boundary

**Console-only change.** The following packages are NOT modified:
- `@europa/engine` — no gameplay changes
- `@europa/terrain` — no map generation changes
- `@europa/fog`, `@europa/networking`, `@europa/matchmaking` — unaffected

**Modified packages:**
1. `@europa/design` (`packages/design/`) — token table update
2. `@europa/console` (`packages/console/`) — palette, canvas, cell-view, styles, elevation-swatch

### Key Files

| File | Package | Change Type |
|------|---------|-------------|
| `packages/design/src/tokens.ts` | design | Modify: replace flat land tokens with biome zone config |
| `packages/console/src/render/palette.ts` | console | Modify: new biome zone functions, update existing band functions |
| `packages/console/src/render/canvas.ts` | console | Modify: pipe outline, contour threshold, pre-computed colors |
| `packages/console/src/render/cell-view.tsx` | console | Modify: add drop-shadow filter to pipe spans |
| `packages/console/src/styles/index.css` | console | Modify: add drop-shadow to `.europa-pipe` rule |
| `packages/design/src/components/game/elevation-swatch.tsx` | design | Modify: 4 biome zones instead of 6 bands |
| `DESIGN.md` | root | Modify: update § 1.1 terrain tokens, § 3 contrast pairs |
| `packages/console/tests/unit/render/palette.test.ts` | console | Modify: update all band tests for 4-zone system |
| `packages/console/tests/unit/render/canvas-terrain.test.ts` | console | Modify: update contour threshold, pipe outline tests |

---

## 2. Architecture Overview

### Rendering Pipeline (unchanged structure, changed data)

```
┌─────────────────────────────────────────────────────┐
│                    Canvas 2D Paint                    │
│                                                      │
│  Pass 0: Void radial gradient (unchanged)            │
│  Pass 1: Terrain                                     │
│    1a: Water gradients (unchanged)                   │
│    1b: Wave texture (unchanged)                      │
│    1c: Land directional gradients (BIOME COLORS)     │
│    1d: Inner shadows (unchanged)                     │
│    1e: Contour hints (threshold: zone ≥ 2)           │
│    1f: City glow (unchanged)                         │
│  Pass 2: Units (unchanged)                           │
│  Pass 3: Pipes (DARK OUTLINE added)                  │
│  Pass 4: Effects (unchanged)                         │
│  Pass 5: Labels (unchanged)                          │
│  Pass 6: Hover/focus (unchanged)                     │
└─────────────────────────────────────────────────────┘
```

### Data Flow: Elevation → Color

```
elevation (0–255)
    │
    ▼
biomeZoneForElevation(elevation)
    │
    ├── zone: 0–3
    ├── hue: per-zone constant
    ├── saturationPct: per-zone constant
    └── lightness: linear interpolation within zone range
    │
    ▼
terrainColor(terrain, elevation)  →  hsl(H S% L%)
    │
    ├── water → WATER_COLOR (unchanged)
    └── land → biome zone HSL
```

### Token Design (FR-001, FR-007, FR-031)

**Retired tokens** (removed from `TOKENS.color`):
- `landBandCount: 6`
- `landBandLightness: [18, 26, 34, 42, 50, 58]`
- `landHue: 120`
- `landSaturationPct: 12`
- `landMinLightnessPct: 26`
- `landMaxLightnessPct: 62`

**New tokens** (added to `TOKENS.color`):
```typescript
biomeZones: readonly [
    { elevationMax: 80,  hue: 195, saturationPct: 30, lightnessMin: 15, lightnessMax: 28 },  // Ice Plains
    { elevationMax: 160, hue: 210, saturationPct: 35, lightnessMin: 10, lightnessMax: 22 },  // Fractured Ice
    { elevationMax: 208, hue: 200, saturationPct: 15, lightnessMin: 20, lightnessMax: 35 },  // Rocky Outcrops
    { elevationMax: 255, hue: 220, saturationPct: 8,  lightnessMin: 60, lightnessMax: 78 },  // Peaks
]
```

**New constants** (palette.ts):
```typescript
export const BIOME_ZONES = TOKENS.color.biomeZones;
export const PIPE_OUTLINE_COLOR = 'rgba(0, 0, 0, 0.7)';
```

### Pipe Outline Design (FR-010, FR-021)

**Canvas (Pass 3):**
- Filled pipes (downhill/flat/uphill): `stroke()` first with `PIPE_OUTLINE_COLOR` + `Math.max(1, zoom * 0.04)` width, then `fill()` with slope color.
- Hollow pipes (stalled): `stroke()` with `PIPE_OUTLINE_COLOR` + `Math.max(2, zoom * 0.08)` width (thick dark outline), then `stroke()` with slope color + `Math.max(1.5, zoom * 0.06)` width (colored inner stroke).

**DOM overlay (cell-view.tsx):**
- Add `filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7))` to `.europa-pipe` CSS rule.
- This creates a dark border around the CSS border-triangle that matches the Canvas outline behavior.

---

## 3. Key Decisions

### Decision 1: Biome zone data as a typed array, not a Map

**Choice**: `biomeZones` is a `readonly` tuple of 4 objects with fixed shape.

**Rationale**: The zone config is static (spec Out-of-Scope: "not user-configurable"), so a plain array with index lookup is simpler and faster than a Map. The zone boundaries are monotonically increasing, so a linear scan of 4 entries is negligible. TypeScript tuple typing provides compile-time size enforcement.

**Alternative considered**: A `Map<number, BiomeZoneConfig>` — rejected because Maps don't carry tuple-length guarantees and add indirection for no benefit.

### Decision 2: Keep `landBandIndex` and `landBandColor` function names

**Choice**: Retain the existing function names `landBandIndex(elevation)` and `landBandColor(band)` but change their semantics (6→4 bands, biome-zone HSL).

**Rationale**: These functions are called from `canvas.ts` (lines 214, 215, 256) and the palette test suite. Renaming them would create unnecessary churn. The doc comments will be updated to reflect the new semantics.

**Alternative considered**: Rename to `biomeZoneIndex` and `biomeZoneColor` — rejected because it would touch every call site for cosmetic gain. The functions are internal to the console package.

### Decision 3: Dark outline via Canvas stroke, not shadow

**Choice**: Use `ctx.strokeStyle` + `ctx.stroke()` for the pipe outline, not `ctx.shadowColor` + `ctx.shadowBlur`.

**Rationale**: Shadows are the most expensive Canvas2D operation (already used sparingly for city glow). The stroke approach is deterministic, scales with zoom via simple math, and doesn't introduce blur artifacts. The spec (FR-010) explicitly prescribes the stroke approach.

### Decision 4: Contour threshold from `band >= 3` to `zone >= 2`

**Choice**: Contour hints appear on zones 2–3 (Rocky Outcrops and Peaks), equivalent to the current `band >= 3` threshold.

**Rationale**: The current threshold shows contours on the upper half of the elevation range. With 4 zones, zones 2–3 cover elevations 161–255 (the upper 37%), which is the equivalent visual proportion. The spec (FR-012) confirms this mapping.

### Decision 5: Elevation swatch uses biome zone colors

**Choice**: `EuropaElevationSwatch` in `@europa/design` updates to use `biomeZones` for its color computation.

**Rationale**: The swatch is a design-system component that visualizes elevation. It must match the board's visual language. The component already reads `TOKENS.color.landBandCount` and `TOKENS.color.landBandLightness` — it will read `TOKENS.color.biomeZones` instead.

**Risk**: The swatch is in `@europa/design`, which means the design package is also modified. However, the spec (FR-041) explicitly requires this, and the change is minimal (the `bandIndex` and `lightnessFor` helpers change, the component structure stays the same).

---

## 4. Implementation Strategy

### Phase A: Token Foundation (design package)
1. Update `tokens.ts` with new biome zone config (retire old tokens, add `biomeZones` array)
2. Update `elevation-swatch.tsx` to use biome zones
3. Update DESIGN.md § 1.1 (terrain token rows) and § 3 (contrast pairs)

### Phase B: Palette Module (console package)
4. Update `palette.ts` exports: new `BIOME_ZONES`, `PIPE_OUTLINE_COLOR`, updated `landBandIndex`/`landBandColor`/`terrainColor`
5. Add `biomeZoneForElevation()` function (FR-005)
6. Update palette tests for 4-zone system

### Phase C: Canvas Renderer (console package)
7. Update `canvas.ts` pre-computed color cache (6→4 zones)
8. Update contour threshold (band ≥ 3 → zone ≥ 2)
9. Add pipe outline stroke to `drawPipes` method (FR-010)
10. Update canvas terrain tests

### Phase D: DOM Overlay (console package)
11. Add drop-shadow filter to `.europa-pipe` CSS rule (FR-021)
12. Verify cell-view.tsx needs no changes (FR-020: terrain stays transparent)

### Phase E: Verification
13. Run `pnpm verify` — all tests pass, no regressions
14. Visual verification: render a board with cells at all four biome zones

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Engine/terrain test breakage | Very Low | High | No engine/terrain files modified; AC-021 asserts zero changes to those packages |
| Canvas snapshot test drift | High | Medium | Tests must be updated in the same change set; snapshot expectations reflect new biome colors |
| Pipe outline visual regression | Medium | Low | Outline is additive (dark stroke on existing triangles); visual comparison before/after |
| DESIGN.md drift | Medium | Medium | G-01/G-02 guards catch token mismatches; update in same commit |
| Elevation swatch mismatch | Low | Low | Component reads same tokens as palette; biome zone config is the single source |

---

## 6. Acceptance Criteria Traceability

| AC | Tests | Implementation |
|----|-------|----------------|
| AC-001–AC-009 | T-007 (palette tests): biome zone boundary values | T-003 (palette.ts): `biomeZoneForElevation()` |
| AC-010–AC-011 | T-009 (canvas tests): pipe outline stroke calls | T-006 (canvas.ts): `drawPipes` outline |
| AC-012–AC-013 | T-010 (research): contrast matrix verification | T-006: outline + existing colors |
| AC-014–AC-015 | T-009: outline provides contrast guarantee | T-006: outline stroke |
| AC-016 | T-008 (CSS test): drop-shadow on `.europa-pipe` | T-005 (index.css): filter rule |
| AC-017–AC-019 | T-011 (integration): water/city rendering unchanged | No changes to water/city code paths |
| AC-020 | T-007: pure function tests for `biomeZoneForElevation` | T-003: function implementation |
| AC-021 | T-011: full test suite green | No engine/terrain/fog/networking/matchmaking changes |
| AC-022 | T-007: updated palette tests | T-003: palette module |
| AC-023 | T-009: updated canvas tests | T-006: canvas renderer |
| AC-024 | T-012 (design tests): swatch renders 4 zones | T-002: elevation-swatch.tsx |
| AC-025 | T-011: minimap uses terrainColor (inherits) | T-003: palette module |
| AC-026 | T-011: `pnpm verify` green | All tasks complete |
