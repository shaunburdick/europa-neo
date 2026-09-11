# Orchestration Log: Design System Fixes (Issues #148 + #149)

## Status
- **Current Wave**: Complete
- **Branch**: `design-fixes`
- **PR**: https://github.com/shaunburdick/europa-neo/pull/157
- **Last Updated**: 2026-09-11

## Plan Summary
Fix design system issues from code review I-17/I-18: single-source player colors via design tokens, implement FogOverlay with real styling, repair modal backdrop ARIA, remove a11y exclusions, implement browser-mode focus-trap tests, wire into CI, strengthen guard tests.

## Task Wave Progress

### Wave 1 — Token Foundation — ✅ Complete
- T-001: Added playerColor1–4 tokens to tokens.ts
- T-002: Added token assertions to tokens.test.ts
- T-003: Updated DESIGN.md § 1.1 token table

### Wave 2 — Game Primitive Migration — ✅ Complete
- T-004: Rewrote city-marker.tsx
- T-005: Rewrote player-badge.tsx
- T-006: Rewrote troop-chip.tsx

### Wave 3 — FogOverlay + Modal Fix — ✅ Complete
- T-007: Implemented FogOverlay with europa-fog-overlay class
- T-008: Added fog-overlay CSS to catalog
- T-009: Fixed modal backdrop ARIA (role="presentation")

### Wave 4 — Test Infrastructure — ✅ Complete
- T-010: Added test:browser script
- T-011: Added design-browser-test CI job
- T-012: Extended no-literals to scan design/src
- T-013: Updated no-literals tests

### Wave 5 — Test Strengthening — ✅ Complete
- T-014: Strengthened fog-overlay tests
- T-015: Added modal ARIA integration tests
- T-016: Removed nested-interactive a11y exclusion

### Wave 6 — Guards + Docs — ✅ Complete
- T-017: Added props documentation warning to catalog guard
- T-018: Updated manual numbers.mdx
- T-019: Added europa-fog-overlay to DESIGN.md § 2

### Wave 7 — Verification + PR — ✅ Complete
- T-020 through T-027: All verification passed, PR created

## Decisions & Rationale
- 2026-09-11: Player colors live in @europa/design tokens (D-1)
- 2026-09-11: Modal backdrop: role="presentation" (D-4)
- 2026-09-11: Browser tests wired via test:browser + CI job (D-5)
- 2026-09-11: Added @playwright/test devDep (CI fix — pnpm strict layout)

## CI Fix
- Attempt 1: `playwright` not found — design package only had @vitest/browser-playwright (playwright-core), not the full playwright CLI
- Attempt 2: `npx playwright` not found — same root cause
- Attempt 3: Added @playwright/test as devDependency — resolved

## PR Status
- 41 CI checks passing, 0 failures
- Closes #148 and #149
