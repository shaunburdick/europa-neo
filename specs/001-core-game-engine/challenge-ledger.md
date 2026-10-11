# Challenge Ledger — specs/001-core-game-engine

Decisions ruled at spec-kit gates. Decisions ruled DEFENDED are precedent for later
gates; reopen only with new evidence, named in the row.

## Gate 1 — Specify (v1.16 amendment, issues #136/#132) — 2026-10-11

Reviewer: opposing counsel (automated). Artifacts judged: `spec.md` v1.16 (FR-013
rewrite, FR-024/025/026, AC-16..AC-21, Clarifications v1.16), `data-model.md` §10–§11,
`contracts/README.md` serialization section, `plan-fix-engine-serialization-paratroop.md`
(Phase 4 input draft). All source citations verified in the working tree.

Size sanity (Gate 1 lane check): amendment ≈ 4 FRs (3 new + 1 rewritten), 6 ACs,
~40 lines clarifications + ~90 lines data-model; governed code change ≈ serialize.ts
(+1 new module, ~50 lines), paratroop branch, tests + 1 fixture. Ratio is sane for a
repo whose constitution makes specs-as-documentation binding. Smallest change satisfying
the problem = 2 appended bytes/cell + format bump + paratroop enemy branch; FR-024/FR-025
pin already-shipped behavior, which is justified because the issues' own acceptance
criteria demand those guarantees be permanent regression guards (AC-16, AC-18), not
because the code needs it.

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 1 | Author's claim that 2 of #136's 3 evidence items were already fixed on `main` (issue #74) | High (scoping of the whole serialization half) | DEFENDED | Verified against source: `importVersion()` is gone — `readEngineApiVersion()` returns `ENGINE_API_VERSION` (`packages/engine/src/serialize.ts:256-262`, imported at :99; constant `'0.2.0'` at `packages/core/src/types.ts:43`); decode strictly validates `boardSize ≥ 8` (`serialize.ts:701-704`; `MIN_BOARD_SIZE = 8` at `packages/engine/src/create.ts:41`), `playerCount` 2–4 (:705-710), city coords + duplicates (:827-841), owner bytes (:832-836, :854-858), pipe masks (:861-865), reserves (:866-870), trailing bytes (:880-882), ID-table canonical order (:746-754); conformance scan for hardcoded semver literals exists (`packages/engine/tests/serialization-conformance.test.ts:65-75`) and a format-version mutation test exists (:101-110). The third item is genuinely open: encode writes no terrain (`serialize.ts:563-571`) and decode fabricates an all-land elevation-0 board (:884-898). Spec v1.16 states exactly this (spec.md:380) — neither overstates nor understates. | None. |
| 2 | Wire shape: append `elevation` u8 + `terrainFlag` u8 per cell, `SERIALIZE_FORMAT_VERSION` 1→2, `ENGINE_API_VERSION` unchanged | High (wire format, replays, hash fixtures) | DEFENDED | Lossless: all other `World` state already round-trips (`serialize.ts:376-576`; `MatchConfig` has exactly the 5 serialized fields — `packages/core/src/types.ts:141-161`). Elevation is provably uint8: `createWorld` enforces `[0, 255]` (`create.ts:106-110`, `MAX_ELEVATION = 255` at :42), terrain invariant INV-3 (`packages/terrain/src/validate.ts:14`), fbm normalized to `[0,255]` (`packages/terrain/src/fbm.ts:95-96`). Terrain is NOT derivable from elevation — water ties at the threshold elevation are split by sorted-index order (`packages/terrain/src/water.ts:31-42, 65-66`), so both bytes are required; spec.md:382 states this correctly. `ENGINE_API_VERSION` staying at 0.2.0 is consistent with the module's own two-version boundary (`serialize.ts:10-24`) and the layout version guards the break. Hash/fixture impact correctly scoped: `finalStateHash: "0aafe88f"` pinned at `packages/engine/tests/fixtures/sample-2p-match.json:26`; the `update` path exists at `packages/engine/scripts/update.ts`. data-model §10 layout matches the decision byte-for-byte. | Non-blocking: encode does not verify `cells[i]` is row-major (`x = i % w`); row-major is a documented type invariant (`packages/core/src/types.ts:133`) and every engine consumer indexes `cells[y*w+x]`, so this is not a serialization-introduced gap. Optional encode check only. |
| 3 | FR-013 attack semantics pinned testably: (a) which combat math, (b) attacker-loses outcome, (c) `CombatEvent` actor labelling, (d) FR-008/capture interaction | High (customer-visible gameplay; binding owner decision) | DEFENDED | (a) "the same 1:1 attrition math as FR-008" (spec.md:127), verified against `packages/engine/src/resolution/combat.ts:209-240` (`damage = min`, capacity clamp, tie→owner 0); shared helper `resolveTwoWayAttrition` pinned in data-model §11. (b) garrison survives → owner unchanged, 2N already spent, landed troops lost, pipes cleared — pinned in FR-013 body, transition table (data-model §11), AC-19, edge case spec.md:106. (c) `attacker` = landing player always, explicitly contrasted with the flow-combat convention (spec.md:397); `CombatEvent.winner: PlayerId | 'tie'` already supports ties (`packages/engine/src/contracts/engine-types.ts:245`). (d) Phase-2 resolution composes because the pre-flow snapshot is taken after Phase 2/3 — verified in current code (`packages/engine/src/tick.ts:221-226`, combat at :234-246); capture stays Phase 6 and a neutral occupant never captures (`packages/engine/src/resolution/capture.ts:69-93`), so the N=G annihilation case leaves the city put, as spec.md:402 says. US4 AC-5, edge case, and AC-19/20/21 are mutually consistent and implementation-independent (testable headlessly). | DEFERRED (low risk): whether a losing enemy-landing order lands in `appliedOrders` (FR-023) is derivable but never stated — data-model §11 lists `errors` only for water/out-of-bounds, so a losing landing resolves as applied. Verify with one test asserting `appliedOrders` contains a losing enemy landing. One sentence in FR-013 would close it. |
| 4 | Traceability: every issue acceptance criterion → FR/AC | Med | DEFENDED | #136 AC1→AC-16/FR-024; AC2→AC-17/FR-026; AC3→AC-18/FR-025; AC4→AC-16+AC-17 test additions. #132 AC1→FR-013 (recorded in the requirements body, in place — no superseded FR-013 text remains standing); AC2→AC-20; AC3→AC-19. #132 dependency I-07 ("shared combat model") is self-satisfied by extracting the attrition helper in this change set. | Non-blocking: confirm I-07 has no conflicting landed/in-flight work. |
| 5 | Constitution / AGENTS.md compliance | High | DEFENDED | Determinism: integer-only math, sequential landings in existing sorted order, no RNG/clock (spec.md:391; plan §5); coverage: new suites named per AC (AC-17/18/19/20/21), SC-003 unchanged; simplicity: one attrition implementation replaces two divergent ones (net simplification); tunables stay in `ENGINE_CONSTANTS` (`paratroopCost`, `cellCapacity`); no `europa-source/` copying. | Non-blocking: spec.md:392 names a planned file/function (`resolution/attrition.ts`, `resolveTwoWayAttrition`) — a "how" leak in the spec body, consistent with this spec's precedent (`committedFlowTally`, `flowRateForDelta`) and the behavior is stated independently of the helper; acceptable, flagged for awareness. |
| 6 | Manual (spec 007 FR-012 gate): does `docs/manual/src/pages/special-weapons.mdx` contradict amended FR-013? | Med | DEFENDED (no manual change strictly required) | `special-weapons.mdx:29` already documents "Landing on an enemy-held cell also means those 10 troops immediately fight whatever is there" — i.e. the manual describes the attack semantics this fix implements; no manual page claims landing flips ownership (grep of all capture references). The change set makes code match the manual, not vice versa, so AGENTS.md rule 4 imposes no mandatory edit. | Plan step 9 (post-implementation numeric re-verify + optional one-liner) is the right, proportionate follow-up. |
| 7 | Gate-1 size/scope: is the amendment materially more than the problem requires? | Med (gate-blocking if over-large) | DEFENDED | See size-sanity note above. The only content beyond the minimal fix is the pinning of already-shipped serialization guarantees (FR-024/FR-025) — demanded verbatim by issue #136's acceptance criteria as regression guards, cost already paid by the existing conformance suite. Nothing else is gold-plated; every AC traces to an issue or an FR. | None. |

### Assumptions to verify (non-blocking)

- A1: Issue #132's dependency I-07 (shared combat model) has no conflicting scope —
  the plan extracts the helper itself in this change set.
- A2: A losing enemy-landing paratroop order appears in `appliedOrders`, not `errors`
  (FR-023 + data-model §11 imply it; verify with a test).

### Notes for Gate 2 (Plan)

- plan §4 says flow combat uses a "lower owner byte" labelling convention; the spec's
  v1.4 ruling (spec.md:204-206) is "garrison owner is defender, committed-flow
  contributors are attackers". Reconcile the wording before implementation; behavior
  spec is unaffected.
- plan §8's "replay CLI `update` path" verified to exist (`packages/engine/scripts/update.ts`).

### Gate verdict: PASS

Every high-risk decision is DEFENDED; one low-risk DEFERRED with a named verification
(A2); no constitution conflicts; no over-scoping. Both issues' acceptance criteria are
traceable to testable ACs; the author's already-fixed claim was verified true against
source, so the spec's scope is correctly narrowed to the terrain round-trip plus the
paratroop enemy-landing branch.

## Gate 2 — Plan (v1.16 amendment, issues #136/#132) — 2026-10-11

Reviewer: opposing counsel (automated). Artifact judged: `plan.md` (Phase 4, replaces
the earlier draft), with `research.md` §9, `data-model.md` §10/§11/§6-step-5,
`contracts/README.md`, `quickstart.md` §6, and the FR-013 append at `spec.md:127` as
linked context. Round 1 of 2. Every file path, signature, constant, and line number
the plan cites was re-verified against the working tree; Gate-1 DEFENDED decisions
were carried forward and not reopened (no new evidence undermining any of them).

Size sanity: plan ≈123 lines governing ≈1 new ~40-line module + ~40 lines of
serialize.ts edits + a ~30-line paratroop branch + a 5-line tick.ts event merge +
tests + 1 fixture regeneration. Smallest change satisfying both issues = exactly
§5's enumeration; nothing outside it was found. Ratio sane.

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 8 | Every technical choice in the plan traces to spec v1.16 / an issue and all source citations are accurate | High | DEFENDED | Re-verified verbatim: `resolveCombat` signature `combat.ts:86-96` (incl. `registry` param the old data-model §4 omitted); two-way path `:175-253` (damage=min `:210`, clamp/tie `:228-240`, roles `:189-207`, lower-byte payload labelling `:212-214`); `resolveTwoWayAttrition` absent from the tree (grep `packages/`); `SERIALIZE_FORMAT_VERSION = 1` `serialize.ts:120`; `ENGINE_API_VERSION '0.2.0'` `packages/core/src/types.ts:43`; 8-byte cell record `serialize.ts:563-571`, `cellsBlockLen = n * 8` `:498`, size assertion `:573-575`; decode cell loop `:852-878`, all-land fabrication `:884-898`; `cellCapacity: 30` `flow-rate.ts:122`, `paratroopCost: 10` `:137`; paratroop cost `:93-94`, apply branch `:184-200`, pipes `:199`, success push `:200`, doc `:60-61`; tick.ts `:133`, `:156-163`, `:175-177`, `:214-219`, `:221-226`, `:234-248`, `:250-253`, `:258-261`; `capture.ts:69-93`/`:76-78`; `events.ts:61`; `create.ts:41`/`:42`/`:106-110`; `core/types.ts:133`/`:141-161`; thresholds `vitest.config.ts:14-19`; fixture pin `sample-2p-match.json:26` + `engineVersion "0.2.0"` `:27`; `scripts/update.ts` verified to replay and rewrite in place; conformance `:65-75`/`:103`; test helpers `serialize.test.ts:269`/`:295`; manual `special-weapons.mdx:29`; spec-dir contract mirrors and contracts-drift test confirmed gone (plan step 6's note true). | Non-blocking findings 8a/8c/8d below. |
| 9 | Wire format v2 is complete — no computation/encoding/decoding/validation site of the cell record size is missed; no silent mis-framing path | High (wire format) | DEFENDED | Encode has exactly one size computation (`serialize.ts:498`, defended by the `p !== total` assertion `:573-575`); decode streams through the bounds-checked `PayloadReader` with a trailing-bytes check (`:880-882`), so a v1 payload fails the format byte and a wrong-length cell block fails truncation/trailing checks — mis-framing cannot be silent. Both test helpers hardcoding the record size are cited by the plan (P-1); no absolute cell-offset assertions exist in `serialize.test.ts` (grep), so append-not-interleave keeps every existing test valid. No raw-byte payload consumers exist outside the engine's own tests (grep: `serializeWorld`/`deserializeWorld` referenced only by engine tests, replay scripts, and the contract declaration). | Non-blocking: see 8b (missing-cell guard at encode). |
| 10 | Phase-2 in-resolver landing combat + shared `resolveTwoWayAttrition` extraction; Phase-5 composition via the pre-flow snapshot | High (gameplay correctness, binding owner decision) | DEFENDED | The plan's step sequence produces every row of data-model §11: win → `min(N−G, cap)` + owner write; loss → `G−N`, owner write suppressed; tie → 0/0; neutral/same-owner unchanged; pipes unconditional (`:199`); cities via Phase 6 only, and `capture.ts:76-78` confirms a neutral occupant never captures so the N=G row leaves the city put; sequential same-target landings resolve against accumulated arrays inside `resolveParatroop` (deterministic, `tick.ts:133` sort). Snapshot-timing claim verified true in code: the pre-flow snapshot (`tick.ts:225-226`) runs after Phase 2 (151-178) and Phase 3 (180-200). Helper extraction is roles-agnostic and behavior-preserving for flow combat (math at `:210`/`:228-240` is a pure function of four numbers + cap). | Non-blocking: implementer note — step 5's event merge must land inside the `if (paratroopOrders.length > 0)` block (`tick.ts:165-178`, `paraResult` is block-scoped). |
| 11 | Determinism & constitution compliance of the proposed code shape | High | DEFENDED | Integer-only (`Math.min`, `>>> 0`), no RNG/wall-clock, sequential landings in existing sorted order, tunables (`cellCapacity`, `paratroopCost`) at the single constants location (`packages/core/src/flow-rate.ts`), format-version constant beside its documented home, no allocations beyond the return object in the helper (SC-006), no `europa-source/` code. Coverage thresholds (`vitest.config.ts:14-19`) hold via P-1..P-13 without padding; every new branch (encode terrain validation, decode `terrainFlag > 1`, paratroop enemy branch, attrition helper edges) is directly exercised. | None. |
| 12 | Gate-1 findings 6 and 7 genuinely closed by the architect | Med | DEFENDED | Finding 6: FR-013's appliedOrders sentence is present at `spec.md:127`, the matching row at `data-model.md:241`, the cited code path is correct (`tick.ts:214-219` gates deferred orders by success index; `paratroop.ts:200` pushes success unconditionally of combat outcome), and P-7 pins it. Finding 7: plan §2 decision 4 + `data-model.md:129` correctly separate role identification (garrison-is-defender, `combat.ts:189-207`, per `spec.md:204-206`) from event-payload labelling (lower owner byte, `combat.ts:212-214`), with no behavior change — consistent with `spec.md:397`. | None. |
| 13 | Fixture regeneration approach and the "no other hash pins" audit | Med | DEFENDED with correction | Regeneration is mandated (FR-026) and the mechanism is real (`scripts/update.ts` replays from seed+terrainSettings and rewrites `finalStateHash`, printing `Updated old → new`; fixture fields preserved). BUT the audit is incomplete in two ways (finding 8a). | See finding 8a — reword P-12; refresh `packages/engine/README.md:160`. |
| 14 | Deleting the superseded plans rather than archiving them (old v1.9 issue-#50 plan, planner draft `plan-fix-engine-serialization-paratroop.md`) | Low | DEFENDED (acceptable) | `plan.md` is this directory's current-artifact carrier by convention; git history retains the prior versions; the prior ledger records every decision from the deleted draft, so the audit trail is preserved in-repo. Glob confirms only the canonical artifacts remain in the feature dir. | None. |

### Findings (all non-blocking)

- **8a (test-plan accuracy)**: P-12 (`plan.md:108`) attributes the fixture pin guard to
  `tests/replay/replay.test.ts`, but **no test anywhere consumes
  `packages/engine/tests/fixtures/sample-2p-match.json`** (zero references in
  `packages/`; replay/CLI tests build their own runtime or tmp fixtures). The hash-pin
  audit (`plan.md:80`, `:115`) also misses `packages/engine/README.md:160`, which embeds
  `"finalStateHash": "0aafe88f"` and goes stale on regeneration. Regeneration itself
  stays correct and mandated; reword P-12 (the real determinism net is replay.test.ts's
  runtime-computed hashes; the fixture is a sample whose pin is doc hygiene) and add the
  README example to step 8's regeneration scope (stale docs are bugs, AGENTS.md).
- **8b (encode robustness)**: the new per-cell encode validation (`plan.md:5-step-1`)
  should guard `world.board.cells[i] === undefined` and throw
  `EngineSerializationError`, matching the existing encode style (`serialize.ts:476-477`,
  `:537-538`, `validateCellFields` `:588-615`); a bare `cell.elevation` read on a
  malformed world would surface a TypeError instead of the contract error type.
- **8c (trivial scoping note)**: `paraResult` is block-scoped inside
  `if (paratroopOrders.length > 0)` (`tick.ts:165-178`) — step 5's merge must land in
  that block.
- **8d (free staleness fix)**: `data-model.md:32` (§1 "contract mirrors … change
  together") and `research.md:73-77` (§5 contracts-drift description) still reference
  the deleted spec-dir contract mirrors and a test that no longer exists; both files are
  already amended by this change set, so a one-line correction is free and keeps the
  delta docs truthful (plan step 6 acknowledges the situation but the stale claims stand
  in the amended docs themselves).

### Assumptions to verify (non-blocking)

- B1: regenerated `finalStateHash` and the refreshed `README.md:160` example are
  committed in the same change set (verify by diff review at Phase 5/6).
- B2: Gate-1 assumption A2 (losing landing in `appliedOrders`) is closed by test P-7 —
  confirm the test lands with the implementation.

### Unresolved disagreements: none.

### ADR-worthy

- The "landing combat resolves in Phase 2, not Phase 5" decision with its alternatives
  and rejection reasons (`plan.md` §2 decision 3) is the one Gate-2 decision not already
  pinned verbatim in the spec clarifications; record it as a short ADR or ensure the
  reasoning survives into `spec.md`'s v1.16 section during implementation.

### Gate verdict: PASS

Every high-risk decision (1, 2, 3 carried from Gate 1; 8-11 here) is DEFENDED; the
four findings are non-blocking accuracy/robustness corrections, none of which hides
untested new code, a wire-format gap, or a constitution conflict. The plan matches the
approved spec v1.16 and nothing more — no gold-plating, no speculative refactor (the
combat.ts extraction is spec-mandated at `spec.md:392` and Gate-1 DEFENDED). Proceed to
Phase 5 tasks; fold findings 8a-8d into the implementation change set.

## Gate 3 — Tasks (v1.16 amendment, issues #136/#132) — 2026-10-11

Reviewer: opposing counsel (automated). Artifact judged: `tasks.md` (12 tasks, 6
phases), with `plan.md`, `spec.md` v1.16, `data-model.md`, `research.md`,
`quickstart.md` §6, and the engine source as linked context. Round 1 of 2. Gates 1–2
DEFENDED decisions carried forward; none reopened (no new evidence undermining any).
Every file/line anchor cited in `tasks.md` was re-verified against the working tree.

Size sanity: 12 tasks governing ≈1 new ~40-line module + ~40 lines of serialize.ts
edits + a ~30-line paratroop branch + a 5-line tick.ts event merge + test extensions
+ 1 fixture regen + doc hygiene. Every task maps to plan §5/§7; ratio sane; smallest
change satisfying both issues is exactly what the 12 tasks produce.

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 15 | Completeness: every plan code surface has a producing task | High | DEFENDED | Mapped plan §5/§7 → tasks with zero gaps: serialize.ts format bump + terrain branches → T-002 (+tests T-003); `attrition.ts` + suite → T-001; `combat.ts` extraction → T-004; `paratroop.ts` enemy branch → T-005 (+tests T-007, quickstart Q-008 extension); `tick.ts` event merge → T-006; fixture regen → T-008; contract JSDoc → T-010; manual gate → T-011; verification → T-012. Plan P-1..P-13 all land in T-001/T-003/T-004/T-007/T-008/T-012; quickstart Q-011..Q-014 map to T-003, T-012, T-007, T-008+T-012. | Non-blocking finding 15a (Q-012 command mismatch). |
| 16 | Dependency ordering and parallel-safety claims | High | DEFENDED | Verified against source: T-004 genuinely requires T-001 (`resolveTwoWayAttrition` does not exist — grep, Gate-2 #8) and `combat.test.ts` is the flow-combat regression net (`tests/unit/combat.test.ts` exists); T-005 requires T-001 and is correctly sequenced after T-004 per plan §8; T-006 requires T-005 (`paraResult` block-scoped at `tick.ts:165-178` — confirmed, finding 8c anchor real); T-007 requires T-005+T-006 (CombatEvent observability needs the merge); T-008 requires T-002 (`hashWorld` is FNV-1a over serialized bytes — `research.md:110`); T-010/T-011 require Phases 2–3. Parallel claims hold: T-001 touches `resolution/attrition.ts` + new suite only; T-009 edits spec-dir docs only; T-010 edits `engine-api.ts` JSDoc only — all mutually disjoint. T-008's extra dependency on T-003 is over-strict but harmless. | None. |
| 17 | Traceability both directions (spec v1.16 ↔ tasks) | Med | DEFENDED | Reverse: every v1.16 item has a producing or retention task — FR-013 → T-001/T-005/T-007; FR-024/AC-16 → T-002 (format-version independence) + T-012 (conformance suite, mutation at byte `3 + ENGINE_API_VERSION.length`); FR-025/AC-18 new item (`terrainFlag > 1`) → T-003, matrix retention → T-012; FR-026/AC-17 → T-002/T-003/T-008; AC-19/20/21 + US4 AC-5 → T-007; FR-023/A2 → T-007; FR-017 sequential landings → T-007; SC-001/SC-003 → T-012. Forward: every task traces to an FR/AC, a plan step, or a Gate finding; T-009/T-011 trace to Gate-2 8d / Gate-1 finding 6 + spec 007 FR-012 + AGENTS.md rule 4 rather than spec-001 FRs — acceptable because both are mandated hygiene, not spec-001 behavior. | None. |
| 18 | Gate-2 findings 8a–8d closure, anchors real | Med | DEFENDED | All four represented with verified anchors: 8a → T-008 (README hash pin real at `packages/engine/README.md:160`; "no test consumes `sample-2p-match.json`" re-verified — zero references in `packages/`); 8b → T-002+T-003 (encode-style anchors real: undefined-guard throws at `serialize.ts:476-477` and `:537-538`, `validateCellFields` `:588-615`); 8c → T-006 (`tick.ts:165-178` block-scoped `paraResult` confirmed); 8d → T-009 (`data-model.md:32` and `research.md:73-77` still reference the deleted spec-dir mirrors and the gone `contracts-drift.test.ts` — confirmed; no contracts-drift file in `tests/`). | Non-blocking finding 15e (T-008 wording). |
| 19 | Coverage-gate honesty (constitution III / SC-003) | High | DEFENDED | Every new line of code lands in one of three places, each directly exercised: attrition helper (new suite `tests/unit/attrition.test.ts`, boundary cases cap−1/cap/cap+1, tie, zero), serialize terrain encode/decode branches (T-003 rejection + round-trip cases), paratroop enemy branch (T-007 win/loss/tie/city/event/sequential/appliedOrders rows). `packages/engine/vitest.config.ts:14-19` thresholds (lines/functions/branches/statements 80) confirmed real; tasks correctly cite `:14-19` (plan's `:14-18` is the imprecise one). Retention suites named in T-012 all exist: `serialization-conformance.test.ts`, `unit/combat.test.ts`, `replay/replay.test.ts`, `determinism.test.ts` (glob-verified). | None. |
| 20 | Manual gate (spec 007 FR-012): "no edit expected" | Med | DEFENDED (independently re-verified) | Verified the manual myself, not the author's word: `special-weapons.mdx:20` (cost 2× what lands, 10 land) and `:29` ("Landing on an enemy-held cell also means those 10 troops immediately fight whatever is there") already describe the attack semantics; `numbers.mdx:52-53` (cost 20 / land 10) unchanged by v1.16; grep of all `docs/manual/src/pages/` finds no page claiming a landing flips ownership. The change set makes code match the manual; no player-facing number changes. T-011 is a verification task with a conditional edit — proportionate. | None. |
| 21 | Verification honesty: T-012 gates the merge | High | DEFENDED | T-012 mandates iterative `verify:changed` then full `pnpm verify` before any push (AGENTS.md rule 6), explicit coverage confirmation, retention-suite greens, and monorepo lint/typecheck/build — matching the repo's actual gate. "Nothing committed" matches the sweep's working-tree constraint. | None. |
| 22 | No gold-plating | Med | DEFENDED | All 12 tasks trace to an issue AC, an FR/AC, a plan step, or a Gate finding. The optional row-major encode check is excluded per Gate-1 finding 2's own non-blocking ruling and recorded in plan §8; T-004's extraction is spec-mandated (`spec.md:392`); T-009/T-011 are mandated hygiene/verification. Nothing speculative. | None. |
| 23 | Architect's flagged item 1 — old v1.9 `tasks.md` overwritten | Low | DEFENDED (carry-forward) | Same ruling as Gate-2 #14: `plan.md`/`tasks.md` carry the current amendment by this directory's convention; git history retains v1.9; the prior ledger records every decision from the superseded list. `tasks.md:9` cites the convention explicitly. No new evidence against. | None. |
| 24 | Architect's flagged item 2 — Phase-2-vs-Phase-5 resolution folded into T-011 instead of a standalone ADR | Med | DEFERRED (low) | The decision itself is pinned in the approved spec (`spec.md:391` resolution point; `:392` composition rationale), and Gate-2's ADR-worthy note explicitly allowed "ADR **or** reasoning survives into spec.md". BUT T-011's sub-check as worded ("carries the rationale — add one sentence if absent") passes vacuously: the **rejection reasons** for Phase-5 deferral (a Phase-3 gun could destroy the garrison first leaving committed-only troops that never materialize; landed troops would double-count in the Phase-5 pre-flow snapshot — `plan.md` §2 decision 3) live only in `plan.md`, not in spec.md. | Non-blocking finding 15c: tighten T-011's sub-check to name the two rejection reasons, or accept plan.md §2 as the durable record. |
| 25 | Architect's flagged item 3 — optional row-major encode check excluded | Low | DEFENDED | Gate-1 finding 2 already ruled this non-blocking (row-major is a documented type invariant at `packages/core/src/types.ts:133`; every consumer indexes `cells[y*w+x]`; not a serialization-introduced gap). Plan §8:119 records the exclusion explicitly. Minimal-change discipline upheld. | None. |

### Findings (all non-blocking)

- **15a (quickstart command mismatch)**: quickstart.md:455-463 (Q-012) tells the
  validator to run the `serialization-conformance` suite and expects "the
  decode-rejection matrix includes the new `terrainFlag > 1` case" — but the strict
  decode matrix lives in `tests/unit/serialize.test.ts:427`
  ("deserializeWorld — city and cell strictness"), and the conformance suite contains
  no decode-rejection matrix (its describes: contract surface, version-boundary
  behavior, identity-table round-trip). T-003/plan P-1 correctly place the new case in
  serialize.test.ts; the quickstart's bash snippet just won't run it. Fix: add
  `-- serialize` to Q-012's command or note the second suite.
- **15b (T-005 tie-phrasing self-conflict)**: T-005 says "owner write **suppressed**
  when `G ≥ N`; `0` on tie" — `G ≥ N` includes the tie, which contradicts the `0`-on-tie
  row in the same parenthetical. This echoes FR-013/AC-19's own loose "(G ≥ N)"
  survival parenthetical (survival is really `G > N`; spec.md:127/:408 tie sentences are
  unambiguous). Risk absorbed by T-007's explicit tie test (`N = G` → 0/0) and
  data-model §11, but T-005 should read "`G > N`" to match the implementation it
  describes.
- **15c (T-011 sub-check vacuous-pass risk)**: see verdict 24 — tighten the wording to
  name the two rejection reasons, or state that `plan.md` §2 is the accepted durable
  record.
- **15d (T-002 deletion scope)**: "delete the all-land fabrication block
  (`serialize.ts:884-898`)" — that block also builds `board.cities` and `width`/
  `height`, which decode still needs. The task intends deleting the fabricated `cells`
  (and the stale "feature 003's responsibility" comment), not the whole `Board`
  object. One clarifying word avoids an over-delete.
- **15e (T-008 wording)**: "No other hash pins exist (verified…)" sits next to T-008's
  own README refresh — the README pin **is** another pin. Should read "no other pins
  besides the fixture and the README example" (grep `0aafe88f` confirms exactly three
  occurrences in the tree: fixture:26, README:160, and the quickstart expect-line
  `quickstart.md:483`, which T-008's `expect` text mirrors correctly anyway).

### Assumptions to verify (non-blocking)

- C1: T-011's sub-check passes without a spec edit (spec.md:391-392 already carries the
  resolution point and composition rationale) — confirm at implementation that this is
  judged sufficient, per verdict 24.
- C2: T-008's plan.md reword lands in the same change set as the fixture regen and
  README refresh (Gate-2 assumption B1, unchanged).

### Unresolved disagreements: none.

### Gate verdict: PASS

All high-risk decisions (15, 16, 17, 19, 21 here; 1–3, 8–11 carried) are DEFENDED;
one low-risk DEFERRED (24) with a named tightening; five non-blocking findings, all
wording/anchor-precision nits that no untested code, dependency error, or constitution
conflict hides. Coverage, verification, manual-gate, and 8a–8d closure claims were each
independently re-verified against the working tree rather than accepted on the author's
word. The task set is exactly proportionate to the approved plan — nothing added,
nothing dropped. Proceed to implementation; the five findings are cheap to fold in
during Phase 5.
