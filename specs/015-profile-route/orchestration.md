# Orchestration Log: Profile Route & Identity Onboarding

## Status
- **Current Wave**: Complete — PR #55 open
- **Branch**: `issue-49-calm-falcon`
- **PR**: https://github.com/shaunburdick/europa-neo/pull/55
- **Last Updated**: 2026-09-02

## Plan Summary

Add a dedicated `/profile` route to the console SPA replacing the inline lobby identity card. Three identity states: unnamed (form), named (welcome card + continue), restoring (indicator). Stateless `returnTo` query parameter for match-join redirects. Lobby landing gains compact identity display with "Manage profile" link. Zero reducer changes, zero new view modes, zero new dependencies.

## Task Wave Progress

### Wave 1 — Routing Foundation (T001-T003) — ✅ Complete
- [x] T001: Add `'profile'` to Route union + parseRoute in route.ts
- [x] T002: Add `'profile'` to RouteEntry in route-adapter.ts
- [x] T003: Add `'profile'` case to bootstrapProductionRoute in main.tsx

### Wave 2 — ProfileView Component (T004-T005) — ✅ Complete
- [x] T004: Implement readReturnTo validation function
- [x] T005: Implement ProfileView component

### Wave 3 — Lobby Integration (T006-T007) — ✅ Complete
- [x] T006: Wire profile view into lobby runtime view gate + match-join redirect
- [x] T007: Replace LobbyIdentityCard with compact identity display in lobby landing

### Wave 4 — Tests (T008-T012) — ✅ Complete
- [x] T008: Route parser + adapter tests
- [x] T009: readReturnTo unit tests
- [x] T010: ProfileView component tests
- [x] T011: LobbyLanding updated tests
- [x] T012: ProfileView a11y tests

### Wave 5 — Verification (T013-T014) — ✅ Complete
- [x] T013: Verify all acceptance criteria (SC-001..SC-006)
- [x] T014: Full verification suite gate

## Decisions & Rationale

- 2026-09-01: Profile as sub-view of lobby (not new viewMode) — avoids reducer changes, keeps lobby context intact
- 2026-09-01: Bootstrap mounts lobby runtime for /profile — same connection/controller infrastructure
- 2026-09-01: Stateless returnTo — URL query param only, no localStorage
- 2026-09-01: Match-join redirect in LobbyRoot after identity resolution — returning players proceed directly

## Blockers & Escalations

(none yet)

## New Tasks Discovered

(none yet)

## Review Findings

- 2026-09-02: Two browser-mode component tests failed in CI (NOT preexisting — introduced by Feature 015 changes):
  1. `lobby-landing.test.tsx:459` — LobbyRoot view gate: `window.location.pathname` was `/profile` in Vitest browser env, causing ProfileView to render instead of LobbyLanding. Fix: reset pathname to `/` before rendering.
  2. `lobby-persistence.test.tsx:246,270` — identity form moved to `/profile` route, tests still looking for "Display name" textbox in lobby. Fix: replaced form interactions with `controller.setHandle()` and updated assertions to match compact lobby identity display.
- All tests now pass locally (134 browser-mode, 677 unit-mode). Spec status flipped to Implemented (2026-09-02). AGENTS.md updated with CI-must-pass rule (rule 7).
