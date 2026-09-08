# Quickstart: Semantic URL Routing (Feature 013)

**Feature**: 013-semantic-url-routing | **Spec**: [spec.md](./spec.md) | **Status**: Implemented (v1.1 — TanStack Router migration)

---

## Setup

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm host
```

Open `/lobby`, create a waiting match, then use its semantic path from a second
browser. Verify adaptive `/match/<id>`, explicit `/join` and `/spectate`, reload,
Back/Forward, unknown/malformed recovery, and accessible notices.

---

## Required gates

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @europa/console test -- --coverage
pnpm --filter @europa/console test:e2e
pnpm --filter @europa/console test:selfhost
pnpm build
docker compose config -q
docker build -t europa:semantic-url-check .
```

Run the repository stale-production-link/privacy guard. The known root `pnpm
test` baseline may report that `@europa/design` has no test files; record that
known issue separately and use package-targeted tests for this feature. Confirm
`?e2e` remains deterministic and `?live` never mounts a match runtime.

---

## Route contract summary

| Path | Behavior |
|---|---|
| `/` | Redirect to `/lobby` (no match creation, no WebSocket). |
| `/lobby` | Mount the public lobby runtime (identity, listing, create, join, spectate). |
| `/match/<matchId>` | Adaptive entry: open seat → player, in-progress → spectator, full/unavailable → recovery. |
| `/match/<matchId>/join` | Explicit player entry; full/running/collected → actionable error + lobby recovery. |
| `/match/<matchId>/spectate` | Explicit spectator entry; failure → actionable error + lobby recovery. |
| Any other path | SPA fallback, then recover to `/lobby` with "Page not found. Returning to lobby." notice. |

**Match-ID validation** — six rejection reasons preserved from hand-rolled layer:
`malformed-encoding`, `empty-match-id`, `decoded-slash`, `unsafe-character`,
`wrong-segment-count`, `unsupported-path`.

**Route-entry kinds** — eight entry shapes preserved: `redirect`, `welcome`,
`lobby`, `profile`, `resolve`, `player`, `spectator`, `unavailable`.

---

## TanStack Router migration validation

The v1.1 migration (issue #75) replaced the hand-rolled `parseRoute`/`adaptRoute`
layer with `@tanstack/react-router` code-based route tree. All behavioral
contracts (FR-001..FR-019) are preserved; only the route-selection mechanism changed.

### Architecture

| Element | Detail |
|---|---|
| Router | `@tanstack/react-router` v1.x, code-based route tree (not file-based) |
| Root layout | Pathless layout route with `beforeLoad` deferred-resolution gates (identity + connection) |
| Lobby context | `LobbyLayoutContext` + `useLobbyLayout()` hook; wraps lobby, profile, and match views |
| Match layout | Handles route resolution, deep-link interstitial, unnamed-identity redirect |
| Match routes | 3 components: adaptive index, join, spectate |
| Search params | Typed `returnTo` on `/profile`; `?ws=` and `?e2e` preserved as untyped escape hatches |

### Route tree classification

| Shape | Count | Notes |
|---|---|---|
| Canonical route shapes | 5 | `welcome`, `lobby`, `profile`, `match` (+ `join`/`spectate` sub-routes) |
| Match-ID rejection reasons | 6 | Identical classification to pre-migration hand-rolled layer |
| Route-entry kinds | 8 | `redirect`, `welcome`, `lobby`, `profile`, `resolve`, `player`, `spectator`, `unavailable` |
| Typed search params | 1 | `returnTo` on `/profile` (relative-pathname-only safety contract preserved) |
| Untyped escape hatches | 2 | `?ws=` transport override, `?e2e` test harness |

### Bundle size

| Metric | Value | Budget | Headroom |
|---|---|---|---|
| Total gzipped | 134,689 B (87.7%) | 153,600 B | 18,911 B |
| TanStack Router contribution | ~3–5 KB gz | — | — |
| Largest chunk (vendor / React 19) | 84,823 B gz | — | — |

FR-030 budget met: 134,689 B gz < 153,600 B (12.3% headroom).

### Test counts (post-migration)

| Suite | Files | Tests |
|---|---|---|
| Unit | 50 | 805 |
| Component | 30 | 220 |
| A11y | 7 | 60 |
| E2E | — | 45 |
| Keepalive | — | 2 |
| Determinism | — | 3 |
| **Total** | — | **~1,135** |

### Validation mapping (FR-020..FR-030)

| FR | What it requires | Proving suites | Result |
|---|---|---|---|
| FR-020 | Adopt `@tanstack/react-router` v1.x | Route tree source (`src/routing/route-tree.ts`), `package.json` dependency | PASS |
| FR-021 | Five canonical route shapes preserved | Unit routing tests, E2E path tests | PASS |
| FR-022 | Six match-ID rejection reasons | Unit `validateMatchId` tests (determinism preserved) | PASS |
| FR-023 | Eight route-entry kinds | Unit `adaptRoute` tests (eligibility rules unchanged) | PASS |
| FR-024 | Typed search params for `returnTo` | Unit search-param tests, component profile tests | PASS |
| FR-025 | `?ws=` / `?e2e` escape hatches preserved | E2E selfhost smoke, `?e2e` determinism tests | PASS |
| FR-026 | Nested layout routes for lobby context | Component lobby-layout tests, E2E deep-link tests | PASS |
| FR-027 | Loader caching does not change route-entry authority | Unit deferred-resolution tests (snapshot authority preserved) | PASS |
| FR-028 | Deep-link / unnamed-identity / welcome / not-found preserved | E2E deep-link interstitial tests, a11y notice tests | PASS |
| FR-029 | Browser-visible URL shapes identical | E2E reload / Back-Forward tests, determinism tests | PASS |
| FR-030 | Bundle under 153,600 B gz budget | `test:selfhost` bundle check (134,689 B gz) | PASS |

### Key preservation guarantees

- **`?e2e`** harness: unchanged, deterministic, test-only.
- **`?ws=`** transport override: read by `resolveLobbyServerUrl`, outside router.
- **`?live`/`?match=`/`?name=`/`?token=`** direct-match seam: `live-runtime.tsx` still available for test-only compatibility.
- **`europa:pathchange`/`popstate`**: replaced by TanStack Router navigation lifecycle; observable behavior identical.
- **Unknown-route recovery**: `notFoundComponent` renders existing `RouteNotice` kind `'unknown'` → `/lobby`.
- **Redirect loop guard**: `/` → `/lobby` via `beforeLoad` redirect; no history-loop accumulation.

---

## Common debugging recipes

### "Route doesn't match"

- Check the URL against the route table above. Ensure `<matchId>` is a single
  path segment (no `/` after decoding).
- Six rejection reasons surface via `validateMatchId` — the console renders an
  actionable notice with lobby recovery.

### "Deep-link shows interstitial instead of match"

- The deep-link interstitial appears when the lobby snapshot is still loading
  or the match is full/unavailable. Wait for resolution or click the lobby
  recovery link.

### "Old `?live` URL doesn't work"

- Intended: FR-009 retired the `?live` route. Use `/match/<id>` instead.
  The `?e2e` test harness is unaffected.
