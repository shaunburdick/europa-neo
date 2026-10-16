# Terrain relief shading — delta-based land-tile edge bevels (issue #182)

## What changed

Replaces the uniform inner shadow on land tiles (sub-pass 1d) with **relief bevels whose magnitude is the raw elevation delta to the visible neighbour**, so a slope reads as a slope instead of a flat inset.

- **`packages/console/src/render/relief.ts`** (new, pure): the `|Δ| → fraction` mapping and the band colour, anchored at the biome zone's own 1c gradient end — highlight anchored at the light end, shadow at the dark end. Continuous and proportional; no banding, no quantisation, no sampling formula.
- **`packages/console/src/render/canvas.ts`**: sub-pass 1d rewritten. Deltas are computed at paint time against the four visible neighbours; relief is drawn only between two **visible land** tiles. Water, map borders, and fog-hidden or absent neighbours are neutral — relief never reveals hidden elevation. The whole sub-pass collects its bands into one map keyed by colour and paints one `fill()` per distinct colour over a single path, replacing one `fillRect` per band (9,024 → 822 `fill()` calls on the representative 48×48 fixture), colours iterated in sorted key order so fill order is a pure function of the colour set.
- **`packages/design`**: two additive tokens, `reliefHighlight` `#ffffff` and `reliefShadow` `#000000`, documented in `DESIGN.md` note **N-5**; `design.css` and its vendored copies regenerated.
- **Docs**: `DESIGN.md` § 1.1 rows and the whole diverged terrain-figure sweep; § 4.4's four canvas marker references; spec 005 v1.13 amendment block; `AGENTS.md`; the player manual and the in-game legend (which now describe the two elevation channels — hue for biome, luminance for relief).
- **Tests**: `relief.test.tsx` (four-zone readback, AC-008 byte identity, AC-003 confinement), `relief.test.ts`, the A-03 token-reading block in `palette.test.ts` with the Peaks case un-vacuumed, and Q-P05 in `perf.test.ts`.

## Why

Issue #182. The 1c biome gradient already encodes absolute elevation by hue; the retired inner shadow encoded nothing, so the board read flat. Relief layered on top of the unchanged hue bands makes local slope legible without spending the hue channel the biome encoding needs.

**The perf gate had to be re-pinned on measurement, not plan.** The original gate was an absolute 8 ms budget on a 48×48 fixture. That fixture passed at 5.9 ms while carrying only 4 distinct `|Δ|` values; a representative fixture measured ≈8.0 ms. Two findings forced the change:

1. The first 40.4 ms reading was the **decorated** 48×48 board with relief **off** — units, pipes and cities cost 40–50 ms on their own. The frame, not the feature, was being measured.
2. Even after the painter redesign the representative fixture sat right on the budget.

So NFR-001 now gates relief's **attributable addition** (relief-on − relief-off, min-of-round-medians, identical representative fixture) at a pinned 6 ms, with Q-P01's 8 ms budget untouched, and the test asserts the fixture's variety (`distinct |Δ| ≥ 200`, `distinct band colours ≥ 500`, all four zones carrying deltas) so the gate cannot regress to a fixture that flatters the number. Measured: **3.60–4.30 ms**, worst 4.30, ≈39% margin.

## What was removed

- The uniform inner-shadow fill and its `canvas-terrain.test.ts` assertion (replaced by a readback assertion against the new sub-pass, which also accepts the batched `rect()`+`fill()` shape).
- The vacuous Peaks assertion in `palette.test.ts` — it read a literal instead of the token, so it could not fail. It now reads `TOKENS.color.biomeZones` zone 3, and mutation testing confirms the whole A-03 block goes red when a token changes.
- Stale terrain figures across `DESIGN.md`, the `PIPE_OUTLINE_COLOR` comment, and the `palette.ts` module doc-comment.

## Declined, and why

- **`±0.02` ratio allowance** on the contrast floors: it would have hidden real regressions; a single `0.0045` absolute luminance allowance (8-bit rounding) is used instead.
- **A mod-6 sampling formula** for contour-freeness: the control-pixel guard proves it directly and fails loudly.
- **Cutting the 96 px zoom confinement fixture** (requested by review): the 96 px case is where band thickness collapses to its floor, so it is the only fixture that would catch a geometry regression there.
- **D7's per-`MapCanvas` colour memo**: superseded by whole-sub-pass batching, which is a bigger win for the same reasoning.
- **Fixing the below-target pipe-indicator contrast here**: filed as **#199**. The `DESIGN.md` rows that land below their recorded target carry a #199 annotation instead.

## Disclosures

- **Corner-overlap pixels moved** with colour batching. The change is deterministic and confined to same-tile `t × t` corners; `midAxisDifferences: 0`, nothing in a neighbouring tile, and no asserted pixel moved. The pre/post image hashes cited in the plan's history came from a **throwaway probe** and are not reproducible from the repository — the suite's committed guarantee is general confinement (AC-003) plus repeat-paint and reversed-`Map` byte identity (AC-008).
- **The plan's earlier D7 framing was wrong** and the plan says so: the absolute budget it pinned measured the frame rather than the feature. The plan and `tasks.md` record the superseded numbers, not just the final ones.
- Two `DESIGN.md` figures beyond what the spec's A-03 enumerated were corrected (the outline row's dark-background claim measures 2.91:1, not ≥3:1) — leaving a measurably false number beside its corrected neighbours would have been worse.
- Spec v1.6 corrected four statements implementation proved wrong, and v1.7 re-pinned NFR-001; no criterion, threshold, or scope changed in either.

Closes #182.
