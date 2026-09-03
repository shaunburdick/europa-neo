# Feature 016: Test Suite Cleanup

> Version: 1.0
> Last Updated: 2026-09-02
> Status: Approved (Phase 3 complete — clarifications applied)
> Dependencies: None (touches all packages but introduces no new code)

## Problem Statement

The Europa Neo monorepo has accumulated 331 test files containing approximately 2,000+ test cases across 8 packages. This test surface creates two concrete problems:

1. **CI execution time**: The Client CI `Test suites (console)` job has a 10-minute timeout (raised from 4 minutes when Feature 015 pushed it past the original limit). The console alone has 119 test files across 15+ subdirectories, with browser-based suites (component, a11y, e2e, perf, determinism, parity, keepalive) each launching Chromium. Feature 015 added tests that pushed the job to 4m17s against a 4-minute budget — and the trajectory is upward with every new feature.

2. **Maintenance burden**: Many test files exist in dense clusters (37 matchmaking unit files, 27 networking unit files, 19 terrain unit files) where they overlap significantly in what they exercise. Tests that assert implementation details (internal function calls, exact call counts, private state mutations) create false-positive failures when code is refactored, forcing developers to rewrite tests even when behavior is preserved. This slows development velocity — the opposite of what tests should do.

The goal is **aggressive reduction**: cut test count, reduce execution time, and simplify maintenance while preserving the constitution's ≥80% coverage gate on game logic (Constitution III). This is a subtractive effort — no new test infrastructure, no new test categories.

## User Stories

- As a **contributor**, I want **fewer tests to run locally** so that I can validate changes in under 60 seconds instead of minutes.
- As a **contributor**, I want **tests that survive refactoring** so that I can restructure code without rewriting test assertions.
- As a **contributor**, I want **CI to complete quickly** so that I get feedback before switching context.
- As a **maintainer**, I want **a smaller test surface** so that adding new features doesn't continuously push CI toward timeout limits.

## Functional Requirements

### Reduction Criteria (What to Remove)

- **FR-001**: Remove tests that assert implementation details rather than observable behavior. Implementation-detail tests are defined as: tests that verify internal function call counts (`toHaveBeenCalled` with exact counts on spied internals), tests that assert private state mutations, tests that depend on specific import/module structure, or tests that fail when equivalent refactoring changes internal call paths without changing external behavior.

- **FR-002**: Remove redundant test cases where multiple tests in the same file (or across files in the same package) exercise identical input/output pairs with only superficial differences (different variable names, different describe-block nesting, same assertion). When N tests cover the same behavioral path, retain at most 1 unless the inputs genuinely differ.

- **FR-003**: Remove snapshot tests that capture implementation details (DOM structure, component tree shape) rather than meaningful user-visible output. Snapshot tests that assert text content, ARIA labels, or semantic structure may be retained if they provide unique coverage.

- **FR-004**: Remove tests that only verify type-level constraints (TypeScript compile-time checks) without runtime assertions. These are already enforced by `pnpm typecheck` and provide no additional runtime value.

- **FR-005**: Remove quickstart/documentation tests that merely re-import a module and assert it exports expected symbols. These are covered by TypeScript's module resolution and the conformance typecheck program.

- **FR-006**: Remove tests for deprecated or removed features that no longer exist in the codebase. Audit all test files for references to deleted functions, removed exports, or stale behavior.

### Coverage Preservation (What to Keep)

- **FR-007**: Maintain ≥80% test coverage (statements, branches, functions, lines) on all game logic modules: `@europa/engine`, `@europa/terrain`, `@europa/fog`, `@europa/networking`, `@europa/matchmaking`. This is Constitution III — a merge gate, not aspirational.

- **FR-008**: Retain all tests that exercise the public API surface of each package (exported functions, classes, types). Public API tests are the contract between packages and their consumers.

- **FR-009**: Retain all tests that verify game-critical behaviors: deterministic simulation output, fog-of-war leakage prevention, terrain generation balance, combat resolution, pipe flow, multiplayer wire protocol correctness. These are the highest-value tests in the repo.

- **FR-010**: Retain all E2E and integration tests that exercise the full stack end-to-end (matchmaking → engine → networking → console). These catch cross-package regressions that unit tests cannot.

- **FR-011**: Retain all accessibility tests that verify WCAG 2.2 AA compliance (Constitution VI). These are not redundant with functional tests.

### Package-Specific Targets

- **FR-012**: Console package: target a 40–50% reduction in test file count. The console has the largest and most diverse test surface (unit, state, input, net, qol, routing, render, component, a11y, e2e, perf, determinism, parity, keepalive, integration, conformance). Priority removals:
  - Unit tests that duplicate what component or E2E tests already cover
  - Component tests with screenshot snapshots that add visual regression burden without proportional coverage value
  - Integration tests that re-test what unit tests already cover at a finer granularity
  - Tests in `__screenshots__/` directories (visual regression snapshots) — evaluate whether they provide unique value or can be replaced by targeted assertions

- **FR-013**: Matchmaking package: target a 30–40% reduction. With 37 unit test files and 9 quickstart files, this package has the highest unit-test density. Priority removals:
  - Quickstart tests that merely verify exports exist
  - Unit tests with overlapping describe blocks testing the same function with slightly different inputs where edge cases are already covered
  - Tests that assert internal state machine transitions rather than observable matchmaking outcomes

- **FR-014**: Networking package: target a 30–40% reduction. With 27 unit test files and 11 integration files, evaluate for overlap between unit and integration layers. Priority removals:
  - Unit tests that mock the WebSocket layer and re-test what integration tests already cover with real sockets
  - Integration tests that duplicate unit test coverage of the same codec/frame handling

- **FR-015**: Terrain, engine, fog packages: target a 20–30% reduction. These packages have the most游戏逻辑 (game logic) and the constitution's coverage gate applies most directly. Be more conservative here — focus on removing only clearly redundant cases, not coverage that supports the ≥80% gate.

- **FR-016**: Design package: target a 30–40% reduction. With 14 brand tests and 13 component tests, evaluate whether brand tests (asset manifest, MIME type checks) can be consolidated into fewer files. Component tests should focus on public API behavior, not internal rendering details.

- **FR-017**: Version package: minimal reduction expected (only 2 test files). Verify no redundancy but no aggressive cutting needed.

### CI Speed Improvements (Issue #56 Track)

- **FR-018**: After test reduction, the `Test suites (console)` job in `client-ci.yml` must complete in under 4 minutes on a standard GitHub Actions runner, with the timeout returned to 4 minutes (down from the current 10-minute emergency raise).

- **FR-019**: Cache Playwright browser installations using `actions/cache` keyed on `pnpm-lock.yaml` hash (already partially implemented — verify it's effective and not re-downloading).

- **FR-020**: Split `client-ci.yml` into three parallel console jobs: (1) `console-test` — node-mode tests only (unit, determinism, parity, keepalive, lobby-integration), no Chromium, target 3-minute timeout; (2) `console-e2e` — browser/Playwright tests (component, a11y, e2e, perf, selfhost, conformance), target 6-minute timeout; (3) `console-coverage` — merged coverage gate, target 6-minute timeout. Each job runs independently.

- **FR-021**: The `Coverage gate (console ≥ 80%)` job runs separately from `Test suites (console)` — verify that coverage collection overhead is not duplicating test execution. If the coverage job re-runs the same tests that the test job already ran, consolidate them.

## Non-Functional Requirements

- **Reliability**: Test reduction must not introduce regressions. Every removed test must be justified in the PR description with reference to FR-001 through FR-006, and the remaining tests must prove equivalent coverage through the ≥80% gate.
- **Reversibility**: Each removal must be independently revertible. Do not batch unrelated removals into a single atomic commit — one commit per package or per removal category so that a specific removal can be reverted if a gap is discovered.
- **Observability**: After cleanup, each package's test count and coverage percentage must be documented in the PR description as a before/after comparison table.

## Acceptance Criteria

- [ ] **AC-001**: Total test file count across all packages is reduced by ≥25% (from 331 to ≤248 files).
- [ ] **AC-002**: Total test case count is reduced by ≥20% (from ~2,000 to ≤1,600 cases).
- [ ] **AC-003**: Console test file count is reduced by ≥40% (from 119 to ≤71 files).
- [ ] **AC-004**: All 8 packages maintain ≥80% coverage on statements, branches, functions, and lines — verified by running `pnpm coverage` (or equivalent per-package coverage command) and confirming no threshold drops below 80%.
- [ ] **AC-005**: Client CI `Test suites (console)` job completes in under 4 minutes on a standard runner.
- [ ] **AC-006**: Client CI `Test suites (console)` job `timeout-minutes` is set to 4 (not 10).
- [ ] **AC-007**: No game-critical behavior tests are removed (determinism, fog leakage, terrain balance, combat, pipe flow, wire protocol).
- [ ] **AC-008**: Each removed test category has at least one representative example in the PR description showing before/after with justification.
- [ ] **AC-009**: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all pass after cleanup.
- [ ] **AC-010**: The full `pnpm test` (all packages) passes after cleanup — zero test failures.

## Out of Scope

The following are explicitly **not** part of this feature:

- **New test infrastructure**: No new test runners, no new test frameworks, no new mocking libraries. This is a subtractive effort using existing tooling.
- **Test parallelization infrastructure**: While FR-020 evaluates parallelization, implementing a new parallel test runner (e.g., splitting Vitest projects across workers) is out of scope — only job-level parallelization in CI YAML is in scope.
- **Code changes to source files**: This feature only modifies test files and CI configuration. No production code changes.
- **Coverage threshold changes**: The 80% constitution gate is not being lowered. If anything, the goal is to prove that fewer, better tests can maintain the same coverage.
- **Test quality improvements for retained tests**: This feature removes bad tests; it does not rewrite or improve retained tests. Test quality improvements are a separate concern.
- **Other CI workflows**: Only `client-ci.yml` is in scope. Other workflows (engine-ci, terrain-ci, fog-ci, network-ci, matchmaking-ci) may benefit from similar cleanup but are not targeted.

## Edge Cases

- **Removing a test drops coverage below 80%**: If any package drops below the 80% threshold after removal, the specific removed test(s) that covered the missing branches/functions must be restored. The ≥80% gate is absolute — no exceptions.
- **Removing a test reveals a bug**: If removing a test exposes a genuine bug that the test was catching, the bug must be fixed (not the test restored). The test was doing its job — the bug is the real issue.
- **Ambiguous test purpose**: If it's unclear whether a test asserts behavior or implementation, keep it. The reduction target is aggressive but not reckless — when in doubt, preserve.
- **Tests that exist solely for coverage padding**: These are prime removal candidates. A test that calls a function but makes no assertions about its output is pure padding — remove it.
- **Determinism/perf/parity suites**: These are high-value, low-count suites (3 tests each). Do not remove them — they verify properties that unit tests cannot.

## Examples

### Example: Implementation-Detail Test (Remove)

```typescript
// REMOVE: asserts internal call count on a private helper
it('calls buildCell exactly once per tick', () => {
  const spy = vi.spyOn(internalModule, 'buildCell');
  engine.tick();
  expect(spy).toHaveBeenCalledTimes(32 * 32);
});
```

**Why remove**: If `buildCell` is refactored to process cells in batches of 16, this test fails even though behavior is identical. The test asserts implementation, not outcome.

### Example: Behavioral Test (Keep)

```typescript
// KEEP: asserts observable game state after tick
it('produces deterministic output for identical seeds', () => {
  const state1 = engine.tick(seedA);
  const state2 = engine.tick(seedA);
  expect(state1.board).toStrictEqual(state2.board);
});
```

**Why keep**: This tests a constitutional requirement (determinism) and will survive any internal refactoring.

### Example: Redundant Test (Remove)

```typescript
// File A:
it('rejects empty handle', () => {
  expect(validateHandle('')).toBe(false);
});

// File B (different describe block, same package):
it('returns false for empty string input', () => {
  expect(handleValidator('')).toBe(false);
});
```

**Why remove one**: Both test the same input/output pair. Keep one; remove the other.

### Example: CI Before/After

**Before** (current `client-ci.yml`):
```yaml
console-test:
  timeout-minutes: 10  # raised from 4 due to Feature 015
  steps:
    - ...  # 12 sequential browser suites, ~4m17s
```

**After** (target):
```yaml
console-test:
  timeout-minutes: 4
  steps:
    - ...  # 8–9 suites after reduction, <3m30s target
```

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | Should visual regression screenshot tests (`__screenshots__/` directories) be removed entirely or replaced with targeted DOM assertions? | No decision needed — `__screenshots__/` directories are debug artifacts from Vitest Browser Mode, already gitignored. They are not visual regression comparison tests. The only real screenshot is a one-off in `us1-acceptance.spec.ts` saved to `test-results/`. | None — these are clutter, not tests. |
| 2 | Is there a per-package test count target beyond the aggregate ≥25% reduction, or should packages with already-lean test suites (version, fog) be left untouched? | No per-package floor. Keep the least amount of tests with the most coverage across all packages, including version and fog. | FR-012 through FR-017 targets are guides, not hard floors. Aggressive reduction applies uniformly. |
| 3 | Should the coverage gate job (`console-coverage`) be consolidated into the test job (`console-test`)? | No — split into three parallel jobs instead. `console-test` (node-mode only, no Chromium), `console-e2e` (browser/Playwright), `console-coverage` (merged coverage gate). Each runs independently with appropriate timeout. | FR-020 rewritten: three-job split instead of consolidation. |

## CI Job Structure (After Cleanup)

The `client-ci.yml` workflow splits into three parallel console jobs:

### `console-test` (node-mode, no Chromium)
- Unit tests (`test:unit`)
- Determinism golden fixture (`test:determinism`)
- Subcell parity (`test:parity`)
- Quiet-client keepalive (`test:keepalive`)
- Lobby transport integration (`test:lobby-integration`)
- **No Playwright install** — pure Node execution
- Target timeout: 3 minutes

### `console-e2e` (browser/Playwright, needs Chromium)
- Component tests (`test:component` — Vitest Browser Mode)
- Accessibility tests (`test:a11y` — axe-core in browser)
- E2E tests (`test:e2e` — Playwright)
- Perf budgets (`test:perf` — real Chromium paint metrics)
- Selfhost smoke (`test:selfhost` — builds + scans dist/)
- Library emit + contract conformance
- Target timeout: 6 minutes

### `console-coverage` (merged coverage gate)
- Merged node+browser coverage with ≥80% threshold
- Independent Playwright install
- Target timeout: 6 minutes
