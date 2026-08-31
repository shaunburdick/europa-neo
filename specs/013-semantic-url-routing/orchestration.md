# Orchestration Log: Console Semantic URL Routing

## Status
- **Current Wave**: Wave 2 — Complete after second HOLD remediation; T013 remains pending
- **Branch**: issue-35-semantic-url-scheme
- **Last Updated**: 2026-08-30

## Plan Summary
Replace production query-selected live boot with a pure pathname router and explicit route-to-runtime adapter. `/` redirects to canonical `/lobby`; semantic match paths preserve match intent while existing lobby, identity, networking, and gameplay seams remain authoritative. Native and Docker hosts serve the SPA shell for safe deep links while reserving `/version`, assets, WebSocket upgrades, and traversal handling; `?e2e` remains test-only and `?live` is retired.

## Task Wave Progress

### Wave 0 — Baseline and guards — ✅ Complete
- T001 baseline and status — ✅ complete
- T002 route contract tests — ✅ complete
- T003 stale-link/privacy guards — ✅ complete (tracked production-surface guard added; expected findings remain until migration waves)

### Wave 1 — Pure routing foundation — ✅ T004–T007 complete
- T004 closed route model, pure parser, segment validation, and semantic builders — ✅ complete
- T005 route unit tests — ✅ complete
- T006 route-to-entry adapter seam — ✅ complete
- T007 retired live-route export removal — ✅ complete
### Wave 2 — Bootstrap, history, accessible recovery — ✅ Complete after HOLD remediation
- T008 route-aware production bootstrap — ✅ complete
- T009 runtime integration — ✅ complete
- T010 accessible route notices and focus/live-region recovery — ✅ complete
- T011 runtime/browser coverage — ✅ complete (unit/component/a11y assertions)
- T012 routing E2E — ✅ complete
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
- Wave 0 code-review remediation complete:
  - T002 is complete and its retired-route fixture now distinguishes prose from a query-shaped
    historical example with a `/` path prefix.
  - Same-line stale/privacy matches are consolidated into one diagnostic carrying both kinds;
    the guard's detection scope and exemptions are unchanged.
  - The targeted privacy suite has no self-failures. Its final stale-reference assertion remains
    intentionally failing because migration waves have not yet removed the existing production
    `?live` and credential-bearing references.
- Wave 1 HOLD-1 remediation complete:
  - Added dedicated `route-adapter.test.ts` coverage using Feature 010-compatible lobby
    snapshots and observable command outcomes.
  - Covered adaptive player/spectator selection, full-waiting non-downgrade, explicit intent
    preservation, snapshot-less resolution, no-command redirect/unavailable behavior, and
    exact `MatchId` forwarding.
- No application implementation change was required; T008 and stale-reference migration
  remain pending and were not addressed.

## Wave 2 HOLD remediation

- Route notices are now rendered by the production route bootstrap/runtime, including unknown
  paths, authoritative unavailable states, shortcut command failures, and match-leg transport
  failures. Notices focus their alert panel and provide keyboard-operable retry/return actions
  while retaining the existing lobby controller and identity.
- Successful lobby-originated create/join/spectate actions push exactly one semantic match path;
  failures do not push. Browser `popstate` updates the active route and re-runs authoritative
  resolution. Component coverage proves unavailable recovery is rendered without an entry
  command; the existing a11y suite proves alert naming, focus, and controls.
- Routing E2E now uses `127.0.0.1` consistently for Playwright's browser origin and the
  ephemeral WebSocket fixture, while retaining the init-script query-override removal assertion.
- Focused unit/component/a11y gates, strict typecheck, lint, format, and build are green. The
  routing E2E unknown-route and root cases are green; the semantic match case still exposes a
  pre-existing full-stack fixture readiness failure (lobby remains reconnecting before the
  target snapshot). Broader `?live` fixture failures are intentionally T013 stale-reference
  work and were not migrated in this remediation.

## T011 Completion

- Added 2 unit tests for explicit-intent/no-I/O guards, 3 component tests for adaptive
  waiting hand-off and route recovery, and 2 a11y tests for recovery semantics and
  spectator read-only controls.
- Focused result: **7 tests passed** across the three new T011 files.
- T013 browser/full-stack migration and all later tasks remain pending.

## T012 Completion

- Added `packages/console/tests/e2e/routing.spec.ts` using a real matchmaking/networking
  stack and poll-based waits. Coverage includes root replacement redirect and refresh,
  Back/Forward and semantic-path refresh, terminal/leave route retention, and unknown-path
  recovery without a redirect loop.
- T013 remains intentionally pending; the broader existing `?live` full-stack fixtures were
  not migrated by this task.

## Second Wave 2 review remediation

- Route-notice retry now increments an explicit route retry epoch, causing the failed route
  resolution/entry command to run again even when the pathname and snapshot references are
  unchanged. A successful lobby-originated transition marks the route as already attempted so
  its newly canonical URL cannot replay the command.
- Post-attach player and spectator transport loss now preserves the existing reconnecting
  surface. Only failed initial handshake/attach promises invoke route failure and replace the
  route shell with a notice; socket-loss reducers still receive their normal reconnect events.
- Component coverage proves retry re-runs a failed join command, transport loss renders
  `Reconnecting to match…` without a route notice, and same-document create/join/spectate each
  push exactly one semantic entry while failed actions push none. T013 fixture migration is
  intentionally untouched.

## Remaining Wave 2 review blocker — resolved

- 2026-08-30: Updated `packages/console/tests/e2e/routing.spec.ts` so the history scenario
  creates its semantic match entry through the production Create match action, then uses only
  `page.goBack()`/`page.goForward()` for traversal. The test asserts pathname re-resolution,
  lobby/recovery UI state, and zero `load` events during traversal; no `page.goto()` occurs
  between history operations. T013 migration and host/Docker work remain pending and untouched.

## Remaining Wave 2 gate — resolved

- 2026-08-31: The isolated successful-spectate history test passed, but the full
  routing component run exposed a fixture gap: the scripted lobby transport
  correctly returned the successful spectator transition, then the production
  `SpectatorMatchLeg` attempted its real WebSocket attach. With no match server
  in this component test, that attach failed and correctly rendered route
  recovery instead of spectator state. This was a stale fixture expectation, not
  a routing or spectator production defect.
- Added a narrow component-local match-client mock so the test exercises the
  successful lobby hand-off and semantic history behavior without pretending to
  run a full-stack spectator attach. The test still asserts the observable
  `Spectating` state and exactly one `pushState`; T013 remains pending.
- Verification: isolated test 9/9; routing component suite 99/99; routing E2E
  3/3 (with `CI=1` to force Playwright's Vite web server); typecheck, lint,
  format, and build all pass. The first non-CI E2E attempt reused a dead
  development-server slot after the broad package run and was not a test
  failure; the forced clean-server rerun is authoritative.
