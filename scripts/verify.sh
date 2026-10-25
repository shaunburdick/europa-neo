#!/usr/bin/env bash
# scripts/verify.sh — Full CI verification suite (local mirror of client-ci.yml)
# Run before pushing to catch failures CI would catch.
set -euo pipefail

echo "=== Europa Neo — Full Verification Suite ==="
echo ""

# Phase 1: Build all workspace dependencies (required for typecheck + tests)
echo "--- Phase 1: Building workspace dependencies ---"
pnpm build
echo ""

# Phase 2: Lint + Typecheck (mirrors console-lint job)
echo "--- Phase 2: Lint + Typecheck ---"
pnpm typecheck
pnpm lint
pnpm format:check
echo ""

# Phase 3: Conformance programs (008 FR-029/FR-030). Each contract-bearing
# package ships a dedicated strict `tsc -p tsconfig.conformance.json` run
# that compiles its contract-conformance witness test file(s) alongside
# src/ — a vitest run does NOT type-check, so the witnesses only prove
# anything when this program compiles them. Console imports conformance
# from source (src/index) — no build needed; the library programs
# compile against the workspace dists built in Phase 1.
echo "--- Phase 3: Conformance programs ---"
pnpm --filter @europa/console typecheck:conformance
pnpm --filter @europa/networking typecheck:conformance
pnpm --filter @europa/fog typecheck:conformance
pnpm --filter @europa/matchmaking typecheck:conformance
echo ""

# Phase 4: Design system guards (mirrors console-lint)
echo "--- Phase 4: Design system guards ---"
pnpm --filter @europa/design check:vendor-identity
pnpm --filter @europa/design check:no-literals
pnpm --filter @europa/design check:component-catalog
pnpm --filter @europa/design check:bundle-size
echo ""

# Phase 5: Console node-mode tests (mirrors console-test)
echo "--- Phase 5: Console node-mode tests ---"
pnpm --filter @europa/console test:unit
pnpm --filter @europa/console test:determinism
pnpm --filter @europa/console test:parity
pnpm --filter @europa/console test:keepalive
pnpm --filter @europa/console test:lobby-integration
echo ""

# Phase 5b: Console CI-parity integration gates (008 FR-024). CI runs the
# first three suites only through the coverage config's NODE project
# (client-ci console-coverage job) and contract-conformance in the
# console-e2e job; invoked DIRECTLY here so a red suite fails `pnpm verify`
# without re-running every suite Phases 5-6 already run, uninstrumented
# (Gate 1 SHOULD-1). Bounded parity: exactly these gates, nothing more.
echo "--- Phase 5b: Console CI-parity integration gates (FR-024) ---"
pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/host-smoke-n-players.test.ts
pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/semantic-route-security.test.ts
pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/semantic-url-privacy.test.ts
pnpm --filter @europa/console exec vitest run --config vitest.config.ts tests/integration/contract-conformance.test.ts
echo ""

# Phase 5c: CI-parity package gates (008 FR-024): core's coverage gate
# (core-ci core-coverage job) and logging's test suite (logging-ci) run
# in CI but in no other local gate. Remaining per-package coverage gates
# are deliberately deferred (Out of Scope) to bound local wall-clock.
echo "--- Phase 5c: CI-parity package gates (FR-024) ---"
pnpm --filter @europa/core coverage
pnpm --filter @europa/logging test
echo ""

# Phase 6: Console browser-mode tests (mirrors console-e2e)
echo "--- Phase 6: Console browser-mode tests ---"
pnpm --filter @europa/console test:component
pnpm --filter @europa/console test:a11y
echo ""

# Phase 6b: Console browser-mode tests WITH V8 coverage (mirrors
# console-coverage job's browser project). The standalone browser config
# (Phase 6) never activates coverage instrumentation, so race conditions
# between V8 coverage and Playwright's cursor positioning go undetected.
# Running the browser project from the coverage config catches this class
# of flaky test before push.
echo "--- Phase 6b: Console browser-mode tests (coverage mode) ---"
pnpm --filter @europa/console exec vitest run \
  --config vitest.config.coverage.ts \
  --project browser \
  --reporter verbose
echo ""

# Phase 7: Console E2E tests (mirrors console-e2e)
echo "--- Phase 7: Console E2E tests (Playwright) ---"
pnpm --filter @europa/console test:e2e
echo ""

# Phase 8: Console perf budgets (mirrors console-e2e)
echo "--- Phase 8: Console perf budgets ---"
pnpm --filter @europa/console test:perf
echo ""

# Phase 9: Selfhost build + remote URL scan (mirrors selfhost script)
echo "--- Phase 9: Selfhost verification ---"
pnpm --filter @europa/console test:selfhost
echo ""

# Phase 10: Other package tests (mirrors other CI workflows)
echo "--- Phase 10: Other package tests ---"
pnpm --filter @europa/core test
pnpm --filter @europa/engine test
pnpm --filter @europa/terrain test
pnpm --filter @europa/fog test
pnpm --filter @europa/networking test
pnpm --filter @europa/matchmaking test
pnpm --filter @europa/version test
pnpm --filter @europa/design test
echo ""

# Phase 11: Documentation privacy guard (010 FR-014 / NFR-003). Mirrors the
# pages-deploy.yml build step and manual-ci.yml so a credential/identity
# leak into the manual or an approved implementation surface is caught
# before merge, not after the post-merge Pages deploy.
echo "--- Phase 11: Documentation privacy guard ---"
node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
echo ""

# Phase 12: Spec consolidation guard (008 FR-013..FR-017)
echo "--- Phase 12: Spec consolidation guard ---"
pnpm exec tsx scripts/check-spec-consolidation.ts
echo ""

# Phase 13: Referenced-contract-file guard (008 FR-033). Fails on any
# .ts file under specs/**/contracts/ not referenced by a test or source
# file (imports AND explicit path-string mappings count). .md prose and
# README files are exempt; the guard is vacuously green while no spec-side
# .ts mirror exists (regression protection against re-introducing one).
echo "--- Phase 13: Referenced-contract-file guard ---"
pnpm exec tsx scripts/check-referenced-contract-files.ts
echo ""

# Phase 14: Dead-export gate (008 FR-034 / issue #140). Knip runs in
# production + exports-only mode: tests/E2E cannot keep an export alive,
# contracts are excluded by config, and only export findings fail the gate.
echo "--- Phase 14: Dead-export gate (knip) ---"
pnpm exec knip --production --exports --no-progress --no-tag-hints
echo ""

echo "=== All verification checks passed ==="
