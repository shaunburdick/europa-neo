# Challenge Ledger — Gate 1 (Specify) + Gate 2 (Plan), combined

**Feature**: 005-client-console (PR-3, branch `fix/console-review-cleanup`, base `main` tip `4c8eed7`)
**Artifacts under challenge**: `specs/005-client-console/spec.md` v1.12 · `specs/010-public-lobby-match-browser/spec.md` v1.14 · `specs/005-client-console/plan.md` · plus `data-model.md`, `research.md` §16, `quickstart.md` §16, `contracts/reducer-correlation.md`
**Source issues**: #153 (`F-CON-ST-001`…`010`), #127 (`F-CON-RD-003/006/012/014`, `F-CON-UI-002/003/004/005/007/009/010`)
**Challenger**: opposing counsel, combined Gate 1 + Gate 2 pass (PM skipped Gate 1 and merged the two).
**Basis**: static verification only (file reads + ripgrep); no shell available, so the suite and `tsc` were not run. `bug-sweep` worktree = `main` baseline; `security-sweep` = PR #189 head; `matchmaking-sweep` = PR #188 head.

## Round 1 — verdict: **Gate 1 HOLD**, **Gate 2 HOLD**

### HIGH
- **H1 — F-CON-ST-004 disposition self-contradictory across four artifacts.** `spec.md` listed the heartbeat AC half under *"Already fixed on main — … not re-implemented"* while `data-model.md` §17 made it a mandatory invariant, `plan.md` §7.4 N4 said it *"fails against today's `reduce()`"*, and `contracts/reducer-correlation.md` cited AC-3 as in-scope. `plan.md` §3 also claimed the guarantee *"does not hold **end-to-end** today"* — false: no production path dispatches `pong` (`envelope-to-event.ts:109-111` → `null`; `ws-lobby-client.ts:1007-1008` → bare return). The `reduce()`-level guarantee (`reducer.ts:294-310` allocates twice) is what fails. **Ruled CONCEDED; fixed in round 2.**
- **H2 — FR-039(b) "nearest rendered cell" did not encode ruling 6**, and `plan.md` §13 Q1 still read *"Nothing is implemented until answered."* Requirements section alone did not yield correct behaviour. **Ruled CONCEDED; fixed in round 2.**

### MEDIUM
- **M1 — FR-045 / data-model §17 invariant broader than the plan's `pong`-only short-circuit**; `socketClosed`-while-`game_over` (`reducer.ts:630-632`) unaddressed; TTL-prune consequence unstated. **PM ruling added before round 2: scope, do not generalise** (issue #153's AC is literally *"A heartbeat no-op returns the same state reference"*). **CONCEDED; fixed in round 2.**
- **M2 — `plan.md` §13 posed all seven ruled questions as open blockers; N18 labelled "optional" although ruling 3 mandates it; Q5 misstated ruling 5 as three tab-walk tests; rejected design-fallback branch still live.** **CONCEDED; fixed in round 2.**
- **M3 — comment budget had a would-be 7th site** (`src/a11y/keyboard.ts:91-97` instruction in §5.10.4, absent from §11's six). **CONCEDED; fixed in round 2.**

### LOW
- **L1** — `plan.md` §5.3 called `lobby-reducer.ts:289-308` a "30 line" case (20). **CONCEDED; fixed.**
- **L2** — §9's no-bump rationale omitted that deleting `lobbyRosterDelta` narrows the barrel-exported `LobbyAction`/`LobbyActionKind` (`src/index.ts:70`, `:73`). **CONCEDED; fixed.**

### Round 1 — DEFENDED (unchanged through round 2)
Duplicate `FR-027` removal (verbatim duplicate at baseline `spec.md:531` vs `:158`) · absorbed-feature citations (`018-FR-001` @ spec 005 `:437`; `023-FR-006/007` @ spec 010 `:404/405`; no `specs/018-*`/`023-*`) · version reservations (v1.12 vs #189's v1.11; v1.14 vs #188/#189 both on v1.13 — checked against branch heads) · both already-fixed dispositions with named guarding tests (`lobby-controller.test.ts:486-503`; `zoom.test.ts:100`, `zoom-math.test.ts:94/111`) · ~70 plan citations, zero stale · 23-element census (27 − 4 comments = 23 across 12 files) · one-line `RefAttributes` enabler (React 19.2; `ref` via `...rest`; six ref-needing sites) · two tab-walk inversions equal-or-stronger · ST-009 test deletions dead-code-only · determinism / accessibility / no `any` / no suppressions · FR → work item → test mapping complete.

## Round 2 — verdict: **Gate 1 PASS**, **Gate 2 PASS**

All seven findings closed and re-verified:

- **H1** — `spec.md:576-591` retitled *"wire half only"*, full pong census incl. `ws-lobby-client.ts`, *"no production path ever dispatches a `pong` action"*, `reduce()`-level guarantee *"new in v1.12 and open work (FR-045; plan W2)"*; `plan.md:37` ruling 6 rewritten, `plan.md:78` ST-004 = **SPLIT** (new citations `reducer.ts:234-245/248-260/604` re-checked exact), `contracts:3`, `data-model.md:588`. False "end-to-end" claim gone.
- **H2** — `spec.md:159` FR-039(b) amended in place with direction-of-travel semantics; `grep nearest` over spec/plan/research/quickstart = **0** (sole directory hit `data-model.md:88` is pre-existing and unrelated); `plan.md:198` ⚠️ deleted; `plan.md:441` §13 = "None."; N11 asserts the ruled edge case.
- **M1** — scoped to `pong` in five places (`spec.md:165`, `data-model.md:588`, `data-model.md:366-369`, `plan.md:148`, `contracts:42-49`, `quickstart.md:526`), with the `socketClosed` exclusion and the TTL consequence both stated.
- **M2** — §13 = "None." with pointer to §1; seven answers folded into the binding *"Gate 1 + Gate 2 resolutions"* block (`plan.md:41-51`); N18 required at `:34`, `:332`, `:435`; rejected fallback replaced by `plan.md:232`.
- **M3** — `plan.md:265` "entry data only … not edited. §11 therefore remains exactly the six ruled sites"; §11 = exactly 6 rows.
- **L1** — `plan.md:161` "20 lines". **L2** — `plan.md:391` acknowledges the barrel narrowing.

**Regression sweep**: version reservations intact (1.12 / 1.14 + both concurrency notes); no `[NEEDS CLARIFICATION]` in either feature; no stale blocker text; no scope creep; determinism unaffected.

**Residual (non-blocking, carried to Gate 3 / implementation)**:
- **LOW** — `data-model.md:366-367` / `spec.md:165` say the TTL prune moves to "the next dispatch *that changes state*"; after W2 the exact truth is "the next dispatch that is not a `pong` no-op" (`socketClosed`-while-`game_over` changes nothing yet still prunes). No test or implementation depends on it; one clause makes it exact. Assumption: prune timing is not a user-facing guarantee.
- **INFO** — the heartbeat bullet sits under the "Already fixed on main" heading while its body declares half of it open work; the bullet title ("wire half only") removes the ambiguity. A stricter edit would give the open-work sentence its own bullet.

---

# Gate 3 (Tasks) — Challenge Ledger — PR-3 `specs/005-client-console/tasks.md`

**Challenger**: `spec-challenger`, Gate 3, static verification only (file reads + ripgrep against the `console-sweep` worktree = `main` tip `c184d54` + uncommitted artifacts). Basis: independent re-derivation of the collision map from per-task `Files:` lines; spot-check of 16 red-first failure modes against real source; full comment-arithmetic audit; §7 traceability sweep.

## Verdict: **PASS** (no HIGH/MEDIUM findings; 5 LOW, 1 DEFERRED micro-item with a verification plan)

### The three PR-2 failure criteria — independently re-derived

**1. Collision-map completeness — CONFIRMED, 16/16, zero missing, zero extra.** Rebuilt the file→tasks map from every task's `Files:` line without using the printed map, then diffed. Exactly 16 files are edited by more than one task, matching entry-for-entry including edge directions (`semantic-route-runtime` T-011→T-012→T-014→T-031; `lobby-landing.test` T-014→T-027→T-031; roster-card ×2 T-004→T-022; `modal-exclusivity` T-017→T-024; `wcag-assertions` T-014→T-033; `lobby-runtime` T-013→T-018→T-032; `App` T-018→T-026; `lobby-landing.src` T-018→T-028→T-032; sidebar/SurrenderModal/GameOverModal/match-validation/route-notice/deep-link-interstitial →T-032; `order-bar` T-032→T-034). The 14 `[P]` tasks are pairwise file-disjoint and first-touch of their files. Counts reconcile: 40 tasks, 9 phases, 14 `[P]`, 18 red-first.

**2. Red-first integrity — CONFIRMED.** All 18 red-first tasks ordered before the implementation they pin. No test ordered after the impl it pins without a stated reason. Spot-checked failure modes all real: `applyRosterDelta` pushes in arrival order (`ws-lobby-client.ts:1231`/`:1234`, no `sort()`) · `ReduceOptions` has no `correlation` and `reduce()` always reallocates (`reducer.ts:294-310`) · `attach()` at `zoom.ts:238` has no re-entry guard · `match-adaptive-route.tsx:93` is a literal no-op · zero of the nine `id="main"` elements carry `tabIndex` · `moveFocus` clamps bounds only (`keyboard.ts:62-65`) · `grep id={statusId}` in `src/` = zero matches · `prevHandlesRef` starts empty (`lobby-roster-card.tsx:99`) · three independent modal booleans (`App.tsx:482/495/697-706`) · census re-confirmed: 27 hits = 23 elements across 12 files + 4 comment mentions at exactly `tooltip.tsx:9,136` / `copy-link-button.tsx:20,110`, per-file counts summing to 23 · both tab-walk reds real.

**3. Comment arithmetic — CONFIRMED, Σ counted = 0.** Tier A exactly plan §11's six `src/` sites (site 5 correctly "no edit"); Tier B exactly 2 new-export JSDoc; whitelist matches the tables; all deletions verified at cited anchors. All 40 tasks audited for sneaked comments — every impl task states "zero comment edits" or names its single exempt edit. **T-038's script does catch trailing `//` on added lines** (`[[:space:]]\/\/[^\/]`), **normalizes `+++ b/`/`--- a/`**, has exit-1 conditions (a)–(d), and **mandates the self-test that failed PR-2**. It can fail the PR. Tier C correctly in-scope: all three are corrections of comments this change itself falsifies (AGENTS rule 4), not discretionary additions. Both gate-carried residuals folded into T-036 (anchors verified exact).

### Findings

**HIGH / MEDIUM: none.**

**LOW:**
- **LOW-1** — collision map omits one conditional edge: T-039 may edit `spec.md`/`data-model.md`, which T-036 also edits, no directed edge, no `depends:`. Map-completeness footnote, not a HOLD.
- **LOW-2** — T-038 path-prefix mismatch: awk prints repo-relative paths, whitelist rows are package-relative, so check (a) as written flags every legitimate exempt line.
- **LOW-3** — T-038 can vacuously pass on uncommitted work (`git diff main...HEAD` empty until commit).
- **LOW-4** — T-038 trailing pattern gaps (misses trailing `//` at EOL and trailing block comments). Fails open, closed by the normative reviewer clause.
- **LOW-5** — three anchor off-by-ones: `sidebar.tsx:303`→`:304`; `onFocus :160-166`→`:157-166`; init comment `:86-87` (author later verified `:84-85`); allocator doc 14 lines not 13.

**DEFERRED D-1** — T-038 execution point: must postdate commit and T-040 rebase; DEL pass must be non-empty.

### Cut list (three smallest-value items)
1. **Tier C3** replacement helper doc — keep costs a line that can itself go stale; plan §7.2 asked for deletion. **Cut = delete.**
2. **Tier C1** sibling walk comment rewrite — retitled test already says it; deleting also satisfies truthfulness at 0 added. **Cut = delete instead of correct.**
3. **Tier B2** `MatchRouteShell` JSDoc — internal shell, props self-describing at 3 call sites, largest single comment-maintenance item. **Cut = drop to zero.**

### Assumptions
`main` has not moved beyond `c184d54` on PR-3 surfaces (both competing PRs excluded by ruling 1); plan Gate-2-DEFENDED items re-verified only where tasks restated them; static verification only — the suite and `tsc` were not run (red runs are the implementer's obligation).

**Nothing conceded; nothing unresolved. PASS.**

---

## Gate 3 — PM disposition (2026-10-12)

All three cut items applied (none disputed; each reduces comment surface, consistent with the owner's hard constraint). All five LOWs applied, closing D-1.

**Post-cut arithmetic (author re-summed from surviving rows):** Tier A base 6 / worst 18 · Tier B **5/8** (B1 only) · Tier C **1/2** (C2 only) · **grand exempt added base 12 / worst 28** · **Σ counted discretionary = 0** · **5-file whitelist** (`src/render/SurrenderModal.tsx` ≤5, `src/ui/order-bar.tsx` ≤5, `src/internal/lobby-runtime.tsx` ≤8, `src/contracts/console-state.ts` ≤8, `tests/a11y/wcag-assertions.test.ts` ≤2) · T-038 exit-1 conditions renumbered (a)–(d), threshold `> 28`.

**Stale-token sweep after the cuts: zero hits** for `C1`, `C3`, `B2`, `base 17`, `worst 39`, `7-file`, `34-43`, `13 lines`, `:303`, `:160-166`, `:86-87`.

**Counts unchanged**: 40 tasks, 9 phases, 14 `[P]`, 18 red-first, 40 `Cites:`.

**Deviation accepted**: the init-comment anchor is `:84-85` in the tree, not the PM's suggested `:85-86` — verified empirically rather than taken on the PM's word.

**Final Gate 3 verdict: PASS.** Ready for implementation (Phase 6).
