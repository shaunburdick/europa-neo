# Tasks: Engine fixes — serialization terrain round-trip + paratroop attack semantics (spec 001 v1.16)

**Branch**: `bug-sweep` (off `main`) | **Date**: 2026-10-11
**Spec**: `specs/001-core-game-engine/spec.md` v1.16 (FR-013, FR-024..FR-026, AC-16..AC-21) — APPROVED (Gate 1 PASS)
**Plan**: `specs/001-core-game-engine/plan.md` — APPROVED (Gate 2 PASS; findings 8a–8d folded in below)
**Issues**: #136 (serialization), #132 (paratroop attack semantics)
**Status**: Gate 3 PASS (2026-10-11; the five non-blocking findings 15a–15e are folded into the task text above). **Phase 6 COMPLETE — all 12 tasks done**; verification record in T-011/T-012 below.

> Replaces the completed v1.9 (issue #50) task list, per this directory's convention that `plan.md`/`tasks.md` carry the current amendment (superseded copy preserved in git history, same ruling as Gate-2 finding 14).

---

## Phase 1 — Shared attrition helper (foundation)

Depends on: nothing. Parallel-safe with Phase 2.

- [x] **T-001**: Create `packages/engine/src/resolution/attrition.ts` with the pure roles-agnostic helper `resolveTwoWayAttrition({ attackerOwner, attackerTotal, defenderOwner, defenderTotal, cellCapacity }) → { winnerOwner, winnerCount, damage }` per plan §3 and `data-model.md` §11 (damage = `min(N, G)`; winner clamped to `cellCapacity`; equal remnants → `winnerOwner 0`). Integer-only (`Math.min`, `>>> 0`), allocates nothing beyond the return object (SC-006). Land it with its new unit suite `packages/engine/tests/unit/attrition.test.ts` (plan P-8): capacity boundary cap−1/cap/cap+1, tie, zero totals.
  **Traces**: FR-013, FR-011 (v1.5 clamping), spec.md:392; data-model §11; plan §5 step 2.

---

## Phase 2 — Serialization terrain round-trip (wire v2)

Depends on: nothing (parallel-safe with Phase 1).

- [x] **T-002**: `packages/engine/src/serialize.ts` — bump `SERIALIZE_FORMAT_VERSION` 1 → 2 (`:120`; `ENGINE_API_VERSION` stays `'0.2.0'`); write 10-byte cell records appending `elevation` + `terrainFlag` after `cityOwners` (`:563-571`) and update `cellsBlockLen = n * 10` (`:498`); extend the module-header layout doc and format-version history (`:31-60`, `:116-119`). **Strict encode**: throw `EngineSerializationError` on elevation outside `0..255`, terrain not `'land' | 'water'`, **and on `world.board.cells[i] === undefined`**, matching the existing encode style (`serialize.ts:476-477`, `:537-538`, `validateCellFields` `:588-615`) so a malformed world yields the contract error type, not a TypeError **(Gate-2 finding 8b)**. **Decode**: read both bytes inside the existing cell loop (`:852-878`), reject `terrainFlag > 1` with `EngineFormatError`, build `board.cells` with real values, and delete the fabricated `cells` array plus its stale "feature 003's responsibility" comment from the board-construction block (`:884-898`) — keep `board.cities`, `width`, and `height`, which decode still builds from the payload **(Gate-3 nit 15d: do not over-delete)**.
  **Traces**: FR-024, FR-025, FR-026; AC-17, AC-18; plan §5 step 1; data-model §10.

- [x] **T-003**: Extend `packages/engine/tests/unit/serialize.test.ts` — board round-trip asserting exact `cells` equality (elevation + terrain, including water) after `deserializeWorld(serializeWorld(w))` (AC-17); encode-rejection cases for elevation ∉ `[0,255]`, unknown terrain, and a missing cell entry **(8b guard)**; decode-rejection `terrainFlag > 1` (AC-18); extend the hand-built payload helpers from 8- to 10-byte cell records (`buildPayload` `:235`, `cellsWithFirstCell` `:292-295`). Existing offset-based tests stay valid (append-not-interleave) — keep them green (plan P-1/P-2).
  **Traces**: FR-026, AC-17, AC-18. Depends on T-002.

---

## Phase 3 — Paratroop attack semantics (`resolveTwoWayAttrition`)

Depends on Phase 1 (T-001). Order inside the phase matters — see T-004 → T-005.

- [x] **T-004**: Refactor the total-force two-way path in `packages/engine/src/resolution/combat.ts` (`:175-253`) to call `resolveTwoWayAttrition` — behavior-preserving, **no signature change**; keep role identification (garrison-is-defender, `:189-207`) and event-payload labelling (lower owner byte, `:212-214`) exactly as-is (spec v1.4 / plan §2 decision 4 / Gate-1 finding 7). `packages/engine/tests/unit/combat.test.ts` must stay green before proceeding (plan §8 refactor-risk note, P-9).
  **Traces**: FR-008, AC-19 (flow side), Gate-1 finding 7. Depends on T-001.

- [x] **T-005**: `packages/engine/src/resolution/paratroop.ts` — in the apply branch (`:184-200`), branch on target state at that moment: empty/neutral and same-owner keep current behavior; enemy-held calls `resolveTwoWayAttrition({ attackerOwner: playerIndex + 1, attackerTotal: N, defenderOwner: targetOwner, defenderTotal: G, cellCapacity })` and writes counts/owners only per the data-model §11 transition table (owner write **suppressed** when `G > N` — the garrison survives; `0` on tie (`N = G` → 0/0, which is NOT a surviving garrison); winner `min(N − G, cellCapacity)` when `N > G`) **(Gate-3 nit 15b)**; push a `CombatEvent` (`attacker` = landing player, `defender` = garrison owner, totals N vs G, losses = damage) via `pushCombatEvent` (`packages/engine/src/events.ts:61`); pipes cleared in every outcome (`:199`, already unconditional). Update the module doc (`:60-61` — landing on enemy cells is an attack; `events` no longer "currently empty").
  **Traces**: FR-013, AC-19, AC-20, AC-21; data-model §11; plan §5 step 4. Depends on T-001; sequence after T-004 per plan §8.

- [x] **T-006**: `packages/engine/src/tick.ts` — merge `paraResult.events.combat` into `events.combat` after Phase 2, **inside the existing block-scoped `if (paratroopOrders.length > 0)` block** (`:165-178`; `paraResult` is block-scoped) **(Gate-2 finding 8c)**, using the same spread pattern as the combat/capture phases (`:250-253`, `:258-261`). Errors merging (`:175-177`) and the appliedOrders gate (`:214-219`) need no change.
  **Traces**: FR-013, data-model §11 (event merge row), FR-023. Depends on T-005.

- [x] **T-007**: Enemy-landing test coverage in `packages/engine/tests/unit/paratroop.test.ts` (plan P-3..P-7): win (`N > G`, occupant clamped to capacity), loss (**owner unchanged**, pipes cleared), tie (`N = G` → 0/0) row-by-row against data-model §11 (AC-19); enemy **city** targets — win transfers the city via the Phase-6 capture phase same tick, loss leaves it (AC-20); `CombatEvent` field assertions incl. `winner: 'tie'` (AC-21); sequential double-landing on one target (FR-017); **a losing enemy landing appears in `appliedOrders`, not `errors`**, full `tick()` pipeline (FR-013 + FR-023; Gate-1 finding 6 / assumption A2). Plus extend `packages/engine/tests/quickstart/paratroop-gun.test.ts` (Q-008, plan P-11) with one headless enemy-landing scenario (cost 2N paid, attrition, pipes cleared, event emitted).
  **Traces**: AC-19, AC-20, AC-21, US4 AC-5, FR-017, FR-023. Depends on T-005, T-006.

---

## Phase 4 — Fixture regeneration, hash pins, delta-doc hygiene

Depends on Phase 2 (payload change lands first).

- [x] **T-008**: Regenerate the pinned replay hash after the v2 payload changes `hashWorld` output: `tsx packages/engine/scripts/update.ts packages/engine/tests/fixtures/sample-2p-match.json` (expect `Updated 0aafe88f → <new>`; `engineVersion: "0.2.0"` stays). Refresh the embedded example hash at `packages/engine/README.md:160` in the same change set (**Gate-2 finding 8a** — stale docs are bugs). Reword `plan.md` §7 P-12, §5 step 8, and §8's hash-fixture risk to correct the mis-attribution (**8a**): **no test consumes `sample-2p-match.json`** — the real determinism net is `packages/engine/tests/replay/replay.test.ts`'s runtime-computed hashes; the fixture pin is sample/doc hygiene. No other hash pins exist besides the three `0aafe88f` occurrences in the tree — the fixture (`sample-2p-match.json:26`), the README example (`packages/engine/README.md:160`), and the quickstart Q-014 expect-line (`specs/001-core-game-engine/quickstart.md:483`, which names the pre-v2 hash only as the "before" side of the regeneration output) — everything else is a runtime run-to-run comparison **(Gate-3 nit 15e)**.
  **Traces**: FR-026, SC-001; plan §5 step 8, §7 P-12. Depends on T-002, T-003.

- [x] **T-009** [P]: Remove the dead contract-mirror references (**Gate-2 finding 8d**) — `specs/001-core-game-engine/data-model.md:32` (§1 "contract mirrors … change together") and `specs/001-core-game-engine/research.md:73-77` (§5 contracts-drift description of `specs/.../contracts/engine-types.ts` and a test that no longer exist): one-line corrections pointing at `packages/engine/src/contracts/` as the only contract surface (`contracts/README.md`). Both files are already amended by this change set, so the fix is free.
  **Traces**: plan §6 step 6; AGENTS.md rule 4 (stale specs are bugs). Parallel-safe with T-008.

---

## Phase 5 — Contract docs and manual gate

Depends on Phases 2–3 (documents what shipped).

- [x] **T-010**: Documentation-only contract updates — JSDoc in `packages/engine/src/contracts/engine-api.ts` for `serializeWorld`/`deserializeWorld`/`hashWorld` (lossless round-trip + two-version boundary guarantees; no signature change), then verify `specs/001-core-game-engine/contracts/README.md`'s serialization section still matches the shipped wire format (it already describes v2 — confirm, don't rewrite).
  **Traces**: FR-024, FR-026; plan §5 step 6.

- [x] **T-011**: **Manual gate — verification task; "no edit expected" was the Gate-1 ruling, superseded by the 2026-10-13 outcome below.** Re-verify the player-facing paratroop numbers against v1.16: `docs/manual/src/pages/special-weapons.mdx:29` ("those 10 troops immediately fight whatever is there"), the cost/landing rows (`special-weapons.mdx:20`, `docs/manual/src/pages/numbers.mdx:52-53` — cost 20, land 10). **Gate-1 finding 6 ruled no manual change is mandated**: the manual already describes attack semantics, no page claims landing flips ownership, and this change set alters no player-facing number (N = 10, 2N = 20, capacity 30 unchanged) — the code moves to match the manual, not vice versa. **Add a `docs/manual/` edit ONLY if this verification finds a contradiction or a missing number** (then update in the same change set per spec 007 FR-012); record the verification outcome in the PR/task notes either way. Sub-check (tightened per Gate-3 nit 15c — must not pass vacuously): confirm spec.md v1.16 carries the resolution-point + composition rationale (the "Resolution point" and "Shared combat model" bullets under Clarifications v1.16 — add a sentence only if one is missing), **and** confirm `plan.md` §2 decision 3 remains the accepted durable record of the two Phase-5 rejection reasons (a Phase-3 gun could destroy the garrison first, leaving committed-only troops that never materialize; landed troops would double-count in the Phase-5 pre-flow snapshot). The check passes only if BOTH the spec bullets and the plan.md reasons are present — no new ADR file.
  **Outcome (2026-10-11)**: manual re-verified — `special-weapons.mdx:29` documents the attack semantics ("those 10 troops immediately fight whatever is there"); the cost/landing rows (20 cost / 10 land) are unchanged by v1.16; a grep of all `docs/manual/src/pages/` finds no page claiming a landing flips ownership → no contradiction found. Sub-check: spec.md v1.16 carries the "Resolution point" and "Shared combat model" bullets, and `plan.md` §2 decision 3 carries both Phase-5 rejection reasons → satisfied (no ADR file needed).
  **Outcome (2026-10-13, PR #186 review)**: the reviewer overruled the "no manual change is mandated" verdict — verifying that existing prose is still accurate does not discharge spec 007 FR-012 / AGENTS.md rule 4 when the shipped behavior itself changed (an enemy landing now resolves an attack instead of replacing ownership). A short player-facing clarification WAS added to `docs/manual/src/pages/special-weapons.mdx` in this change set: surviving defenders keep the cell and any city, an equal-force landing is a mutual annihilation that leaves the cell neutral, and a city transfers only via the capture phase after the garrison is eliminated. No other manual page needed a change (no page elsewhere claims a landing flips ownership or states a garrison-vs-landing rule).
  **Traces**: Gate-1 finding 6, plan §5 step 9 + §2 decision 3, spec 007 FR-012; Gate-2 "ADR-worthy".

---

## Phase 6 — Verification

Depends on all previous phases.

- [x] **T-012**: Run `pnpm verify:changed` (or `bash scripts/verify-changed.sh`) iteratively during Phases 1–5, then the full gate `pnpm verify` (AGENTS.md rule 6) before any push. Confirm explicitly: engine coverage ≥ 80% (`packages/engine/vitest.config.ts:14-19`, SC-003); retention suites green — `tests/serialization-conformance.test.ts` (AC-16/AC-18, format-version mutation at byte `3 + ENGINE_API_VERSION.length`, no-hardcoded-semver scan), `tests/unit/combat.test.ts` (P-9 extraction regression), `tests/replay/replay.test.ts` + regenerated fixture (P-12), `tests/determinism.test.ts` (P-13, SC-001); lint/format/typecheck/build across the monorepo. Nothing is committed in this phase — leave the working tree uncommitted pending Gate 3 / user approval.
  **Outcome (2026-10-11)**: `pnpm verify:changed` green during implementation; the four named retention suites green explicitly (conformance 7/7, combat 36/36, replay 94/94, determinism 3/3); engine coverage 96.55% statements / 87.16% branches / 99.13% functions / 96.42% lines (≥80 gate, SC-003); fixture regenerated `0aafe88f → 82f73922` and re-checked via `scripts/run.ts` (`PASS 1 ticks`); full `bash scripts/verify.sh` **PASSED** (all 12 phases: build, lint, format, typecheck, console browser/E2E, all package suites, privacy + spec-consolidation guards). Commits follow only after this green gate, per the PM's post-Gate-3 instruction.
  **Traces**: SC-001, SC-003, AC-16..AC-21; AGENTS.md rules 2, 6, 7.

---

## Dependency map

```
Phase 1: T-001 ──────────────┐            Phase 2: T-002 → T-003 ─┐
                             ├─→ Phase 3: T-004 → T-005 → T-006 → T-007
                             ┘                                     │
                                          Phase 4: T-008, T-009[P] ←┘
                                          Phase 5: T-010, T-011
                                          Phase 6: T-012 (all)
```

**Parallel-safe**: T-001 ∥ Phase 2 (T-002 → T-003); T-009 ∥ T-008; T-010 ∥ T-011.

## Gate-2 findings → tasks

| Finding | Task |
| --- | --- |
| 8a — P-12 fixture mis-attribution + missed `packages/engine/README.md:160` hash pin | T-008 (fixture regen + README refresh + plan.md reword) |
| 8b — encode must guard `cells[i] === undefined` in the existing encode style | T-002 (guard) + T-003 (test) |
| 8c — `tick.ts` merge must land inside the block-scoped `if` | T-006 |
| 8d — dead contract-mirror refs at `data-model.md:32`, `research.md:73-77` | T-009 |

**Total**: 12 tasks across 6 phases.
