# Research: Console Semantic URL Routing — v1.1 TanStack Router Migration

## v1.0 Findings (superseded by v1.1)

The v1.0 implementation used the native History API with a hand-rolled parser.
Finding #1 ("Use the native History API rather than adding a router dependency")
is now superseded by the v1.1 decision to adopt `@tanstack/react-router`.

## v1.1 Findings — TanStack Router Adoption

### 1. Library choice: `@tanstack/react-router` v1.x

TanStack Router v1.x (current stable: v1.170.33, verified 2026-09-07) provides:

- **Code-based route tree** — explicit `createRoute()` calls with
  `getParentRoute` linkage, matching the existing `parseRoute` classification
  style. No file-system convention, no code generation.
- **Typed search params** — `validateSearch` on per-route definitions replaces
  ad-hoc `window.location.search` reads. The `returnTo` safety contract
  (relative-pathname-only, unsafe → absent) can be enforced in a single
  `validateSearch` function.
- **Layout routes** — pathless layout routes provide the lobby connection/
  identity context wrapping `lobby`, `profile`, and `match` views, replacing
  the manual orchestration in `lobby-runtime.tsx`.
- **`Outlet` rendering** — child routes render through `<Outlet />`, replacing
  the manual view-mode gate.
- **`beforeLoad` guards** — deferred-resolution gates (identity `named` +
  connection `ready`) live in `beforeLoad` on the layout route, replacing
  the `useEffect` gates in `lobby-runtime.tsx`.
- **`notFoundComponent`** — unknown routes render the existing `RouteNotice`
  with `kind: 'unknown'`, replacing the manual `unknown` → `/lobby` redirect
  in `main.tsx`.
- **`redirect()`** — the `/` → `/lobby` redirect is a route-level `beforeLoad`
  that throws a redirect, eliminating the manual `replaceState` in
  `bootstrapProductionRoute`.
- **Automatic code splitting** — route components are lazy-loaded by default
  when using the Vite plugin or manual `lazy()` wrappers, helping the bundle
  budget (FR-030).

### 2. Bundle impact

`@tanstack/react-router` v1.x ships ~14 KB gzipped (core + React adapter).
The current vendor chunk is ~81 KB gz. Adding the router pushes the initial
bundle to ~95 KB gz — well under the 150 KB budget (FR-030). Lazy route
chunks for welcome/match views keep the initial payload small.

Tree-shaking: only `createRouter`, `createRoute`, `createRootRoute`,
`RouterProvider`, ` Outlet`, `useNavigate`, `useSearch`, `useParams`,
`redirect`, and `notFound` are imported. Unused features (SSR, streaming,
code-gen) are excluded by the build.

### 3. Match-ID validation — preserving the six rejection reasons

TanStack Router does not provide built-in path-segment validation. The
existing `decodeMatchSegment` / `validateDecodedMatchId` logic in `route.ts`
is preserved as a utility function (renamed to `validateMatchId`) and called
inside the match route's `beforeLoad` or component-level validation. The
six `RouteRejection` reasons are preserved as a type union; the route tree
produces them identically.

### 4. Route-entry adaptation — preserving the eight entry kinds

`adaptRoute` in `route-adapter.ts` is a pure function: `(Route, LobbySnapshot | null) → RouteEntry`. It does not depend on React, DOM, or the router
library. It is preserved as-is (imported into route components or the layout
route's `beforeLoad`). The `RouteEntry` union type is preserved.

### 5. `?ws=` transport override — stays untyped (clarification #10)

`resolveLobbyServerUrl` reads `window.location.search` directly. This is
outside the router's typed search-param surface and is not changed. The
`?ws=` value is never declared as a TanStack typed search param.

### 6. `?e2e` test harness — stays unchanged (FR-011, FR-025)

The `?e2e` check in `main.tsx` runs before the router mounts. It remains a
simple `URLSearchParams.has('e2e')` guard that dynamically imports the demo
runtime. The router is never involved in the `?e2e` path.

### 7. Direct-match E2E seam — preserved (FR-025)

`window.__europaTestMatch` and the `live-runtime.tsx` dynamic import remain
reachable from `main.tsx` before the router tree mounts. The seam is a
test-only compatibility path, not a production route.

### 8. `europa:pathchange` custom event — removable (FR-029)

TanStack Router's `useLocation()` replaces `usePathname()`. The
`patchHistoryForPathChanges()` monkey-patch and the `europa:pathchange`
custom event are no longer needed. Tests asserting the custom event must be
updated in the same change set.

### 9. Deferred route resolution — `beforeLoad` + context

The identity/connection gates (`state.connection !== 'ready'` ||
`state.identityStatus !== 'named'`) are expressed as `beforeLoad` guards on
the layout route. While a gate holds, `beforeLoad` returns without rendering
the child, and the route stays in a "pending" state. Re-evaluation happens
automatically when the dependency (identity/connection) changes — no manual
`useEffect` re-triggering needed.

### 10. Deep-link interstitial — component-level, not route-level

The `DeepLinkInterstitial` is a transient UI state, not a route. It remains
in the lobby layout route's component, driven by the lobby store's
`deepLinkInterstitial` state. The router does not model it as a route.

## Rejected alternatives (v1.0, still valid)

| Alternative | Reason |
|---|---|
| React Router | Heavier, less type-safe search params, no code-based route tree without file-system约定. |
| Hidden `?live` shim | Contradicts FR-009 and retains credential-bearing production URLs. |
| Server 404 for deep links | Fails direct-load/native/Docker acceptance. |
| Identity/token in path or route state | Violates Feature 010 storage/session authority and privacy. |
| New match lookup API | Duplicates authoritative lobby projections and invites drift. |

## Rejected alternatives (v1.1)

| Alternative | Reason |
|---|---|
| `swr` for loader caching | Deferred by PO ruling (clarification #9). TanStack Router's built-in loader caching is sufficient. |
| Typed `?ws=` search param | Deferred by PO ruling (clarification #10). Keep as untyped escape hatch. |
| File-based route generation | FR-020 requires code-based route tree. Avoids code-gen complexity and CI noise. |
| Thin compatibility layer for old routing API | Full replacement per clarification #8. Cleaner surface, no dead code. |

## Baseline

Locked repository versions: React 19, Vite, TypeScript strict mode, Vitest 4,
Playwright, Biome 2, pnpm 11.22.0, Node 22+ development and pinned Node 24
Docker runtime. New dependency: `@tanstack/react-router` v1.x (MIT license).
