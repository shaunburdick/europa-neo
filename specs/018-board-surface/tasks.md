# Tasks: Board Surface Treatment (Coastline, Zone Seams, Tile Grain, Elevation Contours)

**Spec**: `specs/018-board-surface/spec.md` v1.2 · **Plan**: `plan.md` · **Branch**: `issue-182-tile-shading`

## Progress

- [x] T-001 Pure grain + coast + seam module (`src/render/surface.ts`)
- [x] T-002 Grain-shifted face sprites and variant-batched 1c
- [x] T-003 Coast band sub-pass 1c2
- [x] T-004 Zone seam sub-pass 1f (1e2)
- [x] T-005 `PaintOptions.surface` control
- [x] T-006 Unit suite for the pure mappings
- [x] T-007 Browser readback suite `surface.test.tsx` (AC-001…AC-005)
- [x] T-008 017 readback suite amendments (AC-003/AC-004/AC-005 wording)
- [x] T-009 Spec amendments: 017 v1.12, 005 v1.17
- [x] T-010 `DESIGN.md`, `AGENTS.md`
- [x] T-011 Perf measurement: Q-P01 and Q-P05, on and off
- [x] T-012 Live screenshots at 32/74/96 px + 3× crops; verify tail
- [x] T-013 Contour mapping + `contour-ink` token (FR-004, v1.2)
- [x] T-014 Contour pass in 1c2; retire the 1e hatch
- [x] T-015 Unit and readback coverage (AC-006, AC-007)
- [x] T-016 v1.2 docs: spec, plan, 017/005 amendments, DESIGN, manual, AGENTS
- [x] T-017 Interval measurement, before/after screenshots, perf and verify tail
- [x] T-018 Review fix (PR #204): snap the contour and the seam to one whole pixel column (v1.3)

## Evidence (2026-10-20)

- Screenshots: `__screenshots__/board-{32,74,96}px.png`, `coast-crop-3x.png`, `seam-crop-3x.png`.
  The 2026-10-20 set came from the live match `70f56ced…`; the 96 px re-shoot comes from the
  deterministic `?e2e` 16×16 demo at 96 px, whose cell (4,11) drops one ladder step on both S
  and E — the same-tone S/E corner the nonzero-fill fix restores.
- Perf: Q-P01 3.2 → 3.8 ms; Q-P05 relief-on 4.6 → 6.1 ms, relief-off 0.65 → 2.1 ms, addition
  3.95 → 4.00 ms (bound 6 ms).
- Re-measured after the Gate 3 fix: Q-P01 3.7 ms; Q-P05 relief-on 6.1 ms, relief-off 2.1 ms,
  addition 4.0 ms (bound 6 ms). Dropping the stride-8 `rect()` fast path measured the addition
  at 8.3 ms, so it stays.
- Seam worst-case contrast per zone pair: 0/1 1.829, 0/2 1.934, 0/3 1.634, 1/2 1.829, 1/3 1.634,
  2/3 1.634; worst crossed bevel tone 1.373. All ≥ 1.2.
- `pnpm verify` green (exit 0): console node 1,050; browser 306 + 380 coverage; perf 4;
  determinism 1; a11y 74; E2E 60.

**Deviation resolved at spec v1.1:** the grain set is `[0, -0.5, -1, -2]`, one-sided rather
than symmetric. A positive offset breaks 017 FR-006's Peaks lit floor (1.220 → 1.195 at +1,
1.163 at +2), and 018's non-goals forbid changing the relief contract. FR-003, AC-004 and the
Decisions Taken block now state the 0 to −2 range and this rationale; the code is unchanged.
Reported to the dispatcher at T-001.

## Evidence (2026-10-21, v1.2 — elevation contours)

- **Interval.** Measured on 50 generated boards (`@europa/terrain`, sizes 32 and 48, 25 seeds
  each, 142,940 land–land edges, elevations 87–206): 28 levels crosses **18.4 %** of land–land
  edges — 0.35 lines per land tile, one line every ~2.9 tiles, 30 % of tiles touching one,
  3–5 bands per board. 24 → 20.9 % (0.40/tile), 32 → 15.3 %, 40 → 13.4 %, the retired 8-level
  hatch ≈ 55.3 % (1.05/tile). 32 was rejected because a level lands on 160, the zone 1/2 cut:
  **17.7 %** of its lines were hidden by the opaque seam; at 28 that share is **1.3 %**, at 36
  0.1 %. Chosen: **28 levels**.
- **Tone.** `contour-ink` = `rgba(0, 0, 0, 0.2)` (new token). Measured on the rendered composite
  against the face stops the line crosses: zone 0 **1.395**, zone 1 **1.392**, zone 2 **1.346**,
  zone 3 **1.588** — all under the seam's 1.634:1 worst case, so the seam stays the strongest
  hairline. It also retires the `rgba(0, 0, 0, 0.10)` hatch literal, dropping `DESIGN.md` § 4.4's
  canvas-fallback exceptions from four to three.
- **Layering, verified in code and pixels.** Contours paint in 1c2 (before 1d): on a crossing
  edge where the tile is also higher, the column reads the bevel tone and the contour is visible
  only with `relief: false`. The seam (1e2) wins where the two coincide: the column reads
  `#9ca3af`, one line. No second walk of the cells — the pass shares 1c2's neighbour lookups.
- **Perf.** Q-P01 **4.0–4.1 ms** (budget 8) with the contour pass and **4.1 ms** with it removed on
  the same harness — no measurable cost. Q-P05 relief-on 6.6–6.9 ms, relief-off 1.8 ms,
  addition **5.0 ms** (bound 6).
- **Screenshots.** `__screenshots__/contour-{before,after}-96.png` and
  `contour-{before,after}-32.png`, painted by the real `MapCanvas` from one generated 32×32 board
  (seed `3576916120`) at 96 px (8×8 window centred on cell (22,6): 32 of 37 crossing edges
  visible, 39 % zone 2–3) and at 32 px (whole board). The "before" shots are the `a78ff0d`
  painter (diagonal hatch); the "after" shots are this change.
- **Verify tail:** `bash scripts/verify.sh` green (exit 0): all 13 phases, console node
  1,057 tests / browser component 315 / a11y 74, perf 4, determinism 1, E2E 60, plus the
design package's 381 and the spec/documentation guards.

## Evidence (2026-10-21, v1.3 — hairlines on the raster grid)

- **Defect (PR #204 review, P2 `canvas.ts:406`).** Both lines were built as
  `x + zoom − 1`, which is fractional whenever the wheel has been used. At 73.75 px/cell the
  shared edge sits at 368.75, so the 1 px rect spans `[367.75, 368.75]` and Canvas covers two
  columns at partial alpha. Readback at row 110: contour column 367 `(32,110,97)`, 368
  `(28,100,88)` against control `(34,116,102)`/`(34,118,104)` — 25 % and 75 % ink, neither at
  full strength; seam columns `(65,116,167)` and `(135,152,167)` instead of the opaque token
  `(156,163,175)`.
- **Fix.** `snappedLineStart(edge, origin, width) = round(edge − origin) + origin − width` in
  `surface.ts`, used by the contour (1c2) and the seam (1e2): the edge is rounded in the bitmap's
  frame — the paint's viewport translate removed — and the width derived from it, never two
  independent roundings, which could yield a 0 or 2 px line. Rounding in board space instead
  (`round(edge) − width`) leaves the line crisp only when the origin is whole; at 73.75 px with an
  origin of 0.4 it still covered columns 367 and 368, which the fractional-translate readback
  asserts against. After the fix: contour column 368 `(27,94,83)` = `contour-ink` at full coverage
  over its own control pixel, seam column 368 `(156,163,175)` exactly, and every neighbouring
  column byte-identical to the control.
- **Residual.** When the edge fraction rounds down (221.25 at the same zoom) the line takes the
  lower column and the face fills' own 25 %/75 % blend column stays visible beside it: at most
  one column, at most half the face delta. Rounding up covers that blend column under the line.
  Snapping the cell grid is a larger change and was not attempted.
- **Same pattern elsewhere?** The coast band is a ≥ 1.28 px area fill whose inner edge is
  antialiased by design, and the bevels are wider area fills — both out of scope. The only other
  hairline in the render path is the minimap's 1 px viewport rectangle
  (`qol/minimap.tsx`: `viewportRect` returns fractional `x`/`y`, then the stroke adds 0.5),
  which antialiases the same way; the minimap is outside 018's scope (Non-goals) and is left
  unchanged.
- **Tests.** New fractional-zoom readback (AC-003/AC-006): `tests/component/render/surface.test.tsx`
  › "hairlines snap to the raster grid" asserts exactly one inked column/row at 73.75 px and full
  ink coverage, plus the same with a fractional viewport origin (`x 0.4`); all four hairline cases
  fail on the pre-fix painter (`[367, 368]` vs `[368]`, `[367, 368]` vs `[367]` with the origin), and the
  board-space-only snap fails the origin case. `snappedLineStart`'s whole-pixel, exact-width and
  half-pixel invariants are in `tests/unit/render/surface.test.ts`. Integer-zoom readback,
  determinism and perf are unchanged.
- **Perf.** Q-P01 4.1 ms median (budget 8) and the 017 relief addition 5.1 ms (bound 6), both
  inside the v1.2 measurements (4.0–4.1 / 5.0).
- **Verify tail.** `bash scripts/verify.sh` green (exit 0): all 13 phases, console node
  1,058 / browser 320 / coverage 394 / a11y 74, perf 4, determinism 1, E2E 60, plus every other
  package and the specification/documentation guards.

## Tasks

### T-001 — Pure module

`packages/console/src/render/surface.ts`:

- `COAST_WIDTH_RATIO = 0.04`, `coastBandWidth(size)`.
- `LAND_FACE_GRAIN_OFFSETS = [0, -0.5, -1, -2]` and `grainOffsetIndex(coord)` — a
  `Math.imul` hash of `(x, y)` only, no zone/elevation/neighbour input.
- `SEAM_WIDTH_PX = 1`, `SEAM_COLOR` re-exported from the palette.

**Range:** the set is non-positive on purpose (D1, spec FR-003 v1.1). A symmetric ±2 set
breaks 017 FR-006's Peaks lit floor (1.220 → 1.163 at +2). Four values in 0 to −2 are kept.

### T-002 — Grain in 1c

Build sprites per (zone, offset) — 16 cached sprites — from fractional-`hsl()` stops
(`landBandColorAtLightness`), never `adjustBrightness` (it rounds). Each paint creates one
pattern per variant and fills all tiles of that variant in one path. WGSL/WebGL untouched.

### T-003 — Coast band

Before 1d: per land tile, per side, a present water neighbour paints the 4 % rect in the
zone's step-1 lit/shaded tone; buckets are (colour → rect run), filled sorted.

### T-004 — Zone seam

After 1e: E/S neighbours only, different zones and both visible land, one 1 px column/row on
the lower-coordinate side of the shared edge, one fill.

### T-005 — Control flag

`PaintOptions.surface`, default `true`; `false` skips grain, coast and seam.

### T-006 / T-007 — Tests

Unit: grain index determinism, bounds, ≥ 4 distinct values on 32×32, coordinate-only
invariance; coast width; seam colour floor against every zone's grain-shifted worst stop and
every bevel tone. Readback: coast tone by direction at 32/96, bevel-wins-at-corner with the
017 control, seam presence/absence + 1 px + six-pair contrast, grain bounds (0 to −2) and
two-paint identity, hidden-neighbour invariance.

### T-008 — Amend 017 tests

AC-003's absent/water byte-identity clause becomes "differ only by the coast band"; AC-004's
same-zone identity becomes "same zone + same grain offset identical, different coords differ
only by grain"; AC-005's floors read the grain-shifted worst-case stop.

### T-009 / T-010 — Specs and docs

017 v1.12 (FR-005, AC-003, AC-004 + changelog), 005 v1.17 (`024-FR-013` sentence + block),
`DESIGN.md` § 1.1 rows, N-6, § 4.4, `AGENTS.md` table + Current state. Nothing player-facing:
no manual or overlay change (018 is not gameplay).

### T-011 / T-012 — Evidence

Run `test:perf` before/after (Q-P01, Q-P05 addition) and `pnpm verify`; capture a live 32×32
match at 32, 74 and 96 px plus 3× crops of a coastline and a seam in `__screenshots__/`.

### T-013 — Contour mapping and token

`surface.ts`: `CONTOUR_INTERVAL = 28`, `CONTOUR_WIDTH_PX = 1`, `elevationBand`, `contourCrosses`.
`packages/design/src/tokens.ts`: `contourInk = rgba(0, 0, 0, 0.2)`; palette re-exports
`CONTOUR_COLOR`. Rebuild the design package so the vendored `design.css` copies and the
`--europa-color-contour-ink` variable stay byte-identical (G-05).

### T-014 — Contour pass in 1c2, hatch retired

The coast loop already pays one neighbour lookup per land side; a present land neighbour now
also feeds `contourCrosses`, and a crossing E or S edge pushes one rect on the lower-coordinate
cell's side. One path, one fill, all four zones, before 1d so a bevel owns every pixel it
covers. Sub-pass 1e (the diagonal hatch, its `design-exception` marker and its literal) is
deleted.

### T-015 — Tests

Unit: interval/band mapping and the 20 % ink token. Readback (AC-006): one CSS px on a crossing
edge at 32 and 96 px, none inside a band, all four zones, silence against water / absent /
off-board, bevel-over-contour and seam-over-contour layering, ink 1.05:1–1.6:1 against each face
stop. The AC-002 coast fixture moves from 140/130 to 160/150 so no level crosses it (it was
isolating the coast band against the 018 control).

### T-016 / T-017 — Docs and evidence

018 v1.2 (FR-004, AC-006/AC-007, decisions, A-06–A-09), `plan.md` D8, 017 v1.14 (FR-005,
FR-006 sampling, AC-005), 005 `024-FR-012` + changelog block, `DESIGN.md` § 1.1 / N-6 / § 4.4,
the manual's board page, `AGENTS.md`. Evidence: the measured interval/crossing distribution,
the ink ratios, Q-P01 with and without the pass, and the before/after 96 px and 32 px crops in
`__screenshots__/`.
