# Implementation Plan: Board Surface Treatment (Coastline, Zone Seams, Tile Grain)

**Feature**: `specs/018-board-surface/spec.md` (v1.0) · **Branch**: `issue-182-tile-shading`
**Plan status**: draft returned with `tasks.md` for Gate 2 · **Date**: 2026-10-20

## 1. Summary

Three surface treatments in `packages/console/src/render/`, all decoration:

1. **Coast band (FR-001)** — a 4 %-of-cell band inside a land tile on each side whose
   neighbour is a *visible water* cell, lit on N/W and shaded on S/E with 017's step-1
   lightness shares.
2. **Zone seam (FR-002)** — one 1 CSS px isoline on the shared edge of two visible land
   cells in different biome zones, painted over faces, grain, and bevels.
3. **Tile grain (FR-003)** — one constant lightness offset per tile, from its coordinates
   alone, applied to both stops of the face texture through a cached variant set.

No engine, protocol, flow, pipe-slope, board-size, or minimap change. No new runtime
dependency. At most one new token; this plan reuses an existing one.

## 2. Technical context

| Area | Fact this plan relies on |
| --- | --- |
| Painter | `MapCanvas.paint`, terrain sub-passes 1a–1f in `canvas.ts` |
| Face texture | one 64 px sprite per zone, one `CanvasPattern` per paint, period = one cell |
| Neighbours | `destinationCoord` + `MapView.cells.get(coordKey(dst))`; absent = fog-hidden |
| Zones | `landBandIndex(elevation)` → 0–3; `landBandColor(zone)` |
| Relief tones | `reliefToneColours(face)` — step-1 entries feed the coast band |
| Tokens | `TOKENS.color.textMuted` (`#9ca3af`) already clears FR-002's floor |
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
and the shaded case at 1.403 (zone 2, −2), both above 1.2. The trade-off is recorded in
`tasks.md` T-001 and reported as a narrowed requirement.

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

**Decision.** Sub-pass 1f (after 1e's contour diagonals, before 1f city glow) collects the
shared edges of visible land neighbours in different zones. To visit each edge once, only a
tile's E and S sides are tested. Geometry: vertical `(edgeX − 1, y, 1, S)`, horizontal
`(x, edgeY − 1, S, 1)`.

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

`PaintOptions` gains `readonly surface?: boolean`, default `true`. `false` skips 1c2, 1f and
the grain variants (faces revert to the zone texture) and is the control every 018 readback
criterion compares against. Relief stays independently switchable.

### D5 — Determinism

Grain depends on coordinates only; coast on the tile's zone plus "neighbour is present water";
seam on two present land zones. Every bucket is filled one path per colour with colours sorted,
so insertion order cannot change pixels. No clock, no randomness, no new `MapView` field.

### D6 — Performance shape

Grain multiplies the face-pattern set from 4 to 16 (4 zones × 4 offsets), all sprites cached on
the painter; each paint creates 16 patterns and fills one path per variant. The coast pass adds
one neighbour lookup per land side and one fill per (zone, side) colour; the seam adds one
lookup per land tile on two sides and one fill total. No per-cell gradient, pattern or image.
Both figures are measured under Q-P01 and Q-P05 (T-010).

### D7 — Amendments and docs in the same change set

017 spec v1.12 restates FR-005 (A-01), AC-004 (A-02) and AC-003 (A-03); 005's absorbed
`024-FR-013` gains A-04's sentence plus a v1.17 block; `DESIGN.md` § 1.1 (biome-zones, text-muted),
N-6 and § 4.4; `AGENTS.md` table + Current state. 017's relief contract — geometry, ladders,
light rule, floors, fog rules — is untouched.
