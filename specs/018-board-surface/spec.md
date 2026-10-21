# Feature Specification: Board Surface Treatment (Coastline, Zone Seams, Tile Grain)

**Feature Branch**: `018-board-surface`

**Last Updated**: 2026-10-20

**Version**: 1.0

**Created**: 2026-10-20

**Status**: Implemented on `issue-182-tile-shading`; `plan.md`, `tasks.md` and the evidence line live beside this file. Three console visual changes selected by the product owner from a shortlist.

**Input**: Product-owner selection: (1) a coastline band, (2) biome zone seams, (3) deterministic per-tile grain. Scope is the canvas terrain path only — `packages/console/src/render/canvas.ts` sub-passes 1a–1f and `palette.ts` as they stand on `issue-182-tile-shading`, sitting alongside `specs/017-terrain-relief-shading/spec.md` v1.11.

**Numbering**: 018 is the next free spec directory (`ls specs/` checked 2026-10-20).

## Problem Statement

The board's terrain reads as flat cut-outs. Land meets water with a hard colour cut, so an island and a continent look alike; the four biome zones meet in a hard hue jump (teal straight into brown), so a boundary reads as a seam in the artwork rather than as terrain; and every tile of a zone carries the same decorative texture, so a wide terrace repeats like wallpaper. All three are surface treatments, not new information: they must not add a channel, must not read as elevation, and must not change what a player can learn about a cell.

## User Story 1 - Read the board as terrain, not as tiles (Priority: P1)

As a player, I want the edge of the land, the boundaries between terrain zones, and the surface of each tile to look like a map's land, contour and texture, so that islands, zone boundaries and wide terraces are legible at a glance without any of those marks pretending to be height.

**Independent Test**: Browser pixel readback against scripted `MapView` fixtures: a coast band appears only on visible-water edges with the NW light; a zone seam appears only between visible land cells of different zones; grain varies per cell and is unaffected by permuting elevations across the fixture. Every fixture is also painted with the 018 passes suppressed, as the control.

**Acceptance Scenarios** (prose, detailed in Acceptance Criteria):

1. A land tile beside visible water carries a thin band inside its own edge, lit on N/W and shaded on S/E; a tile beside fog, off-board space, or other land carries none.
2. Two visible land tiles in different biome zones are separated by one hairline, and the face colour still changes across it.
3. Any two land tiles at the same elevation look slightly different in surface, the difference is identical every frame, and shuffling which cell holds which elevation leaves each cell's surface unchanged.

### Edge Cases

- **Map edge**: off-board sides carry no coast band, no seam, and no relief; a coast band stops at the board's edge.
- **Fog frontier**: an edge whose neighbour is absent from the fog-filtered view carries no coast band and no seam — absence itself must not imply water or a zone.
- **Water-only view**: no land cells paint anything from this feature; water pixels are byte-identical to the control paint.
- **One-cell island**: all four edges carry a coast band, and no relief bevel (there is no land neighbour).
- **Zone boundary that is also a coast**: the land/water edge is a coast; no seam is drawn there.
- **Zone boundary edge that also carries a relief bevel**: the seam stays continuous across it.
- **Zoom extremes** (32 px and 96 px cells, 005 FR-017): coast band width scales with the cell (4 %), the seam stays one CSS pixel, and grain stays within its lightness bound at both.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Coastline band)**: A visible land tile MUST paint a thin band inside its own rect on each side whose neighbour is a **visible water** cell. The band width is **4 % of the cell size** — feature 017's step-1 bevel ratio — so it scales with zoom and never leaves the land tile. Its tone follows the same single NW light as the bevels: a **north- or west-facing band is lit, a south- or east-facing band is shaded**, derived from the tile's own zone face by feature 017's step-1 lightness shares (0.74 lit, 0.40 shaded), keeping hue and saturation. Water-adjacent sides never carry a relief bevel (017 FR-004), so the band is additive. Where a coast band meets a **perpendicular relief bevel at the same tile corner, the relief bevel wins**: the band is clipped to the region not covered by that tile's bevels, and its length along its own side is otherwise full. The band MUST NOT vary with the water cell's elevation, depth, or any other property beyond "visible water".

- **FR-002 (Zone seams)**: Where two adjacent **visible land** cells fall in different biome zones, the console MUST paint **one seam line, 1 CSS px wide and zoom-independent, centred on their shared edge**, over the faces and over any relief bevel on that edge so the line stays continuous. **The face colour still changes at the seam**; the line marks an existing change rather than replacing it (see Non-goals). The line is one design token colour and MUST measure **≥ 1.2:1** against each of: the adjoining zone face's worst-case rendered stop (grain included), and any relief bevel tone the seam crosses. It MUST NOT be the sole carrier of the zone boundary — the hue change remains. No seam is painted between land and water, within one zone, or against an absent/off-board neighbour.

- **FR-003 (Tile grain)**: Every visible land tile MUST carry a deterministic, static surface offset derived **only from its own cell coordinates**, identical across frames, painters, sessions, and `MapView.cells` insertion order. The offset is **one constant per tile applied to both stops of the face texture**, so the NW→SE gradient's direction and amplitude are unchanged, and its magnitude MUST stay within **±2 HSL lightness points** (a fixed small set of values, not continuous noise). It MUST NOT read from elevation, terrain, zone index, or any neighbour state, so it can neither read as height nor leak fog-hidden information. On a 32×32 all-land fixture at least four distinct offsets MUST appear. It MUST NOT be suppressed by reduced motion or by feature 017's relief paint option: it is surface decoration, not relief (see Decisions).

### Constraints

- **Canvas 2D only, console package only.** No engine, protocol, flow, or pipe-slope change; `src/render/pipe-slope.ts` is untouched and 005 FR-013 behaviour is unchanged.
- **Performance**: `test:perf` Q-P01 keeps its **< 8 ms** budget on its 32×32 fixture, and feature 017's **< 6 ms** relief-attributable addition is unchanged — the three new treatments paint in both the relief-on and relief-off states, so they cannot inflate that difference. No per-cell gradient, pattern, or image object is created per frame; grain reuses pre-rendered variants.
- **Accessibility**: 017's A-01/A-02 floors (`specs/017-terrain-relief-shading/spec.md` FR-006: lit/shaded ≥ 3:1, each bevel ≥ 1.2:1 against the face's worst-case stop) still hold, measured against the **grain-shifted** worst-case stop. Nothing added here may be the sole carrier of information: the coast duplicates a land/water boundary the water fill already states, the seam duplicates a hue change, and the grain carries nothing.
- **Tokens**: no colour literal in `packages/console/src`. At most one new token (the seam colour) may be added, to `packages/design/src/tokens.ts` and `DESIGN.md` § 1.1 in the same change set (012 FR-017/FR-018); any existing token that already satisfies FR-002 means no new token.
- **Fog discipline**: nothing renders differently because of an unseen cell (017 FR-004/FR-010, 002 SC-001). All three treatments are pure functions of the fog-filtered view snapshot and the cell's own coordinates.

## Acceptance Criteria *(mandatory)*

Every criterion is binary and machine-checkable unless marked **reviewer check**. All readback criteria compare against a control paint with the 018 passes suppressed.

- **AC-001 (FR-001)** — Browser readback at 32 px and 96 px cells: a land tile with visible water on N and on S paints a lit band on N and a shaded band on S, inside its own rect, each 4 % of the cell within readback tolerance; the same fixture with those neighbours absent from the view, off-board, or land paints no band; the water cells' pixels match the control.
- **AC-002 (FR-001)** — On a fixture where a coast band meets a perpendicular relief bevel (Δ ≥ 10, so the widest bevel), the bevel's pixels inside its own trapezoids are byte-identical to the control's, the coast band is absent only inside those trapezoid regions, and its remaining length on its own side is full; a tile whose four neighbours are all visible water paints four bands and no bevel.
- **AC-003 (FR-002)** — A visible land pair in different zones paints a seam on the shared edge; the same pair with equal zones, with water on one side, or with one cell absent paints none; the seam measures 1 CSS px at both 32 px and 96 px zoom; it measures ≥ 1.2:1 against both adjoining zone faces' worst-case stops and against any relief tone it crosses. The face colour on each side still equals the zone colour (the seam did not unify it).
- **AC-004 (FR-003)** — Painting the same fixture twice yields byte-identical pixels; permuting elevations across the fixture's cells leaves each cell's sampled face offset unchanged; two cells at the same elevation but different coordinates differ in surface; over a 32×32 all-land fixture at least four distinct offsets appear and no offset exceeds ±2 HSL lightness points; the same-zone byte-identity clause of 017 AC-004 no longer holds and is replaced by this criterion.
- **AC-005 (Fog and determinism)** — A land tile on the fog frontier paints identical pixels when the hidden neighbour is water, land, or a different elevation (all unrepresentable in the fixture: absent in every case), and identical pixels across two runs and across a shuffled `MapView.cells` insertion order; `test:determinism`'s golden hash is unchanged.
- **AC-006 (Perf, guards, accessibility)** — Q-P01 < 8 ms and the 017 relief-attributable addition < 6 ms with the three treatments enabled; no per-cell gradient/pattern/image allocation is observable in the paint path; `check:no-literals` is green; 017's readback suite (AC-001–AC-005) is green with its floors measured against the grain-shifted worst-case stop; the existing axe suite is green. **reviewer check** confirms no added mark is the sole carrier of any state.

**Done when** the readback suite passes at 32 px and 96 px on all four biome zones, `test:perf` and `test:determinism` are green, and `pnpm verify` is green.

## Out of Scope (Non-goals)

- **Unifying the face colour across biome zones.** Removing the hue change would remove the elevation channel (005 FR-001, 017); the seam marks the cut, it does not hide it. A unified face is a separate feature.
- **Any relief-contract change** — bevel geometry, width ladder, lightness ladders, NW light, contrast floors, and fog rules stay as 017 v1.11 specifies.
- **Any engine, protocol, flow, pipe-slope, terrain-generation, board-size, or minimap change** (the minimap paints through its own painter and is unchanged, as 017 excluded it).
- **Animation, motion, or a new player-facing control** — none of the three treatments moves; nothing is added to the help overlay or the manual.
- **A non-visual readout** of coast, seam, or grain — all three are decoration.
- **More than one new design token.**

## Amendments Required

This spec **amends** `specs/017-terrain-relief-shading/spec.md` in three clauses only, and applies them in the change set that implements 018. **It does not change 017's relief contract**: the bevel model, FR-001–FR-004, FR-006's floors, the light rule, the ladders, and the determinism/fog requirements all stand.

| # | Target | Required change |
| --- | --- | --- |
| A-01 | 017 FR-005, clause "every tile of a zone draws identical pixels ... a function of zone and zoom alone" | Restate: `zone + zoom + the cell's own grain offset (018 FR-003)`; the texture still encodes no elevation. |
| A-02 | 017 AC-004, clause "two tiles of the same zone MUST render byte-identical rects" | Replace with 018 AC-004 (same zone, same grain offset → identical; different coordinates → differ only by grain). |
| A-03 | 017 AC-003, clause making a tile byte-identical whether its non-land neighbour is absent or water | Restate: water at elevation 0 and at 255 stay byte-identical (no water property reaches the paint), while absent vs water differ only by the fixed coast band, which is elevation-independent. |
| A-04 | `specs/005-client-console/spec.md` absorbed `024-FR-013` ("An edge adjacent to water ... MUST be neutral") | "Neutral" means no relief bevel and no synthesized neighbour elevation; a fixed coastline band (018 FR-001) MAY be painted on that edge. |
| A-05 | `DESIGN.md` § 1.1 (+ N-5 or a new N-6 family note); `AGENTS.md` governing-documents table | Record the seam token or the reused token, the coast band's step-1 derivation and grain's ±2 bound with the readback suite as their assertion point; add the 018 row to the table and refresh "Current state" in the same change set. |

## Decisions Taken

- **Coast vs relief bevel (FR-001)**: no overlap to arbitrate on a side — 017 paints a bevel only against a *visible land* neighbour, so water-facing sides are always bevel-free. They meet only at a tile corner, where the **relief bevel wins** and the coast band is clipped.
- **Coast strength**: 017's **step-1 band** — 4 % width, 0.74 lit / 0.40 shaded lightness shares — so the shoreline reads at the same weight as the weakest ledge without inventing a second ladder.
- **Seam strength (FR-002)**: the face colour **still changes**; the seam is a 1 CSS px isoline drawn over it at **≥ 1.2:1** against both adjoining faces and any bevel it crosses. It marks the cut rather than hiding it; unifying the face is a non-goal.
- **Grain range (FR-003)**: **±2 HSL lightness points**, one offset per tile applied to both face stops, sourced from coordinates alone (≥ 4 distinct values on a 32×32 board). It is *not* disabled by reduced motion (it does not move) and *not* tied to 017's relief option (it is not relief); it follows the face texture, which paints in both states.

## Open Questions

- Which token carries the seam colour — the existing dark canvas token or one additive `seam` token — is left to the plan; either satisfies FR-002 and changes no behaviour.
