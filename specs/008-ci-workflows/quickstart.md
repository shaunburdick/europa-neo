# Quickstart: Coverage-Gate Integrity + Test Infrastructure Consolidation

> Issue #131 | Specs 008 v1.1 + 016 v1.1 | Branch: `issue-131-coverate-gate-integrity`

## What This Changes

1. **Coverage gate now measures what it claims**: a11y `.tsx` files included, `src/internal/` no longer blanket-excluded
2. **CI covers all packages**: `@europa/design` and `@europa/version` get coverage jobs
3. **Orphaned config detection**: CI fails if a vitest config exists but nothing references it
4. **Golden fixture → hash**: 1.7 MB blob replaced by 64-byte SHA-256 constant
5. **Test-only module relocated**: `fake-match-client.ts` moved from `src/` to `tests/`
6. **setTimeout audit**: unit tests verified free of wall-clock waits

## Files Changed

### Coverage Config (3 files)
- `packages/console/vitest.config.coverage.ts` — a11y glob fix + `src/internal/` exclusion removal + per-file exclusions
- `packages/console/vitest.config.ts` — `src/internal/` exclusion removal
- `packages/console/vitest.config.browser.ts` — `src/internal/` exclusion removal

### CI Workflow (1 file)
- `.github/workflows/client-ci.yml` — `design-coverage` job + `version-coverage` job + orphaned-config guard

### Golden Fixture (3 files)
- `packages/console/tests/fixtures/golden-1000-tick.json` — DELETED
- `packages/console/tests/fixtures/determinism-golden-hash.ts` — NEW (auto-generated hash constant)
- `packages/console/tests/integration/determinism.test.ts` — rewritten to use hash comparison
- `packages/console/scripts/generate-determinism-golden.ts` — rewritten to emit hash

### Module Relocation (1 file moved)
- `packages/console/src/internal/fake-match-client.ts` → `packages/console/tests/fixtures/fake-match-client.ts`

## Verification

```bash
# Quick smoke
pnpm --filter @europa/console coverage       # ≥80% all metrics, src/internal/ included
pnpm --filter @europa/console test:determinism # hash comparison passes
pnpm --filter @europa/design coverage          # ≥80% all metrics
pnpm --filter @europa/version coverage         # ≥80% all metrics (100%×4)

# Full gate
pnpm verify                                    # typecheck + lint + format + all tests
```

## Acceptance Criteria Summary

| AC | Spec | Description | Status |
|----|------|-------------|--------|
| AC-007 | 008 | a11y glob `*.test.{ts,tsx}` | ✅ Fixed |
| AC-008 | 008 | `src/internal/**` not blanket-excluded | ✅ Fixed |
| AC-009 | 008 | `design-coverage` CI job | ✅ Added |
| AC-010 | 008 | `version-coverage` CI job | ✅ Added |
| AC-011 | 008 | Orphaned-config guard | ✅ Added |
| AC-012 | 008 | `vitest.config.browser.ts` linked | ✅ Verified |
| AC-013 | 008 | `src/internal/` in coverage report | ✅ Fixed |
| AC-012 | 016 | Golden fixture deleted, hash works | ✅ Replaced |
| AC-013 | 016 | Zero setTimeout in unit tests | ✅ Audited |
| AC-015 | 016 | Test-only modules relocated | ✅ Moved |
| AC-016 | 016 | Coverage ≥80% all packages | ✅ Verified |
