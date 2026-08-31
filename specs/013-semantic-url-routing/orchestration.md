# Orchestration Log: Console Semantic URL Routing

## Status
- **Current Wave**: Wave 0 — Complete
- **Branch**: issue-35-semantic-url-scheme
- **Last Updated**: 2026-08-30

## Plan Summary
Replace production query-selected live boot with a pure pathname router and explicit route-to-runtime adapter. `/` redirects to canonical `/lobby`; semantic match paths preserve match intent while existing lobby, identity, networking, and gameplay seams remain authoritative. Native and Docker hosts serve the SPA shell for safe deep links while reserving `/version`, assets, WebSocket upgrades, and traversal handling; `?e2e` remains test-only and `?live` is retired.

## Task Wave Progress

### Wave 0 — Baseline and guards — ✅ Complete
- T001 baseline and status — ✅ complete
- T002 route contract tests — ⏳ pending
- T003 stale-link/privacy guards — ⏳ pending

### Wave 1 — Pure routing foundation — ⏳ Pending
### Wave 2 — Bootstrap, history, accessible recovery — ⏳ Pending
### Wave 3 — Full-stack and security — ⏳ Pending
### Wave 4 — Native host and Docker — ⏳ Pending
### Wave 5 — Documentation truthfulness — ⏳ Pending
### Wave 6 — Final gate — ⏳ Pending

## Decisions & Rationale
- 2026-08-30: `/` uses a replacement redirect to `/lobby`, leaving the root available for future authentication entry.
- 2026-08-30: `?e2e` remains unchanged as the sole test-only query harness.

## Blockers & Escalations
- 2026-08-30: Root `pnpm test` has a known baseline failure because `@europa/design` has no test files; implementation must preserve and document this separately from feature regressions.

## T001 Baseline

- **Branch/status**: verified on `issue-35-semantic-url-scheme`; the working tree
  contained only the pre-existing untracked coordination log before T001 edits.
- **Root command**: `pnpm test` — exit **1**. `@europa/design` reports
  `No test files found, exiting with code 1`; recursive execution stops with
  `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. This is the known no-test-files baseline,
  not a routing regression.
- **Console package command**: `pnpm --filter @europa/console test:unit` — exit
  **1**, with **42 files and 559 tests passed**, but one existing unhandled
  `ReferenceError: window is not defined` from
  `tests/unit/internal/live-runtime-fallback.test.ts`; Vitest reports the run as
  unsuccessful. This is recorded as a pre-feature baseline.
- **Package command inventory**: root gates are `pnpm test`, `pnpm lint`,
  `pnpm format:check`, `pnpm typecheck`, and `pnpm build`; console-focused gates
  are `pnpm --filter @europa/console test:unit`, `test:component`, `test:a11y`,
  `test:e2e`, `test:selfhost`, and `coverage` (with the package's corresponding
  script names).

## New Tasks Discovered
- None.

## Review Findings
- No implementation wave reviewed yet.
