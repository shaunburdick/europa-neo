# Tasks: Board Surface Treatment (Coastline, Zone Seams, Tile Grain)

**Spec**: `specs/018-board-surface/spec.md` v1.0 · **Plan**: `plan.md` · **Branch**: `issue-182-tile-shading`

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
