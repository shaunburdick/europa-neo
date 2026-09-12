# Plan: Coverage-Gate Integrity + Test Infrastructure Consolidation

**Feature**: 008-ci-workflows (v1.1) + 016-test-suite-cleanup (v1.1)
**GitHub Issue**: #131
**Date**: 2026-09-11
**Branch**: `issue-131-coverate-gate-integrity`

## Technical Context

- **Repository**: Europa Neo monorepo (pnpm workspaces, 9 packages)
- **CI Platform**: GitHub Actions (13 workflow files)
- **Test Framework**: Vitest 4.x (node-mode + browser-mode via Playwright), Playwright E2E
- **Coverage**: V8 provider, ≥80% gate on all four metrics (Constitution III)
- **Constitution**: `.specify/memory/constitution.md` — TypeScript strict, determinism discipline, ≥80% coverage gate, specs-as-documentation, simplicity over cleverness

### Current State (Pre-Change)

| Area | Status |
|------|--------|
| Console a11y glob (coverage config) | `tests/a11y/**/*.test.ts` — MISSES 5 `.tsx` files |
| `src/internal/**` coverage | Excluded from ALL 3 console vitest configs (~3,022 LOC) |
| `@europa/design` coverage CI | NO job — only `design-browser-test` exists |
| `@europa/version` coverage CI | NO job in ANY workflow — only `version-drift.yml` |
| Orphaned vitest config detection | NONE — configs can go stale silently |
| Golden fixture | 1.7 MB `golden-1000-tick.json` committed to repo |
| Test-only modules in `src/` | `test-state.ts` (used by App.tsx), `fake-match-client.ts` (unused by production) |
| setTimeout-for-condition in tests | ~10 occurrences across 7 test files |
| Potential unfalsifiable assertions | ~100 `toBeDefined()`/`not.toBeNull()` calls across packages |

## Architecture Decisions

### AD-001: Fix coverage config, don't restructure coverage collection

**Decision**: Fix the a11y glob and remove `src/internal/**` exclusion in the existing three vitest configs. Do not restructure how coverage is collected.
**Rationale**: The existing coverage architecture (node-mode + browser-mode merged via `vitest.config.coverage.ts`) is sound. The bugs are in configuration values, not architecture.

### AD-002: Remove `src/internal/**` blanket exclusion, add per-file exclusions only where justified

**Decision**: Remove `src/internal/**` from all three `coverage.exclude` arrays. For files genuinely untestable (e.g., DOM-bound entry points like `live-runtime.tsx` that are only exercised by real-socket integration), add individual `// Untestable: <reason>` exclusions.
**Rationale**: User decision + spec FR-008. The blanket exclusion hides 3,022 LOC of code from the coverage gate. Per-file exclusions maintain transparency. The `test-state.ts` file IS tested (used by App.tsx which is tested); `live-runtime.tsx` and `lobby-runtime.tsx` are DOM-bound and need real-browser coverage.

### AD-003: Add coverage jobs to `client-ci.yml`, not separate workflow files

**Decision**: Add `design-coverage` and `version-coverage` jobs to the existing `client-ci.yml` workflow.
**Rationale**: `client-ci.yml` already covers all packages. Adding separate workflow files would duplicate the `changes` detection job and the checkout/pnpm/build steps. The new jobs are lightweight (run `pnpm coverage` for small packages) and fit naturally alongside the existing `console-coverage` job.

### AD-004: Orphaned-config guard as inline CI step, not a separate script

**Decision**: Add an inline CI step (bash one-liner) that greps for `vitest.config*.ts` files and cross-references them against npm scripts and workflow job names. Fail if any config is unreferenced.
**Rationale**: NFR-005 requires <10 seconds. A `find | while read` loop checking `grep -r` against `package.json` scripts and workflow YAML is fast and simple. No need for a separate script file.

### AD-005: Golden fixture → SHA-256 hash in `beforeAll`

**Decision**: Replace the 1.7 MB `golden-1000-tick.json` with a SHA-256 hash loaded in `beforeAll`. The scenario code (`determinism-scenario.ts`) is already pure and deterministic. Run it, hash the JSON output, compare against a stored constant.
**Rationale**: User decision + spec FR-023. The hash is ~64 bytes vs 1.7 MB. The determinism guarantee is identical: if the scenario output changes, the hash diverges. The generation script emits the hash instead of the full JSON.

### AD-006: `test-state.ts` stays in `src/internal/` — it's production code

**Decision**: `test-state.ts` is imported by `src/render/App.tsx` (production code) for its dev/demo fallback chain. It is NOT test-only — it's a legitimate module used by production. Leave it in place.
**Rationale**: Spec FR-026 targets test-only modules. `test-state.ts` is production code that happens to also be used by tests. `fake-match-client.ts` IS test-only (zero production imports) and should be relocated.

### AD-007: `fake-match-client.ts` relocated to `tests/fixtures/`

**Decision**: Move `src/internal/fake-match-client.ts` to `tests/fixtures/fake-match-client.ts`. It has zero production imports (verified by grep).
**Rationale**: FR-026 — clean separation of test infrastructure from production source.

### AD-008: setTimeout patterns — replace only in unit tests, keep in integration/E2E

**Decision**: Replace `setTimeout`-for-condition in unit test files with `vi.waitFor()` / `vi.useFakeTimers()`. Integration and E2E tests (real sockets, real timers) may retain `setTimeout` where necessary.
**Rationale**: FR-024 scopes the ban to "unit tests (excluding E2E and browser-mode tests where real timers are necessary)." Integration tests like `quiet-client-keepalive` and `lobby-transport` test real networking behavior that requires real timers.

## Files to Modify

### Coverage Config Fixes

| File | Change |
|------|--------|
| `packages/console/vitest.config.coverage.ts` | Fix a11y glob: `tests/a11y/**/*.test.ts` → `tests/a11y/**/*.test.{ts,tsx}`; remove `src/internal/**` from `coverage.exclude` (node + browser projects + top-level) |
| `packages/console/vitest.config.ts` | Remove `src/internal/**` from `coverage.exclude` |
| `packages/console/vitest.config.browser.ts` | Remove `src/internal/**` from `coverage.exclude` |
| `packages/console/vitest.config.coverage.ts` | Add per-file exclusions for genuinely untestable DOM-bound entry points (`live-runtime.tsx`, `lobby-runtime.tsx`) with `// Untestable:` comments |

### CI Workflow Changes

| File | Change |
|------|--------|
| `.github/workflows/client-ci.yml` | Add `design-coverage` job (runs `pnpm --filter @europa/design coverage`); Add `version-coverage` job (runs `pnpm --filter @europa/version coverage`); Add orphaned-config guard step to a suitable existing job (or new lightweight job) |
| `.github/workflows/version-drift.yml` | No changes — `version-drift.yml` is for version drift detection, not test coverage |

### Golden Fixture Replacement

| File | Change |
|------|--------|
| `packages/console/tests/fixtures/golden-1000-tick.json` | DELETE (1.7 MB) |
| `packages/console/tests/integration/determinism.test.ts` | Rewrite: run scenario in `beforeAll`, hash output (SHA-256), compare against stored hash constant |
| `packages/console/scripts/generate-determinism-golden.ts` | Rewrite: emit hash constant instead of full JSON; or delete if no longer needed |

### Test-Only Module Relocation

| File | Change |
|------|--------|
| `packages/console/src/internal/fake-match-client.ts` | Move to `packages/console/tests/fixtures/fake-match-client.ts` |
| `packages/console/tests/component/render/pipe-slope.test.tsx` | Update import path |
| `packages/console/tests/component/render/map-canvas.test.tsx` | Update import path |

### setTimeout Replacements (unit tests only)

| File | Pattern | Replacement |
|------|---------|-------------|
| `packages/console/tests/unit/runtime.test.ts` | `await new Promise(resolve => setTimeout(resolve, 50))` | `vi.waitFor()` with retry |
| `packages/console/tests/unit/net/ws-lobby-client.test.ts` | `setTimeout(fn, ms)` fake timer setup | Verify fake timers are used correctly |
| `packages/console/tests/unit/net/ws-lobby-client.test.ts` | `setTimeout(resolve, 0)` | Already using fake timers — verify |

## Validation

### AC Mapping

| AC | How Verified |
|----|-------------|
| AC-007 | `vitest.config.coverage.ts` a11y glob is `*.test.{ts,tsx}` — all 8 a11y files (3 `.ts` + 5 `.tsx`) run in `pnpm coverage` |
| AC-008 | `src/internal/**` not in any `coverage.exclude`; per-file exclusions only for DOM-bound entry points |
| AC-009 | `design-coverage` job exists in `client-ci.yml`, runs `pnpm --filter @europa/design coverage`, passes |
| AC-010 | `version-coverage` job exists in `client-ci.yml`, runs `pnpm --filter @europa/version coverage`, passes |
| AC-011 | Orphaned-config guard script/step exists and passes (zero orphaned configs) |
| AC-012 | `design-browser-test` job runs `test:browser` → references `vitest.config.browser.ts` explicitly |
| AC-013 | `pnpm coverage` (console) reports non-zero hit counts for `src/internal/` files |
| AC-012 (016) | `golden-1000-tick.json` deleted; determinism test passes via hash comparison |
| AC-013 (016) | Zero `setTimeout`-for-condition in unit test files |
| AC-015 (016) | `fake-match-client.ts` relocated to `tests/fixtures/`; no `src/` file imported exclusively by tests |

### Local Verification

1. `pnpm typecheck` — all packages pass
2. `pnpm lint` — Biome clean
3. `pnpm format:check` — formatted
4. `pnpm --filter @europa/console test:unit` — unit tests pass
5. `pnpm --filter @europa/console test:determinism` — hash-based determinism passes
6. `pnpm --filter @europa/console coverage` — ≥80% on all four metrics, `src/internal/` files appear in report
7. `pnpm --filter @europa/design coverage` — ≥80% on all four metrics
8. `pnpm --filter @europa/version coverage` — ≥80% on all four metrics
9. Orphaned-config guard passes (zero orphaned configs)
10. `pnpm test` — full monorepo test suite passes

## Constitution Alignment

| Principle | Alignment |
|-----------|-----------|
| I. Type Safety | All new/modified code TypeScript strict; no `any` in test helpers |
| III. Tested Game Logic | ≥80% gate strengthened: more code now measured by the gate |
| IV. Specs as Documentation | Both specs amended in the same change set (v1.1) |
| V. Simplicity | Orphaned-config guard is a simple grep loop; golden fixture replacement is one hash comparison |
| VI. Accessibility | No a11y tests removed; a11y glob fix ensures ALL a11y tests are measured |
