# Plan: Test Suite Cleanup (Feature 016)

> Date: 2026-09-02
> Phase: 4 (Planning)
> Spec: `specs/016-test-suite-cleanup/spec.md`
> Branch: `issue-56-test-cleanup`

## Overview

Subtractive cleanup of the Europa Neo monorepo's test suite: remove ~109 test
files (~34%) and ~470 test cases (~23%) while preserving the constitution's
≥80% coverage gate on all game logic. No production code changes. CI workflow
restructured into three parallel jobs.

## Guiding Principles

1. **Coverage gate is absolute** (Constitution III). If any package drops below
   80% after removal, restore the specific test(s) that covered the missing
   branches/functions.
2. **When in doubt, keep** (spec Edge Cases). Reduction is aggressive but not
   reckless.
3. **One commit per package** (NFR: Reversibility). Each removal is independently
   revertible.
4. **No new test infrastructure** (Out of Scope). Subtract only.
5. **Specs stay truthful** (Workflow Rule 4). No spec changes needed — this
   feature doesn't change behavior.

## Architecture Decisions

### Decision 1: Conservative game-logic packages, aggressive maintenance packages

Engine, terrain, and fog have the most game logic and the constitution's
coverage gate applies most directly. Target 15–30% reduction (remove only
clearly redundant tests). Console, matchmaking, networking, and design have
higher maintenance burden and more overlap — target 35–40% reduction.

**Rationale**: The cost of accidentally dropping coverage on game logic
(determinism, fog leakage, terrain balance) far exceeds the benefit of
aggressive trimming. Maintenance-heavy packages have more low-value tests.

### Decision 2: CI split — three independent parallel jobs

Split `client-ci.yml`'s `console-test` job into:
1. `console-test` — node-mode only (unit, determinism, parity, keepalive,
   lobby-integration), no Chromium, 3-min timeout
2. `console-e2e` — browser/Playwright (component, a11y, e2e, perf, conformance),
   6-min timeout
3. `console-coverage` — merged coverage gate, 6-min timeout

**Rationale**: Per spec Clarifications v1.2 (item 3). Each job has different
resource needs (Chromium vs node-only) and different timeout budgets. Parallel
execution cuts wall-clock CI time.

### Decision 3: Move conformance test to console-e2e

The `contract-conformance.test.ts` needs `build:lib` (library emit → `dist/`).
It currently runs in `console-test` but is a build-artifact gate, not a
node-mode test. Moving it to `console-e2e` keeps node-only clean.

**Rationale**: The conformance test reads `dist/` — it's conceptually a
build-artifact gate, not a unit/integration test. It also imports `node:fs`,
which doesn't run in browser context, but it runs in node-mode vitest. The
`console-e2e` job can run it as a separate step after the browser suites.

### Decision 4: Coverage job runs independently

The `console-coverage` job re-runs all tests with coverage collection. After
test reduction, this duplication is acceptable because:
- Coverage thresholds must be verified independently (constitution gate)
- The coverage config (`vitest.config.coverage.ts`) defines its own projects
  (node + browser) and cannot share artifacts with the test jobs

**Rationale**: Per spec Clarifications v1.2 (item 3) — three independent jobs.
The coverage job's purpose is the ≥80% gate, not speed.

## Implementation Strategy

### Phase 6a: Test File Removals (per-package commits)

Work package-by-package in order of risk (lowest first):

1. **Version** — no removals (already 2 files)
2. **Engine** — remove ~4 files (conservative)
3. **Terrain** — remove ~9 files
4. **Fog** — remove ~7 files
5. **Design** — remove ~14 files
6. **Networking** — remove ~14 files
7. **Matchmaking** — remove ~18 files
8. **Console** — remove ~43 files (largest, last)

For each package:
1. Run `pnpm test` to establish green baseline
2. Identify specific files to remove using research.md candidates
3. Remove files, run `pnpm test` to verify no failures
4. Run `pnpm coverage` to verify ≥80% maintained
5. Commit with descriptive message: `test(<package>): remove <N> <category> tests`

### Phase 6b: CI Workflow Restructuring

After all test removals are committed and verified:

1. Edit `.github/workflows/client-ci.yml`:
   - Rename `console-test` to `console-test` (node-only)
   - Add `console-e2e` job (browser/Playwright)
   - Modify `console-coverage` job (already exists, adjust timeout)
2. Verify all three jobs pass on the branch
3. Commit: `ci: split console-test into three parallel jobs`

### Phase 6c: Final Verification

1. Run complete local verification (workflow rule 6):
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format:check`
   - All package tests
   - Browser-mode tests
   - E2E tests
2. Verify acceptance criteria:
   - AC-001: file count ≤ 239
   - AC-002: case count ≤ 1,617
   - AC-003: console files ≤ 64
   - AC-004: all packages ≥ 80% coverage
   - AC-005/006: CI timeout ≤ 4 min for console-test
   - AC-007: no game-critical tests removed
   - AC-008: PR description has before/after examples
   - AC-009: typecheck/lint/format pass
   - AC-010: full test suite passes

## Coverage Preservation Protocol

For each package removal batch:

1. **Before removal**: record current coverage metrics
2. **After removal**: run `pnpm --filter <package> coverage`
3. **If any metric drops below 80%**: restore the specific removed test(s)
   that covered the missing lines/branches
4. **Document**: add before/after coverage to PR description

Key coverage-sensitive areas to monitor:
- Engine: `src/tick.ts`, `src/applyCommand.ts`, `src/flow.ts` (determinism core)
- Terrain: `src/generate.ts`, `src/validate.ts` (balance core)
- Fog: `src/index.ts`, `src/playerView.ts` (leakage prevention)
- Networking: `src/server.ts`, `src/frame.ts` (wire protocol)
- Matchmaking: `src/matchmaker.ts`, `src/lobby.ts` (lifecycle core)
- Console: `src/state/reducer.ts`, `src/input/` (order correctness)

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Coverage drops below 80% after removal | Medium | High (merge gate) | Run coverage after each batch; restore specific tests |
| Removing a test reveals a genuine bug | Low | Medium | Fix the bug, don't restore the test (spec Edge Cases) |
| CI split breaks workflow triggers | Low | Medium | Test all three jobs on branch before merge |
| Ambiguous removal (behavior vs implementation) | Medium | Low | Keep when in doubt (spec Edge Cases) |
| Removal of stale test references break imports | Low | Low | Run typecheck after each removal batch |

## Files Modified

### Test files removed (see research.md for full list)
- ~43 console test files
- ~18 matchmaking test files
- ~14 networking test files
- ~14 design test files
- ~9 terrain test files
- ~7 fog test files
- ~4 engine test files

### CI configuration
- `.github/workflows/client-ci.yml` — split into three parallel jobs

### No production source files modified
### No spec files modified
