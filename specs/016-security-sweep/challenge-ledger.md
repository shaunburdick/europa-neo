# Challenge Ledger — spec 016 security-sweep (Gate 1: Specify)

**Gate**: 1 — Specify (what and why) | **Date**: 2026-10-11
**Challenger**: opposing counsel (spec challenge) | **Author challenged**: `spec-driven-planner`
**Artifacts**: `specs/016-security-sweep/spec.md` (amendment manifest v1.0), `clarifications.md` (D1–D8), in-place amendments to specs 004 v1.11, 005 v1.11, 006 v1.8, 007 v1.8, 010 v1.13, 013 v1.5, 015 v1.1, AGENTS.md table/Current state.
**Evidence basis**: full reads of the amended sections; live verification of every code claim (`main.tsx:101→108` strip-before-resolve, `identityRegistry.ts:328 restoreIdentity`, `ws-match-client.ts:292 sendEnvelope`, `ws-lobby-client.ts:390/762`, `client.ts:111 nextWireSeq`, `reducer.ts:77 PENDING_ORDERS_CAP = 64`, `console-types.ts:114 CONSOLE_API_VERSION = '0.4.1'`, `console-api.ts:471 @internal` on the `ConsoleRuntime` interface, `index.ts:28/217` barrel exports, `main.tsx:124 window.__europaLobby`, 4 E2E specs consuming it, `lobby-storage.ts` `{guestPlayerId, handle}`, `specs/010/.../data-model.md:77`, `docs/manual` lobby/quick-start resume wording); issues #152/#146/#129 read in full (ACs enumerated).

## Size sanity (gate prerequisite)

- Artifact size: manifest 70 lines (17 amendment rows, zero FRs) + clarifications 43 lines (8 decisions); governed delta ≈ 23 requirement units across 7 owning specs.
- Code governed: console net layer (3 files), runtimes/bootstrap (4), lobby-storage, matchmaking identityRegistry + lobbyService, 3 contract mirrors + 2 doc transcriptions + conformance pins ≈ 15–25 files.
- Ratio: sane for a three-issue P1 security sweep shipped as one PR (owner-ruled). The manifest is correctly sized as an index.
- Smallest change satisfying the problems: #129 as specced; #152 as specced except FR-035 (perf, not security — see #14 below); #146's resume secret is the *minimum* proof object (verified: the lobby connection issues no session token today and a seat token cannot exist pre-claim), so FR-026/027 + FR-018 + FR-040…043 are near-minimal.

## Decision inventory (ranked: cost-if-wrong × irreversibility)

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 1 | #146 ruling: implementation wrong, not prose; add per-identity resume secret (004 FR-026/027, 006 FR-018, 010 FR-040…043, 007 FR-004a) | HIGH | DEFENDED | Verified no pre-seat bearer exists (`ws-lobby-client` issues no session token; seat token cannot pre-exist a claim), so a new proof object is the minimum that preserves 010 FR-003/US1 AC-3 reload-restore. The opposite ruling (id is secret) contradicts 004 v1.4, 006 FR-016, 010 FR-024/FR-038/SC-008 and the whole ID-visibility design. Constitution II (server mints, CSPRNG) and IV (honest conformance record at 006 v1.8, 010 v1.13 rationale) satisfied. Issue #146's own alternative ("require the seat token") cannot cover pre-seat restore — considered and correctly lost. | Merge `specs/010…/data-model.md` §4 + `lobby-storage.ts` JSDoc into the same-change-set obligation (finding 4). |
| 2 | D4 wire compatibility: additive optional `resumeSecret`, no `NETWORK_API_VERSION` bump | MED (one-way door, wire) | DEFENDED (recommend additive to PO) | Precedent v1.3 `detail` / v1.6 `guestPlayerId` additions; old clients degrade to the security-mandated mint-fresh ("establishment never fails", 004 v1.6 rule); a major bump would break *all* gameplay traffic to fix a lobby-identity path; client and server ship together in the single-port self-host bundle, so there is no deployed third-party client population to protect. Absence tolerated both directions (FR-026). | None. If PO prefers hard rejection, 004 "Version compatibility" + 006 "Behavioral compatibility" change in one edit (clarifications open question 1). |
| 3 | Spec 013 **AC-014 (v1.1)** left standing: "The `?ws=`/`?live=`/`?match=` direct-match E2E seam … pass unchanged after the migration (FR-025, FR-011)" | MED | **CONCEDED → HOLD (finding 1)** | Directly contradicts rewritten FR-025/FR-035, which retire `?live`/`?match=`/`?name=`/`?token=` consumption and narrow the seam to `window.__europaTestMatch`. AC-014 is unsatisfiable as written; a superseded criterion left standing in the Acceptance Criteria section is a gate-level defect. | Amend AC-014 in place (v1.5): seam = `window.__europaTestMatch` only + `?e2e` harness; add the v1.5 tag. |
| 4 | Spec 010 **SC-017** exists only inside the v1.13 narrative ("SC-017 added"), not in the Success Criteria section (list ends SC-016, line 205) | MED | **CONCEDED → HOLD (finding 2)** | SC-017 is the primary measurable for the biggest fix (#146). The file's own convention places SCs in the main list (SC-012…SC-016 were added there by v1.8); a reader of Success Criteria alone misses it. | Add SC-017 to the Measurable Outcomes list; keep the v1.13 narrative row as changelog. |
| 5 | Spec 013 **Route Contract preamble** (line 46): "Production URLs do not carry match identity, player name, reconnect token, or WebSocket endpoint in query parameters" | MED-LOW | **CONCEDED → HOLD (finding 3)** | The rewritten FR-025 normatively *requires* production boots to honor a `?ws=` WebSocket endpoint in the query; the unamended preamble now contradicts it. | Scope the preamble (e.g. "generated/primary production URLs"; operator transport override excepted) in the v1.5 change set. |
| 6 | `specs/010…/data-model.md` §4 still says the client stores `{ guestPlayerIdClaim, handle }` only; `lobby-storage.ts` JSDoc cites it | MED-LOW | CONCEDED → finding 4 | FR-042/FR-003 now require storing the resume secret beside the id; merging as-is ships a stale spec, which constitution IV calls a bug. Not named in the manifest or any amended FR. | Name `data-model.md` §4 (and the mirroring JSDoc) in the implementation change set — one line in FR-042 or the manifest's A-12 row. |
| 7 | D1: both credentials required (resume secret AND session/reconnect/seat tokens), disjoint scopes | MED | DEFENDED | Verified: seat token cannot exist before a claim; the lobby connection issues no `sessionToken` today, so the resume secret is the only possible pre-seat proof. Landing sites (010 v1.13 cross-cutting decision 1) state the reason. | — |
| 8 | D2: active holder superseded only by matching secret | MED | DEFENDED | Matches existing 004 edge case (line 63: session tokens single-seat, second claim closes old socket) and the manual's existing "This session moved somewhere else" notice; possession-of-secret = ownership. | — |
| 9 | D3: single-epoch secret rotation on every successful restore | LOW-MED | DEFENDED (DEFERRED note) | Bounds replay value at one epoch; worst case (delivery of the new secret lost) is identity churn identical to the already-accepted degradation. | Plan phase must pin rotation ordering so a failed delivery cannot strand a client on a stale secret; verify with a drop-mid-restore test. |
| 10 | FR-037 / 015 FR-019: production bootstrap installs no `__europa*` handles; sentinel channel defers the name | LOW-MED | DEFERRED (assumption stated) | Mechanism is normatively constrained (pre-load opt-in sentinel, no bearer values, test-only boot modes); deferring the name is correct at Gate 1 — a mandated name would be design leak. Verified 4 E2E specs (`lobby`, `identity-migration`, `shareable-links`, `spectator-sidebar`) plus `main.tsx:124` depend on today's handle. | Assumption to verify at plan: the sentinel is settable from the Playwright init script and the 4 specs migrate in the same change set (015 v1.1 already mandates this). |
| 11 | FR-038: public barrel exports no `@internal` declaration; `CONSOLE_API_VERSION` bump required | LOW | DEFENDED (precision nit) | Verified the `@internal — declared for tests` tag sits on the `ConsoleRuntime` *interface* (re-exported as `ConsoleRuntimeContract`), not on the `ConsoleRuntime` *class*, whose doc says "Exported for tests and for hosts that want to embed". No in-repo consumer imports either from the barrel; package is `private: true`. | Wording: name the `@internal`-marked declarations specifically (the type alias), or explicitly rule on whether the class value export also goes. |
| 12 | D5: `CONSOLE_API_VERSION` 0.4.1 → 0.5.0 for the barrel removal | LOW | DEFENDED (confirm number with PO) | The requirement to bump traces to the console contract's own breaking-surface rule (Implementation Note 17 mechanism); 0.x minor = breaking is the right line; v1.10 precedent shows version numbers in this repo go to the user. "Breaking" is theoretical (no consumer, unpublished package) so the PO can confirm 0.5.0 at no risk. | — |
| 13 | FR-028: every send path settles through its promise contract | LOW | DEFENDED (wording follow-up) | Verified `sendOrder`/`sendEnvelope` throw sites (`ws-match-client.ts:292`, `ws-lobby-client.ts:762`). But fire-and-forget void sends (heartbeats, some lobby actions) return no promise; as written FR-028 demands one. | Clarify: promise-returning sends reject; void sends MUST NOT throw and MUST log. |
| 14 | FR-035: allocation-free copy-on-write rehydration | LOW | DEFENDED (scope observation) | Traces to issue #152's proposed fix verbatim (F-CON-RT-009), so it is not gold-plating — but it is the only requirement in the sweep that is performance, not security, and no #152 AC depends on it. | If the PO wants a leaner PR, FR-035 is the one deferrable item. |
| 15 | `guardReplaceStateUrlArgument` (main.tsx:191) — production monkey-patch of `history.replaceState` that exists only because of the E2E init script | LOW | DEFERRED → finding 5 | FR-035 rescopes the test patch but never mentions this production wrapper; once the init script stops being load-bearing the wrapper is dead weight that still patches a browser API in production. | Plan phase: delete it with the test-patch rescoping, or state why it stays. |
| 16 | 010 absorbed `015-FR-019` ("privileged lobby actions require the server-bound session credential") is narrower than the new model | LOW | DEFERRED | Not false, but incomplete after FR-043 (secret OR server-bound proof). Historical absorbed-bullet, low reader impact. | Optional one-line precision in the v1.13 sweep. |
| 17 | 013 v1.1 note (line 261) still cites FR-025 as keeping the `?live`/`?match=`/`?token=` query seam reachable | LOW | DEFERRED | Historical versioned note; but it cites the *rewritten* FR-025 for retired behavior, so a supersession marker avoids confusion. | One-line "(superseded by v1.5 FR-025)" marker. |
| 18 | D6 verification depth (owner-ruled); D7 manual review obligation (surveyed 2026-10-11) | LOW | DEFENDED | D6 matches AGENTS.md rule 6. D7's survey claim verified against `docs/manual` (`lobby.mdx:87` already says "resume credential handled by the browser and server; do not copy or share"; no bare-ID-restore claim exists). | — |
| 19 | Manifest-only 016 (no standalone FRs); one PR for #152/#146/#129 | — | DEFENDED | Verified: `specs/016/spec.md` contains zero FRs; every requirement lives in an owning spec with a version bump + dated entry in each file's own convention (005/004/006/007/015 use versioned sections; 013 has a change-log row v1.5; 010 has no change-log table, consistent). One-PR ruling is owner-binding and not reopened. | — |

## Coverage map (issue AC → owning requirement) — complete, no orphan ACs

- **#152**: send-while-CLOSING rejects + flat ack map → 005 FR-028/FR-029 ✔ | mount-after-teardown → FR-030 ✔ | half-open honest status → FR-031 ✔ | malformed nested `lobbyEvent` dropped → FR-032 ✔ | instance isolation → FR-033 (+FR-034/035/036) ✔
- **#146**: id-without-secret cannot restore/leave/rename → 004 FR-027 + 006 FR-018 + 010 FR-040/FR-043 ✔ | active holder not evicted by claim alone → 010 FR-041 + 006 FR-018 ✔ | spec prose matches authority → 004 v1.3 bullet + 006 v1.8 prose reconciliation + 010 v1.13 sweep + 007 FR-004a ✔ (with findings 2/4)
- **#129**: `?ws=` in real browser → 013 FR-025 + AC-018 ✔ | one `returnTo` validator + open-redirect corpus → FR-034 + AC-019 ✔ | no bearer in URL + gated globals → FR-025/FR-035 + AC-020 + 005 FR-037 + 015 FR-019 ✔ | spec note matches shipped `CONSOLE_API_VERSION`/`minCellPx` → 005 Implementation Note 17 ✔ (verified 0.4.1 / 32 px in source)

## Gate verdict

**HOLD** — not because any high-risk decision failed (they all held), but because three text defects leave the artifact contradicting itself where readers look:

1. **013 AC-014** must be amended in place (retired `?live`/`?match=` seam) — a superseded criterion standing in the Acceptance Criteria section is unsatisfiable as written.
2. **010 SC-017** must be added to the Success Criteria section proper (file's own SC convention; it is the primary measurable for #146).
3. **013 Route Contract preamble (line 46)** must be scoped so it no longer forbids what FR-025 requires.
4. **`data-model.md` §4** (and its `lobby-storage.ts` JSDoc mirror) must be named in the same-change-set obligation (constitution IV).

All four are small, mechanical edits; nothing requires re-arguing the #146 ruling, D4, or D5. Re-submit after the edits and this passes.

## Steering recommendations for the product owner

- **D4**: adopt the recommendation — additive, no `NETWORK_API_VERSION` bump (see #2).
- **D5**: confirm 0.5.0; the requirement to bump is normative and the number is low-risk (unpublished package, no consumers).
- **Test-sentinel naming**: leave to plan phase as proposed; mandating a name in the spec would be design leak, and the mechanism is already normatively pinned.

---

# Round 2 — re-challenge and final verdict (2026-10-11)

**Round**: 2 of 2 (final) | **Verdict**: **PASS**

## Binding product-owner decisions (recorded; not reopened)

| Decision | Ruling | Where it lands |
|---|---|---|
| D4 wire posture | **ADDITIVE, no `NETWORK_API_VERSION` bump** — accepted as recommended | 004 v1.11 FR-026 + "Version compatibility"; 006 v1.8 "Behavioral compatibility"; 010 v1.13 contract bullet; manifest A-01 |
| D5 `CONSOLE_API_VERSION` | **0.4.1 → 0.5.0** — accepted as recommended | 005 v1.11 FR-038 (normative: bump required, 0.x minor-line); clarifications D5 carries the number |
| FR-035 allocation-free rehydration | **Kept in scope** — came from #152's proposed fix; not raised again | 005 v1.11 FR-035; manifest A-04 |
| Test-sentinel naming | Deferred to plan phase — accepted as proposed | 005 FR-037 / 015 FR-019 mechanism normative; name plan-phase |

## Verification of the eight reported changes (against actual files, not the report)

| # | Claimed fix | Verified? | Evidence |
|---|---|---|---|
| 1 | 013 AC-014 amended in place | ✅ | `spec.md:166` — "(v1.1; amended v1.5)": seam "driven exclusively through `window.__europaTestMatch` fixtures, since the `?live`/`?match=`/`?name=`/`?token=` query consumption is retired (FR-025, FR-035)". Now mutually consistent with FR-025, FR-035, and AC-020; no contradiction remains. Self-tagged at point of use — good hygiene. |
| 2 | 013 Route Contract preamble scoped | ✅ | `spec.md:46` — "Generated, documented, and shareable production URLs… the sole excepted query value is an operator-typed `?ws=` transport override (FR-025), which an operator may enter on a semantic path but which the application never generates, links, or documents." Consistent with FR-016 ("generated or documented links"), FR-010 (routing ignores it for classification — FR-025's closing sentence), line 58 (routes never expose WS URLs), and the Examples line 149. |
| 3 | Supersession markers | ✅ (accurate, not over-applied) | `spec.md:261` (v1.1 note — query form retired, window seam remains) and `spec.md:127` (v1.1 edge-case bullet — former "or the legacy query path" clause superseded). Correctly NOT applied to v1.1 notes 258/260, which remain true (`?e2e`+window seam preserved; `?ws=` read path preserved). |
| 4 | 010 SC-017 in the Success Criteria list | ✅ | `spec.md:206` — "SC-017 (v1.13)" sits after SC-016, is measurable (10/10 scripted trials; three discrete outcomes a, b, c), and cites FR-040…FR-043 + SC-010 cross-check. The v1.13 narrative now points to it as the normative location (`spec.md:442`). Matches the file's own SC convention. |
| 5 | 015-FR-019 precision + v1.13 contract bullet | ✅ | `spec.md:428` (absorbed `015-FR-019` now reads "…server-bound session credential — or, for identity restore/rename/release since v1.13, the owner-only guest resume secret (FR-040/FR-043)"); `spec.md:444` names `data-model.md` §4 + `lobby-storage.ts` JSDoc as same-change-set obligations. |
| 6 | data-model.md §4 | ✅ | §4 now `{ guestPlayerIdClaim, resumeSecret, handle }` with correct credential semantics (stored for restore proof only; claim grants no authority per FR-041; cites FR-003/FR-042), plus the bolded constitution-IV obligation naming the JSDoc edit deferred to implementation. No code touched — correct for the spec phase. Agrees with FR-040…FR-043. |
| 7 | 005 FR-038 export precision | ✅ against the barrel | `spec.md:560` distinguishes the `@internal — declared for tests` **interface** in `contracts/console-api.ts` (re-exported as `ConsoleRuntimeContract` — the export removed) from the `ConsoleRuntime` **class** value export from `./runtime` (retained, expressly out of sweep scope). Matches source exactly (`index.ts:28` class / `index.ts:217` interface alias / `console-api.ts:471` tag) and also sweeps the other `@internal` sites (`contracts/console-to-networking.ts:379/392`). |
| 8 | Manifest rows + no standalone FRs | ✅ | A-06 and A-13 mirror fixes 7 and 4–6 precisely; still 17 rows; the manifest defines zero FRs (references only) — the PO's amend-in-place ruling remains honored. |

## Regression sweep after the fixes (no new contradictions)

- Versions unchanged as reported (004 v1.11, 005 v1.11, 006 v1.8, 007 v1.8, 010 v1.13, 013 v1.5, 015 v1.1, 016 v1.0); staying inside unshipped amendment versions is correct — no spurious bumps.
- 004/006/007/015/clarifications.md/AGENTS.md untouched; round-1 findings on those files stand.
- Cross-checks: preamble ↔ FR-016/FR-010/line 58/Examples ✔ | AC-014 ↔ AC-020 ↔ FR-035 ✔ | data-model §4 ↔ FR-003/FR-041/FR-042 ✔ | FR-038 ↔ actual barrel ✔ | SC-017 ↔ FR-040…043 terminology ✔.

## Non-blocking polish notes (recorded for the implementation/plan phases; none holds the gate)

1. 013 v1.5 changelog row could name the AC-014 amendment and preamble scoping for completeness; AC-014's self-tag "(v1.1; amended v1.5)" already gives point-of-use traceability, so this is cosmetic.
2. 013 clarifications row 3 (v1.1 session table, `?ws=`/`?live=`/`?match=` seam "preserved") is historical by construction and superseded by marked notes 261/127; a one-word marker would be symmetric, not required.
3. Record the PO's confirmed `CONSOLE_API_VERSION` **0.5.0** in `clarifications.md` D5 (currently phrased as a recommendation) so the plan phase does not re-open the number.
4. Carried-forward DEFERRED items from round 1 (all with verification paths): secret-rotation ordering so a lost directed-event delivery cannot strand a client on a stale secret (plan: drop-mid-restore test); sentinel implementability from the Playwright init script with the four dependent E2E specs migrating in the same change set; FR-028 wording for fire-and-forget void sends (reject for promise-returning paths, log-and-never-throw for void ones); `guardReplaceStateUrlArgument`'s fate when the E2E init script stops being load-bearing (delete with the rescoping, or state why it stays).

## Final gate verdict

**PASS.** Every round-1 HOLD finding is genuinely resolved in the files (not just reported): AC-014 is consistent with FR-025/FR-035, the Route Contract preamble no longer forbids what FR-025 requires, SC-017 is in the Success Criteria list and measurable, `data-model.md` §4 and its same-change-set obligation agree with FR-040…FR-043, and FR-038 names its export unambiguously. The supersession markers are accurate and narrowly scoped. All high-risk decisions were DEFENDED in round 1 (the #146 resume-secret ruling, D1, D2, D4, D5); the PO's binding rulings close the steering questions; no criterion fails the cost/risk bar; no constitution conflict remains (IV is now actively enforced via the §4 obligation). The amendments are ready for the product owner's approval, with the four polish notes and four DEFERRED verifications riding to the plan phase.

---

# Ledger record-gap note (2026-10-11)

The Gate 2 (plan) round-1 challenge was **not conducted by this challenger** — this session ran Gate 1 only (rounds 1–2 above), so no Gate 2 round-1 record from me exists in this file and none can be truthfully back-written. Gate 2's substance survives elsewhere: `plan.md` AD-3 (sentinel naming), AD-9/AD-11 (identity-event secret semantics, F-8 pin), and `clarifications.md` D9, which records Gate 2's F-8 finding verbatim ("letter-tension with the literal 'mint a fresh identity' sentences in 004 FR-027 / 006 FR-018 was reported to the dispatcher for a possible one-clause spec precision"). Whoever ran Gate 2 should append their own record here; this file carries Gate 1 and the F-8 re-check below.

---

# F-8 re-check — same-connection idempotent refresh carve-out (2026-10-11)

**Scope**: verification of one clause amendment only (PO ruling: carve-out; decision not reopened). **Verdict: GATE 1 REMAINS PASSED.**

## 1. No loophole — clause text read against the code

- **004 FR-027 dated entry (`spec.md:187`)**: exception applies only when "the claimed id equals the receiving connection's bound id AND the identity is active — not in a reconnect grace window"; outcome is keep-binding with "no replacement identity… no grace window starts, and nothing is mutated, renamed, released, evicted, or displaced"; "MUST NOT apply to any other connection — a different connection claiming the id mints fresh exactly as before, even for an active identity"; "MUST NOT apply in grace: grace-window restore still requires the resume secret"; "confers no additional authority… handle rename, voluntary seat release, and every other privileged action still require their own credentials (spec 006 FR-018, spec 010 FR-043)."
- **006 FR-018 dated entry (`spec.md:320`)**: mirrors it, adds "MUST NOT authorize rename or leave on that connection."
- **All three loophole tests pass**: (a) a *different* connection claiming an active identity's id → mint fresh, explicitly, "even for an active identity"; (b) grace-window → carve-out excluded twice over ("not in a reconnect grace window" + "MUST NOT apply in grace"); (c) rename/leave on the excepted connection → explicitly excluded, defers to FR-018/FR-043 credentials.
- **Verified against the code** (`lobbyService.ts:1084–1093`): the spec predicates map 1:1 onto `previous !== undefined && claimed === previous && !registry.isInGrace(previous)`; the else-branch falls to `restoreIdentity(claim)` with its documented mint-fresh behavior, so every non-excepted path keeps the security rule. Test pin `lobby.facade.test.ts:264–278` matches the described behavior ("re-establishing the SAME identity starts no spurious grace window" — and the bystander/thief assertions confirm no takeover).

## 2. Authority attribution — correct in both clauses

Both entries state verbatim that "the authority for keeping the binding is the pre-existing connection binding itself (established via the resume secret or a session/reconnect credential at bind time); the claim's id field remains advisory and grants nothing." The security property (id grants nothing) is restated inside the carve-out, not waived.

## 3. Cross-spec consistency

- 004 FR-027 ↔ 006 FR-018: same exception, same scope, same authority attribution, cross-referenced. ✓
- The carve-out is scoped to the *mint-fresh rule only* ("the mint-fresh rule above has exactly ONE exception") — FR-027's first-sentence prohibitions (no restore/mutate/reclaim/displace on id alone, "in the grace window or otherwise") and its restore-authority sentence (secret or FR-007 credential) are untouched. ✓
- 010 FR-041 (unamended, correctly so): already reads "the server mints/reuses per its establishment rules and MUST NOT mutate, reactivate, rename, evict, forfeit, or release" — "reuses" accommodates keep-binding, and the MUST-NOT list is fully respected by the carve-out (which reactivates nothing: the identity is active by precondition). No contradiction; no amendment needed. ✓
- 010 FR-040/FR-043, 004 FR-026, D2 supersession: unaffected — a reload is by definition a new connection, so restore paths all still require the secret. ✓
- 004/006 "Version compatibility"/"Behavioral compatibility" bullets say fresh identity "on reload" — reload = new connection, carve-out inapplicable; still true. ✓

## 4. Manifest truthfulness

A-02 (`spec.md:28`) and A-09 (`spec.md:35`) accurately mirror the new text (exception named, authority source stated, "all other connections and all grace-window claims still mint fresh"); still 17 rows, no standalone FRs. D10 (`clarifications.md:47–54`) records the discovery provenance, the binding ruling, the exact scope, an explicit "No loophole" paragraph, and the landing — accurate against the spec text.

## 5. Scope discipline

Files moved this turn: 004 spec.md, 006 spec.md, 016 spec.md, 016 clarifications.md (D10; D9/D4/D5/open-question updates predate this turn, from the Gate 2 phase). Re-verified byte-identical at my round-2 checkpoint sites in the files that must NOT have moved: 005 FR-038 (`spec.md:560`), 010 SC-017 (`spec.md:206`), 013 preamble + AC-014 (`spec.md:46`, `:166`), `data-model.md` §4 (`:77`). No version bumps (correct — both amendments unshipped); no code touched.

## 6. Convention

Dated in-entry sub-bullets under the existing unshipped versions are the right call: spec 004 already uses dated continuation bullets (v1.3's "2026-08-25:" and "2026-08-26 (feature 010 Clarifications v1.6):" entries), and my Gate 1 round 2 accepted the same pattern for 013 AC-014 inside unshipped v1.5. A version bump would churn numbering for zero reader benefit; the dated entries keep the post-approval edit auditable. Consistent.

## 7. Two residual consistency conditions (named, not gate-blocking; constitution-IV obligations for the implementation change set)

The carve-out was added to the FRs but two *expectation* texts elsewhere still over-generalize "mint-fresh". Neither is a loophole (both are resolvable from the artifacts themselves, and the correct behavior is stated in the same files), but both must be scoped in the same change set:

1. **010 SC-017(b)** (`spec.md:206`): "…never restores, renames, leaves, or displaces anything **(mint-fresh outcome)**" — the verbs remain exactly true under the carve-out (keep-binding is none of them), but the parenthetical gloss is now over-broad: a same-connection id-only claim does NOT mint fresh. Suggested scope: "(mint-fresh outcome for any other connection; the same-connection idempotent refresh of 004 FR-027 is excepted)" or equivalently scope trial (b) to a claim from another connection.
2. **006 v1.8 "Test expectations"** (`spec.md:323`): "…MUST be updated to assert mint-fresh for bare claims…" — must carry the carve-out caveat, because read literally it would have an implementer rewrite the very pin (`lobby.facade.test.ts:264–278`) that the PO ruling preserves; FR-018's dated entry protects it four bullets earlier, but the expectation bullet should say so explicitly.

These are the same class as the `lobby-storage.ts` JSDoc obligation I accepted in Gate 1 round 2: a named same-change-set edit, enforceable by AGENTS.md rule 4. If the PM prefers zero residual ambiguity, a one-clause edit now closes both; that is a preference, not a gate condition.

## Re-check verdict

**GATE 1 REMAINS PASSED.** The F-8 carve-out is correctly scoped, loophole-free, authority-attributed to the connection binding, code-accurate, consistent with every neighboring requirement, truthfully mirrored in the manifest and D10, conventionally recorded, and limited to the four reported files. The two residual expectation-text conditions are recorded above for the implementation change set.

---

# Gate 2 — Plan challenge, round 1 (2026-10-11)

**Gate**: 2 — Plan (how) | **Challenger**: opposing counsel (plan challenge) | **Author challenged**: `modern-architect-engineer`
**Artifacts under challenge**: `plan.md` (AD-1…AD-10, wave sequencing, FR→implementation→test map), `research.md`, `data-model.md`, `contracts/` (4 files), `quickstart.md`, updated `clarifications.md`.

> **Provenance note (written at round 2)**: the round-1 append never landed — the session issued its findings and questions but no verdict, and no ledger write executed. This record is reconstructed from the round-1 session transcript at the start of round 2. No verdict was issued in round 1; the session ended with two questions pending to the author.

## Evidence basis (round 1 — live verification, not the report)

- Full reads of all six artifacts, the constitution, and the Gate 1 ledger (carried forward; Gate 1 DEFENDED decisions not reopened).
- Code claims verified against the working tree: `main.tsx:101→108` (strip-before-resolve), `:124`/`lobby-runtime.tsx:159` (both unconditional `__europaLobby` installers), `:191` guard; `identityRegistry.ts:66–86/328`; `lobbyService.ts:998/:1084–1093 (F-8)/:1098/:1115/:1165`; seat-reconnect authority chain (`server.ts:1141–1175` reconnectToken validated → `:1330` `onSeatReconnected`); `ws-match-client.ts:292/294` + heartbeat `:203/:225` (no scheduler seam, no establish timeout); `ws-lobby-client.ts:111 (DEFAULT_ACTION_TIMEOUT_MS=10_000)/:248/:390/:562/:600/:621/:648/:762/:857–863/:1066–1086`; `client.ts:111`; `reducer.ts:77`; `console-types.ts:114`; `index.ts:28/:217`; `console-api.ts:471`; `contract-conformance.test.ts:351–352`; `validate.ts` (claim pass-through, no stripping); `search-params.ts:32–74` divergence; privacy script `check-documentation-privacy.mjs`; exactly two module-globals in `net/`; the four E2E handle reads; no `?match=`/`?token=` E2E dependency; `scripts/verify.sh` Phase 7 + `verify-changed.sh` Tier D run Playwright.
- Spec coverage checked against amended FR texts (004 FR-026/027; 005 FR-028…038 + v1.11 verification standard; 006 FR-018; 010 FR-003/040/041/043 + SC-017; 013 AC-018…020; 015 FR-019/020 + AC rows).

## Round-1 conclusions carried into round 2

- **Spec→plan coverage**: complete for every manifest row EXCEPT 015 FR-020 (finding F3). Constitution check holds (CSPRNG confined to the injected registry seam; no tick-path randomness; no new deps).
- **All cited locations in the plan were accurate**, with four exceptions (F1–F4) and two open questions (Q1, Q2).

## Findings raised (pre-verified; Part A)

| # | Finding | Evidence |
|---|---------|----------|
| F1 | AD-5 undercounts the init-script consolidation: "three copies" is wrong | 6 definitions across 5 specs in 2 semantic variants; preserve variant *replaces* the target query, merge variant *merges* — de-dupable only, not behavior-mergeable |
| F2 | AD-8 premise half-false: "reuses the scheduler seam the clients already have" | `ws-match-client` has no seam and no establish timeout; `ws-lobby-client` already arms an epoch-guarded establish timer keyed to `actionTimeoutMs` |
| F3 | 015 FR-020 has no row in the FR→test map | Manifest A-17 requires it; behaviour only incidentally covered by the AC-018 row |
| F4 | research.md's `mountLobbyRuntime` "no importer" claim is export-level only | Module has 4 live `MatchLegHost` importers (`route-tree.tsx:33` + 3 match routes) — the module must not be deleted |

## Questions put to the author (Part B)

- **Q1(a)**: what happens to a stored `resumeSecret` when a directed identity event carries an id but no secret (the rename path at `lobbyService.ts:1165`, consumed by `applyIdentity` at `ws-lobby-client.ts:1066–1086`)? AD-9's "atomic pair overwrite" did not say; read literally, a routine rename would null the stored secret and churn the next reload.
- **Q1(b)**: how is the F-8 same-connection refresh (`lobbyService.ts:1084–1093`) treated — carve-out or mint-fresh under the literal FR-027/FR-018 sentences — and what does its establishment emission deliver (it never calls `restoreIdentity`, so a "fold in the successor" implementation would deliver a secret-less event)?
- **Q2**: W1 installs the sentinel gate but W5 migrates the four dependent specs — the branch would be red across three waves, and `verify.sh`/`pre-push` run Playwright. Is that intended, or should the migration ride W1?

**Status**: no verdict issued; answers requested (round 1 of 2). Findings F1–F4 also transmitted for repair. Carried to round 2.

---

# Gate 2 — Round 2 — verification and final verdict (2026-10-11)

**Round**: 2 of 2 (final) | **Verdict**: **PASS**

## Binding inputs (not reopened)

- Gate 1 round-2 **PASS** (above); PO decisions: amend-in-place, D4 additive/`NETWORK_API_VERSION` unchanged, D5 `0.5.0`, FR-035 in scope, D6 verification depth, one PR for #152/#146/#129.
- **PO ruling (D10) on the F-8 carve-out** — verified landed: 004 FR-027 dated entry (`spec.md:186–187`), 006 FR-018 dated entry (`spec.md:319–320`), manifest A-02 (`spec.md:28`)/A-09 (`spec.md:35`), `clarifications.md` D10 (`:47–54`). Gate 1 re-check above ruled GATE 1 REMAINS PASSED.
- Two spec-side residual expectation texts (010 SC-017(b) gloss; 006 "Test expectations" bullet) are **in-flight via a separate dispatch** — not findings against this plan.

## Part A — four findings verified against files

| # | Reported fix | Verified? | Evidence |
|---|---|---|---|
| F1 | AD-5 corrected: 6 definitions / 5 specs / 2 variants, one helper exporting both | ✅ | `plan.md:143` (with exact line numbers + semantics), `plan.md:106`, `research.md:37`, contract `bootstrap-and-test-seams.md` B-2. Re-read in code: preserve variant replaces the target query (`routing.spec.ts:33` `parsed.search = window.location.search`), merge variant merges (`routing.spec.ts:57`, `identity-migration.spec.ts:82` — inner helper `mergeWsQuery`), preserve copies at `lobby:64`, `shareable-links:39`, `spectator-sidebar:55`. The "de-copied, not behavior-merged (preserve-only would drop `returnTo`)" reasoning matches the code's own doc comment. |
| F2 | AD-8 rewritten with asymmetry; old sentence retracted | ✅ | `plan.md:156–160`: lobby = rekey/document (`ws-lobby-client.ts:857–863` epoch-guarded timer via `scheduler.setTimeout`, `actionTimeoutMs` `:248`, `DEFAULT_ACTION_TIMEOUT_MS = 10_000` `:111` — all confirmed), match = new seam + new timer (heartbeat `:203/:225` bare `setInterval` confirmed; no establish timeout exists). FR-031 row updated (`plan.md:202`) with the match-client test failing pre-fix. Retraction explicit. |
| F3 | 015 FR-020 row added | ✅ | `plan.md:213` — own implementation sites (helpers + wrapper deletion), own test (bootstrap asserts zero `replaceState` wrapping post-deletion), AC-018 incidental coverage named. |
| F4 | `mountLobbyRuntime` claim corrected | ✅ | `plan.md:77–80`, `plan.md:106`, `research.md:39/:72`, contract B-4: export deleted, **module kept**, four importers named (`route-tree.tsx:33`, `match-adaptive-route.tsx:19`, `match-join-route.tsx:30`, `match-spectate-route.tsx:30` — all four confirmed by grep). |

## Part B — answers verified as genuinely implemented and testable

| # | Answer | Verified? | Evidence |
|---|---|---|---|
| Q1a | Adoption **preserves** a stored secret on secret-less events; only `invalidateClaim` clears | ✅ | Pin text in `plan.md:166` (AD-9 Gate-2 pin, naming `applyIdentity` `:1066` + claim rebuild `:1083–1086`), `data-model.md` §3 (`:71`), contract `console-net-client.md:39–40`. Tests: client unit (secret-less → intact; secret-bearing → overwritten) **plus rename → reload → restore**, and SC-017 trial (a) extended to rename→reload (`plan.md:214`, `quickstart.md:56`). Testable against the real sites verified in round 1. |
| Q1b | **AD-11**: every establishment-path event carries the record's current secret via internal-only `resumeSecretOf(id)`; rename carries none; F-8 carved out | ✅ | `plan.md:172–176`; `data-model.md` §1 (`:24`), §2 delivery table + invariant (`:48/:55`), §5 rows (`:103–104`); contract `wire-identity-credentials.md` W-9/W-10 + registry surface (`:53`); `research.md:18` (evidence: the emission at `lobbyService.ts:1109–1122` is built from the secret-free `projectIdentity` — so the composition-in is genuinely required). Test: three-outcome emission unit (`plan.md:197`) + quickstart `:19`. |
| Q1b ↔ spec | Plan and now-approved spec **agree** | ✅ | Substance identical: same predicate (id == connection's bound id, active), same fences (other connection mints fresh; grace excluded; rename/leave credential-gated), same pin (`lobby.facade.test.ts:264` — title verified verbatim; `:245` release test; `:201` id-only grace-restore verified as the test that must flip to mint-fresh). Return-shape `toEqual` pins (`:205/:271`) confirm the secret goes into the **event** only, matching AD-11's composition point. Carve-out blast radius re-checked: a reload is a new connection, so 010 FR-040/041/043 and SC-017(a) are untouched (010 FR-041's "mints/**reuses** per its establishment rules" already accommodates keep-binding). |
| Q2 | Option (ii): migration rides W1 + green-branch invariant | ✅ | W1 row includes "the one-line sentinel migration of the 4 dependent specs" (`plan.md:184`); W5 explicitly excludes it (`:188`); green-branch invariant paragraph (`:190`) cites AGENTS rule 6 and `verify:changed` running Playwright — confirmed: `scripts/verify.sh` Phase 7 (`:64–65`) and `verify-changed.sh` Tier D (`:242–243`) both run `test:e2e`, `.husky/pre-push` runs `verify:changed`. Risks row (`:238`). Corollary verified: W4 cannot redden E2E — the restore flow at `lobby.spec.ts:733` rides the real client (no localStorage forgery), so W4's client stores/presents the secret automatically. Contract B-2 line 28 and `quickstart.md:53` mirror W1. |

## Decision inventory (round 2)

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 1 | AD-1 rotation ordering verify→reactivate→rotate→deliver; lost delivery = mint-fresh churn, never lockout | HIGH | DEFENDED | Registry has an expiry sweep (`restoreIdentity` runs it first — verified); stale secret against active → mint-fresh without evicting (FR-041); pinned by drop-mid-restore tests at registry + lobbyService level (`plan.md:114`), carried in wire-contract pins | — |
| 2 | AD-2 `reactivate()` seam for seat reconnect | HIGH | DEFENDED | Authority chain verified in code: reconnectToken validated (`server.ts:1141–1175`) before `onSeatReconnected` (`:1330`); `restoreIdentity(claim)` becomes claim-only-with-secret; tests pin both sides (`plan.md:118`) | — |
| 3 | AD-3 sentinel `window.__europaTestOptIn`; 4-spec migration | MED | DEFENDED | `addInitScript` pre-load semantics; migration now lands **W1 with the gate** (Q2); component tests + AC-020 scan (`plan.md:129`) | — |
| 4 | AD-4 FR-028 void-send resolution | MED | DEFENDED | Two-way split (promise sends reject / void sends log-never-throw); the in-place FR-028 precision rides the same change set as a named rider (`plan.md:220`) + quickstart checklist | Verify the rider lands when the behavior lands (constitution IV) |
| 5 | AD-5 guard deletion + init-script consolidation | MED | DEFENDED (after F1 repair) | Deletion safe once the init script mirrors native semantics; AC-018 proves `?ws=` with zero patching; consolidation now correctly specified as 2 variants × 6 definitions | — |
| 6 | AD-8 establish timeout | MED | DEFENDED (after F2 repair) | Asymmetry now stated with exact lines; match client genuinely lacks the timeout (FR-031's core gap); lobby rekey defaults to today's effective 10 s | — |
| 7 | AD-9 client storage + secret-preservation pin (Q1a) | HIGH | DEFENDED | Pin + 3 tests across plan/data-model/contract/quickstart; prevents a real rename-wipes-secret regression | — |
| 8 | AD-11 emission invariant + F-8 carve-out (Q1b) | HIGH | DEFENDED | Three-outcome invariant testable; carve-out matches the PO-approved spec entries verbatim in substance; existing tests (`:245`, `:264`) pinned green, `:201` pinned to flip | Stale "reported/pending" framing in plan/data-model/contract — see F5 |
| 9 | Wave sequencing + green-branch invariant (Q2) | MED | DEFENDED (after Q2 fix) | Option (ii) implemented; verify.sh/pre-push accounting correct; W2→W4 same-file ordering preserved; W3 console-collision claim re-verified (privacy script lives in `specs/010`, no console files) | — |
| 10 | Spec→plan coverage (D6 map) | MED | DEFENDED | Every manifest row has an implementation site and a targeted failing-pre-fix test after the FR-020 row was added; spec-only rows (006 FR-016, precision sweeps) correctly testless | — |
| 11 | Verification plan / quickstart delivers owner-ruled depth | MED | DEFENDED | `pnpm verify` + per-AC tests + agent-browser smoke (checklist incl. bad-`?ws=`, reload-restore, no-secret-in-logs); spec-007 manual-review checkpoint present and mandatory (`quickstart.md:78–80`); quickstart updated for AD-9/AD-11/W1 (`:19/:27/:53/:56`) | `quickstart.md:38` vitest filter `test -- main / bootstrap` is sloppy syntax — cosmetic |
| 12 | Gate 1 DEFENDED decisions intact in the plan | — | DEFENDED | D4 no-bump (`plan.md:26/:196/:240`), D5 0.5.0 (`:15/:84/:209` + `public-surface.md`), FR-035 in scope (`:206/:243`), one PR (`:180`), amend-in-place, D6 (`:225–231`) — none reopened, none weakened | — |

## Regression sweep after this round's edits

- No new contradictions in behavior: data-model §5's new F-8 row is fenced identically to the spec entries; grace/active/rename rows still mint-fresh/reject for every non-excepted path; plan summary line 13 ("a bare `GuestPlayerId` authorizes nothing") remains true under the carve-out (authority = binding, never the id).
- F1–F4 repairs are consistent across **all** homes (plan, research, both affected contracts, quickstart) — checked each pair.
- Gate 1 round-2 checkpoints not disturbed: 005 FR-038, 010 SC-017, 013 preamble/AC-014, data-model §4 all unchanged this round (re-grepped).

## Findings (non-blocking; follow-ups — none changes behavior, tests, or decisions)

1. **F5 — post-ruling staleness in `plan.md`**: AD-11's closing sentence (`:176`, "reported … for a possible one-clause spec precision") and the Risks row (`:242`, "if the PM rules the letter governs, the F-8 tests flip") predate the **binding D10 ruling**; `plan.md:5` and `:48` still index "clarifications D1–D8" (now D1–D10). The plan's *behavior* already matches the amended specs; update the framing and the index when plan.md is next touched (Phase 5 kickoff) so tasks.md is not written against a dead contingency. Same staleness, same fix: `data-model.md:57/:103` and `wire-identity-credentials.md` W-10 ("reported to the dispatcher").
2. **F6 — `plan.md` Constitution Check §V (`:37`)** says "one registry method (`reactivate`)" while Complexity Tracking (`:247`) correctly counts two (`reactivate` + `resumeSecretOf`). Update §V; Complexity Tracking is the governing justification and already covers both (no constitution conflict).
3. **F7 — `clarifications.md` internal contradiction**: D5 body (`:25`) labels the PO confirmation "Gate 2 round 2"; the header (`:3`), open question 2 (`:59`), and this ledger's binding-decisions table all say **Gate 1 round 2** (correct). One-word fix; the number 0.5.0 is unaffected.
4. **F8 — `spec.md` status line (`:9`)** still says "returned for Gate 1 challenge" although Gate 1 passed and Phase 4 artifacts exist; and `:64` ("plan.md … deliberately absent here") now reads stale. Housekeeping at next manifest touch.
5. **F9 — polish (from round 1, still open)**: the 004/006 carve-out parenthetical "(established via the resume secret or a session/reconnect credential at bind time)" under-describes first-mint binds (a fresh establishment binds with no prior credential); the operative predicate (id == bound id, active) is precise, so this is rationale-text only.
6. **F10 — cosmetic**: `quickstart.md:38` vitest positional filters (`main / bootstrap`) should be a single filename pattern.

## Final gate verdict

**PASS.** Every high-risk Gate 2 decision is DEFENDED with a named, code-verified test: the rotation ordering can't strand (AD-1), the `reactivate` seam can't leak authority (AD-2 — upstream bearer chain verified in `server.ts`), the sentinel is implementable and its migration now lands with the gate it unbreaks (AD-3/Q2), the void-send wording rides the same change set as an in-place FR edit (AD-4), the production monkey-patch dies with its test-infrastructure cause (AD-5/F1 repaired), the establish-timeout asymmetry is now stated truthfully (AD-8/F2 repaired), a secret-less event can no longer wipe a stored secret (AD-9/Q1a), every establishment emission carries exactly the record's current secret and nothing else does (AD-11/Q1b), the F-8 carve-out in the plan matches the PO-approved spec text fence-for-fence, every manifest row has an implementation site and a failing-pre-fix test (F3 closed), the verification plan delivers D6 depth including the 007 manual checkpoint, and every wave boundary now passes `verify:changed` by construction. Gate 1's DEFENDED decisions (D4, D5, FR-035, one-PR, amend-in-place) are intact and unreopened. The ten findings above are text-reconciliation and housekeeping — none alters behavior, tests, or a decision — and ride to Phase 5 as recorded follow-ups (F5 should be applied before `tasks.md` is derived from `plan.md`).

---

# Gate 3 — Tasks challenge, round 1 (2026-10-11)

**Gate**: 3 — Tasks (breakdown) | **Challenger**: opposing counsel (tasks challenge) | **Author challenged**: `modern-architect-engineer`
**Artifact under challenge**: `specs/016-security-sweep/tasks.md` (37 tasks, 5 waves, manifest coverage matrix).
**Verdict**: **HOLD** — one high-risk structural defect (F3-1) plus two textual gaps; Gates 1–2 carried forward unreopened.

## Size sanity (gate prerequisite)

- Artifact: 118 lines, 37 tasks, 17-row coverage matrix; governed code ≈ 20–30 files across 3 packages + 4–5 E2E specs + manual review — the same delta sized at Gate 1.
- Ratio sane for a three-issue P1 sweep shipped as one PR; the task count tracks the plan's FR→test map without adding scope. Smallest change = the three issues as approved at Gates 1–2; nothing in `tasks.md` sits outside it except the Gate-2-mandated riders (T010, T031), which are obligations, not creep.

## Bidirectional coverage (verified independently against spec.md)

- **17/17 rows → tasks: ✅.** Every row A-01…A-17 appears in the matrix with task(s). **37/37 tasks → rows: ✅** (spot-enumerated: T001→A-16, T004→A-05, T007/T010→A-15/A-16 riders, checkpoints→A-08, T035→A-08/D6, T026→A-03/A-10/A-14, T031→A-14).
- **Spec-only rows genuine, not hand-waving: ✅.** A-03/A-10/A-14 → T026 is a real review gate ("gate = the T023/T024 behavior matches every cited site", drift surfaced not silently patched); A-07 → T009 text verification (conditioned on F3-3 below); 006 FR-016 conformance record correctly codeless per plan.
- **Test discipline spot-checks: ✅.** FR-031 (T016: match client verifiably has no establish timeout — bare `setInterval`, no connect timer; new option/API fails pre-fix), AD-9 (T028 fails pre-fix — `lobby-storage.ts:154` projects to `{guestPlayerId, handle}` today; T029's four named tests), AD-11 (T024 three-outcome emission unit — emission is built from secret-free `projectIdentity` today), F-8 (T024 pins `lobby.facade.test.ts:245/:262/:264/:278` green-unchanged + `:201` flip — matches Gate 2's verbatim checks), FR-038 (T009 barrel type-surface + `'0.5.0'` conformance pin, both fail pre-fix). Hedge wording "fails pre-fix where behavior changes" is used only where honest (T033).
- **Ordering within W1: ✅.** T001 (fix init-script semantics) precedes T005 (delete guard) in task order — the mid-wave window where the un-fixed patch writes `"undefined"` without the guard never opens.

## F5–F10 verification (against files, not the report)

| # | Claim | Verified | Evidence |
|---|---|---|---|
| F5 | F-8 framing → "RESOLVED by binding PO ruling D10"; index D1–D10; status lines | ✅ | `plan.md:176/:242` RESOLVED framing; `:5` "D1–D10"; `:48` "D9/D10"; `data-model.md:57/:103` D10-approved framing (no "reported/pending/dispatcher" anywhere in the file); `wire-identity-credentials.md:35` W-10 "Approved spec text (PO ruling D10)" |
| F6 | Constitution §V two registry methods | ✅ | `plan.md:37` "two (`reactivate`, `resumeSecretOf` …)" |
| F7 | D5 provenance Gate 1 round 2 | ✅ | `clarifications.md:25` (and `:58/:59`) |
| F8 | manifest status line + `:64` | ✅ | `spec.md:9` (Gate 1 + Gate 2 PASS; Phase 5 drafted); `:64` ("plan.md … and tasks.md … now exist") |
| F9 | 004/006 first-mint parenthetical | ✅ | `004 spec.md:187` and `006 spec.md:320` both read "(established at first mint by the connection's own establishment, or at bind time via …)" — rationale text only; operative predicates untouched |
| F10 | quickstart vitest filters | ✅ | `quickstart.md:38` now `test -- main-bootstrap` (single pattern) |

## Decision inventory (ranked)

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 1 | Wave structure: server enforcement (W3 T023/T024) checkpointed **before** client secret storage (W4 T028/T029), under a claimed "every wave boundary passes `verify:changed`" invariant | HIGH | **HOLD (finding F3-1)** | Code-verified contradiction — see F3-1 below. T027's checkpoint is red by construction; the defect also strands `lobby-transport.test.ts`, which no task mentions (0 matches for it in `specs/016`) | Restructure per F3-1 (merge enforcement+storage under one change set, or re-sequence delivery → storage → enforcement); add the missing test-update task |
| 2 | Fail-pre-fix test discipline per behaviour task | MED | DEFENDED (except A-07, see #5) | Spot-checked the five hardest (FR-031, AD-9, AD-11, F-8, FR-038) against current code — every claimed pre-fix failure is real | — |
| 3 | Bidirectional 17/17 coverage + spec-only rows as verification tasks | MED | DEFENDED | Verified independently (above); T026 is a gated review, not a rubber stamp | — |
| 4 | AC-018 no-patch E2E case ownership (T034 says "added alongside T002"; T002 names only the unit file) | MED | **CONCEDED → finding F3-2** | No task creates the `routing.spec.ts` no-patch case the plan structure assigns (`plan.md:100`); T034 would have nothing to execute | Name the E2E case creation in T002 (or T034 owns it) |
| 5 | A-07/Note 17 vs the 0.5.0 bump in the same PR | MED | OPEN — question to author (Q2) | `005 spec.md:370–371` "Current shipped truth … is **0.4.1**" + "MUST quote the shipped literal"; T009 ships 0.5.0 same change set; manifest A-07 also reads "0.4.1". T009 says "Verify Note 17's text matches shipped truth" — update intent not explicit | See Q2 |
| 6 | Console-side acceptance of `resumeSecret` (T017 W2 validator vs T022 W3 field) | LOW-MED | DEFERRED (assumption stated) | Plan FR→test map lists "console mirrors" as an FR-026 site; console has no type mirror (imports `@europa/matchmaking` — verified `ws-lobby-client.ts:75–90`), but T017's structural validation must tolerate a field whose type lands in W3; no task names that tolerance. T030/T033 would catch a late drop | One sentence in T017 or T022 making field-forward-compatibility explicit |
| 7 | T012 marked `[P]` | LOW | CONCEDED (cosmetic) | Per plan AD-7, T012 (`nextWireSeq` in `client.ts`) and T014 (correlation map in `client.ts`) share a file — not parallel-independent | Drop or rescope the `[P]` |
| 8 | Green-branch atomicity of sentinel gate + 4-spec migration (T003+T004 one change set) | MED | DEFENDED | Gate 2 Q2 option (ii) honored exactly; W5 correctly excludes the migration | — |
| 9 | Scope: no creep, no requirement gaps other than F3-1/F3-2 | MED | DEFENDED | All riders trace (T010→plan riders 3–4; T013 rider→AD-4; T031→Gate 1 finding 4/§4 obligation; T036→007 FR-004a mandatory review with PR-body record) | — |
| 10 | Hygiene: commits, attribution, verify checkpoints, europa-source, `private: true` | LOW | DEFENDED | Standing obligations + T011/T021/T027/T032/T037 checkpoints; `Generated-By` mandated, bot co-authors forbidden; no task touches `europa-source/` | — |
| 11 | Constitution I/II/III | MED | DEFENDED | Strict TS + no suppressions standing; CSPRNG confined to injected `randomSecret` (T023, default `randomUUID` — never tick logic); coverage ratchets via one test per AC, full `verify.sh` at T037 | — |
| 12 | F5–F10 applied as claimed | LOW | DEFENDED | All six verified against files (table above) | — |

## Finding F3-1 (the HOLD) — W3's checkpoint is red by construction, and one test file has no owner

Evidence, all verified live:

1. **The integration test that no task covers.** `packages/console/tests/integration/lobby-transport.test.ts` is the US1 AC-3 claim-restore suite. Its standard naming helper `establishNamedClient` (`:654–689`) forges an **id-only** claim — `preseedClaim: { guestPlayerId: guestId, handle }` at `:683`, no secret field exists to include — and asserts `expect(adoptedId(lobby)).toBe(guestId)` at `:687`. Its canonical test (`:1129`, "reconnect within grace restores identity and handle…") asserts id + handle + revision continuity at `:1144–1147`. After T023/T024 (id-only → mint fresh), every use of this helper fails. **Zero occurrences of `lobby-transport` appear in `tasks.md` or any `specs/016` artifact.**
2. **It cannot be repaired inside W3.** Fixing the helper requires seeding a secret, but the client cannot store or present one until T028/T029 (W4): `lobby-storage.ts:154` projects stored JSON to `{ guestPlayerId, handle }` and drops everything else. So the helper is unfixable until W4's client work lands.
3. **T027 runs it anyway.** `verify-changed.sh` diffs against `origin/main`, not the previous wave — so at T027 the changed set includes `packages/console` (from W1+W2) → Tier D runs `test:e2e` → `lobby.spec.ts:705–756` ("identity survives page reload": handle, `identityStatus === 'named'`, `activeMatchId` continuity) fails, since the E2E client likewise cannot present a secret pre-W4. Independently, W3 changes `packages/matchmaking`/`networking` → `HAS_LIB` → Tier C runs `test:lobby-integration` (`lobby-transport.test.ts`) regardless of console.
4. **Gate 2's corollary does not cover this.** `plan.md:190` claims "no spec forges id-only claims via localStorage" — true of the Playwright *specs*, false of this integration suite; Gate 2's Q2 ruling fixed the W1 sentinel boundary, a different boundary. This is new evidence surfaced by task-level checkpoint scrutiny, not a reopening of Gate 2.
5. The tasks' own invariant is stricter than wave-level: `tasks.md:19` says "**No task may leave the branch red**" — as written, T024 does exactly that until T028+T029.

**What must change to clear F3-1** (either option):
- **(a) Pair the change sets**: server enforcement (T023/T024) and client storage/presentation (T028/T029) land as ONE change set under ONE checkpoint — mirroring the T003/T004 pattern — with a new task that updates `establishNamedClient` (capture `resumeSecret` from the bootstrap establishment event at `:666–670`, seed it) and re-scopes any assertion that depends on id-only restore; **or**
- **(b) Re-sequence**: T022 (types) → delivery-only slice of the establishment emission → T028/T029/T031 (client stores/presents; harmless pre-enforcement since `validate.ts` is pass-through) → enforcement slice (T023 flip + T024 mint-fresh/rejection) **plus** the helper update, each boundary green.
Then correct the wave-map/green-branch text to match reality.

## Finding F3-2 — the AC-018 no-patch E2E case has no creating task

T034 tells the implementer to "execute the routing E2E case where `?ws=` … no `history.replaceState` init script installed (added alongside T002…)", but T002 specifies only `tests/unit/main-bootstrap.test.ts`; no task adds the case, though `plan.md:100` assigns it to `routing.spec.ts`. Name its creation in T002 (or make T034 create it).

## Questions put to the author (round 1 of 2)

- **Q1 (F3-1)**: How does T027's `verify-changed` pass at the W3 boundary given evidence items 1–3 above — and which task updates `lobby-transport.test.ts`? If the intended answer is a restructure, pick option (a) or (b) and state the corrected wave map.
- **Q2 (F3-3/item 5)**: T009 ships `0.5.0` in the same change set where Note 17 (`005 spec.md:371`) says shipped truth "is **0.4.1**" and manifest row A-07 records "Corrected to shipped truth: … 0.4.1". Does T009 explicitly **update** Note 17 to 0.5.0, and how does A-07 stay truthful post-merge — or is there an intent behind "verify" that I am not seeing?

## Gate 3 verdict

**HOLD.** Not for scope — the task breakdown tracks the approved spec and plan faithfully (17/17 bidirectional, riders and the 007 review obligation present, hygiene and constitution obligations standing, F5–F10 genuinely applied, fail-pre-fix discipline honest on every spot-check). It holds because the artifact's own green-branch invariant is contradicted by code at the T027 checkpoint (F3-1), one test suite that the invariant depends on has no owning task (F3-1), the AC-018 E2E case is referenced but never created (F3-2), and the Note 17/A-07 ↔ 0.5.0 consistency obligation is ambiguous (Q2). Clear F3-1 (restructure + missing task), F3-2, and Q2 and this passes; the `[P]` mark (F3-4... item 7) and the validator-tolerance sentence (item 6) are polish that may ride the same edit.

---

# Gate 3 — Round 2 — re-challenge and final verdict (2026-10-11)

**Round**: 2 of 2 (final) | **Verdict**: **PASS**

## Reported repairs verified against files (not the report)

| # | Claimed fix | Verified? | Evidence |
|---|---|---|---|
| F3-1 | Option (a): W3 = one atomic change set, single checkpoint T027 executing last; T038 owns `lobby-transport.test.ts`; invariant restated at checkpoint granularity | ✅ | `tasks.md:11–24` (wave map + rules 1–3), `:67–83`: server slice T022→T023→T024, T025/T026, client slice T028→T029→T030→T031→**T038**, then T027 as "the wave's single checkpoint … executes last"; no checkpoint/push between T022 and T027; T038 (`:82`) names the helper sites (`:654–689`, capture `:666–670`, seed `:683`, assertion `:687`), states the pre-fix failure (`adoptedId ≠ guestId` after mint-fresh), and claims one `preseedClaim` call site — **re-verified repo-wide: exactly one (`lobby-transport.test.ts:683`)**; T027 (`:83`) explicitly runs console `test` + `test:e2e` + `verify-changed` and names Tier C+D and the `origin/main` diff — matches my round-1 script analysis (`verify-changed.sh:59`, Tier C `:201–209`, Tier D `:242–243`) |
| F3-2 | T002 owns creating the AC-018 no-patch E2E case; T034 executes | ✅ | `tasks.md:43` (case (2): "create the AC-018 no-patch E2E case in `routing.spec.ts` … fails pre-fix today"; creation/execution split named) and `:88` ("created by T002") |
| Decision 6 | T017 field-forward-compat + positive unknown-field test; T022 console no-mirror note | ✅ | `tasks.md:61` ("silently ignores unknown additive fields (the 004 v1.3 `detail` / v1.6 `guestPlayerId` discipline) … a frame carrying an unknown additive field is accepted (fail pre-fix)"); `:71` (imports verified at `ws-lobby-client.ts:75–90` in round 1) |
| Decision 7 | T012 `[P]` dropped | ✅ | `tasks.md:56` ("No `[P]`: per plan AD-7 this task shares `client.ts` with T014") |
| Q2 | Note 17 → 0.5.0 end state; A-07 truthful | ✅ | `tasks.md:50` (explicit dated in-entry sub-entry under unshipped v1.11, "the note's 'MUST quote the shipped literal' mechanism is what forces this"); `spec.md:33` A-07 reworded to the 0.4.1-at-amendment + 0.5.0-end-state text; `contracts/public-surface.md:23–25` same-change-set obligation; `quickstart.md:90/:94` checklist items. **A-07 is truthful post-merge** — the row no longer implies a shipped 0.4.1 |

## Regression sweep after the restructure

- **No checkpoint separates enforcement from presentation.** The only W3 checkpoint is T027, placed after T038; `.husky/pre-push` → `verify:changed` (default `VERIFY_BASE=origin/main`) runs Tier C (`test:lobby-integration`) and Tier D (`test:e2e`) whenever console or matchmaking changed — both did — so a mid-chain push is mechanically blocked, exactly as the invariant text now states. The red-window inside the wave (T024 … before T028/T029/T038) is real but confined: no checkpoint, no push. The checkpoint-granularity restatement is not a weakening of the approved record — it is what Gate 2's own T003+T004 precedent always implied, and the artifact says so.
- **Green-branch achievable at every checkpoint**: T011 (W1, sentinel pair atomic per Gate 2 Q2), T021 (W2, unchanged), T027 (now: server enforces + client stores/presents → `lobby.spec.ts:705–756` green; helper seeds secret → `establishNamedClient` assertion `:687` green), T037 (full `verify.sh`).
- **Bidirectional coverage holds**: still 17 rows; task count 37 = T001–T038 minus retired T032 (W1 11 + W2 10 + W3 11 + W4 5). T038 mapped (A-13 row + reverse check → A-08/A-13); T032's retirement recorded in the A-08 row and reverse check; its content (console suite green + `verify-changed` + commit hygiene) is present in T027 + standing obligations — no requirement orphaned. Every remaining task traces to a row (spot-enumerated).
- **Fail-pre-fix properties survive the reordering**: W1/W2 tasks unchanged; client-slice tests (T028/T029) still fail against W2-era code; T038's gate names its pre-fix failure against T023/T024 within the same change set; W4 verification tasks land after all code. T002's new no-patch E2E case genuinely fails pre-fix today (strip-before-capture loses `?ws=`; no init script means no mask) and is created+fixed inside T002.
- **`plan.md` annotated history does not contradict the Gate 2 record**: the approved wave table stands untouched; immediately after the green-branch paragraph a bolded "**Gate 3 correction (F3-1)**" paragraph (`plan.md:192`) replaces the false corollary with the verified integration-suite facts and documents the merge + checkpoint-granularity restatement. Gate 2's Q2 ruling (W1 sentinel) is untouched. The Sequencing section's final word is the correction — acceptable annotated history. (Residual, non-blocking: the wave table's W3/W4 rows and the Risks row "W2 vs W4" retain pre-merge phrasing, and the FR→test map row for FR-026 still lists "console mirrors" — T022 `:71` carries the corrected truth.)
- **New sweep of id-only-restore assertions outside `lobby.facade.test.ts`** (my own regression check): `playerIdLifecycle.test.ts:283` and `lobby.identityRegistry.test.ts:356/:376` already assert mint-fresh for bare claims — they stay green. **Two assertions DO flip under T023**: `lobby.identityRegistry.test.ts:240` ("restores the same identity … within grace", id-only claim, `restored === true`) and `:363` (grace restore with mismatched handle, `restored === true`). These are intra-task (T023 owns `identityRegistry.ts` and is adding registry-level tests per its own list: "matching secret restores", "id-only claim never restores … (registry level)", "fail pre-fix where behavior changes"), and T027 explicitly runs the full matchmaking suite before the checkpoint — so a miss is caught locally, inside the owning task's wave, before any push. **Non-blocking**: name the file and sites in T023 for symmetry with T038's explicitness.
- **Defended decisions unreopened**: D4 (T022 `NETWORK_API_VERSION` literal unchanged), D5 (0.5.0), FR-035 (T019 verbatim), amend-in-place, one PR (T037), D10 F-8 pins (T024 `:245/:262/:264/:278` green-unchanged + `:201` flip), W1 sentinel atomicity (T003+T004) — all intact; `tasks.md:127` restates them binding.

## Decision inventory (round 2)

| # | Decision | Risk | Verdict | Defense or reason | Follow-up |
|---|----------|------|---------|-------------------|-----------|
| 1 | F3-1 restructure: W3 atomicity + T038 + checkpoint-granularity invariant | HIGH | **DEFENDED** | Verified in files (table above); pre-push mechanics match my round-1 script analysis; green at every checkpoint now achievable by construction | — |
| 2 | F3-2 AC-018 case ownership | MED | DEFENDED | Creation in T002, execution in T034, plan assigns the file | — |
| 3 | Q2 / Note 17 ↔ A-07 ↔ 0.5.0 | MED | DEFENDED | T009 + A-07 + contract + quickstart all carry the end state; note's own mechanism forces the update | — |
| 4 | Decisions 6–7 (validator forward-compat; `[P]` dropped) | LOW-MED | DEFENDED | Text present; positive unknown-field test named, fail pre-fix | Verify at T023 that the W2-era validator's positive test still passes once the field exists |
| 5 | Coverage matrix after T032 retirement / T038 addition | MED | DEFENDED | 17/17 and 37-task counts re-enumerated; no orphan either direction | — |
| 6 | Registry-suite flips (`lobby.identityRegistry.test.ts:240/:363`) not named in T023 | LOW | DEFERRED (recorded) | Intra-task; T027 runs the full matchmaking suite at the checkpoint — caught before push | Name the file + sites in T023 (symmetry with T038) when tasks.md is next touched |
| 7 | plan.md residual pre-merge phrasing (wave table, Risks row, FR→test "console mirrors") | LOW | DEFERRED (annotated history) | Correction paragraph is the section's final word; Gate 2 record undisturbed | Optional one-line touches at implementation kickoff |

## Final gate verdict

**PASS.** The blocking finding is genuinely closed: server enforcement, client storage/presentation, and the `lobby-transport` helper update now land as one atomic change set under a single checkpoint (T027) that runs the exact Tier C+D suites my round-1 evidence identified, with `.husky/pre-push` mechanically blocking a mid-chain push; T038 exists and owns the previously orphaned suite; the invariant is restated at the granularity the approved T003+T004 precedent always implied. F3-2, Decisions 6–7, and Q2 all landed as claimed and A-07 is truthful post-merge. Bidirectional coverage survives the restructure (17 rows, 37 tasks, T032's content absorbed, T038 mapped), every fail-pre-fix property survives the reordering, `plan.md`'s correction annotates rather than contradicts the Gate 2 record, and no defended decision (D1–D10, FR-035, D4, D5, amend-in-place, one PR, W1 sentinel atomicity) was reopened. The two DEFERRED items (name the registry-suite flips in T023; residual plan phrasing) are caught by T027's checkpoint and are follow-ups, not blockers. Ready for product-owner approval; Phase 6 may start after approval.
