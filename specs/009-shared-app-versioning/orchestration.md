# Orchestration Log: 009-shared-app-versioning

## Status
- **Current Wave**: 2 (of 5)
- **Branch**: `009-shared-app-versioning` (off `main` @ f760f3b)
- **Last Updated**: 2026-08-25
- **Mode**: PM-driven orchestration; PO granted full delegation through PR-ready ("Dispatch and finish it up, let me know when a PR is ready") — NO per-wave user gates; single checkpoint at PR-open. Push + `gh pr create` authorized at that point; merging stays PO's decision.

## Plan Summary
Private zero-dep `@europa/version` workspace package exporting `APP_VERSION`; additive optional `appVersion` on server→client `HelloAckPayload`; unauthenticated `GET /version` on host static surface; HUD footer renders bundled constant; README header + manual index footer; CI drift check across all version surfaces; lockstep bump to **0.0.1** in this change set (**0.1.0 deferred to release issue #4**, PO ruling Clarifications v1.1). App version ≠ NETWORK_API_VERSION (independence test-pinned).

## Task Wave Progress

### Wave 1 — Foundation — ✅ Complete (2026-08-25)
- [x] T-001 scaffold `@europa/version` — `3195d9e` (8 files; build/lint/test/typecheck green; import proof prints 0.0.0)
- [x] T-002 pure drift-checker fn + unit tests — `1270b13` (14 tests; coverage 100% on every metric; extra exported types VersionSourceKind/DriftMismatch + barrel pin test — additive, approved)
- Wave-close verification: `pnpm --filter @europa/version test` → 14 passed

### Wave 2 — Consumers — ✅ Complete (2026-08-25), integration verified
- [x] T-003 wire field — `c5c147c` (both contract copies byte-identical one commit; conformance 5/5; networking 188 green; console mirrors confirmed no-change-needed)
- [x] T-004 /version endpoint — `1128423` (route module + tests; coverage 100%×4; real-socket smoke GET 200 byte-exact / POST 405)
- [x] T-005 HUD footer — `2a6421c` (+ dep + lockfile; #9ca3af on #111827 = 6.99:1 AA; component 44 / a11y 23 green)
- [x] T-006 docs + AGENTS scrub — `f3e65cc` (grep targets 1 hit each at v0.0.0; #6 line scrubbed incl. resolved-blocker drop — orchestrator-directed deviation recorded)
- Integration: stray symlink `packages/version/version` removed; `pnpm install` normalized; typecheck + format:check green; console 266/44/23 green
- PM-notable: commit attribution split (host.ts hunk rode `2a6421c`, documented in `1128423`) — end-state correct, no rewrite
- PM decision for T-010: flip reading-the-screen.md example `(for example, v0.0.0)` → v0.0.1 inside the bump commit (zero staleness, FR-012 discipline)

### Wave 3 — Enforcement & companion specs — ✅ Complete (2026-08-25), integration verified
- [x] T-007 drift CLI — `68de397` (gatherer split into scripts/gather-version-sources.ts — no-deps constraint, console precedent; exit 2=usage; coverage 100%×4 incl. gather logic; `pnpm version:check` exit 0 + spawn-proven)
- [x] T-008 logging taps — `dd51307` (boot + seat-claim taps; host banner aligned + seat tap v-suffixed; networking 191 green)
- [x] T-009 companion specs — `86598df` (004: FR-004 note + Key Entities + Clarifications v1.2; 005: FR-012 + Impl Notes 15; 007: FR-017 + header bump + Clarifications v1.1)
- PM ruling: FR-005 covers boot + seat CLAIM only; spectator/reconnect paths stay unlogged (existing onSeatReconnected callback covers visibility; simplicity clause)
- PM acceptance: data-model.md needs no amendment (never enumerated helloAck fields — verified by T-009)
- Parallelization deviation: all three dispatched concurrently (file sets provably disjoint) vs tasks.md's serial-first T-007 — dependency logic respected

### Wave 4 — Lockstep bump + CI gate — ✅ Complete (2026-08-25), integration verified
- [x] T-010 lockstep bump → 0.0.1 — `ba07690` (12 files single commit incl. reading-the-screen example per Minor-3; all gates green; LIVE SMOKE: banner v0.0.1, GET :5173/version exact JSON, HEAD→405)
- [x] T-011 version-drift.yml — `2091e26` (YAML valid; shape regex-asserted vs client-ci.yml; paths narrow-by-design — flagged against widening)
- Findings: pnpm-lock byte-unchanged by bump (records workspace:* specifiers only); root `pnpm host` footgun discovered → filed as follow-up issue (README docs bug, pre-existing, out of 009 scope)

### Wave 5 — Verification & state — ✅ Complete (2026-08-25)
- [x] T-012 attempt 1 — correctly HALTED on red clean-slate gates (tsx missing from version devDeps; phantom stale binary had masked it since T-007). No flips over red gates.
- [x] Remediation — `11b27f6` tsx devDep declared; wipe→reinstall→36/36 incl. all 10 spawn tests, coverage 100%×4, version:check exit 0
- [x] T-012 retry — `05e4ffa` gates green (repo total 1,331: engine 297 · terrain 242 · fog 112 · networking 191 · matchmaking 171 · console 282 · version 36); suppression scan zero; Implementation Notes ×5; tasks 12/12 ticked; AGENTS.md entry + #13 line + status list; spec → Implemented (2026-08-25)
- Final review: code-quality-reviewer **PASS / merge-ready** (one nit: gatherer regex newline-permissive — carry-forward, no ticket); security-auditor **CLEAR** (zero required; recommended no-store → shipped as `dc54797` with live curl proof; timeout-minutes gap → routed to issue #3 by comment)

## Status: PR OPEN — https://github.com/shaunburdick/europa-neo/pull/14 — ALL 19 CHECKS GREEN (2026-08-25)
- First CI run red on 3 downstream workflows (TS2307 @europa/version): T-003/T-005 gave networking/console their first version-dep edge; those workflows predate the package and build upstreams explicitly. Local green was an artifact of root typecheck's build-first chain.
- Fixed `055ae71`: `Build @europa/version` step added to all 9 affected jobs across network/matchmaking/client-ci (leaf-first ordering); proven by wiped-dist simulation incl. negative control reproducing the defect; watch-path extension deliberately left to issue #3.
- Merging = PO decision. Post-merge: workflow_dispatch live proof of Version Drift; Pages republish automatic.

## Decisions & Rationale
- (2026-08-25) Doc surfaces land at v0.0.0 (T-006) and flip with everything else at T-010 so the tree never fails its own checker mid-series.
- (2026-08-25) Reviewer strategy: code-quality-reviewer checkpoint after W2 and W5 (final); security-auditor once at final review (unauth `/version` already ruled acceptable by Clarifications v1.0 #1).
- (2026-08-25) Environment mitigation active: micro-task dispatches with exact paths; verify disk landings (`git log`, file existence) after every dispatch before proceeding.

## Blockers & Escalations
- (2026-08-25) T-012 clean-slate gates RED → correctly halted before state flips. Root cause: `tsx` never declared in packages/version devDeps (T-007 prose claimed "already catalog'd" — catalog entry existed, manifest reference never landed). Phantom .bin/tsx from stale node_modules masked it through T-007→T-011 verifications. Remediation dispatched (declare dep + clean-slate re-proof), then T-012 reporting half re-dispatched. Retro action: wave-close/final checklists must run gates POST-WIPE.
- Resolved otherwise: W2 staging race (attribution split, documented); stray symlink removed; #13 filed for pre-existing root `pnpm host` README bug (out of 009 scope).

## New Tasks Discovered
- None yet.

## Review Findings
- (none yet)
