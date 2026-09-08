# Orchestration Log: TanStack Router Migration (Issue #75)

## Status
- **Current Wave**: Wave 2 Complete — Wave 3 next
- **Branch**: `issue-75-console-router`
- **Last Updated**: 2026-09-07

## Plan Summary
Migrate console routing from hand-rolled `route.ts`/`route-adapter.ts` to TanStack Router (`@tanstack/react-router` v1.x). Root layout route → lobby context → child routes. Full replacement of `parseRoute`/`adaptRoute`/`executeRouteEntry` surface.

## Task Wave Progress

### Wave 0 — Dependency + baseline — ✅ Complete
- T101: `@tanstack/react-router` v1.170.33 added. Bundle: 112,260 B gz (73.1% of 153,600 B budget)
- T102: Test baseline: 1,060/1,062 pass (2 build-artifact preconditions)

### Wave 1 — Route tree foundation — ✅ Complete
- T103: `validateMatchId` extracted from `route.ts`
- T104: `route-tree.tsx` — TanStack Router code-based route tree
- T105: `search-params.ts` — typed `returnTo` validation
- T106: `match-validation.tsx` — `beforeLoad` + error component
- T107: `route-tree.test.ts` — 62 new tests (all pass)

### Wave 2 — Layout routes + lobby decomposition — ✅ Complete
- T108: `lobby-layout.tsx` — root layout route component with announcer + context
- T109: Deferred-resolution `beforeLoad` on lobby layout (connection + identity gates)
- T110: `match-layout.tsx` — pathless layout under /match/$matchId (deep-link, interstitial, resume)
- T111: `lobby-view.tsx` — extracted lobby view from `lobby-runtime.tsx`
- T112: `profile-route.tsx` — thin ProfileView wrapper with typed returnTo
- T113: Match route components (adaptive, join, spectate) + `MatchLegHost` exported with `matchRole` rename
- Debug fix: 19 component test regressions (missing context provider, lost pending-navigation setter, profile view removed from LobbyRoot)

### Wave 3 — Bootstrap replacement — ⏳ Pending
- T114: Rewrite `main.tsx` with `createRouter` + `RouterProvider`
- T115: Remove `parseRoute` function and `Route` type from `route.ts`
- T116: Remove `usePathname`, `patchHistoryForPathChanges`, `europa:pathchange` from lobby code
- T117: Update `route.ts` exports

### Wave 4 — Test rewrite — ⏳ Pending
- T118–T124: Rewrite routing unit/component tests

### Wave 5 — Integration and E2E — ⏳ Pending
- T125–T130: Full test suites + E2E

### Wave 6 — Bundle, cleanup, final gate — ⏳ Pending
- T131–T135: Bundle measurement, dead code removal, `pnpm verify`, quickstart, AC review

## Decisions & Rationale
- 2026-09-07: `role` → `matchRole` rename on `MatchLegHostProps` to avoid biome `useValidAriaRole` false positive
- 2026-09-07: `LobbyLayoutContext` pattern for child route access to controller/wsUrl/announcer (avoids prop drilling through TanStack Router's Outlet)
- 2026-09-07: `beforeLoad` reads `controller.store.getState()` synchronously (Zustand sync read, no React hooks needed in router lifecycle)
- 2026-09-07: Test fixture `lobby-layout-wrapper.tsx` wraps `LobbyRoot` in context provider for standalone component tests

## Blockers & Escalations
- None currently

## New Tasks Discovered
- None

## Review Findings
- Wave 2: debug-specialist fixed 19 component test regressions from T111/T113 changes (context provider, pending-navigation, profile-view extraction)
