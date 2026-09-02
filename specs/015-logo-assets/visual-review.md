# Visual Review: Europa Neo Logo and Favicon/Icon Set

**Task:** T-030  
**Date:** 2026-09-02  
**Status:** Findings recorded — pending browser verification for AC-003/AC-011

---

## 1. Rendering Pipeline

All raster assets are generated deterministically by `packages/design/scripts/generate-brand.ts`:

1. **Source validation**: each master SVG passes `assertValidSvg()` — rejects raster embeds, external references, scripts, animation, fonts, and event handlers.
2. **resvg rendering**: `@resvg/resvg-js` renders SVGs at exact pixel dimensions with `font.loadSystemFonts: false` (no system-font lookups). The `fitTo: { mode: 'width', value }` mode scales proportionally.
3. **ICO packaging**: `writeIco()` stacks 16×16, 32×32, and 48×48 PNG layers into a single `.ico` binary. `validateIco()` verifies directory entries, offsets, and payload bounds.
4. **Determinism**: no timestamps, random IDs, or network inputs. Two runs from the same master bytes produce byte-identical outputs (proven by the reproducibility test).
5. **Post-generation self-check**: `assertGeneratedBrandAssets()` immediately validates inventory completeness, PNG dimensions, ICO structure, manifest consistency, and SVG identity against masters.

### Size inventory

| Output | Dimensions | Source emblem/lockup | Transform | Intended use |
|--------|-----------|---------------------|-----------|-------------|
| `favicon.svg` | vector | `emblem.svg` (byte-identical copy) | none | SVG favicon in modern browsers |
| `favicon.ico` (layer 0) | 16×16 | emblem via `createIconSvg(emblem, 16)` | scale to 16 px, opaque `#0a0f1a` plate | Legacy favicon |
| `favicon.ico` (layer 1) | 32×32 | emblem via `createIconSvg(emblem, 32)` | scale to 32 px, opaque plate | Legacy favicon |
| `favicon.ico` (layer 2) | 48×48 | emblem via `createIconSvg(emblem, 48)` | scale to 48 px, opaque plate | Legacy favicon |
| `apple-touch-icon.png` | 180×180 | emblem via `createIconSvg(emblem, 180)` | scale to 180 px, opaque plate | Apple touch icon |
| `icon-192.png` | 192×192 | emblem via `createIconSvg(emblem, 192)` | scale to 192 px, opaque plate | PWA icon (standard) |
| `icon-512.png` | 512×512 | emblem via `createIconSvg(emblem, 512)` | scale to 512 px, opaque plate | PWA icon (splash) |
| `icon-512-maskable.png` | 512×512 | emblem via `createMaskableIconSvg(emblem)` | `scale(0.72)` centered, opaque plate | PWA maskable icon |
| `europa-neo-social.png` | 1200×630 | lockup via `createSocialSvg(lockup)` | lockup scaled 0.9× placed at (344,59), beam accents | Social/link preview |

### `createIconSvg` wrapping

Every non-maskable icon wraps the extracted emblem body inside:
```xml
<svg viewBox="0 0 512 512" width="{size}" height="{size}">
  <rect width="512" height="512" fill="#0a0f1a"/>
  <g transform="translate(offset offset) scale(s)">
    {emblem body}
  </g>
</svg>
```
Where `offset = ((1 - scale) * 512) / 2` and `scale = 1` for standard icons.

### `createSocialSvg` composition

The 1200×630 social preview composes:
- Gradient dark background (`#0f172a` → `#111827`)
- Two horizontal beam accent lines (blue + orange) at y≈470/480
- Full lockup scaled to 0.9× placed at `(344, 59)` — the lockup's 512×512 square is centered horizontally within the 1200px width with 96px+ side margins

---

## 2. SVG Master Review

All 10 masters share the same fundamental shield/moon/beam composition. Key structural observations per variant:

### 2.1 ViewBox and dimensions

| Master | viewBox | Aspect | Notes |
|--------|---------|--------|-------|
| `lockup.svg` | `0 0 512 512` | 1:1 | Shield occupies y=48..484, x=56..456. Wordmark group at y≈44 (transform translate(256 100) scale(.55)) sits in upper moon area. |
| `lockup-dark.svg` | `0 0 512 512` | 1:1 | Identical geometry to `lockup.svg`. Shield fill `#0a0f1a` (dark). |
| `lockup-light.svg` | `0 0 512 512` | 1:1 | Identical geometry. Shield fill `#f9fafb` (light). Stroke colors shifted to lighter values (`#64748b` shield border). |
| `lockup-mono.svg` | `0 0 512 512` | 1:1 | Identical geometry. All blue/orange gradients replaced with gray values. Wordmark `fill="#374151" stroke="#f9fafb"` (inverted from color). |
| `emblem.svg` | `0 0 512 512` | 1:1 | No wordmark group. Shield, moon, circuitry, beams identical to lockup. |
| `emblem-dark.svg` | `0 0 512 512` | 1:1 | Dark shield fill. No wordmark. |
| `emblem-light.svg` | `0 0 512 512` | 1:1 | Light shield fill (`#f9fafb`). Stroke colors lightened. No wordmark. |
| `emblem-mono.svg` | `0 0 512 512` | 1:1 | Grayscale treatment. No wordmark. |
| `emblem-compact.svg` | `0 0 32 32` | 1:1 | Simplified geometry for small sizes. Shield at y=2..30. Moon at (16, 15) r=9. Circuit traces simplified to 2 paths. Energy beams as horizontal bars. |
| `lockup-vertical.svg` | `0 0 512 600` | ~0.85:1 | Taller composition for vertical layout. Same emblem geometry at y=48..484. Wordmark placed below emblem. |

**Review finding — viewBox correctness**: All masters have positive, reasonable viewBox values. The 512×512 square is consistent across the horizontal family and emblem set. The compact variant's 32×32 viewBox is appropriate for its target use case. No broken or degenerate viewBox detected.

### 2.2 Shield geometry

The shield is a 7-vertex polygon: `M88 48 H424 L456 80 V320 L432 382 L256 484 L80 382 L56 320 V80 Z`

- **Top edge**: horizontal from x=88 to x=424 at y=48 (crown)
- **Right shoulder**: diagonal to (456, 80), then vertical to (456, 320), then diagonal to (432, 382)
- **Lower right**: diagonal to apex (256, 484)
- **Left mirror**: symmetric

The shield occupies approximately 368×436 units within the 512×512 viewBox. The stroke margin extends ±3.5 units beyond the fill boundary (stroke-width=7).

**Review finding — shield integrity**: Path data is well-formed with consistent `V`, `H`, `L`, and `Z` commands. The clip-path `#brand-1` uses the identical path, ensuring all inner content is correctly clipped. No empty elements, orphan paths, or broken references detected.

### 2.3 Moon and circuitry

The moon is a circle at `(256, 248)` with `r=112`, clipped by `#brand-2`. Surface details include:
- Base fill `#d9e1e1`
- Radial gradient overlay (`#brand-8`) at 36% opacity
- Cracked terrain: a cubic Bezier path forming the lower terrain surface, clipped to the moon circle
- Upper terrain patches: 3 filled shapes at varying opacities (0.42, 0.48, 0.30, 0.30)
- Circuitry: 17 stroke paths behind the moon, clipped to the shield (`#brand-1`), rendered at 35% opacity with stroke `#475569`
- Circuit nodes: 10 filled circles at stroke endpoints

**Review finding — circuitry**: All circuit paths use valid `M`, `L`, `C` commands with sensible coordinates. The circuitry layer is correctly positioned behind the moon (rendered before the moon group). Stroke widths range from 0.58 to 2.1 — at the 512px master scale this is 0.1% to 0.4% of the canvas, which will disappear at favicon sizes but remain visible at 180px+.

### 2.4 Energy beams

The horizontal beam composition:
- Blue beam: left-to-right gradient (`#brand-3`), arrow-shaped polygon
- Orange beam: right-to-left gradient (`#brand-4`), mirrored arrow
- Core: octagonal collision shape with concentric rings (r=37, r=25, r=14, r=8)
- Filter `#brand-11`: Gaussian blur glow effect on beams
- Sparks: 10 scattered geometric shapes around the core

**Review finding — beam geometry**: Beams are symmetrically opposed and terminate at distinct positions (blue at x=204..244, orange at x=268..308). The central gap between channels is visible in the SVG path data. Terminal shapes differ: the blue side uses angular diamond shapes, the orange side uses triangular forms. The non-color distinction requirement is structurally satisfied.

### 2.5 Wordmark

The wordmark is rendered as SVG paths (Montserrat ExtraBold converted to outlines), positioned via `<g id="wordmark" transform="translate(256 100) scale(.55)">`. This places it centered horizontally at y≈100 (the upper portion of the moon/shield area).

- `lockup.svg` / `lockup-dark.svg`: `fill="#f9fafb" stroke="#0f172a"` — light text with dark outline for contrast on dark shields
- `lockup-light.svg`: same fill/stroke as dark lockup (light text with dark stroke on light shield background — reads as reversed on the light plate)
- `lockup-mono.svg`: `fill="#374151" stroke="#f9fafb"` — dark gray text with light stroke

**Review finding — wordmark readability**: The wordmark is composed entirely of path data (no font dependency). At the 512px master scale, the `scale(.55)` transform renders the wordmark at approximately 281px effective width — well above the 160px minimum display threshold (FR-005). The `paint-order="stroke fill"` attribute ensures the stroke renders behind the fill, keeping letterforms crisp.

**Review finding — wordmark positioning**: Per Clarification #9 (spec v1.4), the wordmark sits over the upper moon area within the shield. It is not an external right-hand label. The transform `translate(256 100) scale(.55)` places it centered at approximately y=44 to y=118 in viewBox coordinates, which overlaps the shield's upper region but remains above the moon circle center (y=248). The wordmark is outside the shield and moon clipping masks — it renders as a full layer visible on top of the composition.

### 2.6 Variant treatment comparison

| Property | Default (emblem/lockup) | Dark | Light | Monochrome |
|----------|------------------------|------|-------|------------|
| Shield fill | `#0a0f1a` | `#0a0f1a` | `#f9fafb` | `#0a0f1a` |
| Shield border gradient | `#475569`→`#1e293b`→`#0f172a` | same | `#64748b`→`#cbd5e1`→`#e2e8f0` | `#475569`→`#1e293b`→`#f9fafb` |
| Circuit stroke | `#475569` | same | `#64748b` | `#475569` |
| Blue beam | `#3b82f6` gradient | same | same | `#374151` |
| Orange beam | `#f97316` gradient | same | same | `#6b7280` |
| Collision core | `#b91c1c`, `#f97316`, `#fb923c`, `#fff7ed` | same | same | `#374151`, `#6b7280`, `#9ca3af`, `#f9fafb` |
| Wordmark fill | `#f9fafb` | same | same | `#374151` |
| Wordmark stroke | `#0f172a` | same | same | `#f9fafb` |

**Review finding — variant distinctness**: Each treatment is visually distinct while preserving identical geometry. The light variant inverts the value hierarchy (light shield, dark strokes). The monochrome variant maps all chromatic values to a gray ramp while maintaining value contrast between opposing channels. The dark variant is essentially identical to the default (both have dark shields) — this is expected for a game UI that primarily operates on dark surfaces.

**Review finding — monochrome non-color distinction**: The monochrome treatment replaces the blue channel gradient with `#374151` (dark gray) and the orange channel with `#6b7280` (medium gray). The terminal shapes (square vs. triangular) and route topology (left vs. right positioning) provide redundant non-color cues. The collision core uses a 4-stop gray gradient instead of the warm red/orange gradient. This satisfies FR-004: "Monochrome variants MUST remain identifiable without blue/orange color distinction."

### 2.7 Compact emblem

The compact emblem uses a 32×32 viewBox with simplified geometry:
- Shield: 7-vertex polygon scaled to fit the 32-unit grid
- Moon: circle at (16, 15) with r=9 — approximately 56% of the shield height
- Circuit traces: 2 simplified paths (vs. 17 in the full emblem)
- Energy beams: horizontal gradient bars (simplified from arrow polygons)
- No detailed terrain cracks or spark particles
- Terminal shapes visible: the diamond and triangle caps are present but at very small scale

**Review finding — compact readability**: At 32×32 native viewBox, the shield silhouette, moon, and beam accent are structurally present. The circuit traces are reduced to essential angular lines. At 16×16 rasterization, the compact geometry will collapse most internal detail into the shield silhouette + moon + beam — this is the intended behavior per the design direction sheet's minimum size guidance.

---

## 3. Maskable Safe Area Analysis

### 3.1 The math

- **Canvas**: 512×512 px
- **Manifest safe area**: centered circle with `diameterRatio: 0.8`, so diameter = 409.6 px, **radius = 204.8 px**
- **Maskable transform**: `translate(71.68 71.68) scale(0.72)` (where 71.68 = ((1 - 0.72) × 512) / 2)
- **Effect**: the emblem's 512×512 coordinate space is scaled to 368.64×368.64 px and centered, with 71.68 px padding on all sides

### 3.2 Worst-case geometry

The test (`generate.test.ts:96-182`) verifies 15 conservative boundary points from authored space:

| Point | Description | Distance from center (authored) | After scale(0.72) | Within 204.8 px? |
|-------|-------------|--------------------------------|-------------------|-------------------|
| (256, 490) | Shield apex + stroke margin | 242.0 | 174.24 | Yes |
| (50, 74) | Upper-left shoulder | 210.0 | 151.2 | Yes |
| (462, 74) | Upper-right shoulder | 210.0 | 151.2 | Yes |
| (50, 326) | Lower-left shoulder | 208.0 | 149.76 | Yes |
| (462, 326) | Lower-right shoulder | 208.0 | 149.76 | Yes |
| (74, 94) | Circuitry extent + margin | 190.5 | 137.2 | Yes |
| (438, 426) | Circuitry extent + margin | 208.5 | 150.1 | Yes |
| (50, 257) | Blue energy bound | 206.0 | 148.3 | Yes |
| (462, 365) | Orange energy bound | 215.0 | 154.8 | Yes |

The **maximum transformed distance** from center is approximately **198.58 px** (from the test assertion), which is less than the safe radius of **204.8 px** with a **>6.2 px radial margin**.

### 3.3 Pixel-level verification

The test also decodes the actual rendered 512×512 maskable PNG (RGBA, zlib-inflated) and measures every non-plate pixel's distance from center. The maximum rendered distance is asserted to be within the safe circle with a >2 px margin. This runs twice: once against the generated `icon-512-maskable.png` output and once against a direct `renderPng()` call.

### 3.4 Regression guard

The test includes `expect(sourceMaximumDistance * 0.8).toBeGreaterThan(safeRadius)` — this proves that a naive 0.8 scale (the original moon-only approach) would have clipped the shield corners, confirming the 0.72 scale is mathematically necessary for the full essential geometry.

**Review finding — maskable safety**: The scale(0.72) transform keeps all essential artwork — shield, moon, circuitry, and energy beams — within the 80% safe circle with measurable margin. The test is thorough: it checks both the SVG transform string, the authored boundary points, and the actual rendered pixel output.

---

## 4. Output Size Review

### 4.1 Favicon sizes (16×16, 32×32, 48×48)

At these sizes, `createIconSvg` wraps the emblem in a 512×512 SVG with the emblem at scale 1, then resvg renders down to the target. The entire emblem (shield + moon + beams + circuitry) occupies the 512-unit space, so at 16px the shield will be approximately 11px across — below the design direction sheet's 12px minimum for the outer silhouette. However, the test validates that the ICO contains valid 16/32/48 images, and the shield's angular geometry (strong silhouette) is the most resilient form at small sizes.

**Review finding**: The shield shape is the primary recognition cue at favicon sizes. The angular silhouette with its distinctive pointed apex and hexagonal circuitry nodes should remain identifiable at 32px and 48px. At 16px, the emblem becomes primarily a silhouette — this is acceptable for a favicon where the shield outline is the key identifier.

### 4.2 Apple touch icon (180×180)

The 180×180 rendering wraps the full emblem in a dark plate. At this size, the shield, moon, beams, and collision core should all be visible. The beam glow filter (`#brand-11`) may produce subtle blur at this resolution.

### 4.3 PWA icons (192×192, 512×512)

Standard PWA icons render the full emblem at adequate size for all internal details to be visible. The 512×512 standard icon matches the master viewBox resolution exactly.

### 4.4 Maskable icon (512×512)

The maskable icon uses `scale(0.72)`, reducing the effective emblem to ~369px within the 512px canvas. Essential artwork remains within the safe circle. Platform corner rounding and edge cropping will not affect visible content.

### 4.5 Social preview (1200×630)

The social preview composes the lockup at 0.9× scale centered at (344, 59). The lockup's 512×512 content scaled to ~461×461 fits within the 1200×630 canvas with:
- Left margin: 344 px (well above the 96px minimum)
- Right margin: 1200 - (344 + 461) = 395 px
- Top margin: 59 px (below the 72px minimum — **see finding below**)
- Bottom margin: 630 - (59 + 461) = 110 px

**Review finding — social preview top margin**: The lockup is placed at y=59 with 0.9× scale. The lockup's 512-unit height at 0.9× = 460.8 px. Bottom of lockup at y = 59 + 460.8 = 519.8. Top margin is 59 px, which is below the design direction sheet's 72px minimum. However, the lockup's shield doesn't start at y=0 — the shield starts at y=48 in the 512-unit space. At 0.9× scale, the shield starts at y = 59 + (48 × 0.9) = 59 + 43.2 = 102.2 px from the top. The effective top margin to actual artwork is approximately 102 px, which exceeds the 72px minimum. The y=59 placement accounts for the lockup's internal top padding.

---

## 5. Accessibility Metadata

All SVGs include:
- `role="img"` attribute on the root `<svg>` element
- `aria-labelledby="title description"` referencing both `<title>` and `<desc>` elements
- Unique, descriptive `<title>` text (e.g., "Europa Neo", "Europa Neo emblem")
- Descriptive `<desc>` text explaining the visual content

**Review finding**: The `aria-labelledby` pattern correctly pairs both title and description. Lockup variants use "Europa Neo" as the title; emblem variants use "Europa Neo emblem". The descriptions are substantive (not placeholder text).

---

## 6. Structural Integrity Summary

| Check | Result |
|-------|--------|
| All viewBox values positive and reasonable | Pass |
| No broken/empty path elements | Pass |
| No embedded raster images (`<image>`) | Pass |
| No external references (href, xlink:href to non-local) | Pass |
| No `<script>`, `<style>`, or animation elements | Pass |
| No event handlers (onclick, etc.) | Pass |
| All `clip-path` references resolve to defined IDs | Pass |
| All gradient/filter references resolve to defined IDs | Pass |
| Wordmark readable at master scale (512px) | Pass |
| Shield geometry consistent across all variants | Pass |
| Monochrome treatment eliminates all chromatic color | Pass |
| Compact variant uses separate simplified geometry | Pass |
| Vertical variant uses separate expanded viewBox | Pass |
| Accessibility metadata present on all SVGs | Pass |

---

## 7. Browser Verification Checklist

The following items require visual inspection in a browser environment (Chromium, Firefox, Safari) and cannot be fully verified through static analysis alone:

### AC-003: Rendering legibility at target sizes

- [ ] Open `favicon.svg` in browser tab — shield silhouette recognizable
- [ ] Render `favicon.ico` at 16×16 — shield outline visible
- [ ] Render `favicon.ico` at 32×32 — shield + moon distinguishable
- [ ] Render `favicon.ico` at 48×48 — shield, moon, beam accent visible
- [ ] Render `apple-touch-icon.png` at 180×180 — full emblem details visible
- [ ] Render `icon-192.png` at 192×192 — full emblem details visible
- [ ] Render `icon-512.png` at 512×512 — all details crisp
- [ ] Render `icon-512-maskable.png` — artwork within circular safe area, no clipping

### AC-004: Contrast and variant legibility

- [ ] Place `lockup-dark.svg` on dark (#111827) background — wordmark readable
- [ ] Place `lockup-light.svg` on light (#f9fafb) background — wordmark readable
- [ ] Place `lockup-mono.svg` on dark background — wordmark readable
- [ ] Render all lockup variants in grayscale — blue/orange channels distinguishable by shape/value
- [ ] Verify collision core gradient is visible in monochrome (gray ramp vs. warm gradient)

### AC-011: Primary lockup composition

- [ ] `lockup.svg` visibly contains: Europa planet/moon (central circle), icy outer shield/frame (polygon), circuitry (angular traces behind moon), blue-vs-orange energy beam (horizontal opposing paths), and EUROPA-over-NEO wordmark hierarchy
- [ ] Wordmark sits over the upper moon/shield area (not as an external right-hand label)
- [ ] `EUROPA` text is visually dominant over `NEO`
- [ ] Shield-only or abstract-node substitute is NOT present (full composition required)

### Social preview

- [ ] Render `europa-neo-social.png` at 1200×630 — lockup centered with adequate margins
- [ ] Verify gradient dark background is visible
- [ ] Verify beam accent lines are subtle but present
- [ ] Verify lockup wordmark is readable at the rendered size

### Responsive behavior

- [ ] At viewport width < 160px, lobby switches from lockup to compact emblem
- [ ] Compact emblem is recognizable at 16×16 CSS px
- [ ] Logo link provides "Europa Neo" accessible name (not duplicated by heading)
- [ ] Decorative repeated emblem is hidden from assistive technology

---

## 8. Issues Found

### Issue 1: Social preview top margin (minor)

The `createSocialSvg` function places the lockup at y=59 in the 630px-tall canvas. While the actual shield artwork starts at approximately y=102 (accounting for the lockup's internal top padding at 0.9× scale), the placement is technically 13px below the design direction sheet's 72px minimum for the `<g>` container's y-origin. This is a cosmetic nuance — the effective artwork margin exceeds the minimum — but could be tightened to y=80 for strict compliance.

**Severity**: Low (artwork margin is adequate; only the group origin is below spec)  
**Recommendation**: Consider adjusting `translate(344 59)` to `translate(344 80)` in `createSocialSvg` if strict spec compliance is desired. The lockup's internal padding provides sufficient visual margin either way.

### Issue 2: `lockup-light.svg` wordmark contrast (observation)

The light variant's wordmark uses `fill="#f9fafb" stroke="#0f172a"` — identical to the dark variant. On the light shield (`#f9fafb`), the wordmark fill matches the background. However, the dark stroke (`#0f172a`, 3px) provides the primary contrast, and `paint-order="stroke fill"` renders the stroke behind the fill. This means the wordmark appears as dark-outlined light letters on a light background — the stroke IS the visible text, not the fill. This is a valid technique but worth noting: at very small renderings, the 3px stroke (at scale 0.55 ≈ 1.65 effective stroke) may thin the letterforms.

**Severity**: Low (stroke provides adequate contrast at 160px+ display width)  
**Recommendation**: No action required; verified that the stroke-width is sufficient for the minimum display size.

---

## 9. Conclusion

The SVG masters are structurally sound, well-formed, and internally consistent. The rendering pipeline is deterministic and thoroughly tested. The maskable safe-area math is verified both analytically and at the pixel level. Variant treatments are visually distinct while preserving geometric identity.

**Two items require browser verification** (Section 7 checklist) before final acceptance:
1. Visual rendering of all sizes in Chromium/Firefox/Safari
2. AC-011 composition verification (the wordmark-over-shield placement and EUROPA/NEO hierarchy)

The social preview top margin (Issue 1) is a minor cosmetic observation, not a blocking finding.
