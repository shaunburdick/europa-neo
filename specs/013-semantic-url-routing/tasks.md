# Tasks: Console Semantic URL Routing — v1.1 TanStack Router Migration

**Input**: `spec.md` v1.1, `plan.md` (v1.1), `research.md` (v1.1), `data-model.md`,
`contracts/route-contract.md`. Implementation begins only after approval.

## Wave 0 — Dependency and baseline

- [x] T101 Add `@tanstack/react-router` v1.x to `packages/console/package.json` dependencies; run `pnpm install`; verify `pnpm typecheck` and `pnpm lint` pass with the new dependency present. Record the pre-migration bundle size for later comparison.
- [x] T102 [P] Run existing `pnpm test:unit`, `pnpm test:component`, `pnpm test:a11y`, and `pnpm test:e2e` to establish the green baseline. Record counts per suite. Any pre-existing failure is NOT this migration's responsibility.

## Wave 1 — Route tree and validation foundation

- [x] T103 Extract `validateMatchId` from `route.ts`: move the `decodeMatchSegment` + `validateDecodedMatchId` logic into a standalone exported function that returns `{ ok: true, value: string } | { ok: false, reason: RouteRejection }`. Preserve the `RouteRejection` union type. Keep the URL builder functions (`buildMatchUrl`, `buildJoinUrl`, `buildSpectateUrl`, `buildLobbyUrl`, `buildProfileUrl`) in `route.ts`.
- [x] T104 Create `src/routing/route-tree.ts`: define the code-based TanStack Router route tree with `createRootRoute`, `createRoute`, pathless layout routes, and all five canonical route shapes (`/`, `/lobby`, `/profile`, `/match/$matchId`, `/match/$matchId/join`, `/match/$matchId/spectate`). Implement the `/` → `/lobby` redirect in a root-level `beforeLoad`. Implement `notFoundComponent` that renders `RouteNotice` with `kind: 'unknown'`.
- [x] T105 Add `validateSearch` to the `/profile` route: implement the `returnTo` safety contract (relative-pathname-only, unsafe → absent) matching the existing `readReturnTo` function. Export the validated search type.
- [x] T106 Add match-ID validation in the `/match/$matchId` route's `beforeLoad`: call `validateMatchId`, throw `redirect({ to: '/lobby' })` on rejection (preserving the six rejection reasons as a logged classification). Add component-level error handling for rejected match IDs.
- [x] T107 Write unit tests for the route tree: test all five canonical shapes classify correctly, `/` redirects to `/lobby`, `/profile` validates `returnTo`, match routes validate matchId with all six rejection reasons, unknown routes trigger `notFoundComponent`. Port all 17 test cases from the existing `route.test.ts` to exercise the new validation surface.

## Wave 2 — Layout routes and lobby decomposition

- [x] T108 Create `src/internal/lobby-layout.tsx`: the root layout route component. Move the lobby controller/transport lifecycle (connection, identity, announcer) from `LobbyRoot` into this layout. Render `<Outlet />` for child routes. Remove `usePathname`, `patchHistoryForPathChanges`, and `europa:pathchange` references.
- [x] T109 Implement deferred-resolution `beforeLoad` on the lobby layout route: gate child rendering on `state.connection === 'ready'` and `state.identityStatus === 'named'`. While a gate holds, the route stays pending (TanStack Router's pending state). Re-evaluation happens automatically on identity/connection changes.
- [x] T110 Create `src/internal/match-layout.tsx`: pathless layout under `/match/$matchId`. Implement deferred route resolution against the lobby snapshot using `adaptRoute`. Handle the deep-link interstitial dispatch (non-participant opens match route). Handle the unnamed-identity → `/profile?returnTo` redirect. Preserve the resume-match logic for active participants.
- [x] T111 Extract `LobbyView` from `lobby-runtime.tsx`: the lobby landing component (`LobbyLanding`). Wire it as the `/lobby` route component. Preserve `createMatch`, `joinMatch`, `spectateMatch`, `leaveMatch` command wrappers.
- [x] T112 Wire `ProfileView` (existing `src/ui/profile-view.tsx`) as the `/profile` route component. Connect the typed `returnTo` search param from the route's `validateSearch`.
- [x] T113 Extract match views: create thin route components for `/match/$matchId/index` (adaptive), `/match/$matchId/join` (explicit player), `/match/$matchId/spectate` (explicit spectator). Each calls `adaptRoute` against the lobby snapshot and dispatches to the existing match leg host.

## Wave 3 — Bootstrap replacement

- [x] T114 Rewrite `src/main.tsx`: replace `bootstrapProductionRoute` with `createRouter` + `RouterProvider`. Preserve the `?e2e` guard (runs before router mount). Preserve the `__europaTestMatch` seam (runs before router mount). Preserve the `stripProductionQuery` logic for production paths. Mount `RouterProvider` into `#root`.
- [x] T115 Remove the `parseRoute` function and its imports from `route.ts`. Remove the `Route` type (the route tree replaces it). Keep `RouteRejection`, `validateMatchId`, and URL builders. Update all import sites (`lobby-runtime.tsx` → `lobby-layout.tsx`, `match-layout.tsx`).
- [x] T116 Remove `usePathname`, `patchHistoryForPathChanges`, and the `europa:pathchange` custom event from `lobby-runtime.tsx` (now `lobby-layout.tsx`). Remove the `popstate` listener that re-evaluates routes (TanStack Router handles this natively).
- [x] T117 Update `src/routing/route.ts` exports: remove `parseRoute` and `Route` type; export `validateMatchId`, `RouteRejection`, `MatchRouteIntent`, and URL builders. Update the barrel export if one exists.

## Wave 4 — Test rewrite

- [x] T118 Rewrite `tests/unit/routing/route.test.ts`: test `validateMatchId` directly (all six rejection reasons, valid IDs, round-trips). Test URL builders (unchanged assertions). Test that the route tree classifies all supported shapes.
- [x] T119 Rewrite `tests/unit/routing/route-adapter.test.ts`: test `adaptRoute` against the lobby snapshot (all eight entry kinds). The adapter function is unchanged; tests just import from the new module paths.
- [x] T120 Rewrite `tests/unit/routing/semantic-route-guards.test.ts`: test no-I/O recovery and intent preservation using the new `validateMatchId` and `adaptRoute` imports.
- [x] T121 Rewrite `tests/component/routing/semantic-route-runtime.test.tsx`: test the route tree rendering, deferred-resolution gates, deep-link interstitial, and match leg dispatch using `RouterProvider` with a test history.
- [x] T122 Rewrite `tests/component/routing/semantic-route-transport.test.tsx`: test transport/lobby integration through the route tree.
- [x] T123 Update `tests/component/deep-link-interstitial.test.tsx`: update imports (route-adapter types preserved, so minimal change expected).
- [x] T124 Update `tests/unit/state/lobby-reducer.test.ts`: update `RouteEntry` type imports if paths changed.

## Wave 5 — Integration and E2E

- [x] T125 Run `pnpm test:unit` — all routing, state, and deep-link tests must pass.
- [x] T126 Run `pnpm test:component` — all component and a11y tests must pass.
- [x] T127 Run `pnpm test:e2e` — Back/Forward, reload, root redirect, route retention, and no loop must pass. The `?e2e` harness must remain unchanged.
- [x] T128 Run full-stack semantic-path E2E: create/join/spectate flows through the real wire with TanStack Router handling navigation. Verify ticks, orders, and fog.
- [x] T129 Verify the `?ws=` transport override works on semantic paths (e.g., `/lobby?ws=wss://...`).
- [x] T130 Run `pnpm test:keepalive` and `pnpm test:determinism` — existing integration suites must pass unchanged.

## Wave 6 — Bundle, cleanup, and final gate

- [x] T131 Measure the production bundle: verify `dist/assets` gzipped total is under 150 KB (FR-030). If over budget, implement lazy route chunks for welcome/match views.
- [x] T132 Remove the dead `parseRoute` function, the `Route` type, and any orphaned imports. Verify zero references to the removed surface in tracked files.
- [x] T133 Run `pnpm verify` (full suite): typecheck, lint, format, all tests, build, conformance, selfhost, design guards. Fix any findings without suppressions.
- [x] T134 Update `quickstart.md` with migration validation results (route tree classification, bundle size, test counts).
- [x] T135 Review every v1.1 acceptance criterion (AC-012..AC-017) against the implementation; prepare completion summary.

## Dependencies

Wave 0 precedes Wave 1. Wave 1 blocks Waves 2–3. Wave 3 blocks Wave 4
(test rewrite depends on new modules). Wave 5 depends on Waves 3–4.
Wave 6 depends on Wave 5. `[P]` marks parallel-safe tasks.

No task changes engine, terrain, combat, fog, wire, reconnect, matchmaking
semantics, or issue #34 UX.
