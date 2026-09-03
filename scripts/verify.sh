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

# Phase 3: Console library emit + conformance (mirrors console-lint + console-e2e)
# Clean dist/ first — mirrors CI's fresh checkout where no residual build
# artifacts exist. Without this, stale dist/ files mask import-resolution
# bugs (e.g., CSS imports resolved by leftover vite output).
echo "--- Phase 3: Console library emit + conformance ---"
pnpm --filter @europa/console run clean
pnpm --filter @europa/console build:lib
# build:assets restores the brand directory that Phase 1 produced but
# build:lib does not — unit tests (Phase 5) and the selfhost test (Phase 9)
# expect dist/assets/brand/ to exist.
pnpm --filter @europa/console build:assets
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
pnpm --filter @europa/engine test
pnpm --filter @europa/terrain test
pnpm --filter @europa/fog test
pnpm --filter @europa/networking test
pnpm --filter @europa/matchmaking test
pnpm --filter @europa/version test
pnpm --filter @europa/design test
echo ""

echo "=== All verification checks passed ==="
