# Implementation Plan: Terrain Relief Shading (Delta-Based Edge Bevels)

**Feature**: `specs/017-terrain-relief-shading/spec.md` (v1.10) · **Branch**: `issue-182-tile-shading`
**Plan status**: approved at Gate 2 by the product owner on 2026-10-16; Phase 6 shipped against it; D3/D5/D7 revised for spec v1.9's settled flat-face / per-side bevel model (2026-10-20), D5/D7 re-calibrated for v1.10 (2026-10-20) · **Date**: 2026-10-20

## 1. Summary

Replace sub-pass 1d's uniform inner shadow in `packages/console/src/render/canvas.ts` with per-side bevels: for each land tile and each of its four sides, if the neighbouring cell is a *visible land* cell **and this tile is strictly higher**, paint a mitred trapezoid inside the tile's own rect whose width follows the 4 / 7 / 10 % ladder and whose tone is lit (N/W) or shaded (S/E) under one NW light. Sub-pass 1c paints a flat biome face (the per-tile gradient is retired); 1e's contour hints are untouched. Visuals only: no engine, protocol, wire, or flow change.

The change set also carries amendment groups A-01…A-05, one new pure render module, two additive design tokens, three test-suite extensions, and two player-facing documentation surfaces (manual page + help-overlay legend). No `research.md`, `contracts/`, or `data-model.md`: no data entity, no contract field, no persisted state (spec § Key Entities); the only new surface is one pure module plus one `PaintOptions` flag, specified inline below.

## 2. Technical context

| Area | Fact this plan relies on |
| --- | --- |
| Painter | `MapCanvas.paint(mapView, ctx, options)`; terrain sub-passes 1a–1f at `canvas.ts:172–263`; 1d occupies `:222–242` |
| Paint options | `PaintOptions` at `canvas.ts:78` — one existing member (`reducedMotion`) |
| Fog rule | `MapView.cells` is a `Map<string, CellRenderInfo>` keyed `coordKey` = `"x,y"`; cells outside the horizon are **absent** (`visibility-filter.ts`, fog SC-001) |
| Neighbour pattern | `build-map-view.ts:120` `destinationCoord(coord, direction)` + `rawCells.get(coordKey(dst))` → `undefined` fallback (the `pipeSlopes` derivation, `:227–243`) |
| Biome data | `TOKENS.color.biomeZones` (`packages/design/src/tokens.ts:53–58`) → `BIOME_ZONES`; `biomeZoneForElevation`, `landBandIndex`, `landBandColor` in `palette.ts` |
| 1c background | per tile: linear gradient `landBandColor(zone)` → `adjustBrightness(that, -15)`, from `(x,y)` to `(x+zoom,y+zoom)` (`canvas.ts:215–219`) |
| 1e over 1d | contour diagonals `rgba(0,0,0,0.10)`, 0.5 px, every 6 px, zones ≥ 2, painted **after** 1d (`canvas.ts:244–263`) |
| Guard G-04 | `packages/design/scripts/check-no-literals.ts` — line-based `/rgba?\(/` and `/#[0-9a-fA-F]{3,8}\b/` over `packages/console/src`; computed template strings match neither (`canvas.ts:509–513` is the precedent) |
| Test suites | `test:unit` (node), `test:component` (browser, real Chromium), `test:perf` (browser, Q-P01 8 ms), `test:determinism` (golden hash) |
| Budget gate | `scripts/verify.sh` phase 8 runs `test:perf` **without** `EUROPA_PERF_BUDGET_FACTOR` → local budget is the binding one; CI sets factor 2 |
| Feature-branch rule | never commit to `main`; conventional commits; `pnpm verify` before push |

## 3. Constitution alignment

- **I (type safety)** strict-clean; no `any`, no suppression; `relief.ts` returns typed tuples/`string`, no casts.
- **II (no leak)** relief reads `mapView.cells` only, so an absent neighbour is `undefined` → no band; no new view field, no inference, no synthesis; repeat paints byte-identical (FR-010).
- **III (tested logic)** `relief.ts` is pure with a dedicated unit suite; the browser readback suite proves the rendered contract; coverage stays ≥ 80 %.
- **IV (specs truthful)** A-01…A-05 land in the same change set; every corrected `DESIGN.md` figure is produced by a test reading `TOKENS.color.biomeZones`.
- **V (simplicity)** one module, one flag, no new dependency, no per-zone table, no bucket mapping — D5's closed forms exist because FR-003 forbids the table.
- **VI (accessibility)** relief adds a visual channel and removes none; hue still carries absolute elevation, pipe triangles still carry flow direction; no DOM or accessible-name change.
- **VII (self-hosting)** in-process, no new dependency, no configuration surface.

## 4. Decisions

### D1 — The deltas are computed at paint time, in a new pure module

**Decision.** New file `packages/console/src/render/relief.ts`, called from `canvas.ts`'s sub-pass 1d, which it replaces. `build-map-view.ts` is **not** extended with a relief field; its only change is exporting `destinationCoord`, which it already owns and which relief reuses rather than duplicating.

```ts
// packages/console/src/render/relief.ts  (v1.10)
export const RELIEF_WIDTH_RATIOS = [0.04, 0.07, 0.1] as const;          // steps 1 / 2 / 3
export const RELIEF_STEP_THRESHOLDS = [4, 9] as const;                  // Δ ≤ 4, ≤ 9, else step 3
export const RELIEF_LIT_LIGHTNESS_STEPS = [0.74, 0.79, 0.84] as const;  // share of headroom to L=100
export const RELIEF_SHADED_LIGHTNESS_STEPS = [0.4, 0.5, 0.6] as const;  // share of face L to L=0
export const RELIEF_SIDES = ['N', 'E', 'S', 'W'] as const;
export function reliefStep(delta: number): number;                            // 0, 1, 2, 3
export function reliefWidthRatio(delta: number): number;
export function reliefBandWidth(size: number, delta: number): number;
export function reliefSideIsLit(side: ReliefSide): boolean;                   // N/W true
export function reliefToneColours(faceHsl: string): { lit: [string, string, string]; shaded: [string, string, string] };
export function reliefToneColor(faceHsl: string, delta: number, side: ReliefSide): string;
export function srgbToLinear(channelByte: number): number;
export function relativeLuminance(rgb: readonly [number, number, number]): number;
```

`canvas.ts` sub-pass 1d (per tile, per side in `RELIEF_SIDES`):

```ts
const dst = destinationCoord(info.coord, side);
if (out of [0,mapView.width) × [0,mapView.height)) continue;      // FR-004(c)
const n = mapView.cells.get(coordKey(dst));                        // FR-004(b) absent → skip
if (n === undefined || n.terrain !== 'land') continue;             // FR-004(a)
const delta = info.elevation - n.elevation;
if (delta <= 0) continue;                                          // equal/higher → neutral
const width = reliefBandWidth(zoom, delta);                        // 4/7/10 % (D5)
const colour = reliefToneColor(face[band], delta, side);            // side tone, step strength
```

The painter pre-computes `reliefToneColours(landBandColor(zone))` once per zone per paint, so no band re-parses an `hsl()` string. The zone's face and its two three-tone ladders are the only colour input; `relief.ts` holds no zone table beyond the two ladders (D5).

**Rationale.** (a) `reliefToneColor` is a pure function of `(face, delta, side)` — the face comes from 1c's per-zone cache, the neighbour by keyed `Map.get`, never iteration — so re-inserting the same cells in a different order cannot change a pixel (AC-008); deriving in `build-map-view.ts` would instead add a per-cell `Map<Direction, …>` (memory + build cost) for a value the painter computes in one arithmetic step, and would move a render-only concern into the state layer. (b) Nothing is added to `buildMapView` (outside the measured budget) and the paint-time cost is bounded per bevel (D7). (c) Two modules, one call site, reusing `destinationCoord` / `coordKey` / `landBandIndex`; `CellRenderInfo` and the wire contract are untouched.

### D2 — The relief-free control is one documented `PaintOptions` flag

**Decision.** `PaintOptions` gains `readonly relief?: boolean`, **default `true`**:

```ts
/**
 * Paint delta-based edge relief (FR-001). `false` paints the
 * relief-free control used by the 017 readback suite: the whole
 * sub-pass is skipped. It does not restore the retired uniform
 * inner shadow — FR-005 retires that unconditionally.
 */
readonly relief?: boolean;
```

`paint()` computes `const relief = options?.relief !== false;`. The control render is "the same fixture, same code path, `relief: false`" — the spec's one definition; a neighbour-substituted fixture is not the control. AC-003/AC-004/AC-005 all measure against it; AC-003/AC-004 compare the same coordinate per channel with `closeTo(pixel, rgb, tolerance = 8)` (the `pipe-slope.test.tsx` precedent), AC-005 and the AC-002 rendered half compute WCAG contrast from the sampled pixels.

### D3 — Bevel geometry, caps, order, and confinement

**Decision (v1.9).** The face is flat (one `landBandColor(zone)` fill per tile); sub-pass 1d paints a bevel only on a side where `ownElevation − neighbourElevation > 0`. Each bevel is a mitred trapezoid inside its own tile, with side length `S = zoom` and width `w` from D5: N `(0,0) (S,0) (S−w,w) (w,w)`, S `(0,S) (S,S) (S−w,S−w) (w,S−w)`, W `(0,0) (w,w) (w,S−w) (0,S)`, E `(S,0) (S,S) (S−w,S−w) (S−w,w)`. The taper marks where a ledge run ends; it is not an approximation of a rounded corner.

**Caps (FR-001, v1.9).** Each band registers an *end* at each of the two vertices of its side, carrying that side's cut triangle in board coords. At each grid vertex, ends are gathered from all four surrounding tiles. If two or more land there, every end's cut triangle is filled in its own band colour; if one, the taper stands. The rule closes collinear seams and perpendicular turns without run lengths and is applied after all bands.

**Implementation shape.** `packages/console/src/render/relief-caps.ts` is pure and returns three flat coordinate runs keyed by colour: band polygons (4 points), corner squares (4 points), and cap triangles (3 points). A capped band end is the full band width, so almost every band is an axis-aligned rect and only a lone end keeps a diagonal; a same-tile corner with two different tones adds one square plus the narrower band's triangle to restore the split. The painter paints bands, then squares, then triangles, one path per colour in sorted key order, so the fill sequence is a pure function of the colour set rather than of cell insertion order (AC-008). Relief never leaves its own tile (AC-003 confinement); no cross-tile state exists, and the shared edge carries only the higher tile's bevel by construction (spec Edge Cases). Sub-pass position is unchanged (before 1e), so 1e's contour diagonals still overlay the bevels.

### D4 — The light constant: one source at the NW corner

**Decision (v1.9).** The renderer holds one fixed light position: a bevel whose outward face points **north or west is lit**, one pointing **south or east is shaded**. This replaces v1.0–v1.8's forced sign-to-luminance constant. Tone no longer encodes whether a neighbour is higher or lower — only a positive drop produces a bevel at all — so Peaks's old white-cap arithmetic no longer constrains the model. The rule is one constant (`reliefSideIsLit`) for every tile and zone, documented for players as "the map is lit from its north-west corner".

### D5 — Width and tone ladder (spec v1.10)

**Decision.** Relief has no continuous magnitude function; the settled model steps both width and tone with the positive drop and saturates at ladder step 3:

- **Step cut (v1.10 calibration).** `reliefStep(Δ)` is 1 for Δ 1–4, 2 for Δ 5–9, 3 for Δ ≥ 10 (`RELIEF_STEP_THRESHOLDS = [4, 9]`). Measured over five seeds at both shipped board sizes (32 and 48; 28,594 adjacent land pairs from `@europa/terrain`): `|Δ|` p25 = 2, p50 = 4, p75 = 7, p90 = 10, p99 = 15, max = 27 — so the three steps carry 51 % / 40 % / 8 % of positive drops. v1.9's `min(Δ, 3)` sent nearly every pair to step 3, which is why every bevel saturated; re-pin these two numbers if the generator's relief changes.
- **Width**: `ratio = [0.04, 0.07, 0.10][step − 1]` of the cell size, so `w = zoom · ratio`. At zoom 32 that is 1.28 / 2.24 / 3.2 px; at zoom 96, 3.84 / 6.72 / 9.6 px. Step 3 and Δ255 paint identical widths (the 10 % cap).
- **Tone is a lightness shift inside the face.** For a face `hsl(H, S%, L%)`, a lit (N/W) tone is `hsl(H, S%, L + f_lit · (100 − L))` and a shaded (S/E) tone is `hsl(H, S%, L − f_shaded · L)` — hue and saturation exactly preserved, only lightness moves. `f_lit = [0.74, 0.79, 0.84]`, `f_shaded = [0.40, 0.50, 0.60]`; the anchor lightnesses (100 and 0) come from `reliefHighlight` / `reliefShadow`, so the tokens stay the single source (FR-009). Separate ladders because one share cannot keep a dark zone's shade off black and still give Peaks's pale face enough shade to clear FR-006(a); at Δ1 Peaks measures lit/face 1.220 and lit/shaded 3.249, the tightest cases. Resulting Δ1 hexes (face → lit / shaded): zone 0 `#2873bd` → `#c3dbf2` / `#184572`; zone 1 `#268273` → `#baebe3` / `#174e45`; zone 2 `#8e5c29` → `#ecd5bd` / `#553719`; zone 3 `#dce2e5` → `#f6f7f8` / `#758d99`.
- **Side, not sign**: `reliefSideIsLit(side)` is `side === 'N' || side === 'W'`. The tone never consults the delta beyond choosing the ladder step, and never consults the neighbour's identity beyond proving the drop is positive.

`packages/console/src/render/relief.ts` exposes `reliefStep`, `reliefWidthRatio`, `reliefBandWidth`, `reliefSideIsLit` and `reliefToneColours` (the three lit and three shaded tones for one zone, pre-computed once per paint). No zone data, no table beyond the two three-entry ladders, no clock, no randomness (FR-010). The ladders are renderer constants; the lightness anchors are the two `@europa/design` tokens (FR-009).

**Why the old closed forms are gone.** v1.0–v1.8 normalised one `|Δ|` to the same fraction of every zone's reachable contrast and forced a sign constant from Peaks's arithmetic. The settled model replaces that with an orientation light and a three-step ledge reading, agreed with the product owner; the old `reliefTargetLuminance`/`reliefBandColor`/`reliefFraction` exports are deleted rather than kept as dead code. v1.10 deletes `RELIEF_TONE_MIXES`/`reliefToneMix` with the sRGB mix they described. The contrast floors survive only as FR-006's per-zone Δ1 checks (lit/shaded ≥ 3:1, each bevel ≥ 1.2:1 against the flat face), asserted on the rendered result.

### D6 — Tokens (FR-009) and the guard discipline

**Decision.** Two additive colour tokens in `packages/design/src/tokens.ts`: `color.reliefHighlight: '#ffffff'` and `color.reliefShadow: '#000000'`, re-exported from `palette.ts` as `RELIEF_HIGHLIGHT_COLOR` / `RELIEF_SHADOW_COLOR` and consumed by `relief.ts` as the **lightness anchors** for D5's ladders — the token's HSL lightness (`100 %` / `0 %`) is the end point a tone's lightness moves toward, and its hex value is never painted literally. v1.10 keeps them for exactly this reason: a lightness model still needs a named lit end and shaded end, and FR-009 requires relief's colour inputs to be tokens. Each gets a `DESIGN.md` § 1.1 row in the same commit (012 FR-017/FR-018; a minor change per `DESIGN.md` § 6), and T009 asserts both the token values *and* those two § 1.1 rows exist — AC-007's presence clause needs a prover and no running guard supplies one (G-01/G-02 are deferred per 012's Scope Note; `check:no-literals` scans `packages/design/src` but not `DESIGN.md`). `packages/console/src` gains no hex or rgb literal: the band colour is a *computed* `#rrggbb` template built from token values, which — like `canvas.ts:509–513` — matches neither G-04's literal pattern, so no new `design-exception` marker is needed, and a fallback literal such as `'#000'` in `relief.ts` would fail G-04 immediately (T002 says so at the emission site). The existing six markers stay as they are minus the two 1d ones A-03 retires (`canvas.ts:225`/`:234` markers, `:226`/`:235` literals), leaving four.

**Why the two tokens are not redundant.** FR-009's letter is what forces them ("Every colour relief paints MUST come from `@europa/design` tokens"), not G-04: `check-no-literals.ts`'s patterns match `#`-hex and `rgb(`/`rgba(` only, so a numeric `[255, 255, 255]` / `linear-1.0` anchor would pass the guard untouched. They are kept because their *semantics* are the ladder ends, not a UI surface — and because `TOKENS.color.focusRing` (`tokens.ts:79`) is already `#ffffff` and no pure-black token exists, a future reader will see the duplication and be tempted to delete them as redundant. N-5 must therefore record: that the two values duplicate `focusRing` and black only coincidentally; that G-04 would *not* have required them (so nobody later credits the guard with the work); and that FR-009 does.

The N-5 note also records: the pairing is delta-dependent and canvas-painted; its provenance is D5's ladders; its measured figures (per-zone Δ1 lit/shaded minimum 3.249, the tight Peaks lit/face 1.220 against the single 1.2:1 floor); where it *is* asserted (the 017 readback suite, not § 3); and the guard gap (G-07 is deferred per 012's Scope Note and could not read canvas pixels anyway). No § 3 row is added (§ 3's rows are CSS-surface pairings over § 1.1 hex; its computed-style prover G-07 is deferred) — the `pipe-downhill`/`pipe-uphill` § 1.1 rows are the recorded precedent for a luminance-weak but perceptually distinct board mark.

### D7 — Performance: measured before promised

**Decision (spec v1.9 measurement).** `packages/console/tests/integration/perf.test.ts` keeps `Q-P05`, which gates relief's **attributable addition**, not an absolute frame: the min-of-round-medians paint with relief enabled **minus** the same figure with relief disabled (`relief: false`), both through the same `benchmark()` harness (warmup 25, rounds 5, samples 40) on the identical `MapView`. The fixture is the representative all-land 48×48 field `(x*97 + y*193 + x*x*29 + y*y*61 + x*y*113) % 256` (2,304 cells) — measured **250** distinct positive `|Δ|` and **22** of the 24 possible zone × step × orientation tone colours, all four zones carrying drops — and the test asserts both counts against pinned floors (`distinct positive |Δ| ≥ 200`, `distinct tone colours ≥ 20`), so the gate cannot regress to a degenerate fixture. The bound is `RELIEF_ADDITION_BUDGET_MS = 6` with the same `readPaintBudgetFactor()` treatment `PAINT_BUDGET_MS` gets. Q-P01 is untouched: 8 ms on its own 32×32 fixture.

**The rectangle-first geometry is the perf decision.** A naive per-band trapezoid path plus one triangle path per cap measured **23.7 ms** relief-on against a 0.7 ms flat-face baseline on this fixture. Filling every capped band end as a rect, keeping a taper only at a lone end (187 of 8,988 ends), and emitting one square + one triangle only for the 1,515 same-tile corners with two different tones brings the measured addition to **4.0–4.1 ms** over repeated v1.10 runs (relief-on 4.70–4.80 ms, relief-off 0.70 ms), worst **4.10 ms** — a **≈32 %** margin under the 6.0 ms bound. The v1.10 calibration changes no per-band work: the step lookup is one threshold compare and the tones are still pre-computed once per zone. `scripts/verify.sh` runs `test:perf` with no factor, so the pinned bound is the binding one locally; CI sets the factor to 2. The absolute frame is deliberately **not** gated: a 48×48 full-board paint's base cost is unrelated to this feature, and the flat face lowered the relief-off baseline from ≈3.4 ms to ≈0.7 ms without changing that reasoning.

**The fixture is deliberately bare.** The unit/pipe/city layers are Q-P01's own fixture and would dominate a 48×48 measurement, so a decorated gate would measure those layers rather than relief. A tile's relief never leaves its own rect, so batching and the rectangle-first path move no pixel outside the tile that owns it (AC-003); repeat-paint and reversed-`Map` byte identity are asserted separately (AC-008).

### D8 — Measurement protocol

**Decision.** A browser-mode readback spec `packages/console/tests/component/render/relief.test.tsx` that renders fixtures directly through `MapCanvas.paint` on a real canvas (`width = board·zoom`, `height = board·zoom`) — no `<App />` indirection, because the object under test is the painter and both renders must take the identical code path. Helpers pinned: `paintFixture(mapView, options?) → CanvasRenderingContext2D` (fresh canvas per render, `getImageData` readback), `hexOrRgbToRgb`, `closeTo(pixel, rgb, tolerance = 8)`, `wcagContrast(pixelA, pixelB)`, and:

- **Sampling rule**: for each asserted band, one pixel, at the band's mid-axis on its outermost row (N/S) or column (W/E) — i.e. `(⌊zoom/2⌋, y)` for N, `(⌊zoom/2⌋, y+zoom−1)` for S, `(x, ⌊zoom/2⌋)` for W, `(x+zoom−1, ⌊zoom/2⌋)` for E. At `zoom = 32` that is gradient `t = 17/64` on the N band and `t = 48/64` on the S band, per D5's span table. No mod-6 offset formula: the earlier one ("smallest `o ≥ 2` with `((o − r + zoom) mod 6) == 3`") was a second model of sub-pass 1e's step *and* phase, and it was already one pixel off for a 1-based `r`. Two guards, both verified per band and neither able to re-pick silently: the sampled **control** pixel must match the closed-form 1c gradient colour at that point within `tolerance 8` — this is the contour-freeness proof, because a 1e crossing composites `rgba(0,0,0,0.10)` over the pixel and shifts a Peaks channel by ≈22 bytes, three times the tolerance — and the same coordinate in the relief render must differ from it (the band is actually painted there). A guard failure **fails the test loudly, naming the pixel and the deviation**: the fixture is then wrong and must be moved, never retried into a neighbouring pixel, because a silent re-pick would let a genuine misalignment pass. Zones 0–1 carry no contours, so the guard passes trivially there.
- **Tolerance**: AC-003/AC-004 compare the same coordinate per channel with `closeTo(..., tolerance = 8)`; byte-identical assertions use `Uint8ClampedArray` equality on the whole `getImageData`; AC-005/AC-002 compare WCAG ratios computed from the sampled pixels. One allowance, explicit: a painted tone is asserted against `reliefToneColours` within the per-channel readback tolerance (8) at the band mid-axis; the floors themselves are asserted at their stated values (`≥ 3.0`, `≥ 1.2`) with no allowance — an implementation that weakens the ladder must fail visibly.
- **Fixture set**: four per-zone reference fixtures (own 80/128/161/209; `|Δ|` to the lower/higher neighbour 80/175, 128/127, 161/94, 209/46, lower neighbour on the N side, higher on the S side — so the tight `209` highlight sits on the N band, nearer the light gradient end, and the `46` shadow on the S band nearer the dark end: the worst case for *both* signs rather than a convenient placement; AC-001/AC-005); the `|Δ| = 1…255` sweep fixture sampled at 1, 2, 16, 64, 128, 192, 255 with the four-zone repeats at two fixed magnitudes (AC-002); the neutral cases — all-non-land tile, water-only, fog-only (neighbour absent), off-board corner, and the `|Δ| = 0` case (AC-003, AC-004); the tile-confinement case (every pixel at which the relief render differs from the relief-free control lies inside a band rect belonging to the tile that paints it — asserted globally and per tile, each with a positive difference count so neither can pass vacuously); and the AC-003 hidden-elevation pair realised as (absent, water at 0, water at 255) producing byte-identical **edge-band** pixels, because a *hidden* cell's elevation is structurally unrepresentable in `MapView` (a view contains only visible cells). AC-008 adds repeat-paint byte identity and a `Map` rebuilt in reversed insertion order. Pin `zoom = 32` (the 005 FR-017 minimum, the AC-005/AC-003 assertion point) and add a 96 px zoom case for confinement (spec Edge Cases). The two Peaks reference bands are also pinned **byte-exactly** — `#f9fafb` (highlight, `|Δ| = 209`) and `#646c70` (shadow, `|Δ| = 46`) — so D5's 8-bit quantisation is asserted rather than merely tolerated; T007 pins them where they are exact and browser-independent, at the `fillStyle` level of a real `paint()` through the existing Proxy mock ctx.

### D9 — Amendment work and the token-reading test

**Decision.** A-05 lands *before* A-03, because A-03's figures must come from it: `packages/console/tests/unit/render/palette.test.ts` gains a `documented terrain contrast figures (A-03 sweep)` block that imports `TOKENS` from `@europa/design`, reads `TOKENS.color.biomeZones`, and **asserts** — not merely prints — every figure the sweep will state: the per-zone zone-midpoint lightness, each pipe slope fill's ratio against each dark zone's midpoint (uphill/downhill/flat/stalled), the uphill/downhill ranges, the two hue proximities (downhill green 161.4° vs zone 1 170°; flat amber 37.7° vs zone 2 30°), the water ratios (≈2.37:1 vs void; the shipped land ceiling `hsl(200 15% 95%)`), and the re-derived N-3 figures. A later token change then fails a test instead of rotting `DESIGN.md`. In the same task the vacuous Peaks case (`palette.test.ts:368–374`, `hslToRgb(220, 8, 60)`) reads zone 3 from `TOKENS.color.biomeZones`, the `PIPE_OUTLINE_COLOR` comment (`palette.ts:68–72`) is corrected, and the same file gains the **token-presence assertion AC-007 needs**: `TOKENS.color.reliefHighlight === '#ffffff'` and `TOKENS.color.reliefShadow === '#000000'`, **and** `DESIGN.md` § 1.1 names both (`TOKENS.color.reliefHighlight` / `TOKENS.color.reliefShadow` and their canonical values), so a token added without its row — or a row dropped later — fails a test. The test reads the file at the repo root resolved from its own location (`new URL('../../../../../DESIGN.md', import.meta.url)`), slices the § 1.1 block between its `### 1.1 Colors` heading and the next `### ` heading, and asserts both names appear in it; a missing file, a missing heading, or an empty slice is a hard failure, never a vacuous pass. Precedent for a guard reading repo docs is `check:component-catalog`, which parses `DESIGN.md` § 2 from the repo root. A-03 (`DESIGN.md`) and A-04 (`AGENTS.md`) then copy that block's asserted values into prose — the implementer runs the test and transcribes, never hand-computes. Every corrected row landing below its recorded target carries the filed follow-up issue **#199** (A-03's below-target annotation requirement; the issue exists, so nothing is invented and nothing is left ownerless). A-01/A-02 rewrite `024-FR-013` and extend `018-FR-004` in `specs/005-client-console/spec.md` with a dated **v1.13** clarification block, using the spec's verbatim amendment text.

### D10 — Test strategy and the retired assertion

Each implementation task ships with the tests that prove it (see `tasks.md`'s pairing column). `tests/unit/render/canvas-terrain.test.ts`'s "land cells draw inner shadow (1px dark/light edges)" is **replaced** by an assertion that the new sub-pass paints edge relief and that the two retired fills (`rgba(0, 0, 0, 0.25)`, `rgba(255, 255, 255, 0.15)`) are gone — using the existing Proxy mock ctx, so it fails against today's code (AC-004). `pipe-slope.ts`, `pipe-slope.test.tsx`, and `slope-drift.test.ts` are not touched (AC-006, reviewer check on the diff). `test:determinism` needs no fixture work: relief adds no `MapView` field, so the golden hash is expected to stay byte-identical (AC-008), and T008 asserts that by running the suite rather than by regenerating the hash.

### D11 — Manual and legend (FR-011)

`docs/manual/src/pages/the-board.mdx`'s "Elevation shading" section gains a two-channel explanation — hue = how high a cell is (four hue families), edge shading = whether the neighbour is higher or lower — and loses the false "from dark green at the lowest ground to bright green at the peaks" sentence. The four inline `EuropaElevationSwatch` examples stay (the swatch is unchanged, 024-FR-041). `packages/console/src/ui/help-overlay.tsx`'s `SYMBOL_LEGEND` replaces the single `██ Elevation` entry ("dark = low, light = high") with two distinct entries — absolute biome elevation (hue) and relative edge relief (luminance) — matching A-02's text. Any value the prose quotes in `DESIGN.md` comes from D9's test; the manual and legend quote no figures.

## 5. Rollback and risks

| Risk | Mitigation / rollback |
| --- | --- |
| 48×48 relief's attributable addition exceeds its 6 ms bound | D7's measurement-first order and the whole-sub-pass colour batch, bound against the worst observed run with the fixture's variety pinned; the gate measures the addition, not the frame, so a degenerate fixture cannot hide a regression |
| Peaks lit-tone floor (Δ1, 1.2:1 vs the flat face) | the tone is a fixed sRGB mix toward `reliefHighlight`; the measured Peaks Δ1 lit tone clears the floor and the assertion samples an interior pixel. If it ever lands below, fix the mix, never floor the ladder (FR-003 is stepped by design) |
| Zone 2's shaded-tone floor | same fixed-mix argument; it is not the tight case under the orientation model |
| Tone quantisation (8-bit channels) | the tones are computed `#rrggbb` from token colours; the readback asserts the pure mapping and tolerates one channel step (8) at the sample point |
| Cap geometry at unequal widths | the narrower band's own cut triangle restores its half; the wider band bases the square, so both tones survive the corner |
| Token addition ripples (`design.css`, vendored copies, bundle size) | `pnpm --filter @europa/design build` regenerates `dist/` (gitignored) and vendors the two `design.css` copies, committed in T001; `check:vendor-identity` and `check:bundle-size` are in `pnpm verify` |
| A-03's corrected figures drift from the test | structural: the test asserts them, so a later change fails CI |
| Rollback | the change is one sub-pass + one module + one flag; reverting the relief sub-pass and restoring `canvas.ts:222–242` restores today's board, and the tokens/notes are additive |

## 6. Out of scope

Spec § Out of Scope applies unchanged — nothing it excludes comes back. Reviewer-visible consequences only: `qol/minimap.tsx` untouched, `EuropaElevationSwatch` unchanged, no engine, wire, or configuration change, nothing under `europa-source/`, no new runtime dependency.

## 7. Verification

`bash scripts/verify.sh` green (includes `test:unit`, `test:component`, `test:perf`, `test:determinism`, and the running design drift checks), plus an agent-browser visual smoke against `pnpm host` with a relief-bearing screenshot under `__screenshots__/`. Reviewer checks: the diff touches nothing in `src/render/pipe-slope.ts`, no § 3 row was added, and the manual/legend prose matches D11.

## 8. Spec version

Written against `spec.md` **v1.9**. v1.9's settled model (flat face, per-side bevel, orientation tone, 4/7/10 % ladder, vertex caps) is the spec's own text, which D3/D4/D5 and D7 cite rather than reconcile. The v1.5–v1.8 history is superseded; A-03's older figures remain provisional where the spec still marks them so, and D9's token-reading test is their prover.
