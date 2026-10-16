# PM Handoff: Terrain relief shading (issue #182)

- **Spec**: `specs/017-terrain-relief-shading/spec.md` — **v1.7**, Gate 1 approved (3 review passes). 11 FR / 2 NFR / 11 AC / 5 amendments (A-01…A-05).
- **Plan / Tasks**: `specs/017-terrain-relief-shading/plan.md` (D1–D11, stamped v1.7) · `tasks.md` (T001–T013, `## Progress`).
- **Constitution**: `.specify/memory/constitution.md`. Working rules: `AGENTS.md`.
- **Branch**: `issue-182-tile-shading`, off `main` at `985cf6b`. **Nothing pushed; no upstream.**
- **Phase**: Gate 3 complete (HOLD findings remediated) · **Next: user approval to push + open the PR**.

## Completed

- **Spec** v1.0→v1.7: v1.6 applied four text corrections implementation proved necessary (unsatisfiable AC-003 clause, false `|Δ|=1` justification, two stale figures, A-05 extended to `palette.ts:12–15`); v1.7 re-pinned NFR-001.
- **Groups A/B/C** (T001–T013): two additive tokens (`reliefHighlight` `#ffffff`, `reliefShadow` `#000000`), new pure `src/render/relief.ts`, sub-pass 1d rewritten, `relief.test.tsx` (8 readback tests + AC-008 + confinement), retired the inner-shadow assertion, `palette.test.ts` token-reading A-03 block + Peaks fix, `DESIGN.md` sweep + N-5 + § 4.4, spec 005 v1.13 block, `AGENTS.md`, manual + legend, `tasks.md` Progress.
- **T008 perf**: Q-P05 re-pinned. Gate is now relief's **attributable addition** (relief-on − relief-off, min-of-round-medians, identical 48×48 all-land fixture) at `RELIEF_ADDITION_BUDGET_MS = 6` with `readPaintBudgetFactor()`; measured **3.60–4.30 ms** over ten runs (worst 4.30, ≈39% margin). Fixture adopted is the representative `(x*97 + y*193 + x²*29 + y²*61 + xy*113) % 256` (250 distinct `|Δ|`, 822 colours); floors `≥200` / `≥500`. Q-P01 untouched (8 ms).
- **Gate 3**: HOLD → remediated. H1 `DESIGN.md` § 4.4 marker lines re-pinned (233/332/365/422) + rot note; H2 pinned fixture-variety floors; M1 corner-hash prose downgraded to a non-reproducible throwaway probe; M2 005 citation fixed (the reviewer's "005 has no v1.7 block" was wrong — it has its own v1.7 consolidation block, so the citation points there); L1/L4/L5/L6 applied. All suites + `verify.sh` green.

## Decisions (rationale in one line each)

1. **Full lane, spec trimmed hard** — the feature's real difficulty is contrast arithmetic, a specification problem.
2. **Contrast**: band-to-band ≥3:1 plus one constant 1.2:1 floor vs a relief-free control; the original per-band "≥3:1 vs the tile's own background" is unreachable on Peaks (white caps at ≈1.31:1). Criteria scoped per zone to each zone's reference `|Δ|`.
3. **Sign forced**: a higher neighbour renders darker — a highlight at Peaks `|Δ|=46` caps at ≈1.056:1, below the floor.
4. **Deltas computed at paint time** in a pure `relief.ts`; no new view field; anchors = the 1c gradient end for the band's sign.
5. **One measurement allowance** `0.0045` absolute relative-luminance (8-bit rounding); both floors asserted with none. Reviewer's `±0.02` ratio allowance **rejected**.
6. **No mod-6 sampling formula**; the control-pixel guard is the contour-freeness proof and fails loudly.
7. **Perf gate re-pinned twice, both on measurement not plan**: absolute 8 ms on a degenerate fixture → relief's attributable addition on a representative one. The 40.4 ms first reading was the *decorated* board with relief **off** (units/pipes/cities), not relief, and the painter redesign (whole-sub-pass colour batching, 9,024 `fillRect` → 822 `fill`) brought the representative fixture from ≈8.0 ms to the addition basis above.
8. **Corner pixels may move** with colour batching — deterministic, confined to same-tile `t×t` corners, no asserted pixel moved; the pre/post hashes are a throwaway probe and are not claimed as reproducible.
9. **#199 filed** for the below-target pipe-indicator contrast; corrected `DESIGN.md` rows annotate it rather than fixing it here.
10. **Two unrequested-but-relevant fixes accepted**: `palette.ts:12–15` stale hue families; the outline row's "≥3:1 against all dark biomes" really measures 2.91:1 at Rocky Outcrops' midpoint.

## Next

1. **User approval to push** `issue-182-tile-shading` and open the PR (body at `specs/017-terrain-relief-shading/pr-body.md`). Nothing is pushed yet.
2. If approved: run `bash scripts/verify.sh` immediately before pushing (the husky pre-push hook runs `verify:changed` anyway).
3. After review/merge: `#199` remains open (pipe-indicator contrast) — deliberately not in this change set.

## User preferences

- Visuals only: no engine, flow, or pipe-slope change; biome hue bands stay; relief layered on top; magnitude continuous and proportional to raw elevation delta, no banding.
- Relief only between two **visible land** tiles; water, borders, and fog-hidden/absent neighbours neutral — never reveal hidden elevation.
- Canvas 2D only. Minimap unchanged. Docs ride in the same change set. Nothing pushed without explicit instruction.
