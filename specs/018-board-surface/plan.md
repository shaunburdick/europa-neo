# Implementation Plan: Board Surface Treatment (Coastline, Zone Seams, Tile Grain, Elevation Contours)

**Feature**: `specs/018-board-surface/spec.md` (v1.2) · **Branch**: `issue-182-tile-shading`
**Plan status**: implemented through v1.1; v1.2 adds D8 · **Date**: 2026-10-21

## 1. Summary

Four surface treatments in `packages/console/src/render/`, all decoration except the contour, which replaces a texture with a mark that means something:

1. **Coast band (FR-001)** — a 4 %-of-cell band inside a land tile on each side whose
   neighbour is a *visible water* cell, lit on N/W and shaded on S/E with 017's step-1
   lightness shares.
2. **Zone seam (FR-002)** — one 1 CSS px isoline on the shared edge of two visible land
   cells in different biome zones, painted over faces, grain, and bevels.
3. **Tile grain (FR-003)** — one constant lightness offset per tile, from its coordinates
   alone, applied to both stops of the face texture through a cached variant set.
4. **Elevation contours (FR-004)** — one 1 CSS px line of `contour-ink` on each shared edge
   between visible land cells in different 28-level bands, all four zones, painted before
   the bevels; it retires sub-pass 1e's diagonal hatch.

No engine, protocol, flow, pipe-slope, board-size, or minimap change. No new runtime
dependency. One new token (`contour-ink`); the seam reuses `text-muted`.

## 2. Technical context

| Area | Fact this plan relies on |
| --- | --- |
| Painter | `MapCanvas.paint`, terrain sub-passes 1a–1f in `canvas.ts` |
| Face texture | one 64 px sprite per zone, one `CanvasPattern` per paint, period = one cell |
| Neighbours | `destinationCoord` + `MapView.cells.get(coordKey(dst))`; absent = fog-hidden |
| Zones | `landBandIndex(elevation)` → 0–3; `landBandColor(zone)` |
| Relief tones | `reliefToneColours(face)` — step-1 entries feed the coast band |
| Contour band | `elevationBand(elevation) = floor(elevation / 28)`; `contourCrosses` |
| Tokens | `TOKENS.color.textMuted` (seam) and `TOKENS.color.contourInk` (contour) |
| Guards | `check:no-literals` scans `packages/console/src` for hex/rgb literals |
| Budgets | Q-P01 < 8 ms (32×32); 017's relief addition < 6 ms (48×48) |

## 3. Decisions

### D1 — Grain is a four-value, non-positive offset set

**Decision.** `LAND_FACE_GRAIN_OFFSETS = [0, -0.5, -1, -2]` HSL lightness points; the index
comes from a 32-bit hash of the cell's own coordinates (`Math.imul`, no elevation, zone, or
neighbour input). One constant per tile shifts *both* gradient stops, so the NW→SE direction
and the 5-point amplitude are unchanged.

**Why not symmetric ±2.** 017 FR-006's tightest floor is Peaks's lit bevel against the
texture's lightest stop: 1.220:1 at zero grain, i.e. 1.7 % of headroom. Raising that stop by
one lightness point measures 1.195 against the zone-derived lit tone (1.205 if the tone were
re-derived from the shifted face); +2 measures 1.163 (1.180). A symmetric ±2 set therefore
cannot satisfy "017's floors still hold" without changing the relief contract — which 018's
Non-goals forbid. Every candidate set with a positive value either breaks the floor or leaves
a sub-1 % margin; the four non-positive values keep the binding lit case at its shipped 1.220
and the shaded case at 1.403 (zone 2, −2), both above 1.2. The trade-off is recorded in spec
FR-003/AC-004 and Decisions Taken (v1.1) and in `tasks.md` T-001.

**Why fractional.** The four values must render four distinct surfaces. Integer offsets within
[−2, 0] supply only three, and `adjustBrightness` rounds to an integer lightness, so the face
sprite stops are built from an `hsl()` string with fractional lightness instead of
`adjustBrightness`. Grain therefore never reaches `relief.ts`'s integer-only HSL parser; bevel
and coast tones stay derived from the zone face, exactly as 017 v1.11 shipped them.

### D2 — Coast band: paint first, bevels over it

**Decision.** Sub-pass 1c2 runs after the faces and before 1d. For each land tile and side,
look up the neighbour: only a present `terrain === 'water'` cell paints. Geometry is a
full-length rect inside the tile — N `(x,y,S,w)`, S `(x,y+S−w,S,w)`, W `(x,y,w,S)`,
E `(x+S−w,y,w,S)` — with `w = 0.04 · S`. The tone is `reliefToneColours(landBandColor(zone))`
step 1: `lit[0]` on N/W, `shaded[0]` on S/E.

**Corner arbitration** falls out of paint order: 1d's bevel trapezoids, squares and caps are
painted after 1c2 and own every pixel they cover. The band keeps its full length everywhere
the bevel does not cover it, which is exactly FR-001's "clipped to the region not covered by
that tile's bevels". No geometric intersection code, no per-tile clipping path.

**Fog discipline.** Absent, off-board and land neighbours paint nothing; the water cell's own
elevation is read only by 1a's water gradient, never by the coast pass.

### D3 — Zone seam: one token, one pixel column, after contours
**Decision.** Sub-pass 1e2 (after 1c2's contours and 1d's bevels, before 1f's city glow)
collects the shared edges of visible land neighbours in different zones. To visit each edge
once, only a tile's E and S sides are tested. Geometry: vertical `(edgeX − 1, y, 1, S)`,
horizontal `(x, edgeY − 1, S, 1)` — the same column/row a contour uses, so the seam simply
paints over one rather than doubling the line.

**Why `−1`.** A 1 CSS px column cannot be centred on an integer pixel boundary without
antialiasing two half-covered columns, which blends the token with 50 % face and halves the
measured contrast. Snapping the whole column to the lower-coordinate side keeps it opaque,
exactly 1 px at 32 px and 96 px zoom, and half a pixel off the mathematical boundary — the
closest an unantialiased device-pixel line can sit.

**Colour.** `SEAM_COLOR = TOKENS.color.textMuted` (`#9ca3af`). No new token: the worst
measured pairing is 1.373:1 against zone 3's shaded Δ1 bevel; against every adjoining face's
grain-shifted worst-case stop it is ≥ 1.634 (zone 3) and ≥ 1.829 elsewhere. The face hue still
changes across the seam, so the line duplicates an existing cue.

### D4 — One paint option for the 018-free control

`PaintOptions` gains `readonly surface?: boolean`, default `true`. `false` skips 1c2 (coast
and contour), 1e2 and the grain variants (faces revert to the zone texture) and is the control
every 018 readback criterion compares against. Relief stays independently switchable.

### D5 — Determinism

Grain depends on coordinates only; coast on the tile's zone plus "neighbour is present water";
contour on two present land elevations; seam on two present land zones. Every bucket is filled
one path per colour with colours sorted — the contour has one colour, so it is a single path in
visit order, and overlapping rects share a winding direction — so insertion order cannot change
pixels. No clock, no randomness, no new `MapView` field.

### D6 — Performance shape

Grain multiplies the face-pattern set from 4 to 16 (4 zones × 4 offsets), all sprites cached on
the painter; each paint creates 16 patterns and fills one path per variant. The coast pass adds
one neighbour lookup per land side and one fill per (zone, side) colour; the seam adds one
lookup per land tile on two sides and one fill total. The contour reuses 1c2's neighbour lookup
(two band comparisons per land tile) and one fill for the whole board, so it adds no walk of
the cells and no measurable time — Q-P01 measured 4.0–4.1 ms with the pass removed. No per-cell
gradient, pattern or image. All figures are measured under Q-P01 and Q-P05 (T-011).

### D7 — Amendments and docs in the same change set

017 spec v1.12 restates FR-005 (A-01), AC-004 (A-02) and AC-003 (A-03); 005's absorbed
`024-FR-013` gains A-04's sentence plus a v1.18 block; `DESIGN.md` § 1.1 (biome-zones, text-muted,
contour-ink), N-6 and § 4.4; `AGENTS.md` table + Current state. v1.2 adds A-06–A-09: 017 v1.14
restates FR-005's contour clause, FR-006's sampling exclusion and AC-005's reference to it;
005 restates `024-FR-012`; the manual's board page restates the retired texture sentence.
017's relief contract — geometry, ladders, light rule, floors, fog rules — is untouched.

### D8 — Contours: a band boundary on the shared edge, drawn before the bevels

**Decision.** `surface.ts` owns the pure mapping — `CONTOUR_INTERVAL = 28`,
`elevationBand(elevation) = floor(elevation / 28)`, `contourCrosses(own, neighbour)` — and the
painter folds it into 1c2. The loop already looks up each land neighbour for the coast, so a
contour costs two `Math.floor` comparisons and one rect push: no second walk of the cells, no
new `coordKey` allocation. Only E and S sides are tested so each edge is visited once, and the
line takes the same `edge − 1` column/row as the seam (a whole device pixel, no antialiasing).
One flat array, one `beginPath`, one `fill` for the whole board.

**Interval.** Measured over 50 generated boards (32 and 48, 25 seeds, 142,940 land–land edges):
28 levels crosses 18.4 % of land–land edges (0.35 lines per tile, one line every ~2.9 tiles,
30 % of tiles touching one, 3–5 bands per board). 24 measured 20.9 %, 32 15.3 %, 40 13.4 %; the
retired hatch effectively marked 55.3 % (1.05 per tile). 28 also keeps every level off a zone
threshold (80 / 160 / 208) — at 32 a level lands on 160, where 17.7 % of lines were covered by
the opaque seam; at 28 that is 1.3 %.

**Tone.** `contour-ink` = `rgba(0, 0, 0, 0.2)`, a new token. Measured 1.346–1.588:1 against the
face stops the line crosses, so it stays under the seam's 1.634:1 worst case: the seam remains
the strongest hairline, and the bevel remains the primary relief cue by width and by paint
order. The token also retires the last `design-exception: canvas fallback` marker on the
contour path (the old `rgba(0, 0, 0, 0.10)` hatch literal), so § 4.4's count drops to three.

**Layering.** Contours paint in 1c2, before 1d's bevels: a bevel owns every pixel it covers, so
the two cues never compete on one edge. 1e2's seam paints last and wins over a contour that
shares its edge — measured: on a zone 1/2 edge the column reads the seam colour, one line.

**Fog discipline.** Only a present land neighbour can cross a level; a water neighbour's
elevation is never read (0 and 255 paint identically), and absent or off-board neighbours paint
nothing.
