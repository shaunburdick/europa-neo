# Terrain relief shading — flat face, per-side bevels (issue #182)

## What changed (v1.9, same branch, PR #204)

This revision replaces the v1.0–v1.8 delta-sign luminance model with the model settled with the product owner over several rounds. The previous approval is unchanged in scope; this is a visual-model revision on the same branch, not a new PR.

- **Flat face.** Sub-pass 1c paints one colour per biome zone (the zone midpoint). The per-tile gradient is retired; the face is never lit. Sub-pass 1e's contour hints stay.
- **A bevel only on a positive drop.** `Δ = ownElevation − neighbourElevation > 0` against a visible land neighbour. Equal heights, a higher neighbour, water, fog-absent and off-board sides paint nothing, so a ledge has one bevel, not a ridge/valley pair.
- **One light at the map's NW corner.** North/west bevels are lit, south/east shaded. Tone depends on the side alone — never on the delta's sign or on which tile is higher.
- **Width and tone step with Δ and saturate.** Width is 4 / 7 / 10 % of the cell for Δ = 1 / 2 / 3+, capped at 10 %; the tone mix toward `reliefHighlight` / `reliefShadow` is 0.74 / 0.79 / 0.84, saturating at Δ3.
- **Geometry.** Each bevel is the mitred trapezoid from spec FR-001. At every grid vertex, ends are gathered from all four surrounding tiles: two or more ends fill each one's cut triangle in its own band colour; one end keeps its taper. That closes collinear seams and perpendicular turns without run lengths.

Files: `packages/console/src/render/relief.ts` (mapping rewritten), `packages/console/src/render/relief-caps.ts` (new pure geometry/cap module), `packages/console/src/render/canvas.ts` (sub-passes 1c/1d), the relief unit/readback/perf suites, `DESIGN.md` §1.1/§3/§4.4 + note N-5, `specs/017-terrain-relief-shading/{spec,plan,tasks}.md` (spec v1.9), `specs/005-client-console/spec.md` v1.14, the player manual and the in-game legend.

## Why

The first implementation encoded the delta's *sign* in luminance and used a continuous fraction anchored at each zone's gradient end. The board read as a lighting diagram rather than a map: a higher neighbour produced a band on a tile that was itself not a ledge, and the gradient face competed with the bevels. The settled model keeps one readable channel: colour tells how high a cell is; a bevel tells where the ground drops; its width tells how far; the NW light tells which face of the step you are looking at. The old contrast arithmetic (Peaks's white cap forcing a sign constant) no longer constrains anything because tone is no longer a delta-sign encoding.

## Performance

`Q-P05` still gates relief's **attributable addition** on the representative 48×48 fixture, with Q-P01's 8 ms budget untouched and the 6.0 ms bound unchanged.

- Measured over four runs: relief-on **4.90 ms**, relief-off **0.70 ms** (flat face is cheaper than the retired gradient), addition **4.05–4.20 ms**, worst **4.20 ms** — **≈30 %** margin under 6.0 ms.
- A naive per-band trapezoid + per-cap triangle path measured **23.7 ms** relief-on. The fix is geometry, not a weaker mapping: capped ends are rectangles, only a lone end keeps a taper (187 of 8,988 ends), and only the 1,515 same-tile corners with two different tones need one square + one triangle.
- Fixture variety is asserted as **250 distinct positive `|Δ|`** (floor 200) and **22 of 24 possible tone colours** (floor 20), with all four zones carrying drops.

## Removed / declined

- The v1.0–v1.8 `reliefTargetLuminance`, `reliefBandColor`, `reliefFraction`, `linearTriple`, `RELIEF_HIGHLIGHT_IS_DOWNHILL`, band-ratio thickness and their tests. Nothing is kept as dead code.
- The per-tile biome gradient in 1c; the zone hue and 1e contours remain.
- Any per-band triangle-heavy render path: it cannot meet the perf gate, and the rectangle-first geometry is geometrically equivalent under the cap rule.
- No options, no new tokens, no new dependency, no engine/protocol change.

## Verification

- `pnpm build` and `pnpm --filter @europa/console typecheck` green.
- `bash scripts/verify.sh` green (tail in the task report).
- `test:unit` 1,045 tests / 65 files, `test:component` relief readback 10 tests, `test:perf` 4 tests. Coverage for render logic remains above the 80 % merge gate.
- Agent-browser smoke against `pnpm host`: real generated terrain at two zoom levels plus a 3× crop of a terraced area under `__screenshots__/`.
- `test:determinism` green, golden hash unchanged (no new view field).

## Disclosures

- The v1.9 model deliberately replaces the spec's v1.0–v1.8 FR-006 arithmetic. The accessibility Decision block stands: elevation is still conveyed visually only, tracked as issue #206.
- Cube-corner handling follows the stated rule literally: at a same-tile corner where both bevels exist, the two cut triangles are filled in their own colours, which splits the shared corner square diagonally. Equal-toned corners need no extra paint; different-toned corners use one square + one triangle to keep the cost bounded.
- `specs/005-client-console/spec.md` moved to v1.14 so its absorbed `024-FR-013` / `018-FR-004` text matches the settled model; no other 005 requirement changed.

Closes #182.
