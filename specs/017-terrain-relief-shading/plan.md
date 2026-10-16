# Implementation Plan: Terrain Relief Shading (Delta-Based Edge Bevels)

**Feature**: `specs/017-terrain-relief-shading/spec.md` (v1.7) · **Branch**: `issue-182-tile-shading`
**Plan status**: draft for Gate 2 · **Date**: 2026-10-16

## 1. Summary

Replace sub-pass 1d's uniform inner shadow in `packages/console/src/render/canvas.ts` with per-edge relief bands: for each land tile and each of its four edge directions, if the neighbouring cell is a *visible land* cell, paint a band inside the tile's own rect whose luminance encodes the sign of `neighbourElevation − ownElevation` and whose size encodes `|Δelevation|` continuously. Sub-pass 1c (biome gradient) and 1e (contour hints) are untouched. Visuals only: no engine, protocol, wire, or flow change.

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
// packages/console/src/render/relief.ts  (new)
export const RELIEF_HIGHLIGHT_IS_DOWNHILL = true;  // FR-002 sign constant (D4)
export const RELIEF_MAX_DELTA = 255;               // FR-003 normaliser
export const RELIEF_BAND_RATIO = 0.08;             // band thickness / cell size
export const RELIEF_MIN_BAND_PX = 2;               // keeps the band measurable at zoom 32
export const RELIEF_DIRECTIONS = ['N', 'E', 'S', 'W'] as const;  // fixed paint order
export function reliefBandThickness(zoom: number): number;
export function srgbToLinear(channelByte: number): number;
export function relativeLuminance(rgb: readonly [number, number, number]): number;   // WCAG 2.x
export function linearTriple(hslColor: string): readonly [number, number, number];   // parse → linear
export function reliefFraction(delta: number): number;                       // |Δ| / 255, clamped
export function reliefTargetLuminance(baseLuminance: number, fraction: number, highlight: boolean): number;
export function reliefBandColor(baseLinear: readonly [number, number, number], delta: number, highlight: boolean): string;
```

`canvas.ts` sub-pass 1d (per tile, per direction in `RELIEF_DIRECTIONS`):

```ts
const dst = destinationCoord(info.coord, direction);
if (out of [0,mapView.width) × [0,mapView.height)) continue;      // FR-004(c)
const n = mapView.cells.get(coordKey(dst));                        // FR-004(b) absent → skip
if (n === undefined || n.terrain !== 'land') continue;             // FR-004(a)
if (n.elevation === info.elevation) continue;                      // FR-003 Δ = 0
const highlight = (n.elevation < info.elevation) === RELIEF_HIGHLIGHT_IS_DOWNHILL;
const base = highlight ? lightEndLinear[band] : darkEndLinear[band];   // 1c's own two gradient ends (D5)
ctx.fillStyle = reliefBandColor(base, reliefFraction(Math.abs(n.elevation - info.elevation)), highlight);
```

`lightEndLinear` / `darkEndLinear` are eight `linearTriple()` results computed once at the top of `paint()` — the same two colours per zone that 1c's `landBandColors` / `landBandDarkColors` caches already hold, so the module never re-derives a zone colour and `relief.ts` needs no zone knowledge (D5).

**Rationale.** (a) `reliefBandColor` is a pure function of `(baseLinear, delta, highlight)` — the base comes from 1c's per-zone cache, the neighbour by keyed `Map.get`, never iteration — so re-inserting the same cells in a different order cannot change a pixel (AC-008); deriving in `build-map-view.ts` would instead add a per-cell `Map<Direction, …>` (memory + build cost) for a value the painter computes in one arithmetic step, and would move a render-only concern into the state layer. (b) Nothing is added to `buildMapView` (outside the measured budget) and the paint-time cost is bounded per band (D7, measured by T008). (c) One module, one call site, reusing `destinationCoord` / `coordKey` / `biomeZoneForElevation`; `CellRenderInfo` and the wire contract are untouched.

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

### D3 — Band geometry, order, and confinement

**Decision.** Thickness `Math.max(RELIEF_MIN_BAND_PX, Math.round(zoom * RELIEF_BAND_RATIO))` → 3 px at zoom 32, 8 px at 96 (005 FR-017's clamp). Rect per direction, always inside the tile: N `(x, y, zoom, t)`, S `(x, y+zoom−t, zoom, t)`, W `(x, y, t, zoom)`, E `(x+zoom−t, y, t, zoom)`. Bands are **opaque** (`fillStyle = reliefBandColor(...)`, no alpha, no blend mode, no `globalCompositeOperation`), painted in `RELIEF_DIRECTIONS` order; corner overlaps between bands of the *same* tile are resolved by that fixed order. Consequence: relief never leaves the tile's rect (AC-003 confinement), and no cross-tile coupling exists — the shared delta flips sign per tile by construction, so the two facing bands differ with no ridge/valley state (spec Edge Cases). Sub-pass position is unchanged (before 1e), so 1e's contour diagonals still overlay the bands; the measurement protocol (D8) samples off them.

### D4 — The sign constant: higher neighbour → darker band

**Decision.** `RELIEF_HIGHLIGHT_IS_DOWNHILL = true` — an edge toward a **lower** visible land neighbour is painted with the *highlight* (lighter) treatment, an edge toward a **higher** neighbour with the *shadow* (darker) treatment. One constant, no per-tile variation, documented for players as "the lighter edge shows the way down" (FR-011).

**Why it is forced, not chosen.** On any tile the highlight direction is bounded by white and can therefore reach only `1.31:1` against a Peaks tile's light gradient end (`L≈0.7527`) and `1.91:1` against its dark end (`L≈0.5004`). With a mapping proportional to `|Δ|` (FR-003, and the `≈1.00:1 at |Δ|=1` the spec fixes), a highlight band at `|Δ| = 46` reaches at most `1 + 0.31·(46/255) = 1.056:1` on that background — below FR-006b's `1.2:1` floor. So the Peaks reference fixture's `|Δ| = 46` band cannot be the highlight; the highlight must be the `|Δ| = 209` band, i.e. toward the lower neighbour (D5's table: `209` → `1.2526:1`, the tightest figure in the set). This is the only assignment under which AC-005 passes for Peaks, and spec v1.5's Clarifications records it as *forced* ("a higher neighbour MUST render as the darker band").

### D5 — Magnitude mapping: closed form anchored at the zone background's extreme

**Decision.** Let `f = |Δ| / 255`, and let the **base** be the 1c gradient colour for the zone at the end the band's sign can get closest to: the **light end** (`landBandColor(zone)`, gradient `t = 0`) for a highlight band, the **dark end** (`adjustBrightness(landBandColor(zone), −15)`, `t = 1`) for a shadow band. `L` below is that base's relative luminance. Magnitude is measured as the band's contrast **excess** against the relief-free control, normalised by the reachable maximum at that base:

```ts
// highlight (toward white, cap = 1.05 / (L + 0.05))
L_target = L + f * (1 - L);                          // mix factor k = f
// shadow (toward black, cap = (L + 0.05) / 0.05)
L_target = L * (1 - f) / (1 + 20 * f * L);           // mix factor k = f(1 + 20L) / (1 + 20fL)
```

Both are algebraically exact for the fraction identity: the highlight gives `(R − 1)/(R_cap − 1) = f(1 − L)/(1 − L) = f`, and the shadow gives `R = 1 + 20fL` against `R_cap = 1 + 20L`, so `(R − 1)/(R_cap − 1) = f` too. That identity is asserted on `reliefTargetLuminance` (T003), where it is exact to double precision; what the *painted* band adds on top is bounded separately below. The band colour realises `L_target` by mixing the base colour toward the white/black extreme **per channel in linear-light space** (`c_lin = (1−k)·c_base_lin + k·c_ext_lin`, so the mixed luminance is exact before the 8-bit store), then returning a computed `#rrggbb` string. `Δ = 0` never reaches this code (D1). No table, no bucket, no per-zone magnitude constant: continuity and strict increase in `|Δ|` are structural (`f` is linear, `L_target` monotone in `f`), and rounding to bytes preserves that monotonicity, so the painted band can repeat a colour between adjacent `|Δ|` at the bottom of the range but can never reverse.

**The base is the zone's own background — FR-002's per-zone adaptation is not a second number.** Each zone's base is that zone's 1c gradient end for the band's sign, i.e. the zone's background rather than an adaptation constant: `paint()` already computes both ends for 1c (`landBandColors` / `landBandDarkColors`) and passes the matching one in as a linear triple, so `relief.ts` holds no zone data, no table, and no geometry. A band that sits on a lighter (highlight) or darker (shadow) part of its own gradient than the anchor is simply further from the floor (next paragraph).

**The anchor is the worst case over every band the sign can appear in.** With the tile's gradient running from local `(0,0)` to `(zoom, zoom)`, a pixel's gradient parameter is `t = (u + v + 1) / (2·zoom)`, so at `zoom = 32` the N/W bands span `t ∈ [1/64, 34/64]` (≈0.016–0.531) and the S/E bands span `t ∈ [30/64, 63/64]` (≈0.469–0.984); at `zoom = 96` the bands are thicker but still strictly inside the tile, so every band of every direction stays inside `(0, 1)` at both zoom steps. The 1c background's per-channel bytes are a rounded affine mix of the two endpoint colours and therefore monotone in `t`, and WCAG luminance is monotone in those bytes. So for **every pixel of every band of every direction**:

- a highlight band's local background is at most the light end's luminance (its tightest case, since `(L_band + 0.05)/(L_bg + 0.05)` falls as `L_bg` rises) — so `R ≥ R_derived`;
- a shadow band's local background is at least the dark end's (its tightest case, since `(L_bg + 0.05)/(L_band + 0.05)` falls as `L_bg` drops) — so `R ≥ R_derived`.

That is the whole proof of FR-006b across the band span: the derived figure is a **lower bound satisfied at every point of every band**, not a point estimate, and it needs no per-direction parameter. The cost is that the bound is loose — most for the two bands whose own span is not at their sign's extreme (a highlight on S/E, a shadow on N/W), and slightly for the rest — so D8's sample point reads a figure above the bound rather than equal to it. `RELIEF_BAND_T` and `zoneBackgroundLuminance(zone, t)` are deleted with the model: a per-direction `t` would have been a second model of 1c's geometry, the bands' own spans are too wide for a point to stand for them, and measurement could not keep the two in step.

**Peaks arithmetic (zone 3, own elevation 209 — derivation, reproduced by T003 on the pure function and T006 on the rendered result, never copied into `DESIGN.md`).** Its gradient ends are `landBandColor(3)` = `hsl(200 15% 88%)` (lightness `round((80+95)/2)` from `TOKENS.color.biomeZones[3]`) → `rgb(220, 226, 229)` → `L = 0.75266`, and `adjustBrightness(·, −15)` = `hsl(200 15% 73%)` → `rgb(176, 190, 196)` → `L = 0.50045`. Reference fixture: `|Δ| = 209` toward the lower neighbour 0 (highlight, on the N band) and `|Δ| = 46` toward the higher neighbour 255 (shadow, on the S band):

| band | `f` | base `L` | cap | `L_target` | `R` vs control (lower bound) | floor `1.2:1` |
| --- | --- | --- | --- | --- | --- | --- |
| highlight, `\|Δ\| = 209` | 0.81961 | 0.75266 | `1.05/0.80266 = 1.3081` | `0.75266 + 0.81961·0.24734 = 0.95539` | `1.00539/0.80266 = 1.2526` | passes — binding, margin 4.4 % |
| shadow, `\|Δ\| = 46` | 0.18039 | 0.50045 | `0.55045/0.05 = 11.009` | `0.50045·0.81961/(1+20·0.18039·0.50045) = 0.14620` | `1 + 20·0.18039·0.50045 = 2.8056` | passes |

Band-to-band WCAG contrast on the realised colours — highlight `#f9fafb` (`L = 0.95477`) against shadow `#646c70` (`L = 0.14601`) — is `1.00477/0.19601 = 5.13:1` ≥ 3:1 (FR-006a). The same computation for all four zones, each at its own reference fixture (highlight base = that zone's light end, shadow base = its dark end):

| zone | own | light-end `L` | highlight `\|Δ\|` → `R` | dark-end `L` | shadow `\|Δ\|` → `R` | band-to-band (realised) |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 80 | 0.16386 | 80 → 2.226 | 0.07041 | 175 → 1.966 | 7.77:1 |
| 1 | 128 | 0.17614 | 128 → 2.829 | 0.05023 | 127 → 1.500 | 9.53:1 |
| 2 | 161 | 0.13567 | 161 → 3.940 | 0.04544 | 94 → 1.335 | 10.22:1 |
| 3 | 209 | 0.75266 | 209 → 1.253 | 0.50045 | 46 → 2.806 | 5.13:1 |

Every band clears `1.2:1` and every fixture clears `3:1` band-to-band. The two tightest cases are **Peaks's highlight at `1.2526`** (4.4 % above the floor) and **zone 2's shadow at `1.335`** (11 %); spec v1.5 independently records the Peaks figure as `≈1.25:1`. AC-005's other Peaks orientation figure, `≈3.7:1` for the `|Δ| = 46` band, is that band measured over the light half of the gradient; D8's fixture puts the higher neighbour on the S side, so the `46` band sits over the dark half and reads `≈3.10:1` — which half carries which sign is the plan's choice, and the `1.2:1` floor is met either way.

**Residual allowances (derived, not assumed).** Two effects separate a painted band from the model above, and each is bounded:

1. *The base is the gradient end, which is not a pixel.* The anchor is always at or beyond the band's own worst-case pixel, so the derived ratio never overstates — but the *gap* is smallest where the worst-case pixel is one gradient step from the endpoint (a highlight on N/W at `t = 1/64`, a shadow on S/E at `t = 63/64` at `zoom = 32`). There the pixel's colour differs from the anchor colour by at most one 8-bit step per channel: `|ΔL_bg| ≤ 2.2749/255 = 0.0089` (`2.2749` is `dY/d(sRGB)` summed over the three channels at white, the steepest point of the transfer curve), which moves the measured ratio **up** by at most `0.0089/0.8027 = 0.011` at Peaks. The other two cases (a highlight on S/E, a shadow on N/W) sit further inside their gradients and read further above the bound.
2. *The band colour is stored as `#rrggbb`.* Rounding a channel by at most half a step moves the band's luminance by at most `0.5·2.2749/255 = 0.0045`. This is the only term that can move a painted band in the unfavourable direction of the floor, and it is why the fraction identity is asserted on `reliefTargetLuminance` and not on painted pixels.

**Measurement allowance: `0.0045` absolute in relative luminance**, on a band's *painted* luminance against `reliefTargetLuminance(L_control, f, sign)` — the model evaluated at that band's own control pixel, so the anchor's one-step offset above cannot enter. One number, band-independent, derived above; in ratio terms at the binding Peaks fixture it is `≤ 0.0062`, i.e. **12 % of the `0.0526` margin** that fixture holds over its floor, whereas the `±0.02` ratio allowance considered first would be 38 % of it and could pass a real regression. The criteria themselves — `≥ 3:1` band-to-band, `≥ 1.2:1` per band — are asserted at their stated values with **no** allowance.

**Sample point.** D8 samples one pixel per band, asserts the floor exactly plus that band's painted luminance against its modelled target, at the band's mid-axis — *inside* the anchor's span, so its ratio reads **above** the bound rather than at it; the argument above is what carries the floor, and the measurement confirms it. Orientation for T006 at `zoom = 32`: the Peaks sample pixels read `≈1.38` (highlight) and `≈3.10` (shadow) against bounds `1.2526` / `2.8056` — figures a re-derivation should reproduce; one *below* its bound means the fixture or the implementation has moved.

### D6 — Tokens (FR-009) and the guard discipline

**Decision.** Two additive colour tokens in `packages/design/src/tokens.ts`: `color.reliefHighlight: '#ffffff'` and `color.reliefShadow: '#000000'`, re-exported from `palette.ts` as `RELIEF_HIGHLIGHT_COLOR` / `RELIEF_SHADOW_COLOR` and consumed by `relief.ts` as the mix extremes (their luminance, `1.0` and `0.0`, is what makes D5's fraction identity exact). Each gets a `DESIGN.md` § 1.1 row in the same commit (012 FR-017/FR-018; a minor change per `DESIGN.md` § 6), and T009 asserts both the token values *and* those two § 1.1 rows exist — AC-007's presence clause needs a prover and no running guard supplies one (G-01/G-02 are deferred per 012's Scope Note; `check:no-literals` scans `packages/design/src` but not `DESIGN.md`). `packages/console/src` gains no hex or rgb literal: the band colour is a *computed* `#rrggbb` template built from token values, which — like `canvas.ts:509–513` — matches neither G-04's literal pattern, so no new `design-exception` marker is needed, and a fallback literal such as `'#000'` in `relief.ts` would fail G-04 immediately (T002 says so at the emission site). The existing six markers stay as they are minus the two 1d ones A-03 retires (`canvas.ts:225`/`:234` markers, `:226`/`:235` literals), leaving four.

**Why the two tokens are not redundant.** FR-009's letter is what forces them ("Every colour relief paints MUST come from `@europa/design` tokens"), not G-04: `check-no-literals.ts`'s patterns match `#`-hex and `rgb(`/`rgba(` only, so a numeric `[255, 255, 255]` / `linear-1.0` mix extreme would pass the guard untouched. They are kept because their *semantics* are the mix extremes, not a UI surface — and because `TOKENS.color.focusRing` (`tokens.ts:79`) is already `#ffffff` and no pure-black token exists, a future reader will see the duplication and be tempted to delete them as redundant. N-5 must therefore record: that the two values duplicate `focusRing` and black only coincidentally; that G-04 would *not* have required them (so nobody later credits the guard with the work); and that FR-009 does.

The N-5 note also records: the pairing is delta-dependent and canvas-painted; its provenance is D5's closed forms; its measured figures (per-zone band-to-band floor of 5.13:1, the single 1.2:1 floor, the `0.0045` luminance measurement allowance); where it *is* asserted (the 017 readback suite, not § 3); and the guard gap (G-07 is deferred per 012's Scope Note and could not read canvas pixels anyway). No § 3 row is added (§ 3's preamble defines its rows as measured computed-style pairings over a rendered CSS fixture) — the `pipe-downhill`/`pipe-uphill` § 1.1 rows are the recorded precedent for a luminance-weak but perceptually distinct board mark.

### D7 — Performance: measured before promised

**Decision (v1.7).** `packages/console/tests/integration/perf.test.ts` gains `Q-P05`, which gates relief's **attributable addition**, not an absolute frame: the min-of-round-medians paint with relief enabled **minus** the same figure with relief disabled (`relief: false`), both through the same `benchmark()` harness (warmup 25, rounds 5, samples 40) on the identical `MapView`. The fixture is the representative all-land 48×48 field `(x*97 + y*193 + x*x*29 + y*y*61 + x*y*113) % 256` (2,304 cells) — measured **250** distinct non-zero `|Δ|` and **822** distinct band colours, all four zones carrying deltas — and the test asserts that variety (`distinct |Δ| ≥ 100`, the pinned guard floor; the retired `(x*7 + y*13) % 256` yielded 4) so the gate cannot regress to a degenerate fixture. The bound is `RELIEF_ADDITION_BUDGET_MS = 6` with the same `readPaintBudgetFactor()` treatment `PAINT_BUDGET_MS` gets. Q-P01 is untouched: 8 ms on its own 32×32 fixture.

**Measurement first, then the two-step fallback.** T008 runs the new bench *first* and records the min-of-round-medians; the implementation is the straightforward per-band computation of D5 (≈ 4 bands × (1 `Map.get` + 2 closed forms + 2 sRGB↔linear pairs for the mix) per tile, plus the 8-entry base-triple cache built once per `paint()`). If that does not fit 8 ms, step one is the **documented fallback**: a per-`MapCanvas` memo of `reliefBandColor` keyed `zone:sign:delta` (≤ 4×2×255 = 2,040 entries) — a memo is not a bucket table (it returns the identical continuous function's value and changes no pixel), and it is only added if the measurement demands it. Step two is to re-measure with the memo in place. The plan promises **no** number that T008 has not measured; the task's deliverable includes the printed `[perf]` line in the PR body.

**Superseded, then measured (T008).** The two-step fallback above is superseded by an explicit user decision: the documented `reliefBandColor` memo is **not** added, and the win comes from a painter-side redesign instead — sub-pass 1d now collects every band of the sub-pass into one map keyed by colour and paints one `fill()` per distinct colour over a single path of `rect`s, replacing one `fillRect` per band (an earlier direction-major variant of the same idea is superseded by this whole-sub-pass batch). A tile's bands never leave its own rect (FR-010 confinement), so batching moves only the bounded `t × t` corners where two of a tile's own bands overlap: the fill order resolved those overlaps before and resolves them differently now, so the 48×48 render is no longer byte-identical (its FNV-1a hash moves `822558018 → 3626700548` on the low-variety fixture and `3993118782 → 2135220419` on the conservative one), of which the movement is verified confined to those corners — no mid-axis sample and no pixel outside a tile's own four corners changes, and no asserted pixel moves. The colours are iterated in sorted key order, so the fill order is a pure function of the colour set rather than of cell insertion order (AC-008; repeat-paint and reversed-`Map` byte identity both still pass). Measured on the plan's all-land fixture (2,304 cells, no units/pipes/cities — those are Q-P01's layers, and a fixture carrying them measures ~50 ms regardless of relief): **5.9 ms** min-of-round-medians, p50 6.1 ms. The board is deliberately **bare**, because the unit/pipe/city layers are Q-P01's own fixture and would dominate a 48×48 measurement (~50 ms with relief off), so a decorated gate would measure those layers rather than relief: Q-P05 must not be "fixed" into a decorated board.

**The representative fixture is adopted (v1.7), superseding the "not adopted" text and the sensitivity paragraph it introduced.** With the gate on the addition rather than the absolute frame, the representative field's ≈8.0 ms absolute cost no longer binds: the addition's measured basis is **≈4.45 ms** typical with a worst run of **≈4.95 ms** over ten runs, so the **6.0 ms** bound keeps **≈21 %** margin (a local ten-run re-run measured 3.65–4.45 ms, worst 4.45). 5.0 ms would leave ≈1 % and flake, since `scripts/verify.sh` runs `test:perf` with no `EUROPA_PERF_BUDGET_FACTOR` — the pinned bound is the binding one locally (CI sets the factor to 2). The absolute frame is deliberately **not** gated: a 48×48 full-board paint's base cost is unrelated to this feature.

**FR-010's "accumulated state" clause, head-on.** A per-instance `Map` is accumulated state, so the plan states why it is still admissible: FR-010 forbids a *pixel outcome* that depends on paint order or accumulated state, and the memo's key is the complete input of a pure function, so a hit returns the same string a fresh computation would return and no ordering of tiles, directions, or repeated paints can reach a different pixel. Two obligations follow, and both are in T008: the memo (if added) carries a **memo equivalence assertion** — a unit test that a memoised call returns the identical string to a direct call for the same key — and repeat-paint byte identity (AC-008) is re-run after it lands. Without that assertion the fallback path would ship with browser-only coverage.

### D8 — Measurement protocol

**Decision.** A browser-mode readback spec `packages/console/tests/component/render/relief.test.tsx` that renders fixtures directly through `MapCanvas.paint` on a real canvas (`width = board·zoom`, `height = board·zoom`) — no `<App />` indirection, because the object under test is the painter and both renders must take the identical code path. Helpers pinned: `paintFixture(mapView, options?) → CanvasRenderingContext2D` (fresh canvas per render, `getImageData` readback), `hexOrRgbToRgb`, `closeTo(pixel, rgb, tolerance = 8)`, `wcagContrast(pixelA, pixelB)`, and:

- **Sampling rule**: for each asserted band, one pixel, at the band's mid-axis on its outermost row (N/S) or column (W/E) — i.e. `(⌊zoom/2⌋, y)` for N, `(⌊zoom/2⌋, y+zoom−1)` for S, `(x, ⌊zoom/2⌋)` for W, `(x+zoom−1, ⌊zoom/2⌋)` for E. At `zoom = 32` that is gradient `t = 17/64` on the N band and `t = 48/64` on the S band, per D5's span table. No mod-6 offset formula: the earlier one ("smallest `o ≥ 2` with `((o − r + zoom) mod 6) == 3`") was a second model of sub-pass 1e's step *and* phase, and it was already one pixel off for a 1-based `r`. Two guards, both verified per band and neither able to re-pick silently: the sampled **control** pixel must match the closed-form 1c gradient colour at that point within `tolerance 8` — this is the contour-freeness proof, because a 1e crossing composites `rgba(0,0,0,0.10)` over the pixel and shifts a Peaks channel by ≈22 bytes, three times the tolerance — and the same coordinate in the relief render must differ from it (the band is actually painted there). A guard failure **fails the test loudly, naming the pixel and the deviation**: the fixture is then wrong and must be moved, never retried into a neighbouring pixel, because a silent re-pick would let a genuine misalignment pass. Zones 0–1 carry no contours, so the guard passes trivially there.
- **Tolerance**: AC-003/AC-004 compare the same coordinate per channel with `closeTo(..., tolerance = 8)`; byte-identical assertions use `Uint8ClampedArray` equality on the whole `getImageData`; AC-005/AC-002 compare WCAG ratios computed from the sampled pixels. Two allowances, both explicit: `±20 %` relative for AC-002's invariance, and **`0.0045` absolute in relative luminance on a painted band against `reliefTargetLuminance` evaluated at that band's own control pixel** (D5.2's half-step bound; one number, band-independent, `≤ 12 %` of the binding Peaks margin in ratio terms). The floors themselves are asserted at their stated values (`≥ 3.0`, `≥ 1.2`) with no allowance — an implementation that floors or otherwise weakens the mapping must fail visibly, which is the whole reason the criterion exists; the luminance allowance applies to the "painted band matches the model" check, never to a floor.
- **Fixture set**: four per-zone reference fixtures (own 80/128/161/209; `|Δ|` to the lower/higher neighbour 80/175, 128/127, 161/94, 209/46, lower neighbour on the N side, higher on the S side — so the tight `209` highlight sits on the N band, nearer the light gradient end, and the `46` shadow on the S band nearer the dark end: the worst case for *both* signs rather than a convenient placement; AC-001/AC-005); the `|Δ| = 1…255` sweep fixture sampled at 1, 2, 16, 64, 128, 192, 255 with the four-zone repeats at two fixed magnitudes (AC-002); the neutral cases — all-non-land tile, water-only, fog-only (neighbour absent), off-board corner, and the `|Δ| = 0` case (AC-003, AC-004); the tile-confinement case (every pixel of every neighbouring tile byte-identical between relief-on and relief-off — the AC-003 clause realised as relief-on/off, since a *neighbour's* elevation cannot change without changing the neighbour's own pixels); and the AC-003 hidden-elevation pair realised as (absent, water at 0, water at 255) producing byte-identical **edge-band** pixels, because a *hidden* cell's elevation is structurally unrepresentable in `MapView` (a view contains only visible cells). AC-008 adds repeat-paint byte identity and a `Map` rebuilt in reversed insertion order. Pin `zoom = 32` (the 005 FR-017 minimum, the AC-005/AC-003 assertion point) and add a 96 px zoom case for confinement (spec Edge Cases). The two Peaks reference bands are also pinned **byte-exactly** — `#f9fafb` (highlight, `|Δ| = 209`) and `#646c70` (shadow, `|Δ| = 46`) — so D5's 8-bit quantisation is asserted rather than merely tolerated; T007 pins them where they are exact and browser-independent, at the `fillStyle` level of a real `paint()` through the existing Proxy mock ctx.

### D9 — Amendment work and the token-reading test

**Decision.** A-05 lands *before* A-03, because A-03's figures must come from it: `packages/console/tests/unit/render/palette.test.ts` gains a `documented terrain contrast figures (A-03 sweep)` block that imports `TOKENS` from `@europa/design`, reads `TOKENS.color.biomeZones`, and **asserts** — not merely prints — every figure the sweep will state: the per-zone zone-midpoint lightness, each pipe slope fill's ratio against each dark zone's midpoint (uphill/downhill/flat/stalled), the uphill/downhill ranges, the two hue proximities (downhill green 161.4° vs zone 1 170°; flat amber 37.7° vs zone 2 30°), the water ratios (≈2.37:1 vs void; the shipped land ceiling `hsl(200 15% 95%)`), and the re-derived N-3 figures. A later token change then fails a test instead of rotting `DESIGN.md`. In the same task the vacuous Peaks case (`palette.test.ts:368–374`, `hslToRgb(220, 8, 60)`) reads zone 3 from `TOKENS.color.biomeZones`, the `PIPE_OUTLINE_COLOR` comment (`palette.ts:68–72`) is corrected, and the same file gains the **token-presence assertion AC-007 needs**: `TOKENS.color.reliefHighlight === '#ffffff'` and `TOKENS.color.reliefShadow === '#000000'`, **and** `DESIGN.md` § 1.1 names both (`TOKENS.color.reliefHighlight` / `TOKENS.color.reliefShadow` and their canonical values), so a token added without its row — or a row dropped later — fails a test. The test reads the file at the repo root resolved from its own location (`new URL('../../../../../DESIGN.md', import.meta.url)`), slices the § 1.1 block between its `### 1.1 Colors` heading and the next `### ` heading, and asserts both names appear in it; a missing file, a missing heading, or an empty slice is a hard failure, never a vacuous pass. Precedent for a guard reading repo docs is `check:component-catalog`, which parses `DESIGN.md` § 2 from the repo root. A-03 (`DESIGN.md`) and A-04 (`AGENTS.md`) then copy that block's asserted values into prose — the implementer runs the test and transcribes, never hand-computes. Every corrected row landing below its recorded target carries the filed follow-up issue **#199** (A-03's below-target annotation requirement; the issue exists, so nothing is invented and nothing is left ownerless). A-01/A-02 rewrite `024-FR-013` and extend `018-FR-004` in `specs/005-client-console/spec.md` with a dated **v1.13** clarification block, using the spec's verbatim amendment text.

### D10 — Test strategy and the retired assertion

Each implementation task ships with the tests that prove it (see `tasks.md`'s pairing column). `tests/unit/render/canvas-terrain.test.ts`'s "land cells draw inner shadow (1px dark/light edges)" is **replaced** by an assertion that the new sub-pass paints edge relief and that the two retired fills (`rgba(0, 0, 0, 0.25)`, `rgba(255, 255, 255, 0.15)`) are gone — using the existing Proxy mock ctx, so it fails against today's code (AC-004). `pipe-slope.ts`, `pipe-slope.test.tsx`, and `slope-drift.test.ts` are not touched (AC-006, reviewer check on the diff). `test:determinism` needs no fixture work: relief adds no `MapView` field, so the golden hash is expected to stay byte-identical (AC-008), and T008 asserts that by running the suite rather than by regenerating the hash.

### D11 — Manual and legend (FR-011)

`docs/manual/src/pages/the-board.mdx`'s "Elevation shading" section gains a two-channel explanation — hue = how high a cell is (four hue families), edge shading = whether the neighbour is higher or lower — and loses the false "from dark green at the lowest ground to bright green at the peaks" sentence. The four inline `EuropaElevationSwatch` examples stay (the swatch is unchanged, 024-FR-041). `packages/console/src/ui/help-overlay.tsx`'s `SYMBOL_LEGEND` replaces the single `██ Elevation` entry ("dark = low, light = high") with two distinct entries — absolute biome elevation (hue) and relative edge relief (luminance) — matching A-02's text. Any value the prose quotes in `DESIGN.md` comes from D9's test; the manual and legend quote no figures.

## 5. Rollback and risks

| Risk | Mitigation / rollback |
| --- | --- |
| 48×48 relief exceeds the 8 ms budget | D7's measurement-first order plus the documented fallback; worst case the feature lands with the per-instance memo, which changes no pixel, plus D7's memo-vs-direct unit assertion |
| Peaks highlight floor margin (1.2526:1 vs 1.2:1, 4.4 %) | anchored at the zone's light gradient end, so the figure is a *lower bound* for every pixel of every band (D5), not a sample that could miss; if a derived value ever lands below the floor the correct response is to fix the derivation, never to floor the mapping (FR-003 forbids it) |
| Zone 2's shadow floor margin (1.335:1 vs 1.2:1, 11 %) | same argument; it is the second-tightest case and the one the previous, mis-anchored table overstated as `2.00:1` |
| Band-colour quantisation (≤ 0.0045 in luminance) | bounded in D5.2 and measured by the `0.0045` luminance allowance, which is `≤ 12 %` of the binding margin in ratio terms; the quantised reference colours are pinned byte-exactly (T007) |
| Base anchor (gradient end) is not a pixel | one 8-bit step, always on the safe side (D5.1); the derivation is a lower bound, so the measurement reads above it — T006's `Done when` checks the painted band against `reliefTargetLuminance` at its own control pixel, never against the bound for equality |
| Token addition ripples (`design.css`, vendored copies, bundle size) | `pnpm --filter @europa/design build` regenerates `dist/` (gitignored) and vendors the two `design.css` copies, committed in T001; `check:vendor-identity` and `check:bundle-size` are in `pnpm verify` |
| A-03's corrected figures drift from the test | structural: the test asserts them, so a later change fails CI |
| Rollback | the change is one sub-pass + one module + one flag; reverting the relief sub-pass and restoring `canvas.ts:222–242` restores today's board, and the tokens/notes are additive |

## 6. Out of scope

Spec § Out of Scope applies unchanged — nothing it excludes comes back. Reviewer-visible consequences only: `qol/minimap.tsx` untouched, `EuropaElevationSwatch` unchanged, no engine, wire, or configuration change, nothing under `europa-source/`, no new runtime dependency.

## 7. Verification

`bash scripts/verify.sh` green (includes `test:unit`, `test:component`, `test:perf`, `test:determinism`, and the running design drift checks), plus an agent-browser visual smoke against `pnpm host` with a relief-bearing screenshot under `__screenshots__/`. Reviewer checks: the diff touches nothing in `src/render/pipe-slope.ts`, no § 3 row was added, and the manual/legend prose matches D11.

## 8. Spec version

Written against `spec.md` **v1.7**. v1.5's two corrections (AC-005's binding band is the Peaks `|Δ| = 209` band, and Clarifications records that the highlight/shadow sign constant is *forced*), v1.6's Phase 6 text corrections, and v1.7's NFR-001 re-pin are the spec's own text, which D4/D5 and D7 cite rather than reconcile. A-03's figures remain the only numbers still marked provisional in the spec; D9 derives them from the token-reading test before T011 transcribes them.
