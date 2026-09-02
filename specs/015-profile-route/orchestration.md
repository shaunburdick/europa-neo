# Orchestration Log: Profile Route & Identity Onboarding

## Status
- **Current Wave**: Wave 1 (T001-T003: Routing Foundation)
- **Branch**: `issue-49-calm-falcon`
- **Last Updated**: 2026-09-01

## Plan Summary

Add a dedicated `/profile` route to the console SPA replacing the inline lobby identity card. Three identity states: unnamed (form), named (welcome card + continue), restoring (indicator). Stateless `returnTo` query parameter for match-join redirects. Lobby landing gains compact identity display with "Manage profile" link. Zero reducer changes, zero new view modes, zero new dependencies.

## Task Wave Progress

### Wave 1 — Routing Foundation (T001-T003) — ⏳ Pending
- [ ] T001: Add `'profile'` to Route union + parseRoute in route.ts
- [ ] T002: Add `'profile'` to RouteEntry in route-adapter.ts
- [ ] T003: Add `'profile'` case to bootstrapProductionRoute in main.tsx

### Wave 2 — ProfileView Component (T004-T005) — ⏳ Pending
- [ ] T004: Implement readReturnTo validation function
- [ ] T005: Implement ProfileView component

### Wave 3 — Lobby Integration (T006-T007) — ⏳ Pending
- [ ] T006: Wire profile view into lobby runtime view gate + match-join redirect
- [ ] T007: Replace LobbyIdentityCard with compact identity display in lobby landing

### Wave 4 — Tests (T008-T012) — ⏳ Pending
- [ ] T008: Route parser + adapter tests
- [ ] T009: readReturnTo unit tests
- [ ] T010: ProfileView component tests
- [ ] T011: LobbyLanding updated tests
- [ ] T012: ProfileView a11y tests

### Wave 5 — Verification (T013-T014) — ⏳ Pending
- [ ] T013: Verify all acceptance criteria (SC-001..SC-006)
- [ ] T014: Full verification suite gate

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

(none yet)
