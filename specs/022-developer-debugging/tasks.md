# Tasks: Developer Debugging Tools (Feature 022)

**Input**: Design documents from `/specs/022-developer-debugging/`
**Prerequisites**: plan.md (approved), spec.md (approved)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Foundational — Replay Core Library

**Purpose**: The pure replay engine functions that CLI scripts and tests consume.

- [x] T-001 Create `packages/engine/src/replay/` directory and `index.ts` barrel
- [x] T-002 Implement `validateFixture(data: unknown)` type-narrowing validator in `packages/engine/src/replay/validate.ts` — checks all required fields (version, seed, settings, terrainSettings, playerCount, orders, terminalTick, terminalResult, finalStateHash, engineVersion) with descriptive errors
- [x] T-003 Implement `replayMatch(fixture: Fixture)` pure function in `packages/engine/src/replay/replay.ts` — regenerates board via `generateBoard`, creates world, replays orders tick-by-tick, returns `{ finalWorld, hash, tickCount }`
- [x] T-004 [P] Define `Fixture` and `OrderRecord` TypeScript interfaces in `packages/engine/src/replay/types.ts`
- [x] T-005 Export replay types and functions from `packages/engine/src/replay/index.ts` and re-export from `packages/engine/src/index.ts`
- [x] T-006 Write unit tests for `validateFixture` in `packages/engine/tests/replay/validate.test.ts` — valid fixture, missing fields, wrong types, extra fields tolerated
- [x] T-007 [P] Write unit tests for `replayMatch` in `packages/engine/tests/replay/replay.test.ts` — deterministic round-trip (create fixture → replay → same hash), empty orders, single order, multiple orders at same tick
- [x] T-008 Run engine test suite and verify ≥80% coverage on replay module

**Checkpoint**: Replay core library is tested and ready for CLI consumption.

---

## Phase 2: CLI Scripts

**Purpose**: The three pnpm scripts that wrap the replay core.

- [x] T-009 Create `packages/engine/scripts/capture.ts` — reads `--seed`, `--settings` (JSON path), `--orders` (JSON path), `--out` (output path, default `replay-<timestamp>.json`); generates board, replays, writes fixture JSON with 2-space indent
- [x] T-010 Create `packages/engine/scripts/run.ts` — reads fixture path from argv[2]; validates, replays, compares hash; prints `PASS <N> ticks` or `FAIL expected <hash> got <actual>`; exits 0/1/2
- [x] T-011 Create `packages/engine/scripts/update.ts` — reads fixture path from argv[2]; validates, replays, overwrites `finalStateHash` in-place; prints old → new hash; exits 0 on success, 2 on error
- [x] T-012 Add root `package.json` scripts: `"replay:capture": "tsx packages/engine/scripts/capture.ts"`, `"replay:run": "tsx packages/engine/scripts/run.ts"`, `"replay:update": "tsx packages/engine/scripts/update.ts"`
- [x] T-013 Add `@europa/terrain: "workspace:*"` and `tsx: "catalog:"` as devDependencies in `packages/engine/package.json`

**Checkpoint**: All three CLI commands work end-to-end.

---

## Phase 3: Seed Display & Debug Section (US4)

**Purpose**: Add a collapsible Debug section to the sidebar with the map seed.

- [x] T-014 [P] Add collapsible "Debug" section in `packages/console/src/ui/sidebar.tsx` — below Status section, starts collapsed, header toggles expansion; reads `state.latestView?.config.seed`, renders "Seed: {value}" with `aria-label="Map seed: {value}"` (FR-014–FR-018)
- [x] T-015 [P] Write component test for Debug section in `packages/console/tests/component/debug-section.test.tsx` — render sidebar with seed in ConsoleState, assert section exists, starts collapsed, expands on click, text content and aria-label correct; test with seed undefined (no seed rendered); test spectator mode (FR-017)

**Checkpoint**: Seed is visible in both player and spectator sidebar views.

---

## Phase 4: Integration Tests & Polish

**Purpose**: End-to-end validation and edge case coverage.

- [x] T-016 Write CLI integration tests in `packages/engine/tests/replay/cli.test.ts` — spawn `capture.ts`, `run.ts`, `update.ts` via `child_process.execFile`; verify exit codes (0/1/2), stdout format, fixture file written correctly
- [x] T-017 [P] Write edge case tests: empty order sequence fixture, corrupted fixture (invalid JSON), fixture missing required fields, engine version mismatch warning (stderr, exit 0)
- [x] T-018 [P] Create a sample fixture file `packages/engine/tests/fixtures/sample-2p-match.json` from a known deterministic match for regression testing
- [x] T-019 Update `packages/engine/README.md` with replay tool documentation (usage, fixture format, exit codes)

**Checkpoint**: All acceptance criteria verified; documentation complete.

---

## Phase 5: Final Verification

**Purpose**: Ensure everything passes the full verification gate.

- [x] T-020 Run `pnpm verify:changed` (or full `pnpm verify`) — typecheck, lint, format, all tests green
- [x] T-021 Verify engine coverage ≥80% on all metrics (replay module included)
- [x] T-022 Verify console component tests pass with seed display addition

**Checkpoint**: Ready for PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Replay Core)**: No external dependencies — starts immediately
- **Phase 2 (CLI Scripts)**: Depends on Phase 1 (imports `replayMatch`, `validateFixture`)
- **Phase 3 (Seed Display)**: Independent of Phases 1–2; can run in parallel
- **Phase 4 (Integration)**: Depends on Phases 1–2 (tests consume CLI scripts)
- **Phase 5 (Verification)**: Depends on all previous phases

### Parallel Opportunities

- T-004 (types) can run in parallel with T-002/T-003 (implementations)
- T-006 (validate tests) can run in parallel with T-007 (replay tests) — different test files
- T-014 (seed display) + T-015 (seed test) can run in parallel with Phases 1–2
- T-016 (CLI tests) can run in parallel with T-017 (edge case tests) + T-018 (fixture)

### Within Each User Story

- Types before implementations
- Implementations before tests (or TDD: tests before implementations)
- Core before CLI wrapper
- CLI wrapper before integration tests

---

## Notes

- [P] tasks = different files, no dependencies
- Each task is completable in one sitting
- Test tasks sit alongside implementation tasks (TDD preferred)
- All code must pass `pnpm typecheck`, `pnpm lint`, `pnpm format:check` before commit
- No lint suppressions — fix the code, don't silence the tool
- Engine replay logic must be pure (no I/O, no wall-clock) per constitution Principle II
- Fixture files use 2-space indent (NFR-002) for human readability
