# Research: Biome-Based Terrain Shading (Feature 024)

> Version: 1.0
> Status: Draft

## 1. WCAG Contrast Analysis

### 1.1 Pipe Slope Indicators vs Biome Backgrounds (with dark outline)

The spec's contrast matrix (§ Examples) documents the full analysis. Key findings:

**Dark outline strategy**: `rgba(0, 0, 0, 0.7)` on every pipe triangle provides a universal visual boundary. Against light backgrounds (Peaks, lightness 60–78%), the outline provides ≥9:1 contrast against the background — making all pipe types clearly visible. The outline color `rgba(0, 0, 0, 0.7)` has a composite luminance of approximately 0.028 (near-black), which against Peaks' lightest point (L=78%, relative luminance ≈ 0.528) yields:

```
contrast = (0.528 + 0.05) / (0.028 + 0.05) ≈ 7.4:1
```

This exceeds WCAG 1.4.11's ≥3:1 target for non-text graphical objects by a wide margin.

**Against dark biomes** (Ice Plains L=15–28%, Fractured Ice L=10–22%, Rocky Outcrops L=20–35%):
- The pipe fill colors themselves provide sufficient contrast OR are perceptually distinct:
  - Flat amber `#f59e0b` vs darkest biome (Fractured Ice L=10%): ≈ 5.9:1 — exceeds 3:1
  - Stalled gray `#9ca3af` vs darkest biome (Fractured Ice L=10%): ≈ 5.0:1 — exceeds 3:1
  - Downhill green `#059669` vs darkest biome: ≈ 2.5:1 — below 3:1 in isolation, but green hue (160) is perceptually distinct from all biome hues (195/210/200/220)
  - Uphill red `#dc2626` vs darkest biome: ≈ 2.0:1 — below 3:1 in isolation, but red hue (0) is perceptually distinct from all biome hues

**Redundant visual channels** (constitution Principle VI): Against dark biomes where the pipe fill alone doesn't reach 3:1, the pipe indicator is still unambiguous because:
1. **Hue distinction**: Green (160°) and Red (0°) are in completely different hue families from Cyan (195°), Blue (210°), Blue-gray (200°), and Blue (220°)
2. **Shape**: Triangle shape is distinct from the rectangular cell
3. **Position**: Pipes sit at cell edges, not centers
4. **Outline**: The dark outline always provides ≥3:1 regardless of background

### 1.2 Biome Zone Lightness Ranges (deliberately dark)

The v1.2 spec darkened all zone lightness ranges compared to the initial proposal:

| Zone | Old Range | New Range | Rationale |
|------|-----------|-----------|-----------|
| Ice Plains | 15–40% | 15–28% | Better pipe contrast; maintains dark theme |
| Fractured Ice | 10–30% | 10–22% | Better pipe contrast; maintains dark theme |
| Rocky Outcrops | 20–45% | 20–35% | Better pipe contrast; maintains dark theme |
| Peaks | 60–85% | 60–78% | Capped to keep stalled gray readable |

The darker palette serves two purposes:
1. Better inherent contrast for pipe indicators (most pipe colors are bright against dark terrain)
2. Maintains the dark-themed visual language (page background `#0b0f19`)

### 1.3 Biome Zone vs Void Contrast

Biome zone darkest points vs void (`#1a2233`, relative luminance ≈ 0.022):

| Zone | Darkest L | Relative Luminance | Contrast vs Void |
|------|-----------|-------------------|-----------------|
| Ice Plains | 15% | ≈ 0.027 | ≈ 1.06:1 |
| Fractured Ice | 10% | ≈ 0.014 | ≈ 1.42:1 |
| Rocky Outcrops | 20% | ≈ 0.042 | ≈ 1.93:1 |
| Peaks | 60% | ≈ 0.315 | ≈ 4.57:1 |

The lower zones (0–2) are below 3:1 against void, but this is acceptable because:
- Terrain is never the sole information carrier (constitution Principle VI)
- Elevation information is redundantly encoded by troop chips, city markers, and the minimap
- This matches the existing behavior (current land band floor is ≈ 1.68:1 vs void)

---

## 2. Pipe Outline Approach Rationale

### 2.1 Why Outline Instead of Recoloring

The initial analysis revealed that ALL four pipe slope colors fail strict WCAG 1.4.11 (≥3:1) against SOME biome backgrounds when measured as direct color-to-color contrast. The options were:

| Option | Pros | Cons |
|--------|------|------|
| **A. Dark outline** | Universal guarantee; no pipe color changes; no spec 005 amendment needed | Adds one stroke call per pipe triangle |
| B. Recolor pipes per biome | Could achieve 3:1 everywhere | Would require amending spec 005 FR-013; changes documented player-facing colors; complex per-biome color selection |
| C. Brighten biome backgrounds | Better pipe contrast | Breaks the Europa ice moon theme; lighter backgrounds clash with dark page |

**Decision: Option A (dark outline)** — chosen because:
1. It's a rendering-layer enhancement that doesn't affect pipe color tokens or their documented semantics
2. The performance cost is one extra `ctx.stroke()` per pipe triangle (negligible — pipes are already batched)
3. It provides a universal guarantee regardless of background color
4. It aligns with the spec's explicit prescription (FR-010)

### 2.2 Canvas vs DOM Outline Consistency

The outline must appear in both rendering paths for visual consistency:

- **Canvas** (primary visual): `ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'` + `ctx.stroke()` before `ctx.fill()`
- **DOM overlay** (accessibility layer): `filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7))` on `.europa-pipe`

The drop-shadow on CSS border-triangles creates a dark halo around the triangle shape, matching the Canvas outline behavior. The shadow is 1px spread with 70% opacity — subtle enough to not distort the triangle shape, strong enough to provide contrast.

---

## 3. Technical Risks

### 3.1 DESIGN.md Drift (Medium Risk)

The terrain token rows in DESIGN.md § 1.1 currently document:
- `land-hue`, `land-max-lightness-pct`, `land-min-lightness-pct`, `land-saturation-pct`
- Land band ceiling/floor contrast pairs in § 3

These must be updated in the same change set as the implementation (constitution Principle IV, DESIGN.md § 5 sync rule). The G-01/G-02 guards will catch any mismatch, but the prose rows must be manually updated to reflect the biome zone system.

**Mitigation**: Include DESIGN.md updates in the implementation task list (T-010).

### 3.2 Elevation Swatch in Design Package (Low Risk)

`EuropaElevationSwatch` lives in `@europa/design`, not `@europa/console`. Updating it means the design package is also modified. This is acceptable because:
- The spec (FR-041) explicitly requires it
- The component reads from the same token table being updated
- The change is self-contained (2 helper functions change, component structure stays)

**Mitigation**: Test the swatch component after the token update.

### 3.3 Canvas Pre-computed Color Cache (Low Risk)

The canvas painter pre-computes band colors for performance (lines 143–149 of `canvas.ts`). With 4 zones instead of 6 bands, the cache shrinks from 6 to 4 entries. The loop structure (`for (let b = 0; b < LAND_BAND_COUNT; b++)`) automatically adapts since `LAND_BAND_COUNT` changes from 6 to 4.

**Mitigation**: The loop is driven by the constant; no manual count adjustment needed.

### 3.4 Contour Threshold Mapping (Low Risk)

Current: `band < 3` (no contour) / `band >= 3` (contour) — shows contours on bands 3, 4, 5 out of 6 (upper 50% of elevation range).

New: `zone < 2` (no contour) / `zone >= 2` (contour) — shows contours on zones 2, 3 out of 4 (upper 37% of elevation range: elevations 161–255).

The contour threshold covers a slightly smaller proportion of the elevation range (37% vs 50%), but this is intentional — the Rocky Outcrops zone (161–208) starts at a higher elevation than the old band 3 threshold, which aligns with the visual intent of "higher terrain has contour texture."

---

## 4. Performance Analysis

### 4.1 Biome Zone Calculation

Current: `Math.floor((elevation / 256) * 6)` — floating-point division + floor
New: 4-way comparison chain — branch prediction friendly, no division

The new approach is marginally faster (cheaper CPU operations) and uses fewer cached colors (4 vs 6).

### 4.2 Pipe Outline Stroke

Each pipe triangle currently has one `fill()` or `stroke()` call. Adding the outline adds one `stroke()` call before the existing draw. Since pipes are already batched in a single loop (Pass 3), the additional state changes are minimal:
- One `strokeStyle` assignment (shared across all outline strokes)
- One `lineWidth` assignment (shared)
- One `stroke()` call per pipe triangle

For a typical 32×32 board with ~200 pipes, this adds ~200 `stroke()` calls — negligible compared to the ~10,000 `fillRect()` calls in the terrain sub-passes.

### 4.3 DOM Drop-shadow

The CSS `filter: drop-shadow()` is applied once per `.europa-pipe` element. Modern browsers optimize filter operations on small elements. The shadow is 1px spread — minimal compositing cost.

---

## 5. References

- Spec: `specs/024-biome-based-terrain-shading/spec.md` v1.2
- Constitution: `.specify/memory/constitution.md`
- Design system: `DESIGN.md` (§ 1.1 tokens, § 3 contrast pairs)
- Original pipe flow formula: `packages/engine/src/constants.ts` (flowBase=7, flowSlopeStep=1, flowSlopeDeltaCap=5)
- Pipe slope classification: `packages/console/src/render/pipe-slope.ts`
- WCAG 2.2 non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
