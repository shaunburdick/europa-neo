# Implementation Plan: Console Semantic URL Routing — v1.1 TanStack Router Migration

**Branch**: `issue-75-console-router`
**Spec**: [spec.md](./spec.md) v1.1
**Dependencies**: 004 networking, 005 console, 006 matchmaking, 009 versioning, 010 lobby, 011 single-port hosting, 012 design system, 015 profile route, 017 welcome landing

## Summary

Replace the hand-rolled routing layer (`parseRoute`/`adaptRoute`/
`executeRouteEntry` + manual `usePathname`/`popstate` orchestration in
`lobby-runtime.tsx`) with TanStack Router's code-based route tree. The
migration preserves every behavioral contract (FR-001..FR-019): the five
canonical route shapes, six match-ID rejection reasons, eight route-entry
kinds, `?e2e` harness, `?ws=` transport override, `returnTo` safety contract,
and unknown-route recovery. The route *mechanism* changes; the route *contract*
does not.

## Technical context

- TypeScript strict mode, React 19/Vite, pnpm 11.22.0, Node 22 development
  and pinned Node 24 Docker runtime; existing Biome 2, Vitest 4, and Playwright
  gates.
- New dependency: `@tanstack/react-router` v1.x (MIT, ~14 KB gz).
- Existing feature-010 lobby runtime, matchmaking projections, identity/session
  management, and networking contracts are unchanged.
- The `?e2e` harness, `?ws=` transport override, and `window.__europaTestMatch`
  seam remain outside the router.

## Constitution alignment

| Principle | Decision |
|---|---|
| I — Type safety | TanStack Router's typed route tree and search params enforce type safety at compile time. `RouteRejection` and `RouteEntry` unions preserved. No suppressions. |
| II — Authoritative/deterministic | Route tree classifies paths; lobby snapshot remains authority for eligibility. `adaptRoute` is a pure function, unchanged. |
| III — Tested logic | All existing routing tests rewritten to test the new surface. Coverage gates maintained. |
| IV — Specs/docs | Spec v1.1 amended; plan and tasks updated; manual/docs unchanged (v1.0 already correct). |
| V — Simplicity | One router library replaces hand-rolled `usePathname` + `popstate` + `patchHistoryForPathChanges`. Less code, better typing. |
| VI — Accessibility | Existing focus/live-region patterns, keyboard controls, and axe coverage preserved. `notFoundComponent` renders the existing `RouteNotice`. |
| VII — Self-hosting | No server changes. SPA fallback unchanged. One origin/port. |

## Architecture

### Route tree structure

```
rootRoute (pathless layout — lobby connection/identity context)
├── /                          → redirect to /lobby (beforeLoad)
├── /lobby                     → LobbyView (existing lobby landing)
├── /profile                   → ProfileView (existing profile, returnTo typed search)
├── /match/$matchId            → MatchLayout (pathless, deferred resolution)
│   ├── index                  → adaptive entry (player or spectator)
│   ├── /join                  → explicit player entry
│   └── /spectate              → explicit spectator entry
└── * (notFound)               → RouteNotice kind:'unknown' → /lobby
```

### Key files

| File | Change |
|---|---|
| `src/routing/route-tree.ts` | **NEW** — TanStack Router code-based route tree |
| `src/routing/route.ts` | **REPLACE** — `parseRoute`/types removed; `validateMatchId` utility + `RouteRejection` union + URL builders preserved |
| `src/routing/route-adapter.ts` | **PRESERVE** — `adaptRoute`, `RouteEntry`, `RouteEntryCommands`, `executeRouteEntry` (used by tests and deep-link-interstitial) |
| `src/main.tsx` | **REPLACE** — `bootstrapProductionRoute` replaced by `createRouter` + `RouterProvider`; `?e2e`/`__europaTestMatch` seams preserved before router mount |
| `src/internal/lobby-runtime.tsx` | **REPLACE** — `LobbyRoot` becomes the root layout route component; `usePathname`/`patchHistoryForPathChanges`/`popstate` removed; deferred-resolution gates move to `beforeLoad` |
| `src/ui/deep-link-interstitial.tsx` | **UNCHANGED** — imports `RouteEntry` from route-adapter (preserved) |
| `src/state/lobby-state.ts` | **UNCHANGED** — imports `RouteEntry` type (preserved) |
| `tests/unit/routing/*` | **REWRITE** — tests now exercise the route tree, typed search params, `validateMatchId`, and adapted `adaptRoute` |

### Route tree implementation

```typescript
// src/routing/route-tree.ts (conceptual)

const rootRoute = createRootRoute({
    // Pathless layout: lobby connection/identity context wraps all children
    beforeLoad: () => {
        // Defer until identity + connection gates are satisfied
        // (replaces lobby-runtime's useEffect gates)
    },
    component: LobbyLayout, // wraps <Outlet />
});

const lobbyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lobby',
    component: LobbyView,
});

const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/profile',
    validateSearch: (search) => ({
        returnTo: readReturnTo(search), // existing safety contract
    }),
    component: ProfileView,
});

const matchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/match/$matchId',
    beforeLoad: ({ params }) => {
        // Validate matchId (six rejection reasons)
        const validation = validateMatchId(params.matchId);
        if (!validation.ok) throw redirect({ to: '/lobby' });
    },
});

const matchIndexRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: '/', // adaptive entry
    component: MatchAdaptiveView,
});

const matchJoinRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: '/join',
    component: MatchJoinView,
});

const matchSpectateRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: '/spectate',
    component: MatchSpectateView,
});
```

### Bootstrap replacement

`main.tsx` currently calls `bootstrapProductionRoute` which:
1. Checks `?e2e` → demo runtime (PRESERVED, runs before router)
2. Checks `__europaTestMatch` → live runtime (PRESERVED, runs before router)
3. Calls `parseRoute` → switches on route kind → mounts lobby with route

After migration:
1. `?e2e` check → demo runtime (UNCHANGED)
2. `__europaTestMatch` check → live runtime (UNCHANGED)
3. Create `RouterProvider` with the route tree; the layout route handles
   all production routing

### Lobby runtime decomposition

The 1295-line `lobby-runtime.tsx` is decomposed into:

1. **`LobbyLayout`** (root layout route component) — announcer mount, lobby
   controller lifecycle, `Outlet` for child routes. Replaces `LobbyRoot`.
2. **`LobbyView`** — the existing lobby landing (`LobbyLanding`). Extracted
   from the `LobbyRoot` view gate.
3. **`ProfileView`** — already exists in `src/ui/profile-view.tsx`. Wired
   as a route component.
4. **`MatchLayout`** — pathless layout under `/match/$matchId`. Handles
   deferred resolution (adaptRoute against snapshot), deep-link interstitial,
   and match leg host. Replaces the match-related branches of `LobbyRoot`.
5. **`MatchJoinView` / `MatchSpectateView` / `MatchAdaptiveView`** — thin
   wrappers that invoke `adaptRoute` and dispatch to the existing match leg.

### `?ws=` and `?e2e` handling

- `resolveLobbyServerUrl` continues to read `window.location.search` directly
  (outside the router). Called in `LobbyLayout`'s setup, before the router
  mounts.
- `?e2e` guard runs before `RouterProvider` mounts (same as today).
- `window.__europaTestMatch` seam runs before `RouterProvider` mounts (same
  as today).

### Bundle strategy

- `@tanstack/react-router` is added to the `vendor` chunk (alongside React
  and Zustand) via the existing `manualChunks` config.
- Route components (`LobbyView`, `ProfileView`, `MatchLayout`) are lazily
  loaded via `createRoute({ component: () => import(...) })` to keep the
  initial chunk small.
- Budget check: ~81 KB current + ~14 KB router = ~95 KB gz (well under
  150 KB).

### `europa:pathchange` removal

The `usePathname` hook and `patchHistoryForPathChanges` monkey-patch are
removed. TanStack Router's `useLocation()` provides the current pathname.
Tests asserting `europa:pathchange` are updated to use `navigate()` instead.

## Planned file surface

```
packages/console/src/routing/route-tree.ts       # NEW — route tree definition
packages/console/src/routing/route.ts             # MODIFIED — keep builders + validateMatchId, remove parseRoute
packages/console/src/routing/route-adapter.ts     # PRESERVED — adaptRoute/RouteEntry unchanged
packages/console/src/main.tsx                     # MODIFIED — RouterProvider replaces bootstrapProductionRoute
packages/console/src/internal/lobby-runtime.tsx   # REWRITTEN — decomposed into layout route + child views
packages/console/src/internal/lobby-layout.tsx    # NEW — root layout route component
packages/console/src/internal/match-layout.tsx    # NEW — match pathless layout (deferred resolution + interstitial)
packages/console/src/ui/profile-view.tsx          # UNCHANGED — already exists
packages/console/src/ui/lobby-landing.tsx         # UNCHANGED — already exists
packages/console/src/ui/route-notice.tsx          # UNCHANGED — used by notFoundComponent
packages/console/tests/unit/routing/*             # REWRITTEN — test new routing surface
packages/console/tests/component/routing/*        # REWRITTEN — test route tree + layout
packages/console/package.json                     # MODIFIED — add @tanstack/react-router dependency
```

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Route tree does not match existing `parseRoute` classification | Validate matchId in `beforeLoad` with the same `validateMatchId` function; port all 17 test cases |
| Deferred-resolution gates break on route transition | `beforeLoad` re-runs on every navigation; identity/connection deps trigger re-evaluation |
| Bundle exceeds 150 KB gz | Lazy route chunks + vendor split; measure after integration |
| `popstate` behavior differs from manual `patchHistory` | TanStack Router uses `popstate` natively; test Back/Forward/reload identically |
| `RouteEntry` consumers break (deep-link-interstitial, lobby-state) | `RouteEntry` type and `adaptRoute` function preserved unchanged |
| `?ws=` or `?e2e` accidentally routed | Both checked before `RouterProvider` mounts; never passed to the router |
| Tests fail after rewrite | Port all test assertions; run `pnpm verify` at every wave |

## Acceptance trace

| AC | Mapping |
|---|---|
| AC-012 | Route tree classifies all shapes, rejects with six reasons |
| AC-013 | `adaptRoute` produces eight entry kinds (unchanged function) |
| AC-014 | `?e2e` and `?ws=` seams preserved (pre-router checks) |
| AC-015 | `returnTo` typed search param on `/profile` route |
| AC-016 | Bundle budget verified after router added |
| AC-017 | All existing suites pass, `pnpm verify` green |
