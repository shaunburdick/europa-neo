# Tasks: Coverage-Gate Integrity + Test Infrastructure Consolidation

**Branch**: `issue-131-coverate-gate-integrity` | **Date**: 2026-09-11 | **Specs**: 008 v1.1, 016 v1.1

---

## Wave 1: Coverage Config Fixes

Foundation — these changes affect what the coverage gate measures.

- [ ] T-001: **Fix a11y glob in `vitest.config.coverage.ts`**
  - File: `packages/console/vitest.config.coverage.ts`
  - Change: browser project `include` array — line 67 `tests/a11y/**/*.test.ts` → `tests/a11y/**/*.test.{ts,tsx}`
  - This aligns with `vitest.config.browser.ts` line 30 which already uses the correct glob
  - Verify: run `pnpm --filter @europa/console test:a11y` — all 8 a11y files (3 `.ts` + 5 `.tsx`) execute

- [ ] T-002: **Remove `src/internal/**` from `vitest.config.ts` coverage exclude**
  - File: `packages/console/vitest.config.ts`
  - Change: line 44 — remove `'src/internal/**'` from `exclude` array
  - Keep `'src/main.tsx'` and `'**/*.d.ts'` exclusions
  - Note: `vitest.config.ts` only covers `src/state/**`, `src/input/**`, etc. via its `include` — `src/internal/` isn't in the include list either, so this removal is a no-op for this config. Remove anyway for consistency.

- [ ] T-003: **Remove `src/internal/**` from `vitest.config.browser.ts` coverage exclude**
  - File: `packages/console/vitest.config.browser.ts`
  - Change: line 39 — remove `'src/internal/**'` from `exclude` array
  - Keep `'src/main.tsx'` and `'**/*.d.ts'` exclusions

- [ ] T-004: **Remove `src/internal/**` from `vitest.config.coverage.ts` coverage exclude + add per-file exclusions**
  - File: `packages/console/vitest.config.coverage.ts`
  - Change: line 25 — remove `'src/internal/**'` from top-level `exclude` array
  - Add per-file exclusions for DOM-bound entry points that cannot be tested without real-browser + real-socket integration:
    ```
    // Untestable: DOM-bound entry point exercised only by real-socket integration and E2E suites.
    // Covers live-runtime.tsx (the legacy query-driven entry path).
    'src/internal/live-runtime.tsx',
    // Untestable: DOM-bound production mount for /lobby, /match/:id routes.
    // Covered by real-matchmaker E2E suites (full-stack.spec.ts) and semantic-route tests.
    'src/internal/lobby-runtime.tsx',
    // Untestable: Dev-server demo mount — only exercised by the Vite dev server.
    'src/internal/demo-runtime.tsx',
    ```
  - Keep `'src/main.tsx'` and `'**/*.d.ts'` exclusions
  - Verify: `pnpm --filter @europa/console coverage` — `src/internal/` files appear in the report with non-zero hit counts for tested files (test-state.ts, fake-match-client.ts, lobby-layout.tsx, etc.)

- [ ] T-005: **Verify coverage gate passes after config fixes**
  - Run: `pnpm --filter @europa/console coverage`
  - Assert: all four metrics ≥ 80%
  - Assert: `src/internal/test-state.ts` shows non-zero coverage
  - Assert: a11y `.tsx` files appear in the coverage report
  - Record before/after metrics for PR description

---

## Wave 2: CI Workflow Changes

Depends on Wave 1 — coverage configs must be correct before adding CI jobs.

- [ ] T-006: **Add `design-coverage` job to `client-ci.yml`** [P]
  - File: `.github/workflows/client-ci.yml`
  - Add new job after `design-browser-test`:
    ```yaml
    design-coverage:
      name: Coverage gate (design ≥ 80%)
      needs: [changes]
      if: needs.changes.outputs.changed == 'true'
      runs-on: ubuntu-latest
      timeout-minutes: 3
      steps:
        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        - uses: pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b # v2.1.0
          with:
            runtime: 'node@22'
            cache: true
            require-lockfile: true
        - name: Build @europa/design
          run: pnpm --filter @europa/design build
        - name: Coverage (design)
          run: pnpm --filter @europa/design coverage
    ```
  - Verify: job runs and passes (design already has ≥80% coverage)

- [ ] T-007: **Add `version-coverage` job to `client-ci.yml`** [P]
  - File: `.github/workflows/client-ci.yml`
  - Add new job:
    ```yaml
    version-coverage:
      name: Coverage gate (version ≥ 80%)
      needs: [changes]
      if: needs.changes.outputs.changed == 'true'
      runs-on: ubuntu-latest
      timeout-minutes: 3
      steps:
        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        - uses: pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b # v2.1.0
          with:
            runtime: 'node@22'
            cache: true
            require-lockfile: true
        - name: Build @europa/version
          run: pnpm --filter @europa/version build
        - name: Coverage (version)
          run: pnpm --filter @europa/version coverage
    ```
  - Verify: job runs and passes (version already has ≥80% coverage — 100%×4 per AGENTS.md)

- [ ] T-008: **Add orphaned vitest config guard to `client-ci.yml`** [P]
  - File: `.github/workflows/client-ci.yml`
  - Add a step to an existing lightweight job (e.g., `console-lint`) or a new `config-guard` job:
    ```yaml
    - name: Orphaned vitest config guard
      run: |
        # Find all vitest config files
        configs=$(find packages -name 'vitest.config*.ts' -not -path '*/node_modules/*' | sort)
        orphaned=0
        for config in $configs; do
          pkg_dir=$(dirname "$config")
          pkg_name=$(basename "$pkg_dir")
          config_basename=$(basename "$config")
          # Check if any npm script in the package references this config
          if ! grep -q "$config_basename" "$pkg_dir/package.json" 2>/dev/null; then
            # Also check if any CI workflow references it
            if ! grep -rq "$config_basename" .github/workflows/ 2>/dev/null; then
              echo "::error::Orphaned vitest config: $config (not referenced by any npm script or CI workflow)"
              orphaned=1
            fi
          fi
        done
        if [ "$orphaned" -eq 1 ]; then
          exit 1
        fi
        echo "All vitest configs are referenced."
    ```
  - Verify: guard passes (zero orphaned configs after our changes)

---

## Wave 3: Golden Fixture Replacement

Independent of Waves 1-2 — can be done in parallel.

- [ ] T-009: **Rewrite `generate-determinism-golden.ts` to emit hash**
  - File: `packages/console/scripts/generate-determinism-golden.ts`
  - Change: instead of writing the full JSON fixture, compute SHA-256 hash of the serialized output and emit a TypeScript constant file
  - New output: `tests/fixtures/determinism-golden-hash.ts` containing:
    ```typescript
    /** Auto-generated by scripts/generate-determinism-golden.ts — DO NOT EDIT */
    export const GOLDEN_HASH = 'abcdef1234...';
    export const GOLDEN_TICKS = 1000;
    ```
  - Update the script to `console.log` the hash for manual verification

- [ ] T-010: **Rewrite `determinism.test.ts` to use hash comparison**
  - File: `packages/console/tests/integration/determinism.test.ts`
  - Change: remove `readFileSync` / JSON comparison; import `GOLDEN_HASH` from the generated hash module
  - New test structure:
    ```typescript
    import { createHash } from 'node:crypto';
    import { describe, expect, it } from 'vitest';
    import { runDeterminismScenario, SCENARIO_TICKS } from '../fixtures/determinism-scenario';
    import { GOLDEN_HASH } from '../fixtures/determinism-golden-hash';

    describe('determinism: 1000-tick scripted match (T090 / SC-002)', () => {
        it('produces a deterministic hash matching the golden constant', () => {
            const run = runDeterminismScenario();
            expect(run.frames.length).toBe(SCENARIO_TICKS);
            const hash = createHash('sha256')
                .update(JSON.stringify(run.frames))
                .update(JSON.stringify(run.finalState))
                .digest('hex');
            expect(hash).toBe(GOLDEN_HASH);
        });
    });
    ```
  - Verify: `pnpm --filter @europa/console test:determinism` passes

- [ ] T-011: **Delete `golden-1000-tick.json`**
  - File: `packages/console/tests/fixtures/golden-1000-tick.json` — DELETE
  - Verify: file is gone, `pnpm --filter @europa/console test:determinism` still passes

- [ ] T-012: **Generate the hash constant**
  - Run: `pnpm --filter @europa/console exec tsx scripts/generate-determinism-golden.ts`
  - Verify: `tests/fixtures/determinism-golden-hash.ts` is created with correct hash
  - Verify: `pnpm --filter @europa/console test:determinism` passes with the new hash

---

## Wave 4: Test-Only Module Relocation

Independent of Waves 1-3.

- [ ] T-013: **Relocate `fake-match-client.ts` from `src/internal/` to `tests/fixtures/`**
  - Move: `packages/console/src/internal/fake-match-client.ts` → `packages/console/tests/fixtures/fake-match-client.ts`
  - No production imports exist (verified by grep — zero hits in `src/`)
  - Verify: `pnpm --filter @europa/console typecheck` passes (tsconfig excludes tests/ from compilation, so no import errors in production code)

- [ ] T-014: **Update imports for relocated `fake-match-client.ts`**
  - Search for any test files importing from `../../src/internal/fake-match-client` or similar
  - If found, update paths to `../fixtures/fake-match-client`
  - Verify: `pnpm --filter @europa/console test:unit` passes

- [ ] T-015: **Verify `test-state.ts` is correctly excluded from coverage but not from source**
  - `test-state.ts` is imported by `App.tsx` (production) — it stays in `src/internal/`
  - After Wave 1 changes, it should appear in coverage reports (not excluded by blanket `src/internal/**`)
  - Verify: `pnpm --filter @europa/console coverage` shows `test-state.ts` in the report

---

## Wave 5: setTimeout Replacements (Unit Tests Only)

Independent of Waves 1-4.

- [ ] T-016: **Audit `tests/unit/runtime.test.ts` setTimeout pattern**
  - File: `packages/console/tests/unit/runtime.test.ts` line 375
  - Pattern: `await new Promise(resolve => setTimeout(resolve, 50))`
  - Assess: is this waiting for a DOM render in happy-dom? Replace with `vi.waitFor()` if the condition can be polled.
  - If the setTimeout is inside a `vi.useFakeTimers()` context, verify fake timers are advanced correctly.

- [ ] T-017: **Audit `tests/unit/net/ws-lobby-client.test.ts` setTimeout patterns**
  - File: `packages/console/tests/unit/net/ws-lobby-client.test.ts` lines 119, 286
  - Line 119: `setTimeout(fn, ms)` — appears to be a fake timer setup method override
  - Line 286: `setTimeout(resolve, 0)` — yield to microtask queue
  - Assess: verify these are within fake-timer contexts and not wall-clock waits

- [ ] T-018: **Verify no remaining wall-clock setTimeout in unit tests**
  - Run: `grep -rn "setTimeout" packages/*/tests/unit/ --include="*.test.ts" --include="*.test.tsx"`
  - Any remaining hits should be in fake-timer contexts (verifiable by checking `vi.useFakeTimers()` in the same describe block)
  - Document findings in PR description

---

## Wave 6: Unfalsifiable Assertion Audit

Independent of Waves 1-5.

- [ ] T-019: **Audit `toBeDefined()` assertions in engine tests**
  - Files: `packages/engine/tests/unit/terminal.test.ts`, `packages/engine/tests/unit/capture.test.ts`, `packages/engine/tests/quickstart/*.test.ts`
  - Check each: can the function under test actually return `undefined`? If not, replace with `expect(value).toBe(true)` or similar meaningful assertion.
  - Document each decision (keep/replace) in PR description.

- [ ] T-020: **Audit `toBeDefined()` assertions in console tests**
  - Files: `packages/console/tests/unit/state/pipe-intensities.test.ts` (6 instances), `packages/console/tests/unit/render/canvas-terrain.test.ts` (2 instances), others
  - Same methodology as T-019

- [ ] T-021: **Audit `not.toBeNull()` assertions in networking tests**
  - Files: `packages/networking/tests/unit/reconnect.test.ts`, `packages/networking/tests/unit/connection.test.ts`, others
  - Same methodology — verify each assertion is capable of failing

- [ ] T-022: **Audit `toBeDefined()`/`toBeTruthy()` in design tests**
  - Files: `packages/design/tests/preview.test.ts`, `packages/design/tests/brand/*.test.ts`, `packages/design/tests/dev-page.test.ts`
  - Focus on `toBeTruthy()` calls — these are weaker than `toBeDefined()` and may be unfalsifiable for non-empty strings

---

## Wave 7: Final Verification

Depends on all previous waves.

- [ ] T-023: **Run full `pnpm verify` gate**
  - `pnpm typecheck` — all packages
  - `pnpm lint` — Biome clean
  - `pnpm format:check` — formatted
  - `pnpm test` — all package tests pass
  - Verify: zero failures

- [ ] T-024: **Verify all acceptance criteria**
  - AC-007 (spec 008): a11y glob fix — all 8 a11y files execute in coverage
  - AC-008 (spec 008): `src/internal/**` not in any `coverage.exclude`
  - AC-009 (spec 008): `design-coverage` CI job exists and passes
  - AC-010 (spec 008): `version-coverage` CI job exists and passes
  - AC-011 (spec 008): orphaned-config guard passes
  - AC-012 (spec 008): `design-browser-test` → `test:browser` → `vitest.config.browser.ts` chain verified
  - AC-013 (spec 008): `pnpm coverage` (console) shows `src/internal/` files with non-zero coverage
  - AC-012 (spec 016): `golden-1000-tick.json` deleted; determinism test passes via hash
  - AC-013 (spec 016): zero wall-clock setTimeout in unit tests
  - AC-015 (spec 016): `fake-match-client.ts` relocated; no `src/` file imported exclusively by tests
  - AC-016 (spec 016): `pnpm coverage` ≥80% all metrics for all packages

- [ ] T-025: **Update spec status lines**
  - `specs/008-ci-workflows/spec.md`: flip status to `Implemented`
  - `specs/016-test-suite-cleanup/spec.md`: flip status to `Implemented`
  - Commit: `docs(specs): mark 008 v1.1 and 016 v1.1 as Implemented`
