# PM Handoff: Terrain Relief Shading (#182)

- **Spec**: `specs/017-terrain-relief-shading/spec.md` (**v1.5**, Gate 1 approved 2026-10-16)
- **Plan**: `specs/017-terrain-relief-shading/plan.md` (525 lines, 11 decisions D1–D11)
- **Tasks**: `specs/017-terrain-relief-shading/tasks.md` (13 tasks, T001–T013)
- **Constitution**: `.specify/memory/constitution.md`
- **Repo rules**: `AGENTS.md` (workflow rules 1–8, esp. rule 4 "specs stay truthful")
- **Design contract**: `DESIGN.md` (repo root — spec 012 FR-017)
- **Amended by this work**: `specs/005-client-console/spec.md` (absorbed `024-FR-013`, `018-FR-004`), `DESIGN.md`, `AGENTS.md` table, `packages/console/src/render/palette.ts`, `packages/console/tests/unit/render/palette.test.ts`
- **Branch**: `issue-182-tile-shading` (off `main` at `985cf6b`) — nothing committed or pushed yet
- **Issues**: #182 (this feature) · **#199** (filed follow-up: below-target pipe-indicator contrast)

## Phase

- **Current**: Phase 5 complete (plan + tasks). **Awaiting user approval at Gate 2.**
- **Completed**: spec v1.0 → v1.5 (Gate 1: 3 review passes, all findings applied and verified); plan + tasks written, revised once after Gate 2's first pass.
- **In progress**: Gate 2 user approval.
- **Blocked**: none.
- **Not started**: Phase 6 implementation, Gate 3.

## Decisions

### User decisions (locked — do not reopen)

1. **Edges** — relief only between two *visible land* tiles. Water, borders, fog-hidden/absent neighbours are neutral. Cannot leak hidden elevation (spec 002 zero-leakage).
2. **Passes** — replace the uniform inner shadow (1d) with delta bevels; keep the biome gradient (1c).
3. **Renderer** — Canvas 2D only, no WebGL/3D.
4. **Lane** — Full, spec trimmed hard.
5. **Perf** — extend Q-P01 with a relief-enabled 48×48 fixture under the existing 8 ms budget; no separate statistic.
6. **Docs** — fix *all* diverged `DESIGN.md` terrain figures + the vacuous `palette.test.ts` Peaks assertion in this change set.
7. **Minimap** — unchanged (an exclusion, not a requirement).
8. **Follow-up** — file an issue for the below-target pipe-indicator contrast → **#199**, referenced by the corrected rows so nothing is left ownerless.

### PM / architect decisions (recorded)

9. **Contrast criterion shape** — band-to-band ≥3:1 plus a single constant 1.2:1 floor against a relief-free control. The original per-band "≥3:1 against the tile's own background" is unreachable on Peaks (white caps at ≈1.31:1) and was retired.
10. **Criteria scoped to a per-zone reference fixture** — own elevation selects the zone, so each zone needs its own largest balanced delta pair (80→80/175, 128→128/127, 161→161/94, 209→209/46).
11. **Sign constant is forced, not chosen** — a highlight band at Peaks's reference `|Δ|=46` caps at ≈1.056:1, below the floor; therefore a higher neighbour renders darker. Recorded in spec v1.5 so nobody flips the polarity believing it is free.
12. **`017-FR-###` is unusable** — spec 013 owns an absorbed feature-017 block; specs cite by full path.
13. **Manual edit attribution** — rides on AGENTS.md rule 4 (the sentence is already false), not spec 007 FR-012.
14. **Deltas computed at paint time** — new pure `packages/console/src/render/relief.ts`; no `CellRenderInfo`/view field; neighbour lookup by keyed `Map.get` (never iteration), which is what makes AC-008's insertion-order independence structural.
15. **Relief floor anchor** — the base is the 1c gradient end *for the band's sign* (highlight → light end, shadow → dark end), making the derived ratio a proven lower bound at every pixel of every band. `RELIEF_BAND_T`/`zoneBackgroundLuminance(zone,t)` deleted as a second, drifty model of 1c's geometry.
16. **One measurement allowance**, `0.0045` absolute in relative luminance (8-bit rounding, derived), on the painted band against the model at that band's own control pixel. Both floors asserted at their stated values with **no** allowance. The reviewer's suggested `±0.02` *ratio* allowance was rejected: no single ratio allowance is tight at the Peaks highlight and sufficient at the shadow, and it would sit at 38 % of the binding margin.
17. **No mod-6 sampling formula** — deleted as a second model of sub-pass 1e's step and phase; the control-pixel guard is the contour-freeness proof and fails loudly rather than re-picking a pixel.
18. **The two relief tokens stay** (`reliefHighlight` `#ffffff`, `reliefShadow` `#000000`) with an N-5 note recording that guard G-04 would *not* have required them (FR-009 does) and that the white duplicates `focusRing` coincidentally.
19. **96 px zoom confinement fixture kept** — PM declined the reviewer's cut: the spec's Edge Cases state it and no other task covers it.
20. **A-05 (token-reading test) lands before A-03 (`DESIGN.md`)** — enforced by T011 → T009; the implementer transcribes asserted figures and never hand-computes.

## Notable findings (all pre-code)

- Peaks ships hue 200 / sat 15 / L 80–95, but sub-pass 1c paints the zone **midpoint** (L 88) ramped −15% to L 73, so the light-direction ceiling is ≈1.31:1, not 3:1.
- `palette.test.ts:370` asserts `hslToRgb(220, 8, 60)` — a colour the app never paints. The repo's only Peaks-contrast assertion passes vacuously. Same false "Peaks L=60–78%" in `palette.ts:68–72`.
- `DESIGN.md` has ≥6 diverged terrain rows, incl. `:626`'s "amber 43°" which is `city` (`#fbbf24`), not `pipeFlat` (37.7°).
- G-01/G-02/G-07 have **no runner** (spec 012 defers them) — three criteria cited them and could never go red.
- The minimap cannot fail a relief assertion (`qol/minimap.tsx` has its own painter).
- Recomputed pipe-on-biome contrast is materially worse than documented (uphill ≈1.02–1.17:1); downhill green (161.4°) sits ≈9° from zone 1's hue 170°. → **#199**.

## Next

1. **User approves plan + tasks at Gate 2** (or requests changes).
2. Phase 6: 13 tasks, one domain → **one `modern-architect-engineer` pass**, no orchestration. Order: `T001 → T002 → {T003 [P], T004} → T005 → T006` · `T004 → T007 [P] → T008 → {T009 [P], T010 [P]}` · `T009 → T011` · `{T011, T012 [P]} → T013`.
3. **Gate 3 obligations** (mine, not in tasks.md):
   - Spec `AC-005`'s parenthetical `≈3.7:1` for the Peaks `|Δ|=46` band and the v1.0 Clarifications dark-end `L ≈ 0.4987` need figure-only corrections from T006's *measured* values (the pinned fixture puts that band over the dark half → ≈3.10:1; measured dark-end L ≈ 0.50043). Correction is figure-only — any threshold, criterion, or wording change is a return to the PM, not an implementer edit.
   - Diff challenge on the branch, then PR body: what changed, why, what was removed (the retired 1d fills), what was declined and why (`±0.02` allowance, mod-6 formula, the 96 px cut).
4. Nothing is pushed without explicit instruction.

## User preferences / constraints observed

- Wants the cheapest route that still protects correctness; accepted the lane challenge but kept Full for the contrast criterion.
- Prefers honest docs over quiet divergence — chose the full `DESIGN.md` sweep knowing it exposes below-target contrast numbers.
- Do not relitigate the issue's locked decisions (visuals-only, no engine change, keep the biome bands, continuous magnitude, no WebGL).
- `europa-source/` is SOS-licensed reference only — never copied, never modified.
- Feature branches only; never commit to `main`; conventional commits; no bot co-author trailers.
