# Terrain relief shading — flat face, per-side bevels, calibrated ladder (issue #182)

## What changed (v1.10, same branch, PR #204)

v1.10 is a **calibration-only** revision of v1.9: the model, band geometry, cap rule and NW-light rule are untouched. v1.9's ladder assumed drops of 1–3 in a small heightfield; adjacent land cells actually span the full 0–255 elevation range, so almost every bevel hit 10 % width and the top tone step and the board read as a wireframe.

- **Δ→step thresholds measured, not assumed.** Over five seeds at both shipped board sizes (32 and 48; 28,594 adjacent land pairs from `@europa/terrain`), `|Δ|` runs p25 = 2, p50 = 4, p75 = 7, p90 = 10, p99 = 15, max = 27. `RELIEF_STEP_THRESHOLDS = [4, 9]`: step 1 Δ1–4, step 2 Δ5–9, step 3 Δ10+, splitting positive drops 51 / 40 / 8 %. Width ratios stay 4 / 7 / 10 % of the cell, capped at 10 %.
- **Tone is a lightness shift inside the face's hue.** The sRGB mix toward `#ffffff` / `#000000` desaturated the zone hue and jumped contrast. Both tones now keep the face's hue and saturation and move only HSL lightness: lit (N/W) raises it 74 / 79 / 84 % of the remaining headroom toward `reliefHighlight`'s L=100, shaded (S/E) lowers it 40 / 50 / 60 % of the face's lightness toward `reliefShadow`'s L=0. The two tokens stay meaningful as lightness anchors; no token was added, removed, or re-valued.
- **Δ1 tones (face → lit / shaded):** zone 0 `#2873bd` → `#c3dbf2` / `#184572`; zone 1 `#268273` → `#baebe3` / `#174e45`; zone 2 `#8e5c29` → `#ecd5bd` / `#553719`; zone 3 `#dce2e5` → `#f6f7f8` / `#758d99`. FR-006's floors still pass per zone; the tight cases are Peaks (lit/face 1.220, lit/shaded 3.249).

## v1.9 model (unchanged by v1.10)

- **Flat face.** Sub-pass 1c paints one colour per biome zone (the zone midpoint). The per-tile gradient is retired; the face is never lit. Sub-pass 1e's contour hints stay.
- **A bevel only on a positive drop.** `Δ = ownElevation − neighbourElevation > 0` against a visible land neighbour. Equal heights, a higher neighbour, water, fog-absent and off-board sides paint nothing, so a ledge has one bevel, not a ridge/valley pair.
- **One light at the map's NW corner.** North/west bevels are lit, south/east shaded. Tone depends on the side alone — never on the delta's sign or on which tile is higher.
- **Geometry.** Each bevel is the mitred trapezoid from spec FR-001. At every grid vertex, ends are gathered from all four surrounding tiles: two or more ends fill each one's cut triangle in its own band colour; one end keeps its taper. That closes collinear seams and perpendicular turns without run lengths.

Files: `packages/console/src/render/relief.ts` (thresholds and lightness mapping), `packages/console/src/render/relief-caps.ts` (pure geometry/cap module), `packages/console/src/render/canvas.ts` (sub-passes 1c/1d), the relief unit/readback/perf suites, `DESIGN.md` §1.1/§3/§4.4 + note N-5, `specs/017-terrain-relief-shading/{spec,plan,tasks}.md` (spec v1.10), `specs/005-client-console/spec.md` v1.15, the player manual and the in-game legend.

## Why

The first implementation encoded the delta's *sign* in luminance and used a continuous fraction anchored at each zone's gradient end. The board read as a lighting diagram rather than a map: a higher neighbour produced a band on a tile that was itself not a ledge, and the gradient face competed with the bevels. The settled model keeps one readable channel: colour tells how high a cell is; a bevel tells where the ground drops; its width tells how far; the NW light tells which face of the step you are looking at. The old contrast arithmetic (Peaks's white cap forcing a sign constant) no longer constrains anything because tone is no longer a delta-sign encoding.

v1.10 keeps that model and fixes its calibration: a real board's drops are not 1–3, so the v1.9 steps saturated into uniform 10 % bands, and mixing toward white/black washed the zone hue out of every saturated face. The measured step cut spreads a typical board across the three widths, and the lightness-only tone keeps each bevel visibly the same material as its tile.

## Performance

`Q-P05` still gates relief's **attributable addition** on the representative 48×48 fixture, with Q-P01's 8 ms budget untouched and the 6.0 ms bound unchanged.

- Measured over repeated v1.10 runs: relief-on **4.70–4.80 ms**, relief-off **0.70 ms**, addition **4.0–4.1 ms**, worst **4.10 ms** — **≈32 %** margin under 6.0 ms. Q-P01 measured **3.2 ms** against 8 ms.
- A naive per-band trapezoid + per-cap triangle path measured **23.7 ms** relief-on. The fix is geometry, not a weaker mapping: capped ends are rectangles, only a lone end keeps a taper (187 of 8,988 ends), and only the 1,515 same-tile corners with two different tones need one square + one triangle.
- Fixture variety is asserted as **250 distinct positive `|Δ|`** (floor 200) and **22 of 24 possible tone colours** (floor 20), with all four zones carrying drops. The v1.10 calibration does no per-band work: one threshold compare, tones still pre-computed per zone.

## Removed / declined

- The v1.0–v1.8 `reliefTargetLuminance`, `reliefBandColor`, `reliefFraction`, `linearTriple`, `RELIEF_HIGHLIGHT_IS_DOWNHILL`, band-ratio thickness and their tests. Nothing is kept as dead code.
- The per-tile biome gradient in 1c; the zone hue and 1e contours remain.
- Any per-band triangle-heavy render path: it cannot meet the perf gate, and the rectangle-first geometry is geometrically equivalent under the cap rule.
- No options, no new tokens, no new dependency, no engine/protocol change.

## Verification

- `pnpm build` and `pnpm --filter @europa/console typecheck` green.
- `bash scripts/verify.sh` green (tail in the task report), including lint, conformance, the design guards, selfhost and the docs guards.
- `test:unit` 1,046 tests / 65 files, `test:component` 288 tests / 34 files (+ 74 a11y), `test:perf` 4 tests, `test:determinism` 5 tests. Coverage for render logic remains above the 80 % merge gate.
- Agent-browser smoke against `pnpm host`: a real generated 32×32 match at 32 px and 74 px cells plus a 3× crop under `__screenshots__/` (`relief-board-32px-terraces.png`, `relief-board-74px-terraces.png`, `relief-terraces-crop-3x.png`).
- `test:determinism` green, golden hash unchanged (no new view field).

## Disclosures

- The v1.9 model deliberately replaces the spec's v1.0–v1.8 FR-006 arithmetic. The accessibility Decision block stands: elevation is still conveyed visually only, tracked as issue #206.
- Cube-corner handling follows the stated rule literally: at a same-tile corner where both bevels exist, the two cut triangles are filled in their own colours, which splits the shared corner square diagonally. Equal-toned corners need no extra paint; different-toned corners use one square + one triangle to keep the cost bounded.
- `specs/005-client-console/spec.md` moved to v1.15 so its absorbed `024-FR-013` / `018-FR-004` text matches the calibrated model; no other 005 requirement changed.
- `RELIEF_TONE_MIXES` / `reliefToneMix` are deleted with the sRGB mix they described; the two colour tokens remain as lightness anchors, so no token was added, removed, or re-valued.

Closes #182.
