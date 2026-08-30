# Orchestration Log: 012 3–4 Player Support

## Status
- **Current Wave**: Complete — all 32 tasks (T001–T032) done; spec.md flipped to Implemented (2026-08-29); repo-wide typecheck+lint green; ready for PR (user approval pending)
- **Branch**: `issue-6-3+4-player-matches`
- **Last Updated**: 2026-08-29

## Plan Summary
Single source `BOARD_SIZE_DEFAULTS={2:32,3:48,4:48}` in `@europa/matchmaking` enables lobby pre-select, capacity chrome, N-aware waiting copy, and host implied defaults without any wire version bump; one parameterized E2E harness proves 3p+4p while 2p regression stays green.

## Task Wave Progress

### Wave 1 — Setup + Foundational (T001–T006) — ✅ Complete (review PASS, 2 non-blocking mediums carried)
- T001 verify branch + spec zero clarifications + setup-plan idempotent — ✅ done (no edits, idempotent)
- T002 audit baselines (constants + lobby form + awaiting-start + overlay + host-config) — ✅ done (read-only audit)
- T003 contracts mirrors (board-size-defaults, host-config, waiting-copy, README) — ✅ done `a58db8e`
- T004 add BOARD_SIZE_DEFAULTS to matchmaking constants + contract — ✅ done `a8d211f` (BOARD_SIZE_DEFAULTS single source, re-export)
- T005 unit pin board-size-defaults — ✅ done `0fb1fc7` (6 cases, mirror drift guard)
- T006 conformance (matchmaking + networking byte-identity, mirror check) — ✅ done `ba11f86` (389+285 green, no bump 0.1.0)
- Review: PASS — M-1 dual literal intentional (mitigated), M-2 Frozen vs as const wording (carry)

### Wave 2 — Consumers: Lobby + Overlay + Host foundation (T007–T009, T012–T014, T017–T018) — ✅ Complete
- T007 lobby create form pre-select (FR-002) — ✅ f7adb6b
- T008 lobby-labels chrome (FR-003) — ✅ f596cf2 (already rendered k/N, JSDoc)
- T009 lobby list wiring — ✅ verified no-change needed
- T012 formatWaitingMessage pure helper — ✅ 739900b
- T013 waiting-overlay message prop — ✅ 0f84114
- T014 App wiring N-aware headline — ✅ 7c0ed06
- T017 host-config NPlayerHostConfig + resolveConfig — ✅ 6c3d1ba
- T018 host.ts parameterization — ✅ b426f45

### Wave 3 — Consumer tests (T010, T011, T015, T016, T019, T020) — ✅ Complete
- T010 lobby form transition matrix unit tests — ✅ 71d04be (33 tests)
- T011 lobby chrome component tests — ✅ 972bbc8 (8 tests)
- T015 awaiting-start unit table — ✅ 0c85795 (17 tests)
- T016 waiting overlay component/mounted tests — ✅ 95bff68 (fixed stale test)
- T019 host-config matrix unit tests — ✅ ca06702 (46 tests)
- T020 host smoke per N (port:0) — ✅ 3083c2f (4 tests)

### Remediation — HOST_STATIC_PORT (FR-012) — ✅ Done
- ce61b52 fix(console): reject HOST_STATIC_PORT per FR-012 (was silently ignored) — removed strip in host.ts, updated host-collapse-tdd.test.ts to expect rejection. 55 tests green.

### Wave 4 — Harness + audits + 2p regression (T021–T025) — ✅ Complete
- T021 full-stack-n-players E2E describe.each([3,4]) — ✅ done `7ce6fc5` (SC-001/SC-002 green)
- T022 headless lifecycle victory/forfeit/rematch — ✅ done `20e4e4b` (10 tests, US5 AC-1..4)
- T023 terrain determinism grid (3p odd normalization) — ✅ done (32/48 green; 64 skipped w/ blocker evidence, issue #26)
- T024 fog isolation 500-tick parameterized — ✅ done `0248160`+`97ba96e` (SC-004 green)
- T025 2p regression re-run — ✅ done `383a778` + crypto fix `cf2a32e`/`1abe025` (SC-006 green, 8/8 2p e2e)
- Remediation: HOST_STATIC_PORT reject `ce61b52`; 64 dropped from UI/host `1580dd3` (issue #26); matchmaking globalThis.crypto `cf2a32e`

### Wave 5 — Polish + gates (T026–T032) — ✅ Complete
- T026 manual same-change-set updates — ✅ done `af275b4` (7 files; 64 noted disabled)
- T027 docs privacy re-run — ✅ PASS (exit 0)
- T028 version:check — ✅ PASS (0.1.0 lockstep)
- T029 coverage gate — ✅ PASS (console merged 91.44/85.1/91.86/91.33; all ≥80%)
- T030 SC-007 aggregated gate — ✅ PASS (81 tests)
- T031 SC-008 aggregated gate — ✅ PASS (55 tests)
- T032 CI workflow — ✅ done `9d50a58` (SHA-pinned, path-gated)
- Blockers fixed: lobby-create-form branch 62.5%→100% `ec004c4`; a11y/lobby-landing stale WAITING_FOR_OPPONENT_MESSAGE `f4e5564`+`f08a9ee`

## Decisions & Rationale
- 2026-08-28: Wave split puts foundational map first to unblock parallel consumers; subsequent waves group by file-disjointness to allow parallel agents safely.

## Blockers & Escalations
- (none yet)

## New Tasks Discovered
- (none yet)

## Review Findings
- (pending Wave 1 review)
