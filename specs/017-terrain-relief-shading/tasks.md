# Tasks: Terrain Relief Shading (Delta-Based Edge Bevels)

**Feature**: `specs/017-terrain-relief-shading/spec.md` (v1.5) · **Plan**: `plan.md`
**Branch**: `issue-182-tile-shading`
**Tasks**: 13 (T001–T013). `[P]` marks tasks safe to run in parallel with the immediately
preceding task (different files, no shared edit). One engineer pass; no orchestration.

Every task is one sitting. Tests ship in the same task group as the code they prove.
Every task names the requirement(s) it traces to.

---

## T001 — Relief colour tokens (A-03 token half, FR-009)

**Files**: `packages/design/src/tokens.ts`, `docs/manual/public/design.css`,
`docs/manual/assets/design.css`, `DESIGN.md` § 1.1,
`packages/console/src/render/palette.ts`.
**Do**: add `color.reliefHighlight: '#ffffff'` and `color.reliefShadow: '#000000'` to
`TOKENS.color` (additive; keys sorted alphabetically); add one § 1.1 row per token
(`DESIGN.md` § 1.1 is the only place that spells the variable name) noting they are the
relief mix extremes, canvas-only, with the pairing recorded in the N-5 note added by
T011; run `pnpm --filter @europa/design build` — it regenerates `dist/` (gitignored,
never committed) and vendors the two `design.css` copies, which are the only build output
this task commits; re-export through `palette.ts` as `RELIEF_HIGHLIGHT_COLOR` /
`RELIEF_SHADOW_COLOR`.
**Traces**: FR-009 · 012 FR-017/FR-018 · AC-007.
**Done when**: `pnpm --filter @europa/design check:vendor-identity`, `check:no-literals`,
`check:bundle-size` green; `packages/console/src` unchanged apart from the two re-exports.

## T002 — Pure relief module (plan D1, D3, D4, D5)

**Files**: `packages/console/src/render/relief.ts` (new),
`packages/console/src/state/build-map-view.ts` (**add `export`** to the existing
`destinationCoord` at `:120` — it is module-private today; no behaviour change).
**Do**: implement the module exactly as pinned in plan § 4 D1/D3/D4/D5 —
`RELIEF_HIGHLIGHT_IS_DOWNHILL`, `RELIEF_MAX_DELTA`, `RELIEF_BAND_RATIO`,
`RELIEF_MIN_BAND_PX`, `RELIEF_DIRECTIONS`, `reliefBandThickness`, `srgbToLinear`,
`relativeLuminance`, `linearTriple`, `reliefFraction`, `reliefTargetLuminance` (the two
closed forms), `reliefBandColor` (linear-light per-channel mix → computed `#rrggbb`
template). There is no `RELIEF_BAND_T` and no `zoneBackgroundLuminance`: the base is
passed in as a linear triple (D5). Doc-comment the sign constant and the reason the
mapping is normalised to the base's reachable maximum. **The `#rrggbb` is assembled from
computed byte values inside `reliefBandColor`** — the one place a colour literal could
creep in. Any fallback literal such as `'#000'` there (or anywhere in the module) fails
G-04's `check:no-literals` immediately; there is none, so the file needs no
`design-exception` marker.
**Traces**: FR-001, FR-002, FR-003, FR-010 · NFR-002 · AC-001/002/005 (mechanism).
**Done when**: `pnpm --filter @europa/console typecheck` and `lint` green; no hex/rgb
literal in the file (`pnpm --filter @europa/design check:no-literals` green).

## T003 — `[P]` Unit tests for the relief mapping (AC-002 pure half)

**Files**: `packages/console/tests/unit/render/relief.test.ts` (new).
**Do**: assert `reliefFraction` (`0` at Δ=0, linear, clamped at 255); monotone strict
increase of `reliefTargetLuminance` across `|Δ| = 1, 2, 16, 64, 128, 192, 255` from the
same base, with `255` strictly above `1` and above each sampled quarter — **on the pure
function**, so a mapping floored at ≥ 2 fails (AC-002); the fraction identity
`(R − 1)/(R_cap − 1) == f` on `reliefTargetLuminance`, for all four zones
(`landBandColor(0…3)` as the base) × both signs × `|Δ| ∈ {1, 2, 64, 160, 255}` —
**exact to double precision, no measurement allowance**, since the identity is algebraic
and base-independent; separately, the *realised* deviation:
`|relativeLuminance(reliefBandColor(base, f, sign)) −
reliefTargetLuminance(L(base), f, sign)| ≤ 0.0045` (half an 8-bit step at the steepest point
of the transfer curve, plan D5.2) for the Peaks light base × both signs ×
`f ∈ {0.05, 0.5, 0.82, 1}`;
`reliefBandColor` returning the base colour at `f → 0` (≈1.00:1), the white token at
`f = 1` highlight and the black token at `f = 1` shadow; and neutrality inputs (water,
absent, off-board, Δ=0) yielding no band at the module's boundary. No band-`t` sweep: the
`t` model is deleted (plan D5).
**Traces**: FR-002, FR-003, FR-004, FR-010 · AC-002 (unit), AC-003 (unit).
**Done when**: `pnpm --filter @europa/console test:unit` green.

## T004 — Sub-pass 1d replacement + `PaintOptions.relief` (FR-005, FR-001, FR-004)

**Files**: `packages/console/src/render/canvas.ts`.
**Do**: delete the two retired loops and their `rgba(0, 0, 0, 0.25)` /
`rgba(255, 255, 255, 0.15)` fills and the two `design-exception` markers
(`:222–242`); **add the module import** — `canvas.ts` imports nothing from
`state/build-map-view` today, so the `destinationCoord` and `coordKey` imports are new
lines (`coordKey` is already exported at `:44`, `destinationCoord` becomes exported in
T002); add sub-pass 1d as the per-tile/per-direction loop of plan D1 (bounds check
→ `cells.get(coordKey(dst))` → `terrain !== 'land'` → `Δ === 0` skip → pick the base
triple for the zone and sign (D5) → `fillStyle = reliefBandColor(...)` → the D3 rect),
gated on `options?.relief !== false`; add the `relief?: boolean` member to `PaintOptions`
with the D2 JSDoc (it does **not** restore the retired shadow); leave 1c and 1e untouched
and in place.
**Traces**: FR-001, FR-004, FR-005, FR-008, FR-009 · AC-003, AC-004, AC-007.
**Done when**: `test:component` (existing) and `test:unit` still green; the retired
literals are gone; the diff touches nothing else in `canvas.ts` besides the sub-pass.

## T005 — Browser readback spec A: signs, neutrality, confinement, determinism

**Files**: `packages/console/tests/component/render/relief.test.tsx` (new).
**Do**: build the `paintFixture` / `closeTo` / `sameImageData` harness of plan D8; then
assert (a) a tile with a higher visible land neighbour on one side and a lower one on the
opposite side paints one band lighter and the other darker than the *same coordinate* in
the `relief: false` control render (AC-001); (b) a tile with four non-land neighbours has
every edge-band pixel matching its control within `tolerance 8`, and the two retired
fills are absent (AC-004); (c) the neighbour-absent, water-only, off-board, `|Δ| = 0`
cases are neutral and the (absent, water@0, water@255) pair paints byte-identical edge
bands (AC-003); (d) relief-on leaves every pixel of every neighbouring tile byte-identical
to relief-off (AC-003 confinement); (e) repeated paints are byte-identical and a `MapView`
whose `cells` were inserted in reversed order paints byte-identically (AC-008); (f) a
96 px-zoom confinement case.
**Traces**: FR-001, FR-002, FR-004, FR-005, FR-010 · AC-001, AC-003, AC-004, AC-008.
**Done when**: the spec fails against today's painter (pre-T004 check) and passes after
T004; `pnpm --filter @europa/console test:component` green.

## T006 — Browser readback spec B: per-zone reference fixtures, sweep, sampling rule

**Files**: `packages/console/tests/component/render/relief.test.tsx`.
**Do**: add the four per-zone reference fixtures from plan D5/D8 (own 80/128/161/209;
`|Δ|` to lower/higher 80/175, 128/127, 161/94, 209/46; lower neighbour on the N side,
higher on the S side) with the D8 sampling rule — one pixel per band at the band's
mid-axis on its outermost row/column — and its two guards (the control pixel must match
the closed-form 1c colour within `tolerance 8`, which is the contour-freeness proof, and
the relief render must differ there; a failure fails loudly and the fixture moves, it is
never retried onto another pixel); assert per zone the band-to-band WCAG contrast ≥ 3:1
and each band ≥ 1.2:1 against the same pixel of the control render (AC-005); add the
`|Δ| = 1…255` sweep at `1, 2, 16, 64, 128, 192, 255` asserting non-decreasing magnitude
and strict increase at the top vs the bottom and each quarter, plus the two fixed
magnitudes repeated across all four zones with the ±20 % relative invariance (AC-002
rendered half). Record the measured figures in the task notes / PR (they are the source
for T011).
**Traces**: FR-003, FR-006 · AC-002 (rendered), AC-005.
**Done when**: the four-zone suite is green; each sampled band's *painted* luminance matches
`reliefTargetLuminance` at its own control pixel within the `0.0045` allowance, its ratio
clears `≥ 1.2:1`, and the fixture's band-to-band contrast clears `≥ 3:1` — the two floors
asserted at their stated values with no allowance. Orientation: Peaks reads ≈1.38 highlight /
≈3.10 shadow against D5's bounds 1.2526 / 2.8056, so a figure *below* its bound means the
fixture or the implementation has moved — a defect to fix, not a number to edit.

## T007 — `[P]` Replace the retired inner-shadow assertion (AC-004)

**Files**: `packages/console/tests/unit/render/canvas-terrain.test.ts`.
**Do**: replace "land cells draw inner shadow (1px dark/light edges)" with a real
assertion: with the Proxy mock ctx, a land tile with a visible land neighbour paints an
edge band (`fillStyle` set to a computed relief colour and the expected band `fillRect`),
while a tile whose neighbours are all non-land paints no band, and no `fillStyle` in the
whole paint ever equals the two retired literals (AC-004's literal half, unit-level).
**Pin the Peaks reference fixture's two band colours byte-exactly** — `#f9fafb` for the
`|Δ| = 209` highlight and `#646c70` for the `|Δ| = 46` shadow (plan D5, D8) — so the 8-bit
quantisation is asserted rather than tolerated and an implementation that floors the
mapping fails here visibly. Keep the rest of the file's tests working.
**Traces**: FR-005, FR-001, FR-004, FR-003 · AC-004.
**Done when**: the new assertion fails if the relief sub-pass is removed; `test:unit`
green.

## T008 — `Q-P05` 48×48 relief perf bench (AC-010, NFR-001)

**Files**: `packages/console/tests/integration/perf.test.ts`.
**Do**: add the 48×48 relief-enabled all-land fixture (2,304 cells, elevations
`(x*7 + y*13) % 256`, deltas non-zero across all four zones) and
`Q-P05: paintFrame(48×48 relief-enabled full board)` using the existing `benchmark()` and
`PAINT_BUDGET_MS * readPaintBudgetFactor()`; run it **before** deciding whether the
optimisation is needed. If min-of-round-medians ≥ 8 ms, apply plan D7's fallback — a
per-`MapCanvas` memo of `reliefBandColor` keyed `zone:sign:delta` — and re-measure; **that
path also adds a unit assertion in `relief.test.ts` that a memoised call returns the
identical string to a direct call for the same key**, and re-runs AC-008's repeat-paint
byte identity. Also run `test:determinism` to confirm
the golden hash is unchanged.
**Traces**: NFR-001, FR-010 · AC-008, AC-010.
**Done when**: `test:perf` green with Q-P01 unchanged and Q-P05 under budget, with the
`[perf]` line captured for the PR body; `test:determinism` green, hash unchanged.

## T009 — `[P]` Token-reading contrast test + A-05

**Files**: `packages/console/tests/unit/render/palette.test.ts`,
`packages/console/src/render/palette.ts`.
**Do**: fix the vacuous Peaks case (`:368–374`) to read `TOKENS.color.biomeZones` zone 3
instead of `hslToRgb(220, 8, 60)`; add the `documented terrain contrast figures (A-03
sweep)` block that reads `TOKENS.color.biomeZones` and **asserts** each figure the A-03
sweep will state — per-zone midpoint lightness, each pipe slope fill's ratio against each
dark zone midpoint (uphill ≈1.02–1.17, downhill ≈1.23–1.50, plus flat and stalled), the
two hue proximities (downhill green vs zone 1; flat amber vs zone 2), the water figure and
its named referent (the shipped land ceiling `hsl(200 15% 95%)`), and the re-derived N-3
figures (water vs void; zone 1 midpoint and darkest painted lightness); correct the
`PIPE_OUTLINE_COLOR` comment (`palette.ts:68–72`). **Also assert AC-007's token-presence
clause, which no running guard covers** (`check:no-literals` never reads `DESIGN.md`, and
G-01/G-02 are deferred per 012's Scope Note): `TOKENS.color.reliefHighlight === '#ffffff'`
and `TOKENS.color.reliefShadow === '#000000'`, **and** `DESIGN.md` § 1.1 names both — read
the file at the repo root from the test's own location and assert both
`TOKENS.color.reliefHighlight` / `TOKENS.color.reliefShadow` appear between the
`### 1.1 Colors` heading and the next `### ` heading; a missing file, a missing heading, or
an empty slice fails hard (never a vacuous pass).
**Traces**: FR-011, FR-009, 012 FR-018 · AC-009, AC-007.
**Done when**: `test:unit` green; re-running the test after a hypothetical token edit
fails it; deleting either token or its § 1.1 row fails it; the corrected numbers are
readable from the test's output for T011.

## T010 — `[P]` Amendments A-01, A-02, A-04

**Files**: `specs/005-client-console/spec.md`, `AGENTS.md`.
**Do**: A-01 replace absorbed `024-FR-013` with the spec's verbatim amended text; A-02
append the spec's verbatim `018-FR-004` extension; add one dated **v1.13** clarification
block (issue #182) matching that file's changelog convention for both; A-04 add the
governing-documents row for `specs/017-terrain-relief-shading/spec.md` after the 016 row
and refresh the `Current state` spec list in the same edit.
**Traces**: FR-005 (A-01), FR-011 (A-02), spec Amendment table A-01/A-02/A-04.
**Done when**: `pnpm guard:specs` and `node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs` green; the 005 text matches the spec's quoted text exactly.

## T011 — A-03 `DESIGN.md` sweep, N-5, § 4.4 list

**Files**: `DESIGN.md`.
**Do**: transcribe T009's asserted figures into the rows the spec enumerates — the
`biome-zones` row (shipped array + shipped hues 210/170/30/200), the pipe-on-terrain rows
(`:74/:75/:77/:78`, stale hue list removed, encoding carried by triangle shape + dark
outline recorded), `:76`/N-4's "Peaks (L=60–78%)" and stale hue list, the outline's
"≥7:1 against the lightest biome" claim re-verified, `:626`'s "amber 43°" corrected to
`pipeFlat` 37.7° (`city` is the 43° one), the water row's referent named and recomputed,
§ 3's Peaks ceiling row stating which colour it measures (plus the G-07 deferral), and
N-3 re-derived; add **N-5** in the N-3/N-4 family (the pairing, its provenance in D5's
closed forms, the measured band-to-band floor of 5.13:1, the single 1.2:1 floor, the
`0.0045` luminance measurement allowance, the readback suite as its assertion point, the
guard gap — G-07 is deferred and could not read canvas pixels — and why the two tokens
duplicate `focusRing`/black without being redundant, noting that G-04 would *not* have
required them) and **no § 3 row**; rewrite § 4.4 to list the existing markers by `file:line`
minus the two 1d ones this feature retires, leaving four, plus none added. Every corrected
row landing below its recorded target carries the filed follow-up issue **#199** as its
annotation (or an N-2-style *accepted-with-no-planned-action* note), including the
`pipe-downhill` hue-collision-with-zone-1 case and the flat-vs-zone-2 proximity.
**Traces**: FR-009, FR-011 · Amendment A-03 · AC-007, AC-009.
**Done when**: every figure in the diff traces to a T009 assertion (no hand-computed
number); `check:no-literals`, `check:component-catalog`, `check:bundle-size` green.

## T012 — `[P]` FR-011 player-facing copy

**Files**: `docs/manual/src/pages/the-board.mdx`,
`packages/console/src/ui/help-overlay.tsx`.
**Do**: rewrite the "Elevation shading" section: hue = how high the cell is (four hue
families), edge shading = whether the neighbour is higher (darker) or lower (lighter) —
removing the false "from dark green at the lowest ground to bright green at the peaks"
sentence; keep the four inline `EuropaElevationSwatch` examples. In `SYMBOL_LEGEND`
replace the `██ Elevation` "dark = low, light = high" entry with two entries — absolute
biome elevation (hue) and relative edge relief (luminance) — per A-02. Quote no figures.
**Traces**: FR-011 · Amendment A-02 · AC-009.
**Done when**: a grep finds neither stale sentence in either file; `test:component` and
`test:a11y` green (no new axe violations).

## T013 — Verification and reviewer checks

**Files**: none (verification only; `__screenshots__/` output is gitignored).
**Do**: `bash scripts/verify.sh` green; agent-browser smoke against `pnpm host` with a
relief-bearing board screenshot (a fixture match or a scripted view that shows ridges and
drops); confirm the diff touches nothing in `src/render/pipe-slope.ts`,
`tests/component/render/pipe-slope.test.tsx`, or `tests/unit/render/slope-drift.test.ts`;
confirm no § 3 row was added and N-5 exists; confirm no `package.json` gained a runtime
dependency and the DOM node count per tile is unchanged.
**Traces**: AC-006, AC-007, AC-011 · spec's pre-push gate.
**Done when**: `pnpm verify` green, screenshot captured, AC-006/007/011 recorded for the
reviewer.

---

## Coverage table

| Spec item | Tasks |
| --- | --- |
| FR-001 (edge relief, relative only) | T002, T004, T005, T006, T007 |
| FR-002 (sign constant, per-zone base) | T002, T003, T005 |
| FR-003 (continuous proportional magnitude) | T002, T003, T006 |
| FR-004 (neutral: water / absent / off-board) | T004, T005, T007 |
| FR-005 (uniform shadow retired; 1c/1e kept) | T004, T007 |
| FR-006 (per-zone reference fixture, 3:1 and 1.2:1) | T002, T006 |
| FR-007 (purely visual) | T008, T013 |
| FR-008 (Canvas 2D) | T004 |
| FR-009 (tokens, no literal, note not § 3 row) | T001, T004, T009, T011 |
| FR-010 (pure, order-independent, no new view field) | T002, T005, T008 |
| FR-011 (manual, legend, corrected docs) | T009, T011, T012 |
| NFR-001 (perf: Q-P01 + relief-enabled 48×48) | T008 |
| NFR-002 (no new dependency) | T013 |
| AC-001 | T005 |
| AC-002 | T003 (unit), T006 (rendered) |
| AC-003 | T005 (readback), T003 (unit) |
| AC-004 | T005 (readback), T007 (unit, retired assertion replacement) |
| AC-005 | T006 |
| AC-006 | T013 |
| AC-007 | T001, T004, T009, T011, T013 |
| AC-008 | T005, T008 |
| AC-009 | T009, T011, T012 |
| AC-010 | T008 |
| AC-011 | T013 |
| A-01, A-02 | T010 |
| A-03 | T001 (tokens), T011 (sweep + N-5 + § 4.4) |
| A-04 | T010 |
| A-05 | T009 |

## Dependency order

`T001 → T002 → {T003 [P], T004} → T005 → T006` · `T004 → T007 [P] → T008 → {T009 [P],
T010 [P]}` · `T009 → T011` · `{T011, T012 [P]} → T013`.

T003 and T004 are independent (different files). T007 (unit file) is independent of
T005/T006 (browser file) once T004 lands. T008 needs T004 and reads T006's figures only
informally. T009 and T010 are independent of each other; T011 depends on T009; T012 is
independent of T009–T011; T013 is last.

---

## Progress

Status record for T001–T013 on `issue-182-tile-shading`, with the commit each task landed in.

- **T001** — done (`9f9f35a`).
- **T002** — done (`037ea21`).
- **T003** — done (`565f7b9`).
- **T004** — done (`2a7ce6e`).
- **T005** — done (`5f82b87`, landed with T006).
- **T006** — done (`5f82b87`).
- **T007** — done (`208790f`).
- **T008** — **blocked**: the 48×48 relief-enabled fixture measures 40.4 ms min-round-median against the 8 ms budget; `tests/integration/perf.test.ts` is unchanged at HEAD and the task is unimplemented, awaiting a PM decision on the gate.
- **T009** — done (`9de4dbc`).
- **T010** — done (`3319399`).
- **T011** — done (`5c9bfe4`).
- **T012** — done (`7ec4b19`).
- **T013** — done (this commit): `bash scripts/verify.sh` green, agent-browser smoke against `pnpm host`.
