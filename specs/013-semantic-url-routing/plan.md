# Implementation Plan: Console Semantic URL Routing

**Branch**: `issue-35-semantic-url-scheme`
**Spec**: [spec.md](./spec.md) v1.0
**Dependencies**: 004 networking, 005 console, 006 matchmaking, 009 versioning, 010 lobby, 011 single-port hosting, 012 design system

## Summary

Replace production query-selected live boot with one pure pathname router and an
explicit route-to-runtime adapter. `/` performs one canonical replace redirect to
`/lobby`; `/lobby` owns the existing lobby runtime; semantic match paths resolve
through lobby authority before attaching a player or spectator leg. `?e2e` remains
the sole test harness query. The retired `?live` path and `resolveInitialViewMode`
export are removed, not shimmed.

The existing single HTTP server reserves `/version`, assets, WebSocket upgrades,
and traversal checks, then serves `index.html` for safe application paths. Links
contain only origin and semantic path. Wire, engine, fog, reconnect, and
matchmaking protocol behavior is unchanged.

## Technical context

- TypeScript strict mode, React 19/Vite, pnpm 11.22.0, Node 22 development and
  pinned Node 24 Docker runtime; existing Biome 2, Vitest 4, and Playwright gates.
- Native History API (`pushState`/`replaceState`/`popstate`); no routing dependency.
- Feature 010 remains authoritative for identity/session association and entry
  eligibility; pathname parsing supplies only validated target and intent.
- Browser storage supplies identity/reconnect state; production queries do not
  carry identity, credentials, transport, or match selection.

## Constitution alignment

| Principle | Decision |
|---|---|
| I — Type safety | Closed route/rejection unions, strict tests, no suppressions or new dependency. |
| II — authoritative/deterministic | Pure classification; lobby/matchmaking remains authority for eligibility, seat, role, and state. |
| III — tested logic | Parser, URL construction, host security, history, and full-stack behavior are covered; existing coverage gates remain. |
| IV — specs/docs | This plan and contract define behavior; README, manual, fixtures, and stale-query guards change with implementation. |
| V — simplicity | One parser, one adapter, native History API, and existing runtime seams. |
| VI — accessibility | Existing focus/live-region patterns, keyboard controls, visible focus, and axe coverage apply to recovery. |
| VII — self-hosting | Native and Docker retain one origin/port and no cloud dependency. |

## Architecture

### Pure parser and builders

Add `packages/console/src/routing/route.ts` with `parseRoute(pathname): Route` and
semantic URL builders. Parse pathname only. Decode exactly one match segment for
lookup, reject empty values, decoded slash/backslash, dot segments, controls,
malformed escapes, and extra segments, and preserve the browser-visible path.
This module has no DOM, storage, clock, random source, or network dependency.

### Bootstrap and adapter

Make `main.tsx` the bootstrap authority: handle `?e2e` unchanged, replace `/` with
`/lobby`, and mount a route shell for all other paths. The shell handles popstate
and delegates lobby, adaptive match, explicit join, and explicit spectate through
existing Feature 010 seams. Adaptive entry selects player only for waiting/open
matches and spectator only for in-progress matches; explicit intents never
downgrade. Invalid/unavailable routes announce recovery and replace-navigate to
`/lobby` without opening a match socket.

The adapter owns the visible semantic path; lobby owns identity; match runtime
owns networking. Leaving navigates to `/lobby`; reconnect, terminal, fog, and
order behavior remain in their existing modules.

### Host and Docker

Refactor `packages/console/scripts/host.ts` so safe extensionless application paths
get `index.html` after `/version`, known assets, traversal, and realpath checks.
WebSocket upgrades and security headers remain unchanged. Native banner/create
links use only `origin + /match/<id>` (or suffix), never credentials. Docker
inherits the same handler through `pnpm host`; smoke tests cover every canonical
path and reserved endpoint.

### Retired compatibility

Remove `hasDirectMatchRoute`, `resolveInitialViewMode`, the production `?live`
branch, and the old live runtime if it has no remaining test-only purpose. Migrate
real full-stack fixtures to semantic paths and inject test server details through
existing seams. Preserve the `?e2e` demo and deterministic capture exactly.

## Planned file surface

```
packages/console/src/main.tsx
packages/console/src/routing/{route.ts,route-adapter.ts}
packages/console/src/internal/lobby-runtime.tsx
packages/console/src/internal/live-runtime.tsx  # delete/remove from boot
packages/console/src/state/lobby-view.ts
packages/console/src/ui/route-notice.tsx
packages/console/scripts/host.ts
packages/console/tests/{unit,component,integration,e2e}/...
packages/console/README.md, README.md
docs/manual/{index,quick-start,lobby}.md
Dockerfile
specs/005-*, specs/010-*, specs/011-*
```

No application code is changed in this planning commit.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adaptive route races with lobby snapshot | Existing authoritative state/commands plus action-time revalidation and recovery. |
| Credentials leak into links/history | Builders accept only origin, match ID, and intent; privacy guard scans docs, logs, and output. |
| SPA fallback masks assets or `/version` | Preserve reserved ordering; test traversal, missing assets, version, and upgrades. |
| Removing live mode breaks tests | Migrate real fixtures; run `?e2e` unchanged and assert retired queries never mount. |
| History remount loops | Replace only root/recovery; push user transitions; test back/forward and reload. |
| Accessibility regression | Reuse existing notice/focus/live-region primitives and add keyboard/axe coverage. |

## Acceptance trace

AC-001..004 map to parser/adapter/unit/browser tests; AC-005 to unchanged `?e2e`;
AC-006 to semantic real sockets; AC-007 to native/Docker smoke; AC-008 to
privacy/stale-reference guards; AC-009 to parser/host security; AC-010 to
component/a11y; AC-011 to history/reload E2E. Issue #34 share/copy UX is out of
scope.
