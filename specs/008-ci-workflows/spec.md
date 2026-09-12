# Spec: CI Workflow Hardening

> Version: 1.2
> Last Updated: 2026-09-12
> Status: Implemented (2026-09-11)
> GitHub Issue: #3 (original), #131 (coverage-gate integrity)
> Dependencies: None

## Problem Statement

Downstream CI workflows don't accurately reflect upstream package dependencies in their `paths` triggers. Additionally, the workflows lack operational hardening features (concurrency groups, manual triggers, automated dependency updates) that are standard for production CI pipelines.

Beyond trigger correctness, the coverage-gate infrastructure has systemic integrity gaps: the console coverage config's a11y include glob is `tests/a11y/**/*.test.ts` while five `.tsx` a11y suites exist (~1,355 LOC never measured by `pnpm coverage`/the `console-coverage` CI job), `src/internal/**` (~3,022 LOC / 12 files) is excluded from all three console vitest configs, `@europa/design` and `@europa/version` suites run in no CI workflow (design's browser config is orphaned — `vitest.config.browser.ts` exists but no CI job references it), and design's coverage config excludes its own guard scripts. A coverage gate that doesn't execute what it claims is worse than no gate — it provides false confidence.

## User Stories

- **US1**: As a contributor, I want CI to trigger only when relevant code changes so that I don't wait for unrelated pipelines.
- **US2**: As a maintainer, I want automated tool for keeping pinned action SHAs current so that security patches arrive without manual effort.
- **US3**: As a contributor, I want to manually re-trigger CI after transient failures so that I don't need empty commits.
- **US4**: As a maintainer, I want concurrent pushes to not waste runner resources so that CI costs stay reasonable.
- **US5**: As a maintainer, I want every coverage gate to execute exactly the tests it claims so that I can trust the ≥80% threshold (Constitution III).
- **US6**: As a contributor, I want a CI job that fails if a vitest config file exists but no script or workflow references it, so that orphaned configs are caught before they drift.

## Functional Requirements

### Original (v1.0 — Issue #3)

- **FR-001**: Each workflow's `paths` filter must include only the package directories that are actual runtime or type dependencies (derived from `package.json`), plus shared root config files.
- **FR-002**: `matchmaking-ci.yml` must NOT watch `packages/fog/**` (matchmaking has no dependency on fog).
- **FR-003**: A `.github/dependabot.yml` must be configured for the `github-actions` ecosystem to automatically propose SHA updates.
- **FR-004**: All CI workflows (except pages-deploy which already has one) must include a `concurrency` group keyed to `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` with `cancel-in-progress: true` for PRs.
- **FR-005**: All CI workflows must include `workflow_dispatch` for manual re-triggering.
- **FR-006**: All third-party action references must be pinned to full 40-character commit SHAs with version comments.

### Coverage-Gate Integrity (v1.1 — Issue #131)

- **FR-007**: The console coverage browser project's a11y include glob must be `tests/a11y/**/*.test.{ts,tsx}` (not `*.test.ts`) so that the five `.tsx` suites (`lobby-keyboard`, `lobby-roster-card`, `logo-accessibility`, `profile-view`, `semantic-route-a11y`) are executed during `pnpm coverage` and the `console-coverage` CI job. The `vitest.config.browser.ts` already uses the correct glob — the coverage config must match.

- **FR-008**: Remove `src/internal/**` from the `coverage.exclude` arrays in all three console vitest configs (`vitest.config.ts`, `vitest.config.browser.ts`, `vitest.config.coverage.ts`). The 12 files in `src/internal/` (~3,022 LOC) must be covered by the ≥80% gate. If specific files are genuinely untestable (e.g., DOM-bound entry points like `live-runtime.tsx`), they must be excluded individually with a comment justifying each exclusion — not blanket-directory exclusion.

- **FR-009**: Add a `design-coverage` CI job to `client-ci.yml` that runs `pnpm --filter @europa/design coverage` and asserts ≥80% on all four metrics. The job must depend on the design build step. This closes the gap where `@europa/design` has a browser-test job (`design-browser-test`) but no coverage enforcement.

- **FR-010**: Add a `version-coverage` CI job to `client-ci.yml` (or a dedicated `version-ci.yml` if preferred) that runs `pnpm --filter @europa/version coverage` and asserts ≥80% on all four metrics. `@europa/version` currently has no test or coverage job in any workflow — only `version-drift.yml` checks version drift.

- **FR-011**: Every `vitest.config*.ts` file in the monorepo must be referenced by at least one npm script in its package's `package.json` AND by at least one CI workflow job. Add a CI guard (a script or inline step) that scans for orphaned configs — vitest config files not referenced by any script or workflow — and fails CI if any are found. This catches configs like `packages/design/vitest.config.browser.ts` which exists but may not be consistently invoked.

- **FR-012**: The design package's `vitest.config.browser.ts` must be referenced by a CI job (the `design-browser-test` job in `client-ci.yml` already runs `pnpm --filter @europa/design test:browser`, which uses this config — verify the linkage is explicit and document it).

### Spec-Consolidation Integrity (v1.2 — Issue #139)

- **FR-013**: A CI guard MUST fail if any two spec directories share the same numeric prefix (e.g., `012-3-4-player-support` and `012-design-system`). Duplicate prefixes are forbidden after consolidation.
- **FR-014**: A CI guard MUST fail if a spec directory is marked `**Status**: Implemented` but lacks `tasks.md` and `plan.md` (or their spec-kit equivalents). Implemented specs must carry their full planning trail.
- **FR-015**: A CI guard MUST fail if a spec directory exists without a `spec.md` (e.g., `043-pipe-slope-colors`). Spec directories must contain their spec.
- **FR-016**: A CI guard MUST fail if any tracked file references the legacy `.specify/features/` path (the pre-migration layout). This is the standing regression check from the specs-layout migration (issue #12).
- **FR-017**: The guard MUST be implemented as a script modeled on `scripts/check-orphaned-vitest-configs.ts`, wired into `scripts/verify.sh` and a path-gated workflow, and MUST complete in under 10 seconds.

### Test-Suite Integrity (v1.2 — Issue #139, absorbed feature 016)

- **016-FR-001**: Remove tests that assert implementation details (internal function names, call counts, private helpers) rather than public behavior.
- **016-FR-002**: Remove tests that duplicate coverage already provided by higher-level suites (unit tests that re-test what integration/E2E tests cover).
- **016-FR-003**: Remove snapshot tests that add no value beyond asserting the snapshot itself.
- **016-FR-004**: Remove type-level tests that only re-assert TypeScript's own type checking.
- **016-FR-005**: Remove re-export tests that only assert a symbol is re-exported.
- **016-FR-006**: Remove tests for stale or removed behavior (tests that pass only because the behavior they test no longer exists).
- **016-FR-007**: Retain tests that verify public API contracts, game-critical logic, E2E flows, and accessibility.
- **016-FR-008**: Reduce the console package's test count by 40–50% (from ~1,300 to ~700–800) without reducing coverage below the ≥80% gate.
- **016-FR-009**: Reduce matchmaking, networking, and design package test counts by 30–40%.
- **016-FR-010**: Reduce engine, terrain, and fog package test counts by 20–30%.
- **016-FR-011**: The console CI job MUST complete in under 4 minutes (currently ~10 minutes); restore a job `timeout-minutes` guard.
- **016-FR-012**: Add Playwright browser caching to the console CI job.
- **016-FR-013**: Split `client-ci.yml` into three jobs: `console-test` (~3 min), `console-e2e` (~6 min), `console-coverage` (~6 min).
- **016-FR-014**: Extract shared E2E helpers (match creation, join, board assertions) into a single module.
- **016-FR-015**: Replace the committed golden fixture `tests/fixtures/golden-1000-tick.json` (1.7 MB) with a SHA-256 hash check; regenerate the fixture on demand.
- **016-FR-016**: Replace fake-timer tests with real-timer tests where the timing behavior is the subject under test.
- **016-FR-017**: Remove tests with unfalsifiable assertions (e.g., `expect(true).toBe(true)`, empty mocks).
- **016-FR-018**: Move test-only modules out of `src/` into `tests/` (or a dedicated test-support directory).
- **016-FR-019**: Every removed test MUST be justified in the PR description (removal log).
- **016-FR-020**: The removal MUST NOT reduce coverage below the ≥80% gate on any metric in any package.
- **016-FR-021**: The removal MUST NOT remove any test that covers a documented FR or SC.
- **016-FR-022**: The removal MUST NOT remove any E2E test that covers a user-facing flow.
- **016-FR-023**: The removal MUST NOT remove any accessibility test.
- **016-FR-024**: The removal MUST NOT remove any determinism test.
- **016-FR-025**: The removal MUST NOT remove any conformance test (contract mirrors, wire byte-identity).
- **016-FR-026**: The removal MUST NOT remove any test that caught a real bug (each removal candidate is checked against the bug-fix history).

## Non-Functional Requirements

### Original (v1.0)

- **NFR-001**: All action pins must use the latest stable version within their current major version line (conservative upgrade path).
- **NFR-002**: Permissions model must remain `contents: read` at workflow level with no escalation.
- **NFR-003**: Existing CI behavior must not change — only triggers and metadata are modified.

### Coverage-Gate Integrity (v1.1)

- **NFR-004**: Coverage gate changes must not increase CI wall-clock time by more than 60 seconds per new job. The `design-coverage` and `version-coverage` jobs should run in parallel with existing jobs, not sequentially.
- **NFR-005**: The orphaned-config guard must complete in under 10 seconds (it is a grep/find operation, not a test suite).
- **NFR-006**: All coverage threshold assertions must use Vitest's built-in `coverage.thresholds` (already in place per config) — no separate threshold-checking scripts.

## Acceptance Criteria

### Original (v1.0)

- [ ] `matchmaking-ci.yml` paths no longer include `packages/fog/**`
- [ ] All 6 CI workflows have `workflow_dispatch` trigger
- [ ] All 6 CI workflows have `concurrency` group
- [ ] `.github/dependabot.yml` exists and is valid
- [ ] All action SHAs are updated to latest within same major
- [ ] No workflow behavior changes (same jobs, same steps, same commands)

### Coverage-Gate Integrity (v1.1)

- [ ] **AC-007**: `vitest.config.coverage.ts` browser project a11y include glob is `tests/a11y/**/*.test.{ts,tsx}` — all 8 a11y files (3 `.ts` + 5 `.tsx`) execute during `pnpm coverage`.
- [ ] **AC-008**: `src/internal/**` is NOT in any `coverage.exclude` array in the console package. Coverage reports include `src/internal/` files. Individual untestable files (if any) have explicit per-file exclusions with comments.
- [ ] **AC-009**: `client-ci.yml` has a `design-coverage` job that runs `pnpm --filter @europa/design coverage` and the job passes (≥80% on statements, branches, functions, lines).
- [ ] **AC-010**: `client-ci.yml` has a `version-coverage` job that runs `pnpm --filter @europa/version coverage` and the job passes (≥80% on all four metrics).
- [ ] **AC-011**: A CI step or script detects orphaned `vitest.config*.ts` files (not referenced by any npm script or workflow) and fails CI if any exist. Currently, zero orphaned configs exist after the fix.
- [ ] **AC-012**: `packages/design/vitest.config.browser.ts` is explicitly referenced by the `design-browser-test` CI job (via the `test:browser` npm script) — verify the chain: CI job → npm script → vitest config file.
- [ ] **AC-013**: `pnpm coverage` in the console package reports coverage for `src/internal/` files (non-zero hit counts for files in that directory).
- [ ] **AC-014**: The spec-consolidation guard fails on a duplicate spec-number prefix, an Implemented spec without `tasks.md`/`plan.md`, a spec directory without `spec.md`, and a tracked file referencing the legacy `.specify/features/` path.
- [ ] **AC-015**: The spec-consolidation guard passes on the consolidated tree (zero violations) and completes in under 10 seconds.
- [ ] **AC-016**: The spec-consolidation guard is wired into `scripts/verify.sh` and a path-gated workflow.
- [ ] **AC-017**: The test-suite reduction targets are met: console 40–50% fewer tests, matchmaking/networking/design 30–40% fewer, engine/terrain/fog 20–30% fewer, with coverage ≥80% on every metric in every package.
- [ ] **AC-018**: The console CI job completes in under 4 minutes with the three-way split (`console-test` / `console-e2e` / `console-coverage`) and Playwright caching in place.

## Out of Scope

The following are explicitly **not** part of this feature:

- Composite action to DRY up shared setup steps (separate issue)
- Major version bumps (checkout v4→v7, setup-node v6→v7) — defer to separate PR
- `pnpm/setup` successor migration (pnpm v11+ path) — separate issue
- Test infrastructure de-duplication (E2E helpers, golden fixture replacement) — covered by the v1.2 Test-Suite Integrity section
- Test count reduction — covered by the v1.2 Test-Suite Integrity section
- Coverage threshold changes (the 80% gate is not being lowered or raised)

## Edge Cases

- Dependabot grouping: all action updates should be grouped into a single PR to avoid PR noise.
- Concurrency group key: uses `github.head_ref` for PRs (cancels outdated PR runs) and `github.run_id` for push runs (never cancels push runs).
- `src/internal/` files that are genuinely untestable (e.g., DOM-bound entry points only exercised by real-socket integration): exclude them individually with a `// Untestable: <reason>` comment. Blanket directory exclusion is forbidden after this change.
- Design browser config orphan: if `vitest.config.browser.ts` exists but no npm script points to it, the orphaned-config guard catches it. The fix is to wire the script, not delete the config.
- New packages added in the future: the orphaned-config guard automatically covers them — any new `vitest.config*.ts` must be referenced or CI fails.

## Change Log

| Version | Date       | Change                                                                                          | Reason                                             |
|---------|------------|-------------------------------------------------------------------------------------------------|----------------------------------------------------|
| v1.2    | 2026-09-12 | Added FR-013–FR-017 (spec-consolidation integrity), FR-001–FR-026 of absorbed feature 016 (test-suite integrity), AC-014–AC-018; absorbed feature 016 (issue #139) | Spec consolidation + test-suite reduction (issue #139) |
| v1.1    | 2026-09-11 | Added FR-007–FR-012, NFR-004–NFR-006, AC-007–AC-013, expanded Problem Statement and US5–US6     | Coverage-gate integrity gaps (issue #131, I-26)     |
| v1.0    | 2026-08-21 | Initial spec: FR-001–FR-006, NFR-001–NFR-003, AC-001–AC-006                                    | CI trigger/hardening baseline (issue #3)            |
