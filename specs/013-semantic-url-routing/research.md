# Research: Console Semantic URL Routing

## Findings

1. Use the native History API (`pushState`, `replaceState`, `popstate`) rather
   than adding a router dependency: the console has five fixed shapes and already
   owns mounting in `packages/console/src/main.tsx`.
2. Keep pathname parsing separate from transport policy. Existing
   `state/lobby-view.ts` mixes query classification with same-origin WS policy;
   the new parser must not read query identity or match values. Feature 010's
   `LobbyRoot` remains authoritative for identity, adaptive actions, spectation,
   and leaving.
3. Decode one path segment once, then reject empty values, decoded slash/backslash,
   dot segments, controls, and malformed escapes. Rejected values must never reach
   `path.resolve` or matchmaking.
4. Preserve Feature 011 host ordering: `/version`, known assets, traversal and
   realpath checks, then SPA fallback. Safe application paths receive `index.html`;
   missing assets and reserved endpoints do not.
5. The current live surface is present in `main.tsx`, `internal/live-runtime.tsx`,
   `state/lobby-view.ts`, host banners, and full-stack/waiting tests. Migrate real
   tests through existing seams, remove the public compatibility export, and retain
   only the unchanged `?e2e` harness.
6. No protocol, engine, fog, reconnect, matchmaking, or dependency change is
   warranted. Routing changes browser bootstrap and static delivery only.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| React Router | Unnecessary dependency and lifecycle complexity. |
| Hidden `?live` shim | Contradicts FR-009 and retains credential-bearing production URLs. |
| Server 404 for deep links | Fails direct-load/native/Docker acceptance. |
| Identity/token in path or route state | Violates Feature 010 storage/session authority and privacy. |
| New match lookup API | Duplicates authoritative lobby projections and invites drift. |

## Baseline

Use locked repository versions: React 19, Vite, TypeScript strict mode, Vitest 4,
Playwright, Biome 2, pnpm 11.22.0, Node 22+ development and pinned Node 24
Docker runtime. No version bump or external runtime dependency is needed.
