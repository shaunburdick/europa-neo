# Feature Specification: Board Surface Treatment (Coastline, Zone Seams, Tile Grain, Elevation Contours)

**Feature Branch**: `018-board-surface`

**Last Updated**: 2026-10-21 (v1.2; the zone 2–3 diagonal hatch becomes a real elevation-contour pass)

**Version**: 1.2

**Created**: 2026-10-20

**Status**: Implemented on `issue-182-tile-shading`; `plan.md`, `tasks.md` and the evidence line live beside this file. Four console visual changes selected by the product owner from a shortlist. v1.2 replaces sub-pass 1e's diagonal hatching (`rgba(0, 0, 0, 0.10)` every 6 px, zones 2–3) with elevation isolines drawn on level-crossing land edges in all four zones, painted before the relief bevels — the hatch covered the whole surface, competed with the bevels, and marked nothing about the ground.

**Input**: Product-owner selection: (1) a coastline band, (2) biome zone seams, (3) deterministic per-tile grain, (4) elevation contours in place of the diagonal hatch. Scope is the canvas terrain path only — `packages/console/src/render/canvas.ts` sub-passes 1a–1f and `palette.ts` as they stand on `issue-182-tile-shading`, sitting alongside `specs/017-terrain-relief-shading/spec.md` v1.14.

**Numbering**: 018 is the next free spec directory (`ls specs/` checked 2026-10-20).

## Problem Statement

The board's terrain reads as flat cut-outs. Land meets water with a hard colour cut, so an island and a continent look alike; the four biome zones meet in a hard hue jump (teal straight into brown), so a boundary reads as a seam in the artwork rather than as terrain; every tile of a zone carries the same decorative texture, so a wide terrace repeats like wallpaper; and the zone 2–3 diagonal hatch stands in for a contour while covering the surface uniformly — the busiest thing on the board, competing with the relief bevels for the same job. The first three are surface treatments, not new information: they must not add a channel, must not read as elevation, and must not change what a player can learn about a cell. The fourth is the opposite: a contour says where the ground crosses a level, so it is drawn only where that happens and reads as a line that follows the shape of the ground.

## User Story 1 - Read the board as terrain, not as tiles (Priority: P1)

As a player, I want the edge of the land, the boundaries between terrain zones, the surface of each tile, and the shape of the ground's height steps to look like a map's land, contour and texture, so that islands, zone boundaries, wide terraces and terraces' outlines are legible at a glance without any of those marks pretending to be anything more than they are.

**Independent Test**: Browser pixel readback against scripted `MapView` fixtures: a coast band appears only on visible-water edges with the NW light; a zone seam appears only between visible land cells of different zones; grain varies per cell and is unaffected by permuting elevations across the fixture; a contour appears only on an edge whose two cells straddle a 28-level band boundary. Every fixture is also painted with the 018 passes suppressed, as the control.

**Acceptance Scenarios** (prose, detailed in Acceptance Criteria):

1. A land tile beside visible water carries a thin band inside its own edge, lit on N/W and shaded on S/E; a tile beside fog, off-board space, or other land carries none.
2. Two visible land tiles in different biome zones are separated by one hairline, and the face colour still changes across it.
3. Any two land tiles at the same elevation look slightly different in surface, the difference is identical every frame, and shuffling which cell holds which elevation leaves each cell's surface unchanged.
4. Two visible land tiles whose elevations fall in different 28-level bands are separated by one dark hairline; the line is absent inside a band, and a relief bevel or a zone seam painted later owns the edge where they meet.

### Edge Cases

- **Map edge**: off-board sides carry no coast band, no seam, no contour, and no relief; a coast band stops at the board's edge.
- **Fog frontier**: an edge whose neighbour is absent from the fog-filtered view carries no coast band, no seam, and no contour — absence itself must not imply water, a zone, or an elevation.
- **Water-only view**: no land cells paint anything from this feature; water pixels are byte-identical to the control paint.
- **One-cell island**: all four edges carry a coast band, and no relief bevel (there is no land neighbour).
- **Zone boundary that is also a coast**: the land/water edge is a coast; no seam is drawn there.
- **Zone boundary edge that also carries a relief bevel**: the seam stays continuous across it.
- **Edge that carries both a contour and a relief bevel**: the bevel is painted after the contour and owns every pixel it covers; the contour is not visible inside the bevel.
- **Edge that carries both a contour and a zone seam**: the seam is painted last and is the only line visible there — the contour does not double the mark.
- **Contour level that coincides with a zone threshold**: the seam covers those lines wherever the two cells also differ in zone, so the interval is chosen to keep that coincidence rare (see FR-004).
- **Zoom extremes** (32 px and 96 px cells, 005 FR-017): coast band width scales with the cell (4 %), the seam and the contour stay one CSS pixel at both zooms, and grain stays within its lightness bound at both.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Coastline band)**: A visible land tile MUST paint a thin band inside its own rect on each side whose neighbour is a **visible water** cell. The band width is **4 % of the cell size** — feature 017's step-1 bevel ratio — so it scales with zoom and never leaves the land tile. Its tone follows the same single NW light as the bevels: a **north- or west-facing band is lit, a south- or east-facing band is shaded**, derived from the tile's own zone face by feature 017's step-1 lightness shares (0.74 lit, 0.40 shaded), keeping hue and saturation. Water-adjacent sides never carry a relief bevel (017 FR-004), so the band is additive. Where a coast band meets a **perpendicular relief bevel at the same tile corner, the relief bevel wins**: the band is clipped to the region not covered by that tile's bevels, and its length along its own side is otherwise full. The band MUST NOT vary with the water cell's elevation, depth, or any other property beyond "visible water".

- **FR-002 (Zone seams)**: Where two adjacent **visible land** cells fall in different biome zones, the console MUST paint **one seam line, 1 CSS px wide and zoom-independent, centred on their shared edge**, over the faces and over any relief bevel on that edge so the line stays continuous. **The face colour still changes at the seam**; the line marks an existing change rather than replacing it (see Non-goals). The line is one design token colour and MUST measure **≥ 1.2:1** against each of: the adjoining zone face's worst-case rendered stop (grain included), and any relief bevel tone the seam crosses. It MUST NOT be the sole carrier of the zone boundary — the hue change remains. No seam is painted between land and water, within one zone, or against an absent/off-board neighbour.

- **FR-003 (Tile grain)**: Every visible land tile MUST carry a deterministic, static surface offset derived **only from its own cell coordinates**, identical across frames, painters, sessions, and `MapView.cells` insertion order. The offset is **one constant per tile applied to both stops of the face texture**, so the NW→SE gradient's direction and amplitude are unchanged, and it MUST be one of a fixed small set of values in the range **0 to −2 HSL lightness points** — **never positive** (not continuous noise). The one-sided range is forced by 017 FR-006's tightest floor: the Peaks lit bevel measures 1.220:1 against the texture's lightest stop at zero grain, only 1.7 % over the 1.2:1 floor, and any positive offset drops it below the floor; a non-positive set keeps the binding case at its shipped value. It MUST NOT read from elevation, terrain, zone index, or any neighbour state, so it can neither read as height nor leak fog-hidden information. On a 32×32 all-land fixture at least four distinct offsets MUST appear. It MUST NOT be suppressed by reduced motion or by feature 017's relief paint option: it is surface decoration, not relief (see Decisions).

- **FR-004 (Elevation contours)**: The console MUST paint a contour line on every shared edge between two **visible land** cells whose elevations fall in **different bands of the contour interval** — `CONTOUR_INTERVAL = 28` elevation levels, i.e. `floor(elevation / 28)` differs. The line is **1 CSS px at every zoom**, drawn inside the lower-coordinate cell's rect (column `edgeX − 1` for an east-west edge, row `edgeY − 1` for a north-south edge) so it lands on whole device pixels with no antialiasing, and it covers **all four biome zones** — the zone 2–3 restriction of the retired hatch is gone. It MUST be painted **before** feature 017's relief bevels (sub-pass 1c2, sharing the coastline pass's existing neighbour lookups) so a bevel owns any pixel it covers, and **before** FR-002's zone seam, which wins where a contour and a seam mark the same edge — the seam is the only line visible there. No contour is painted against water, against an absent (fog-hidden) cell, or off-board, so no hidden elevation can reach the paint. Its tone is one token, `contour-ink`, neutral black at **20 %** — measured 1.346:1 to 1.588:1 against the face stops it crosses, below the seam's 1.634:1 worst case, so the seam remains the strongest hairline on the board and the bevels remain the primary relief cue by width (4 / 7 / 10 % of the cell) and by paint order. The pass is batched: one path in one colour for the whole board, never a stroke per edge.

  **Why 28.** Over 50 generated boards (sizes 32 and 48, 25 seeds each, 142,940 land–land edges, elevations 87–206) a 28-level interval puts a line on **18.4 % of land–land edges** — 0.35 lines per land tile, one line every ~2.9 tiles, 30 % of tiles touching one, 3–5 bands per board. 24 levels measured 20.9 % (0.40 per tile), 32 levels 15.3 %, 40 levels 13.4 %, and the retired 8-level hatch effectively marked 55.3 % (1.05 per tile) — so 28 is the sparse end that still yields a network rather than isolated dashes. 28 is also the nearest sparse interval that puts **no level on a zone threshold** (80 / 160 / 208): at 32 a level lands exactly on 160, the zone 1/2 cut, and 17.7 % of its lines fell under the opaque zone seam; at 28 that share is 1.3 % and at 36 0.1 %.

### Constraints

- **Canvas 2D only, console package only.** No engine, protocol, flow, or pipe-slope change; `src/render/pipe-slope.ts` is untouched and 005 FR-013 behaviour is unchanged.
- **Performance**: `test:perf` Q-P01 keeps its **< 8 ms** budget on its 32×32 fixture, and feature 017's **< 6 ms** relief-attributable addition is unchanged — all four treatments paint in both the relief-on and relief-off states, so none can inflate that difference. The contour pass runs inside sub-pass 1c2's existing per-land-tile neighbour loop (no second walk of the cells, no extra `coordKey` lookups) and fills one path in one colour: Q-P01 measured 4.0–4.1 ms both with and without the contour code, and the 48×48 relief addition 5.0 ms (bound 6). No per-cell gradient, pattern, or image object is created per frame; grain reuses pre-rendered variants.
- **Accessibility**: 017's A-01/A-02 floors (`specs/017-terrain-relief-shading/spec.md` FR-006: lit/shaded ≥ 3:1, each bevel ≥ 1.2:1 against the face's worst-case stop) still hold, measured against the **grain-shifted** worst-case stop. Nothing added here may be the sole carrier of information: the coast duplicates a land/water boundary the water fill already states, the seam duplicates a hue change, the grain carries nothing, and a contour duplicates a drop the bevel on the same edge already states.
- **Tokens**: no colour literal in `packages/console/src`. The seam reuses `text-muted`; FR-004 adds the feature's **one** new token, `contour-ink` (`rgba(0, 0, 0, 0.2)`), to `packages/design/src/tokens.ts` and `DESIGN.md` § 1.1 in the same change set (012 FR-017/FR-018), which also retires the last `design-exception: canvas fallback` marker on the contour path.
- **Fog discipline**: nothing renders differently because of an unseen cell (017 FR-004/FR-010, 002 SC-001). All four treatments are pure functions of the fog-filtered view snapshot and the cell's own coordinates; the contour band is a function of two *visible* elevations only.

## Acceptance Criteria *(mandatory)*

Every criterion is binary and machine-checkable unless marked **reviewer check**. All readback criteria compare against a control paint with the 018 passes suppressed.

- **AC-001 (FR-001)** — Browser readback at 32 px and 96 px cells: a land tile with visible water on N and on S paints a lit band on N and a shaded band on S, inside its own rect, each 4 % of the cell within readback tolerance; the same fixture with those neighbours absent from the view, off-board, or land paints no band; the water cells' pixels match the control.
- **AC-002 (FR-001)** — On a fixture where a coast band meets a perpendicular relief bevel (Δ ≥ 10, so the widest bevel), the bevel's pixels inside its own trapezoids are byte-identical to the control's, the coast band is absent only inside those trapezoid regions, and its remaining length on its own side is full; a tile whose four neighbours are all visible water paints four bands and no bevel.
- **AC-003 (FR-002)** — A visible land pair in different zones paints a seam on the shared edge; the same pair with equal zones, with water on one side, or with one cell absent paints none; the seam measures 1 CSS px at both 32 px and 96 px zoom; it measures ≥ 1.2:1 against both adjoining zone faces' worst-case stops and against any relief tone it crosses. The face colour on each side still equals the zone colour (the seam did not unify it).
- **AC-004 (FR-003)** — Painting the same fixture twice yields byte-identical pixels; permuting elevations across the fixture's cells leaves each cell's sampled face offset unchanged; two cells at the same elevation but different coordinates differ in surface; over a 32×32 all-land fixture at least four distinct offsets appear, none is positive and none is below −2 HSL lightness points; the same-zone byte-identity clause of 017 AC-004 no longer holds and is replaced by this criterion.
- **AC-005 (Fog and determinism)** — A land tile on the fog frontier paints identical pixels when the hidden neighbour is water, land, or a different elevation (all unrepresentable in the fixture: absent in every case), and identical pixels across two runs and across a shuffled `MapView.cells` insertion order; `test:determinism`'s golden hash is unchanged.
- **AC-006 (FR-004)** — Browser readback at 32 px and 96 px cells: two visible land cells whose elevations straddle a 28-level boundary paint exactly one CSS px of `contour-ink` on their shared edge, on the lower-coordinate cell's side, in every one of the four zones; two cells inside one band paint nothing there and the pixel is the control's face; the line is absent against water, against an absent cell and off-board, and a water neighbour's own elevation (0 vs 255) leaves the land tile byte-identical; where the tile is also higher (a relief bevel on that side) the bevel's pixels are the bevel tone and the contour is visible only with `relief: false`; where the cells are also in different zones the seam is the only line and measures the seam colour; the ink measures < 1.6:1 and > 1.05:1 against every face stop it crosses, the seam's 1.634:1 floor staying above it; two paints and a reversed cell order are byte-identical.
- **AC-007 (Perf, guards, accessibility)** — Q-P01 < 8 ms and the 017 relief-attributable addition < 6 ms with all four treatments enabled; no per-cell gradient/pattern/image allocation is observable in the paint path; `check:no-literals` is green; 017's readback suite (AC-001–AC-005) is green with its floors measured against the grain-shifted worst-case stop; the existing axe suite is green. **reviewer check** confirms no added mark is the sole carrier of any state.

**Done when** the readback suite passes at 32 px and 96 px on all four biome zones, `test:perf` and `test:determinism` are green, and `pnpm verify` is green.

## Out of Scope (Non-goals)

- **Unifying the face colour across biome zones.** Removing the hue change would remove the elevation channel (005 FR-001, 017); the seam marks the cut, it does not hide it. A unified face is a separate feature.
- **Any relief-contract change** — bevel geometry, width ladder, lightness ladders, NW light, contrast floors, and fog rules stay as 017 v1.14 specifies.
- **Any engine, protocol, flow, pipe-slope, terrain-generation, board-size, or minimap change** (the minimap paints through its own painter and is unchanged, as 017 excluded it).
- **Animation, motion, or a new player-facing control** — none of the four treatments moves and no control is added. The manual's existing sentence that described the tile texture is restated for contours because it would otherwise be false; the help overlay never named the hatch and is unchanged.
- **A non-visual readout** of coast, seam, grain, or contour — all four are decoration.
- **More than one new design token** — the seam reuses `text-muted`; `contour-ink` is the one addition.
- **A smooth (marching-squares) isoline that crosses tile interiors.** The contour stays on cell edges, where the tile grid can carry it without a new geometry model.

## Amendments Required

This spec **amends** `specs/017-terrain-relief-shading/spec.md`, `specs/005-client-console/spec.md`, `DESIGN.md` and the manual in the clauses below, applied in the change set that implements 018. **It does not change 017's relief contract**: the bevel model, FR-001–FR-004, FR-006's floors, the light rule, the ladders, and the determinism/fog requirements all stand.

| # | Target | Required change |
| --- | --- | --- |
| A-01 | 017 FR-005, clause "every tile of a zone draws identical pixels ... a function of zone and zoom alone" | Restate: `zone + zoom + the cell's own grain offset (018 FR-003)`; the texture still encodes no elevation. |
| A-02 | 017 AC-004, clause "two tiles of the same zone MUST render byte-identical rects" | Replace with 018 AC-004 (same zone, same grain offset → identical; different coordinates → differ only by grain). |
| A-03 | 017 AC-003, clause making a tile byte-identical whether its non-land neighbour is absent or water | Restate: water at elevation 0 and at 255 stay byte-identical (no water property reaches the paint), while absent vs water differ only by the fixed coast band, which is elevation-independent. |
| A-04 | `specs/005-client-console/spec.md` absorbed `024-FR-013` ("An edge adjacent to water ... MUST be neutral") | "Neutral" means no relief bevel and no synthesized neighbour elevation; a fixed coastline band (018 FR-001) MAY be painted on that edge. |
| A-05 | `DESIGN.md` § 1.1 (+ N-5 or a new N-6 family note); `AGENTS.md` governing-documents table | Record the seam token or the reused token, the coast band's step-1 derivation and grain's 0 to −2 bound with the readback suite as their assertion point; add the 018 row to the table and refresh "Current state" in the same change set. |
| A-06 | 017 FR-005, clause "The zone 2–3 contour hints (`024-FR-012`) MUST remain unchanged" | Restate: the elevation-contour pass is 018 FR-004 (v1.2), which replaced the diagonal hints; it paints before the bevels, so a bevel covers a contour it meets. |
| A-07 | 017 FR-006's sampling clause and AC-005, which name the sub-pass 1e contour diagonals | Restate the sampling exclusion as 018 FR-004's contour lines (1 CSS px of `contour-ink` on level-crossing land edges, all four zones), whose composite can move a sampled pixel. |
| A-08 | `specs/005-client-console/spec.md` absorbed `024-FR-012` ("Contour hints MUST render on zones 2–3") and `024-FR-013`'s closing "the zone 2–3 contour hints are unchanged" | Restate as 018 FR-004: elevation isolines in all four zones, 28-level interval, one CSS px, no line against water, fog-absent or off-board neighbours. |
| A-09 | `docs/manual/src/pages/the-board.mdx`, "Elevation shading" paragraph | Restate the retired "faint diagonal texture — decoration only" sentence as the contour line (a level crossing, painted under the bevels). The help overlay never described the hatch. |

## Decisions Taken

- **Coast vs relief bevel (FR-001)**: no overlap to arbitrate on a side — 017 paints a bevel only against a *visible land* neighbour, so water-facing sides are always bevel-free. They meet only at a tile corner, where the **relief bevel wins** and the coast band is clipped.
- **Coast strength**: 017's **step-1 band** — 4 % width, 0.74 lit / 0.40 shaded lightness shares — so the shoreline reads at the same weight as the weakest ledge without inventing a second ladder.
- **Seam strength (FR-002)**: the face colour **still changes**; the seam is a 1 CSS px isoline drawn over it at **≥ 1.2:1** against both adjoining faces and any bevel it crosses. It marks the cut rather than hiding it; unifying the face is a non-goal.
- **Grain range (FR-003)**: **0 / −0.5 / −1 / −2 HSL lightness points**, one offset per tile applied to both face stops, sourced from coordinates alone (≥ 4 distinct values on a 32×32 board). The set is one-sided because 017 FR-006's Peaks lit floor is 1.220:1 at zero grain — only 1.7 % headroom — and any positive offset breaks it (1.195 at +1, 1.163 at +2), while 018's non-goals forbid changing the relief contract. A symmetric ±2 set would therefore fail 017's floors. It is *not* disabled by reduced motion (it does not move) and *not* tied to 017's relief option (it is not relief); it follows the face texture, which paints in both states.
- **Contour interval (FR-004)**: **28 levels**, measured at 18.4 % of land–land edges (0.35 lines per tile) rather than guessed; the alternative at 32 levels was rejected because a level lands exactly on the 160 zone cut and 17.7 % of its lines were then hidden by the seam (1.3 % at 28). A contour is drawn where `floor(elevation / 28)` differs across a visible land edge — the tile-grid form of an isoline, and the reason the line follows the ground's shape instead of covering the tile.
- **Contour tone and layering (FR-004)**: one token, `contour-ink` = neutral black at **20 %**, measured 1.346–1.588:1 against the faces it crosses. It is deliberately below the seam's 1.634:1 worst case so the seam stays the strongest hairline, and it is drawn before the bevels so the bevel — 4 / 7 / 10 % of the cell wide — owns every pixel it covers. Where a contour and a seam mark the same edge, **the seam wins**: one line, not two. Because the seam is opaque and painted last, the contour cannot double it.
- **Contours vs the retired hatch (FR-004)**: the hatch was a uniform texture standing in for a contour — 0.5 px diagonals every 6 px on zones 2–3, i.e. ~1.05 marks per land tile over a third of the board. The contour marks 0.35 lines per tile over every zone and only where the ground crosses a level, so the surface reads calmer while the mark now means something.

## Open Questions

- Which token carries the seam colour — the existing dark canvas token or one additive `seam` token — is left to the plan; either satisfies FR-002 and changes no behaviour.
