# Orchestration Log: Issue #30 — Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding

## Status
- **Current Wave**: Wave 8 (Final gates) — in progress
- **Branch**: `issue-30-pipe-flow-rate`
- **Last Updated**: 2026-08-30

## Plan Summary
Replace the binary multiplicative slope model with an elevation-gradient flow model (spec 001 FR-007): downhill `flowBase + flowSlopeStep × min(|Δ|, flowSlopeDeltaCap)`, flat `flowBase`, uphill `max(0, flowBase − flowSlopeStep × |Δ|)` (asymmetric cap per R-1 ruling). Add configurable terrain smoothing (spec 003 FR-010, `terrainSmoothing` default 4, range [0,8]) to make maps traversable. Add four pipe color tokens to @europa/design (spec 012 companion) and slope color-coding with hollow-triangle stalled treatment in the console (spec 005 FR-013). Manual pages ride with behavior change sets (spec 007 FR-012). Matchmaking is verification-only (spec 006). 40 tasks (T001–T040) in 8 phases.

## Key Decisions
- **R-1 (2026-08-30, PM ruling, user-approved)**: ASYMMETRIC cap — `flowSlopeDeltaCap` bounds the downhill bonus only; uphill handicap is uncapped (`max(0, flowBase − flowSlopeStep × |Δ|)`). Stall at Δ ≥ 7 (flowBase/flowSlopeStep). FR-007 formula text correction rides in the implementation change set (specs stay truthful).
- Tuning: `flowBase = 7`, `flowSlopeStep = 1`, `flowSlopeDeltaCap = 5`, `terrainSmoothing` default 4. Rates: downhill 8–12, flat 7, uphill 6→1, stall 0 at Δ≥7. Empirically 31.5% uphill edges stall, 53.6% land reachable at default.
- No version bumps (ENGINE/TERRAIN/CONSOLE/NETWORK/MATCHMAKING_API_VERSION all unchanged).
- No rebalance (open-question-3 ruling); all values tunable in ENGINE_CONSTANTS.

## Task Wave Progress

### Wave 1 — Setup (T001–T002) — ✅ Complete
- [x] T001 Verify branch + spec amendments + setup-plan.sh idempotent
- [x] T002 [P] Baseline audit of flowDownhillFactor/flowUphillFactor references

**T002 audit results** (recorded for PR checklist): files that MUST change — `packages/engine/src/{constants.ts, contracts/engine-api.ts, resolution/flow.ts}`, `packages/engine/tests/unit/{flow,capture,combat,decay}.test.ts`, `packages/engine/tests/quickstart/slope-flow.test.ts`, `packages/engine/README.md` (generic "flowBase × factor" prose, no literal factor names), `specs/001-core-game-engine/{contracts/engine-api.ts, quickstart.md}`, `docs/manual/numbers.md`. Historical references left as-is (note in PR): `specs/007-player-manual/{plan.md,research.md,tasks.md}`, `AGENTS.md` 007-manual historical record, amended spec 001 artifacts (spec.md/data-model.md/plan.md/contracts/README.md — these document the change, correct as-is).

### Wave 2 — Engine flow gradient (T003–T010) — ✅ Complete (Engineer A, 9 commits)
- [x] T003 contract mirrors (`4bc24c9`) · T004 constants (`43ba453`) · T007 tests red→green (`a17d02a`) · T005 flow-rate.ts (`7567ed0`) · T006 flow.ts (`909d7fd`) · T008 literals (`7e975eb`) · T009 quickstart (`23be40d`) · style (`4e3909b`) · T010 README (`53b8e21`)
- Engine suite 302/302 green; contracts-drift 2/2; coverage 95.92/81.2/100/95.77 (stmts/branches/funcs/lines); typecheck clean.

### Wave 3 — Terrain smoothing (T011–T020) — ✅ Complete (Engineer B + T019 dispatch)
- [x] T011 contract mirrors (`81c2d27`) · T012 settings (`eea0004`) · T013 clamp (`4e45282`) · T016 tests red→green (`0d0ecf5`) · T014 smoothing.ts (`1ab62ba`) · T015 generate.ts (`ebd8021`) · T017 settings/clamp tests (`5eee718`) · T018 determinism (`0f08809`) · T020 README (`be8928d`) · style (`1792519`)
- [x] T019 reachable-land suite (`46965bb`) — measured mean reachable-land **54.53%** ≥ 50% floor (US4 AC-1 green). Terrain suite now 366 passed | 50 skipped.
- **T019 decision (2026-08-30)**: agent calibrated edge semantics to BIDIRECTIONAL flow-viability (`flowRateForDelta(delta) > 0 && flowRateForDelta(−delta) > 0`, i.e. |delta| < flowBase/flowSlopeStep) — reproduces the spec's empirical 53.6% (directional-only would give ~84% and contradict the spec's grounding). Stall-threshold coupling reads ENGINE_CONSTANTS live via flowRateForDelta; zero hard-coded literals.

### Wave 4 — Design tokens (T021–T024) — ✅ Complete
- [x] T021+T022 tokens + DESIGN.md sync (`3733487`) · T023 spec 012 companion (`4e9163c`) · T024 tokens.test.ts (`35b529a`)
- Design test 3/3; build regenerates dist/design.css + vendored docs/manual/assets/design.css (G-05 byte-identical); check:no-literals clean; typecheck clean.
- **Contrast note (2026-08-30)**: measured against darkest land tile (#3a4a3a), pipeDownhill 2.51:1 and pipeUphill 1.96:1 fall below 3:1 — documented honestly in DESIGN.md §1.1 rows + note N-4 (mirrors N-3 canvas-fill precedent; FR-013 fixed-scheme context; stalled state has hollow-triangle redundant encoding). Against fog void all four ≥ 3:1.
### Wave 5 — Console slope coding (T025–T032) — ✅ Complete (Engineer C, 10 commits)
- [x] T026 contract mirrors (`ce4c3bf`) · T030 tests red→green (`d7554de`) · T025 pipe-slope.ts (`bd3c2fd`) · T027 buildMapView (`4b7d702`) · T028 palette (`8bbdc43`) · T029 canvas (`d2fd0d2`) · T031 drift (`deceb82`) · T032 component (`e7ca2ae`) · style (`eeb5f97`, `6dcf30b`)
- Console node-mode 605 tests / 50 files; component 92 / 17; a11y 29 / 7; contract-conformance 9/9; no-literals clean; typecheck clean.
- **Decisions (2026-08-30)**: (1) `PipeSlope` declared module-local in the contract (not exported) to keep the conformance witness table green without touching it — renderer union structurally identical/mutually assignable; follow-up possible if PM wants it on the public surface. (2) Component test named `pipe-slope.test.tsx` (browser vitest include is `*.test.tsx`, not `.spec.tsx`). (3) `PIPE_COLOR` retained in palette.ts public export.
### Wave 6 — Matchmaking verification (T033) — ✅ Complete
- [x] T033 passthrough test (`5e5ac9d`) — 4/4 green (override 2, clamp 99→8, default 4, rematch carry-over + fresh initialSeed); zero src changes; matchmaking suite 404 passed.
- Note: matchmaker discards TerrainGenerationResult after auto-start; effectiveSettings observed by regenerating with record settings + initialSeed, byte-identity check makes passthrough airtight.
### Wave 7 — Manual (T034–T037) — ✅ Complete
- [x] T034 pipes.md (`3cbd2d1`) · T035 numbers.md (`367aff8`) · T036 index.md (`31c3834`) · T037 the-board.md (`2b8236a`) · style (`ef7f255`)
- version:check exit 0; docs-privacy PASS (4 player-facing + 9 implementation/spec surfaces). Awareness sweep confirmed no other manual page carries stale flow prose.
### Wave 8 — Final gates (T038–T040) — ⏳ Pending

## Decisions & Rationale
- 2026-08-30: R-1 asymmetric cap ruling (see above). Formula centralized in `flowRateForDelta` so any future change is one line.
- 2026-08-30: Phase 6 routing — PM drives orchestrated waves directly (five packages + matchmaking verification; not solo architect dispatch).

## Blockers & Escalations
- R-1 (resolved 2026-08-30): FR-007 formula text as literally written could not produce uphill stalls; PM ruled asymmetric cap; user approved.

## New Tasks Discovered
- (none yet)

## Review Findings
- (none yet)