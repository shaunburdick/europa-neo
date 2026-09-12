# Orchestration Log: Coverage-Gate Integrity + Test Infrastructure Consolidation

## Status
- **Current Wave**: Wave 1 (Coverage Config Fixes)
- **Branch**: `issue-131-coverate-gate-integrity`
- **Last Updated**: 2026-09-11

## Plan Summary
Fix coverage configurations so they measure what they claim (a11y glob, src/internal exclusion), add missing CI coverage jobs for design/version, replace 1.7 MB golden fixture with SHA-256 hash, consolidate duplicated test infrastructure, and audit for unfalsifiable assertions and setTimeout patterns.

## Task Wave Progress

### Wave 1 — Coverage Config Fixes — ✅ Complete (commit 9295146)
- T-001: Fix a11y glob in vitest.config.coverage.ts ✅
- T-002: Remove src/internal/** from vitest.config.ts ✅
- T-003: Remove src/internal/** from vitest.config.browser.ts ✅
- T-004: Remove src/internal/** from vitest.config.coverage.ts + per-file exclusions ✅
- T-005: Verify coverage gate passes ✅ (89.27% stmts, 82.77% branches, 86.79% funcs, 89.26% lines)

### Wave 2 — CI Workflow Changes — ✅ Complete (commit c456fcf)
- T-006: Add design-coverage job ✅
- T-007: Add version-coverage job ✅
- T-008: Add orphaned-config guard ✅

### Wave 3 — Golden Fixture Replacement — ✅ Complete (commit a10a16a)
- T-009: Rewrite generate-determinism-golden.ts ✅
- T-010: Rewrite determinism.test.ts ✅
- T-011: Delete golden-1000-tick.json ✅ (1.7 MB removed)
- T-012: Generate hash constant ✅

### Wave 4 — Test-Only Module Relocation — ✅ Complete
- T-013: Relocate fake-match-client.ts ✅ (git mv to tests/fixtures/)
- T-014: Update imports (8 files) ✅
- T-015: Verify test-state.ts ✅

### Wave 5 — setTimeout Replacements — 🔄 In Progress
- T-006: Add design-coverage job [P]
- T-007: Add version-coverage job [P]
- T-008: Add orphaned-config guard [P]

### Wave 3 — Golden Fixture Replacement — ⏳ Pending
- T-009: Rewrite generate-determinism-golden.ts
- T-010: Rewrite determinism.test.ts
- T-011: Delete golden-1000-tick.json
- T-012: Generate hash constant

### Wave 4 — Test-Only Module Relocation — ⏳ Pending
- T-013: Relocate fake-match-client.ts
- T-014: Update imports
- T-015: Verify test-state.ts

### Wave 5 — setTimeout Replacements — ⏳ Pending
- T-016: Audit runtime.test.ts
- T-017: Audit ws-lobby-client.test.ts
- T-018: Verify no remaining wall-clock setTimeout

### Wave 6 — Unfalsifiable Assertion Audit — ⏳ Pending
- T-019: Audit engine tests
- T-020: Audit console tests
- T-021: Audit networking tests
- T-022: Audit design tests

### Wave 7 — Final Verification + PR — ⏳ Pending
- T-023: Run full pnpm verify
- T-024: Verify all acceptance criteria
- T-025: Update spec status lines

## Decisions & Rationale
- 2026-09-11: test-state.ts stays in src/internal/ (production code, not test-only)
- 2026-09-11: fake-match-client.ts relocated to tests/fixtures/ (zero production imports)
- 2026-09-11: setTimeout ban scoped to unit tests only (integration/E2E need real timers)

## Blockers & Escalations
- None yet

## New Tasks Discovered
- None yet

## Review Findings
- Pending (Wave 1 review after completion)
