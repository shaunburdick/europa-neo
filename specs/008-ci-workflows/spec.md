# Spec: CI Workflow Hardening

> Version: 1.5
> Last Updated: 2026-10-23
**Status**: Implemented (2026-09-11); v1.4 amendments (issues #133/#144/#145) implemented 2026-10-13 on branch `ci/verify-conformance-parity` (delivery plan/tasks: `plan-gate-parity.md` + `tasks-gate-parity.md`; AC-024–AC-033 verified — red-suite/red-witness/guard drills recorded); v1.5 (2026-10-23) reconciles the workflow count with the shipped tree (issue #133 AC-029 residual)
> GitHub Issue: #3 (original), #131 (coverage-gate integrity), #133 (verify.sh CI-equivalence + composite build action, review ref I-27), #144 (per-package conformance programs wired, review ref I-13), #145 (contract single-sourcing guard, review ref I-14 — folded in by user decision)
> Dependencies: None

## Problem Statement

Downstream CI workflows don't accurately reflect upstream package dependencies in their `paths` triggers. Additionally, the workflows lack operational hardening features (concurrency groups, manual triggers, automated dependency updates) that are standard for production CI pipelines.

Beyond trigger correctness, the coverage-gate infrastructure has systemic integrity gaps: the console coverage config's a11y include glob is `tests/a11y/**/*.test.ts` while five `.tsx` a11y suites exist (~1,355 LOC never measured by `pnpm coverage`/the `console-coverage` CI job), `src/internal/**` (~3,022 LOC / 12 files) is excluded from all three console vitest configs, `@europa/design` and `@europa/version` suites run in no CI workflow (design's browser config is orphaned — `vitest.config.browser.ts` exists but no CI job references it), and design's coverage config excludes its own guard scripts. A coverage gate that doesn't execute what it claims is worse than no gate — it provides false confidence.

As of the v1.4 amendment (2026-10-13, verified against the tree), two further systemic gaps exist. First, `scripts/verify.sh` is not CI-equivalent: CI runs gates that no local gate runs (the `host-smoke-n-players`, `semantic-route-security`, and `semantic-url-privacy` console integration suites — which CI executes only via the console coverage config's node project — the runtime `contract-conformance` suite, the `@europa/core` coverage gate, and the `@europa/logging` test suite), so a red one of these passes `pnpm verify` and fails only at CI. Second, the contract "type witnesses" that specs 002/004/010 rely on never compile: every package tsconfig excludes `tests/` by design and vitest does not type-check, so the witnesses degenerate to runtime `expect(true).toBe(true)` keep-alives — only console and matchmaking even ship a `tsconfig.conformance.json`, matchmaking's program is invoked by no workflow, and networking and fog have none. Additionally, 13 workflows duplicated the checkout + pnpm-setup prologue by hand (9 of them including workspace build chains), package path filters watch direct dependencies only and miss transitive ones (verified: `matchmaking-ci.yml` omits `packages/fog/**` via matchmaking→networking→fog; `engine-ci.yml` omits `packages/terrain/**` despite engine's `@europa/terrain` devDependency), and this spec's own v1.0 acceptance criteria still say "6 CI workflows" while `.github/workflows/` ships 15 at amendment time — 16 as of v1.5, after #197 added its own `contract-guard.yml`.

## User Stories

- **US1**: As a contributor, I want CI to trigger only when relevant code changes so that I don't wait for unrelated pipelines.
- **US2**: As a maintainer, I want automated tool for keeping pinned action SHAs current so that security patches arrive without manual effort.
- **US3**: As a contributor, I want to manually re-trigger CI after transient failures so that I don't need empty commits.
- **US4**: As a maintainer, I want concurrent pushes to not waste runner resources so that CI costs stay reasonable.
- **US5**: As a maintainer, I want every coverage gate to execute exactly the tests it claims so that I can trust the ≥80% threshold (Constitution III).
- **US6**: As a contributor, I want a CI job that fails if a vitest config file exists but no script or workflow references it, so that orphaned configs are caught before they drift.
- **US7**: As a contributor, I want `pnpm verify` to run exactly the gates CI runs — including the integration, security, privacy, and conformance suites — so that a green local run means a green PR (issue #133).
- **US8**: As a maintainer, I want every package's contract type witnesses compiled by a dedicated strict program wired into CI and `pnpm verify`, so that mirror drift fails the gate instead of silently degenerating to `expect(true).toBe(true)` (issue #144).

## Functional Requirements

### Original (v1.0 — Issue #3)

- **FR-001**: Each workflow's `paths` filter must include only the package directories that are actual runtime or type dependencies (derived from `package.json`), plus shared root config files. — *Amended v1.4 (2026-10-13, issue #133 FR-027): "dependencies" now means the workspace-dependency closure defined in FR-027 — the gated package's own `dependencies`/`devDependencies`/`peerDependencies` workspace entries, PLUS the non-dev workspace dependencies (`dependencies` + `peerDependencies`) of each workspace dependency, transitively; a workspace dependency's `devDependencies` do NOT propagate to its consumers. Applied to push-time `paths:` and to the PR change-detection filter lists.*
- **FR-002**: `matchmaking-ci.yml` must NOT watch `packages/fog/**` (matchmaking has no dependency on fog). — *Amended v1.4 (2026-10-13, issue #133 FR-027): REVERSED for the transitive edge. `@europa/networking` declares `@europa/fog` a dependency, so matchmaking's gates transitively depend on fog and `matchmaking-ci.yml` MUST watch `packages/fog/**` under the transitive-closure rule. The v1.0 "no fog watch" rule reflected the direct-dependencies-only model this amendment replaces.*
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

### Commit-Message Hygiene (v1.3 — bot co-author trailers)

- **FR-018**: A commitlint configuration MUST exist at the repo root that extends `@commitlint/config-conventional` (enforcing the Constitution's Conventional Commits rule) AND adds a custom rule forbidding bot co-author trailers. The custom rule MUST reject any commit message containing a `Co-authored-by:` trailer whose name matches Copilot or Claude (case-insensitive, any casing/version suffix, e.g. `Claude Opus 4.5`). Rationale: GitHub's squash-merge preserves co-author trailers from branch commits, which put bot accounts on the repository's Contributors list.
- **FR-019**: A husky `commit-msg` hook MUST run commitlint on every local commit (via `pnpm exec commitlint --edit "$1"`), so a commit with a non-conventional message or a bot co-author trailer is rejected at commit time.
- **FR-020**: A CI workflow MUST lint the PR title with commitlint on every pull request to `main`. The PR title becomes the squash-merge commit subject, so it must satisfy the same rules as a local commit header.
- **FR-021**: The same CI workflow MUST lint every non-merge commit in the PR range (`base.sha..head.sha`) with commitlint, catching bot co-author trailers in branch commits before GitHub's squash-merge can preserve them into `main`. Merge commits MUST be excluded from the lint (their messages are not conventional).
- **FR-022**: The commitlint configuration MUST be a TypeScript file (`commitlint.config.ts`) consistent with the repo's TS-first tooling, and the dependencies (`@commitlint/cli`, `@commitlint/config-conventional`) MUST be pinned in the pnpm catalog and root `devDependencies`.
- **FR-023**: The commitlint CI workflow MUST follow the existing hardening patterns: SHA-pinned actions with version comments, `concurrency` group, `workflow_dispatch`, and `contents: read` permissions. It MUST NOT be path-gated — commit hygiene applies to every PR regardless of which files changed.

### CI/Local Verification Parity (v1.4 — Issue #133, review ref I-27)

- **FR-024**: `scripts/verify.sh` MUST additionally run each of the following CI gates that it omits at amendment time (verified 2026-10-13), before its success banner — **bounded parity, CONFIRMED by user decision 2026-10-13: `verify.sh` gains exactly the issue-named gates below and nothing more from issue #133's parity scope** (issue #145's contract guard is a separately named gate, added under FR-033):
  - the three console integration suites that CI (the `console-coverage` job) executes only via the console coverage config's node project — `pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/host-smoke-n-players.test.ts`, and likewise for `tests/integration/semantic-route-security.test.ts` and `tests/integration/semantic-url-privacy.test.ts` — invoked directly, NOT by running the coverage config's node project: the node project would re-run every suite Phases 5–6 already run, uninstrumented, for no added gate (Gate 1 SHOULD-1, 2026-10-13);
  - the runtime contract-conformance suite `pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/contract-conformance.test.ts` (excluded from the coverage session by design — it is a build-artifact gate);
  - the `@europa/core` coverage gate `pnpm --filter @europa/core coverage` (≥80% on all four metrics, enforced by the package's vitest config) — core's typecheck/lint/test already run locally; the `core-coverage` CI job is the remaining core gap;
  - the `@europa/logging` test suite `pnpm --filter @europa/logging test` — logging's tests currently run in `logging-ci.yml` but in no local gate.
  Any failure in these suites MUST fail `pnpm verify`. Bringing the remaining per-package coverage gates (engine, terrain, fog, networking, matchmaking, logging, design, version, console merged-coverage totals) into `verify.sh` is explicitly deferred (see Out of Scope) to bound local wall-clock.
- **FR-025 was removed at user decision (2026-10-13)** — it covered the parity meta-script; numbering gap retained.
- **FR-026**: The shared pnpm-setup + workspace-dependency-build prologue MUST be extracted into a repo-local composite action at `.github/actions/build-workspace` and invoked by every **package workflow** — defined here as the workflows that gate a workspace package's lint/typecheck/test/coverage: `client-ci.yml`, `core-ci.yml`, `engine-ci.yml`, `fog-ci.yml`, `logging-ci.yml`, `matchmaking-ci.yml`, `network-ci.yml`, `terrain-ci.yml`, and `manual-ci.yml` (for `@europa/manual`, a workspace package per `pnpm-workspace.yaml`). The setup/build steps duplicated by hand in those workflows MUST be replaced by the action; jobs in those workflows MUST NOT retain hand-rolled copies of that prologue. **Platform-constraint clarification (2026-10-13, FR-026 amendment note)**: `actions/checkout` remains each job's FIRST step and is NOT part of the composite action — a local action reference (`uses: ./…`) resolves from the workspace that `actions/checkout` populates, so an action containing the checkout cannot be reached (documented GitHub Actions platform constraint). What the action carries is everything after checkout: the pinned `pnpm/setup` step and the ordered workspace-dependency build loop. Non-package workflows (`commitlint.yml`, `docker.yml`, `pages-deploy.yml`, `release.yml`, `spec-guard.yml`, `version-drift.yml`) are NOT required to adopt the action in this amendment (user ruling 2026-10-13: `pages-deploy.yml` is a deploy workflow, not a package workflow). The v1.0 Out-of-Scope bullet "Composite action to DRY up shared setup steps (separate issue)" is superseded by this requirement (issue #133 is that issue).
- **FR-027**: Every workflow whose triggers or change-detection filters name package directories MUST derive those paths from the **workspace-dependency closure** of the gated package. Closure semantics (normative, HOLD-1 clarification): start from the gated package's OWN `dependencies`, `devDependencies`, and `peerDependencies` workspace entries; for every workspace dependency reached, add its NON-DEV workspace entries (`dependencies` + `peerDependencies`) and recurse; a workspace dependency's `devDependencies` do NOT propagate to its consumers (they gate that dependency's own CI, not its consumers'). These semantics apply both to push-time `paths:` filters and to the `dorny/paths-filter` change-detection lists that PR jobs gate on. Re-derived from the package manifests at amendment time (2026-10-13), this rule reproduces exactly the two verified misses — both MUST be fixed: `matchmaking-ci.yml` MUST watch `packages/fog/**` (matchmaking→networking→fog: fog is a `dependencies` entry of `@europa/networking`, so it propagates), and `engine-ci.yml` MUST watch `packages/terrain/**` (`@europa/terrain` is a direct `devDependencies` entry of engine itself, consumed by `packages/engine/src/replay/*` and `tests/replay/replay.test.ts`). Under the same semantics fog's closure is `{engine, core}` (engine's terrain devDependency does NOT propagate) and networking's is `{core, engine, fog, logging, version}` — matching their existing filters; the path filters of `core-ci.yml`, `fog-ci.yml`, `logging-ci.yml`, `network-ci.yml`, `terrain-ci.yml`, and `client-ci.yml` were verified closure-complete at amendment time. `terrain-ci.yml`'s extra `packages/engine/**` watch (engine depends on terrain, not the reverse) is recorded as an over-watch and left unchanged by this amendment.
- **FR-028**: This spec's workflow-count statements MUST match the shipped tree. At v1.5 (2026-10-23) `.github/workflows/` contains **16** workflow files: `client-ci.yml`, `commitlint.yml`, `contract-guard.yml`, `core-ci.yml`, `docker.yml`, `engine-ci.yml`, `fog-ci.yml`, `logging-ci.yml`, `manual-ci.yml`, `matchmaking-ci.yml`, `network-ci.yml`, `pages-deploy.yml`, `release.yml`, `spec-guard.yml`, `terrain-ci.yml`, `version-drift.yml`. The two v1.0 acceptance-criteria rows that read "All 6 CI workflows" are corrected below as dated historical annotations (six workflows existed at v1.0, 2026-08-21). Any future addition/removal of a workflow updates this list in the same change set (constitution IV). — *Amended v1.5 (2026-10-23, issue #133 AC-029 residual): the v1.4 enumeration listed 15 files and was correct when written (2026-10-13). The change set that wrote it — #197 — also added `contract-guard.yml` under FR-033, which made the count 16 within that same change set; the rule was violated by the change set that wrote it. v1.5 adds `contract-guard.yml` to the enumeration and records the v1.4 count here rather than rewriting the sequence.*

### Conformance-Program Wiring (v1.4 — Issue #144, review ref I-13)

- **FR-029**: Each contract-bearing package MUST ship a dedicated strict typecheck program `tsconfig.conformance.json` plus a `typecheck:conformance` script whose include set compiles the package's contract-conformance witness test file(s) alongside `src/` — closing the documented tradeoff that every package tsconfig excludes `tests/` and vitest does not type-check. Required set at amendment time: `packages/console` (exists — must stay green), `packages/matchmaking` (exists), `packages/networking` (missing — must be created, compiling `packages/networking/tests/contracts-conformance.test.ts`), `packages/fog` (missing — must be created, compiling `packages/fog/tests/conformance.test.ts`). A program MUST NOT exist without being invoked (no middle state).
- **FR-030**: Every `typecheck:conformance` program MUST be invoked in its package's CI workflow (`client-ci.yml` — already wired, `matchmaking-ci.yml` — exists but invoked by no workflow, `network-ci.yml`, `fog-ci.yml`) AND in `scripts/verify.sh`. At amendment time only console's program is wired in both places; matchmaking's `tsconfig.conformance.json` + script exist but run nowhere.
- **FR-031**: The matchmaking conformance program's include set MUST also compile the feature-006 cross-package conformance suite (`packages/matchmaking/tests/conformance.test.ts`), whose compile-time claims ("a non-conforming bridge handler fails typecheck") are false while `tests/` is excluded. This is the 006 match-lifecycle contract comparison: the package contract surface (`packages/matchmaking/contracts/match-types.ts`, `matchmaking-api.ts` — paths as of amendment time; after 006 v1.10 FR-027's unification the surface lives under `src/contracts/`) pinned against networking's/engine's canonical surfaces by compiled witnesses. For feature 010 the comparison coverage already exists — matchmaking's lobby witnesses (`tests/lobby-conformance.test.ts`) against the design transcriptions in `specs/010-public-lobby-match-browser/contracts/` (`lobby-types.md`, `lobby-api.md`) and networking's structural transcription checks (`lobby-wire.md`, `roster-wire.md`) — and becomes effective once FR-029/FR-030 wire it. NO spec-side TypeScript mirror is required for 006: `specs/006-match-lifecycle-matchmaking/contracts/README.md` (verified 2026-10-11) rules that TypeScript contract definitions live in the package, and the orphaned `specs/006-.../contracts/matchmaking-to-networking.ts` was already deleted by hygiene pass #160.
- **FR-032**: The change set implementing FR-029…FR-031 MUST demonstrate the red-witness property: a deliberately broken witness (e.g., a witnessed field dropped or a mirrored type retyped) MUST fail the corresponding CI job AND `pnpm verify`. The demonstration is recorded in the PR description; the broken state is never committed. This makes specs 002/004/010's "fails compilation" witness claims (amended in place: spec 004 v1.12 FR-028, spec 002 v1.10 FR-013) true rather than aspirational.

### Contract-Single-Sourcing Guard (v1.4 — Issue #145, review ref I-14; folded into this delivery by user decision 2026-10-13)

- **FR-033**: A repo-root guard script MUST fail when any **TypeScript** contract file under `specs/*/contracts/**` is not referenced by a test or source file — "referenced" means BOTH reference styles seen in the shipped tree: imports and explicit path-string mappings (as in `packages/console/tests/integration/contract-conformance.test.ts`, which imports a package contract at :42 and maps repo-relative contract paths as strings at :356) (the issue #145 AC-3 "unreferenced contract file" assertion, scoped after grounding: no `.ts` file remains under `specs/*/contracts/**` as of 2026-10-13 — all spec-side machine mirrors were deleted by hygiene pass #160 — so the guard is regression protection against re-introducing an unreferenced hand-maintained mirror). The guard MUST be scoped as follows: (a) it applies to `.ts` files only — prose `.md` contract documents (`specs/004/contracts/hardening-perf/wire-contract-update.md`, the feature-010 design transcriptions, and the 011/012/013/014/016 contract docs) are documentation and are NOT required to be referenced; (b) `README.md` files are exempt; (c) `specs/003-procedural-terrain-generation/contracts/` contains only `README.md` and therefore passes vacuously — the guard MUST NOT require resolving the deferred 64×64 terrain question (issue #138). The guard MUST be wired into `scripts/verify.sh` and a path-gated workflow and MUST complete in under 10 seconds (NFR-005 pattern).

## Non-Functional Requirements

### Original (v1.0)

- **NFR-001**: All action pins must use the latest stable version within their current major version line (conservative upgrade path).
- **NFR-002**: Permissions model must remain `contents: read` at workflow level with no escalation.
- **NFR-003**: Existing CI behavior must not change — only triggers and metadata are modified.

### Coverage-Gate Integrity (v1.1)

- **NFR-004**: Coverage gate changes must not increase CI wall-clock time by more than 60 seconds per new job. The `design-coverage` and `version-coverage` jobs should run in parallel with existing jobs, not sequentially.
- **NFR-005**: The orphaned-config guard must complete in under 10 seconds (it is a grep/find operation, not a test suite).
- **NFR-006**: All coverage threshold assertions must use Vitest's built-in `coverage.thresholds` (already in place per config) — no separate threshold-checking scripts.

### Commit-Message Hygiene (v1.3)

- **NFR-007**: The commitlint CI workflow MUST complete in under 60 seconds (it is a lint pass, not a test suite).
- **NFR-008**: The commitlint CI workflow MUST NOT require write permissions or publish artifacts — `contents: read` only.

### CI/Local Verification Parity (v1.4)

- **NFR-009 was removed at user decision (2026-10-13)** — it covered the parity meta-script (see the FR-025 note under Functional Requirements); numbering gap retained.
- **NFR-010**: The conformance programs (FR-029) MUST be compiler invocations only: no emitted artifacts, no new runtime dependencies, no network access.

## Acceptance Criteria

### Original (v1.0)

- [x] `matchmaking-ci.yml` paths no longer include `packages/fog/**` — *historical (v1.0, direct-deps-only model; FR-027 (v1.4) REVERSES this for the transitive edge matchmaking→networking→fog — `matchmaking-ci.yml` must now watch `packages/fog/**`; see AC-028)*
- [ ] All 6 CI workflows have `workflow_dispatch` trigger — *historical (v1.0, 2026-08-21: six workflows then existed); count superseded by FR-028 / AC-029 — 15 workflow files at v1.4*
- [ ] All 6 CI workflows have `concurrency` group — *historical (v1.0, 2026-08-21); same supersession as above*
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

### Commit-Message Hygiene (v1.3)

- [ ] **AC-019**: `pnpm exec commitlint` passes on a conventional commit message and fails on a non-conventional one (e.g. `fixup! foo` or a missing type).
- [ ] **AC-020**: commitlint fails on a message containing `Co-authored-by: Copilot <...>` or `Co-authored-by: Claude <...>` (any casing, any version suffix).
- [ ] **AC-021**: `.husky/commit-msg` exists and runs commitlint; a local commit with a bot co-author trailer is rejected.
- [ ] **AC-022**: The `commitlint.yml` CI workflow lints the PR title and every non-merge PR commit; a PR whose title or any branch commit contains a bot co-author trailer fails CI.
- [ ] **AC-023**: The commitlint workflow runs on every PR to `main` (not path-gated), completes in under 60 seconds, and uses SHA-pinned actions with version comments.

### CI/Local Verification Parity (v1.4 — Issue #133)

- [x] **AC-024**: With any one of `packages/console/tests/integration/{contract-conformance,host-smoke-n-players,semantic-route-security,semantic-url-privacy}.test.ts` made to fail, `pnpm verify` exits non-zero; the three node-mode integration suites are invoked directly (per FR-024, not via the coverage config).
- [x] **AC-025**: `pnpm verify` runs `pnpm --filter @europa/core coverage` and `pnpm --filter @europa/logging test`; a red one of them fails `pnpm verify`.
- **AC-026 was removed at user decision (2026-10-13)** — it covered the parity meta-script (FR-025); numbering gap retained.
- [x] **AC-027**: All nine package workflows (`client-ci.yml`, `core-ci.yml`, `engine-ci.yml`, `fog-ci.yml`, `logging-ci.yml`, `matchmaking-ci.yml`, `network-ci.yml`, `terrain-ci.yml`, `manual-ci.yml`) invoke `.github/actions/build-workspace`; the hand-rolled setup/build prologue steps are gone from those workflows (per FR-026's platform-constraint note, `actions/checkout` stays as each job's first step — it cannot live inside a local composite action).
- [x] **AC-028**: `matchmaking-ci.yml`'s filters include `packages/fog/**` and `engine-ci.yml`'s filters include `packages/terrain/**` — in both the push `paths:` list and the change-detection filter list — so a fog change triggers the matchmaking gates and a terrain change triggers the engine gates.
- [x] **AC-029**: Spec 008 contains no workflow-count statement inconsistent with the 15 files in `.github/workflows/` (FR-028). — *superseded v1.5 (2026-10-23): the FR-033 guard's own `contract-guard.yml`, added by #197 in the same change set that wrote this criterion, made the shipped count 16 — see AC-034*

### Conformance-Program Wiring (v1.4 — Issue #144)

- [x] **AC-030**: `packages/networking/tsconfig.conformance.json`, `packages/fog/tsconfig.conformance.json`, and `packages/matchmaking/tsconfig.conformance.json` each exist with a `typecheck:conformance` script (console's exists and stays green), and all four programs run in their package CI workflows (`client-ci.yml`, `network-ci.yml`, `fog-ci.yml`, `matchmaking-ci.yml`) AND in `scripts/verify.sh`.
- [x] **AC-031**: `packages/matchmaking/tests/conformance.test.ts` (feature-006 cross-package comparison) is inside the compiled include set of the matchmaking conformance program; the feature-010 lobby witnesses (`tests/lobby-conformance.test.ts`) are compiled by the same program.
- [x] **AC-032**: The red-witness drill is recorded in the PR description: a deliberately broken witness fails the corresponding CI job and `pnpm verify` (FR-032).

### Contract-Single-Sourcing Guard (v1.4 — Issue #145)

- [x] **AC-033**: The referenced-contract-file guard (FR-033) passes on the shipped tree (zero unreferenced `.ts` files under `specs/*/contracts/**`), fails when an unreferenced `.ts` contract file is added there, ignores `.md` prose contract documents and `README.md` files, completes in under 10 seconds, and is wired into `pnpm verify` and a path-gated workflow — without requiring any resolution of the deferred terrain 64×64 question (issue #138).

### Workflow-Count Reconciliation (v1.5 — issue #133 AC-029 residual)

- [x] **AC-034**: Spec 008 contains no workflow-count statement inconsistent with the 16 files in `.github/workflows/` (FR-028 as amended v1.5); the historical counts it narrates (6 at v1.0; 15 at v1.4) are each marked with their date rather than stated as present fact.

## Out of Scope

The following are explicitly **not** part of this feature:

- ~~Composite action to DRY up shared setup steps (separate issue)~~ — *superseded v1.4: issue #133 IS that issue; the composite action is now required by FR-026*
- Major version bumps (checkout v4→v7, setup-node v6→v7) — defer to separate PR
- `pnpm/setup` successor migration (pnpm v11+ path) — separate issue
- Test infrastructure de-duplication (E2E helpers, golden fixture replacement) — covered by the v1.2 Test-Suite Integrity section
- Test count reduction — covered by the v1.2 Test-Suite Integrity section
- Coverage threshold changes (the 80% gate is not being lowered or raised)
- v1.4 (issues #133/#144) scope boundaries: bringing every remaining per-package coverage gate (engine, terrain, fog, networking, matchmaking, logging, design, version, console merged totals) into `verify.sh` (only `@europa/core` coverage + the three directly-invoked console integration suites join in FR-024 — full coverage parity is deferred to bound local wall-clock; the coverage config's node project is deliberately NOT run locally, Gate 1 SHOULD-1); design browser-mode tests, `@europa/manual` link checks, `version-drift`, `docker`, and `release` gates in `verify.sh`; adopting the composite action in non-package workflows; any spec-side TypeScript mirror for feature 006 (contracts live in the package per `006/contracts/README.md`); anything under `packages/terrain` beyond the `engine-ci.yml` path-filter fix (issue #138 / 64×64 maps is explicitly deferred pending a product decision); changes to test *content* — this amendment wires programs and gates, it does not rewrite suites.

## Edge Cases

- Dependabot grouping: all action updates should be grouped into a single PR to avoid PR noise.
- Concurrency group key: uses `github.head_ref` for PRs (cancels outdated PR runs) and `github.run_id` for push runs (never cancels push runs).
- `src/internal/` files that are genuinely untestable (e.g., DOM-bound entry points only exercised by real-socket integration): exclude them individually with a `// Untestable: <reason>` comment. Blanket directory exclusion is forbidden after this change.
- Design browser config orphan: if `vitest.config.browser.ts` exists but no npm script points to it, the orphaned-config guard catches it. The fix is to wire the script, not delete the config.
- New packages added in the future: the orphaned-config guard automatically covers them — any new `vitest.config*.ts` must be referenced or CI fails.
- Adding a workspace dependency to a package changes its workspace-dependency-closure path filters (FR-027); the workflow filters MUST be extended in the same change set.
- A change to `.github/actions/build-workspace` affects all nine package workflows at once: the action stays minimal (setup + install + dependency builds only); `concurrency` groups, `permissions`, and change-detection jobs remain per-workflow.
- A new contract-witness test file MUST be added to its package's `tsconfig.conformance.json` include set in the same change set; a witness outside the program degrades to a vitest-only run (the exact failure mode FR-029 eliminates).

## Change Log

| Version | Date       | Change                                                                                          | Reason                                             |
|---------|------------|-------------------------------------------------------------------------------------------------|----------------------------------------------------|
| v1.5    | 2026-10-23 | Workflow-count reconciliation: FR-028 enumeration now lists 16 files including `contract-guard.yml`; AC-029 annotated as superseded; added AC-034; Problem Statement's v1.4 count dated as historical | Issue #133 AC-029 residual — #197's own `contract-guard.yml` (FR-033) made the shipped count 16 in the same change set that wrote "15" |
| v1.4    | 2026-10-13 | Added FR-024–FR-028, NFR-009–NFR-010, AC-024–AC-029 (CI/local parity: verify.sh gate additions, parity meta-script, `.github/actions/build-workspace` composite, workspace-dependency-closure path filters, workflow-count truth 15); added FR-029–FR-032, AC-030–AC-032 (per-package conformance programs wired into CI + verify.sh, 006/010 contract-comparison closure, red-witness drill); amended FR-001/FR-002 (closure model reverses the v1.0 "no fog watch" rule); superseded the composite-action Out-of-Scope bullet; historical annotations on the v1.0 "6 workflows" AC rows. Gate 1 revisions (2026-10-13): FR-027/FR-001 closure semantics defined precisely — the gated package's own deps/devDeps/peerDeps plus each dependency's NON-DEV workspace entries transitively (devDependencies do not propagate to consumers), reproducing exactly the two named misses and the verified-complete list; FR-024/AC-024 now invoke the three node-mode integration suites DIRECTLY instead of running the coverage config's node project locally (the node project re-runs every suite Phases 5–6 already run, uninstrumented — wall-clock for no added gate); NFR-010's per-package tsc-pass cap removed (cut list); FR-025/NFR-009/AC-026 marked PENDING USER DECISION (cuttable as one block). User decisions + scope fold-in (2026-10-13): FR-025, NFR-009, AC-026 REMOVED at user decision (parity meta-script cut; numbering gaps FR-025/NFR-009/AC-026 retained, tombstoned in place); bounded parity CONFIRMED on FR-024 (verify.sh gains exactly the issue-named gates); composite-action nine-workflow scope and the 006 "wire-not-add" ruling confirmed; issue #145 (I-14) folded into this delivery by user decision — added FR-033/AC-033 (referenced-contract-file guard, .ts-only scoping, terrain 64×64 untouched). Implementation note (2026-10-13): FR-026/AC-027 wording corrected for the composite-action platform constraint — `actions/checkout` stays each package job's first step and is NOT inside `.github/actions/build-workspace` (a local action resolves only from the checked-out workspace); the action carries pnpm-setup + the dependency-build loop, and the "hand-rolled prologue gone" requirement applies to the setup/build steps | Issues #133 (I-27), #144 (I-13), #145 (I-14): verify.sh not CI-equivalent; contract type witnesses never compile; contract-mirror single-sourcing (delivery plan/tasks: `specs/008-ci-workflows/plan-gate-parity.md`, `tasks-gate-parity.md`) |
| v1.3    | 2026-09-14 | Added FR-018–FR-023, NFR-007–NFR-008, AC-019–AC-023 (commit-message hygiene: commitlint in husky + CI) | Bot co-author trailers (Copilot/Claude) reached main via squash-merge and polluted the Contributors list |
| v1.2    | 2026-09-12 | Added FR-013–FR-017 (spec-consolidation integrity), FR-001–FR-026 of absorbed feature 016 (test-suite integrity), AC-014–AC-018; absorbed feature 016 (issue #139) | Spec consolidation + test-suite reduction (issue #139) |
| v1.1    | 2026-09-11 | Added FR-007–FR-012, NFR-004–NFR-006, AC-007–AC-013, expanded Problem Statement and US5–US6     | Coverage-gate integrity gaps (issue #131, I-26)     |
| v1.0    | 2026-08-21 | Initial spec: FR-001–FR-006, NFR-001–NFR-003, AC-001–AC-006                                    | CI trigger/hardening baseline (issue #3)            |
