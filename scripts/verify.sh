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

# Phase 3: Console conformance (mirrors console-lint)
# Conformance test imports from source (src/index) — no build needed.
echo "--- Phase 3: Console conformance ---"
pnpm --filter @europa/console typecheck:conformance
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

echo "=== All verification checks passed ==="
