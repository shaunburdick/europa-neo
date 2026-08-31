# Implementation Plan: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Branch**: `issue-5-docker-support` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md) v1.0 + product-owner gate 2026-08-26 (Node 24 LTS)  
**Dependencies**: 004 networking, 005 console, 006 matchmaking, 010 lobby, 009 versioning  
**Research**: [research.md](./research.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/) | **Quickstart**: [quickstart.md](./quickstart.md)

## Summary

Collapse the self-host deployment from two local servers (`ws://:8080` + `http://:5173`) to ONE `http.Server` on `HOST_PORT` (default 8080) serving HTTP (`dist/` + `/version` + SPA fallback) and WebSocket upgrades from the same port, package it as a reproducible multi-stage Docker image on the latest LTS Node base (`node:24-slim`, confirmed Active LTS 2025-10-28→2028-04-30), add a one-command `docker-compose.yml` (single port mapping + 3-env passthrough), a `.dockerignore`, a GHCR publish workflow (`:edge` on `main`, `:vX.Y.Z` on release tags), and migrate the console client to same-origin WebSocket fallback with hard errors for removed two-port flags. No wire-protocol or game-logic change.

## Technical Context

- **Language/runtime**: TypeScript strict mode, Node LTS (Docker: `node:24-slim` Debian bookworm; dev engines stay `>=22.0.0` per [research.md](./research.md) Finding 1).
- **Package manager**: pnpm 11.22.0 via `corepack` inside Docker; `pnpm install --frozen-lockfile` + `pnpm build` of all workspaces (engine → terrain → fog → networking → matchmaking → console (vite) → version).
- **Primary deps**: `ws@^8.21.3` (only runtime dep in networking, `noServer: true` already), `vite@^6` + `@vitejs/plugin-react` 6.x, React 19, `tsx` for host runner. No new runtime dependency.
- **Storage**: in-memory only (constitution VII). Matches/lobby/identities/sessions remain ephemeral — restart resets them; Docker does not add persistence.
- **Testing**: Vitest 4 (unit/integration/coverage), Playwright E2E (full-stack two-seat proof + keepalive), `docker build` + `docker compose config -q` gates, curl-based version checks.
- **Target platform**: Linux x86_64 mandatory (`linux/amd64`), `linux/arm64` best-effort non-blocking; single container on Docker Engine + Compose v2.
- **Performance goals**: Lobby reachable within seconds of `docker compose up` (cached image; NFR-001); median tick budget unchanged; image compressed size O(200–400 MB) uncompressed, documented precisely at implementation.
- **Constraints**: TypeScript strict, ≥80% coverage on game logic, no lint suppressions, specs-as-docs, `private:true` all packages (never published to npm), single `http.Server` invariant, no protocol change (`NETWORK_API_VERSION` untouched).

## Constitution Check

| Principle | Decision | Why compliant |
|---|---|---|
| I — Type safety | `httpServer?: HttpServer` is typed `import('node:http').Server`; client fallback `location.host` is typed `PageLocator`; no `any`, no suppressions. | Strict TS enforced; contract drift tests cover mirrors. |
| II — Authoritative / deterministic | Host is just a process owner; simulation tick path untouched; no wall-clock in engine. Framing (`ws` `noServer:true`) unchanged. | Only I/O wiring changes; determinism preserved. |
| III — Tested logic (≥80%) | Host config + version-route keep unit coverage; lobby/networking seams need same-origin + seam tests; existing per-package suites stay green (≥80% on every metric). | New logic is hosting/validation — suitable for unit tests; no coverage gate bypass. |
| IV — Specs as docs | This plan, research, data-model, contracts, quickstart are co-committed; README + optional doc-privacy check updated same change set as code. | Spec stays truthful per change-set rule. |
| V — Simplicity over cleverness | One `http.Server`, one port, one `EXPOSE`, one env var, one image; no 2-mode matrix, no extra package, no second transport. | YAGNI: two-port fallback already rejected as binding decision. |
| VI — Accessibility | No UI change except console already ships lobby/HUD; Docker path doesn't alter UI. | Existing a11y test suites remain green. |
| VII — Self-hostable by default | `docker compose up` from a fresh clone with ONLY Docker needed satisfies VII's "single process, env config, no cloud" clause. TLS still off-loaded. | Image is the deployable single process. |

No constitution violation requires exception tracking.

## Architecture

### 1. At a glance

```
Operator runs:          docker compose up
                            │
                    ┌───────┴────────────────┐
                    │  container: node:24-slim runtime
                    │  HOST_PORT=8080 (→ single http.Server)
                    │  request → serveStatic (dist/ + /version + SPA fallback)
                    │  upgrade → wss.handleUpgrade (feature 004, noServer:true)
                    │  console UI + lobby WebSocket on same origin
                    └───────┬────────────────┘
                            │  same http.Server on HOST_PORT
                    ┌───────┴────────────────┐
                    │  Browser at http://host:8080/
                    │    same-origin WS fallback: ws(s)://host:8080
                    │    explicit ?ws= still honored (same-host only)
                    └────────────────────────┘
```

### 2. Networking seam (Spec FR-002 — chosen variant)

**Chosen**: extend `ServerDeps` with optional `httpServer?: import('node:http').Server` (alternative `ServerConfig.httpServer?` is contract-equivalent; plan pins `ServerDeps` because ownership semantics belong with deps — the locus of host-provided resources like `logger`/`lobby`). Document the alternative and keep it accepted if reviewers prefer `ServerConfig`.

- When `httpServer` is supplied: `createMatchServer` attaches its `WebSocketServer` (`noServer: true`) to `httpServer.on('upgrade', …)` and does NOT call `createHttpServer`, does NOT call `httpServer.listen`, and `server.close()` does NOT close `httpServer`.
- When absent: current behavior — `listen()` creates its own `http.Server` and owns its lifecycle. This preserves existing `port: 0` test semantics for callers that have not migrated, while the new host/tests use the external-server path. Either implementation MUST also expose `__boundPortForTest()` returning the single server's bound port (now reading from the externally owned server when present).
- No change to `NETWORK_API_VERSION`, frame format, or `NetworkPayload` union.

### 3. Host single-port collapse (Spec FR-001..FR-005)

Single source file `packages/console/scripts/host.ts` (± `host-config.ts`, `version-route.ts`):

- Delete: `DEFAULT_STATIC_PORT = 5173`, `staticPort` field in `HostLaunchConfig`, `HOST_STATIC_PORT` parsing, `--static-port` flag, `startStaticServer`, and the secondary `staticServer` variable/teardown.
- Add: one `http.Server`:

  ```ts
  const server = createHttpServer(async (req, res) => {
      void serveStatic(req, res); // includes handleVersionRoute pre-SPA + security headers + traversal guard
  });
  // WebSocket upgrade delegation (wss handle injected by networking seam)
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)));
  server.on('error', EADDRINUSE handling on the single HOST_PORT);
  await new Promise<void>((res) => server.listen(wsPort, bindHost, res));
  ```

- `resolveConfig`: `--port`/`HOST_PORT` default `8080`; `--static-port`/`HOST_STATIC_PORT` absent → when seen, return null with message `host: --static-port / HOST_STATIC_PORT no longer supported — the server uses a single port (HOST_PORT / --port); see README`.
- `buildStack(wsPort, bindHost, httpServer)`: create `ServerDeps` with `httpServer`, expose the networking server's internal wss upgrade handle (either via returned `wss` or a small `getWss()` accessor) so host can wire `server.on('upgrade', …)` without duplicating auth logic.
- Banner: `Match server : ws(s)://host:PORT` and `Console UI : http(s)://host:PORT` are the SAME port; lobby banner `→ http://…:PORT/lobby` and `--create` banner join URLs use semantic `/match/<matchId>/join` paths on one origin. Log lines MUST NOT mention `staticPort`.

### 4. Console same-origin fallback (Spec FR-006..FR-008)

Two call sites, one helper:

- **`packages/console/src/state/lobby-view.ts`**: change `resolveLobbyServerUrl(search, locator)` default path from `ws(s)://hostname:LOBBY_DEFAULT_SERVER_PORT` to:

  ```ts
  const locHost = locator.host ?? (locator.hostname ? `${locator.hostname}${locator.port ? `:${locator.port}` : ''}` : '');
  // OR: if locator exposes `host` directly (location.host), use it verbatim.
  // Spec-prescribed string:
  `${locator.protocol === 'https:' ? 'wss' : 'ws'}://${locator.host ?? fallback}`
  ```

  Where `locator` is widened to carry `host` (`location.host` = hostname + port as the browser sees it). When `location.host` is empty (non-http origin, `file://`, unit test), fall back to `localhost:<LOBBY_DEFAULT_SERVER_PORT>` where `LOBBY_DEFAULT_SERVER_PORT` is now documented as "THE default `HOST_PORT` (8080) — not a second port". The explicit `?ws=` override still routes through `validateLobbyServerUrl` (same-host + loopback alias + no-credentials).

- **Semantic match runtime**: use the same-origin default when `?ws=` is absent on canonical lobby and semantic match paths. The retired query-selected live entry is not supported; `?e2e` remains the unchanged test-only harness and explicit `?ws=` remains a validated test/operator override.

- Keep `validateLobbyServerUrl` semantics unchanged; `normalizeWsUrl` unchanged.

- `LOBBY_DEFAULT_SERVER_PORT` becomes a constant for non-browser/test fallback only; its JSDoc MUST say "default HOST_PORT, not a second listener".

### 5. Fixtures — single server (Spec FR-009)

- `packages/console/tests/e2e/full-stack.spec.ts:buildStack()` and `tests/integration/lobby-transport.test.ts:bootLobbyStack()`:

  ```ts
  const httpServer = createHttpServer();
  const server = createMatchServer({ ...CONFIG, port: 0 }, { ..., httpServer });
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', r));
  // server.__boundPortForTest() now reads httpServer.address().port
  ```

  Where `createHttpServer` either is the plain `node:http` one with `serveStatic`-like request handler for tests, or (minimally) an empty request handler because tests drive the browser through a Playwright-proxied route. The server's internal `WebSocketServer` attaches its upgrade handler to this `httpServer`. `__boundPortForTest()` returns `(httpServer.address() as AddressInfo).port`.

- Remove any two-server coordination (previous host had separate `wsPort` + `staticPort`).

### 6. Docker packaging (Spec FR-010..FR-013)

**`Dockerfile` (repo root, multi-stage)**:

```dockerfile
# Header comment: single-port topology; node:24-slim is latest LTS Aug 2026; re-validate at next LTS.
# syntax=docker/dockerfile:1

# Stage 1 — build
FROM node:24-slim@sha256:<pinned> AS build # 24.x — latest LTS Aug 2026
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate && pnpm --version

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2 — runtime (minimal)
FROM node:24-slim@sha256:<pinned> AS runtime # 24.x — latest LTS Aug 2026
WORKDIR /app
ENV NODE_ENV=production
ENV HOST_PORT=8080
# Copy only built artifacts (no node_modules dev deps, no source, no tests)
COPY --from=build /app/packages/console/dist ./packages/console/dist
COPY --from=build /app/packages/console/scripts ./packages/console/scripts
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Runtime node_modules: `pnpm install --prod --frozen-lockfile` OR `npm pack` the built workspaces.
# Prefer `pnpm install --prod --frozen-lockfile` for exact lockfile fidelity; scope: only prod deps.

EXPOSE 8080
CMD ["pnpm", "host"]
```

*Exact `COPY --from=build` list is tuned at implementation to include `packages/*/dist/` plus `packages/version` and any asset `packages/console/build-assets.ts` outputs. The invariant is runtime copies built artifacts + production node_modules only; source TypeScript not shipped.*

**`.dockerignore` (repo root)**:

```
node_modules
dist
coverage
.playwright
packages/*/dist
packages/*/coverage
docs
.git
.gitignore
.github
specs
.muse
.opencode
*.tsbuildinfo
```

(Must NOT exclude content that the build stage produces internally via `COPY` from build stage — build stages copy from build context; `.dockerignore` affects build context only; runtime copies from `build` stage.)

**`docker-compose.yml` (repo root)**:

```yaml
# Single-port topology: one http.Server on HOST_PORT serving static UI + /version + WS upgrades.
services:
  europa:
    build: .
    ports: ["${HOST_PORT:-8080}:${HOST_PORT:-8080}"]
    environment:
      HOST_PORT: ${HOST_PORT:-8080}
      HOST_BIND_HOST: ${HOST_BIND_HOST:-0.0.0.0}
      HOST_PUBLIC_HOST: ${HOST_PUBLIC_HOST:-}
    expose: ["${HOST_PORT:-8080}"]
    # No HOST_STATIC_PORT — removed (FR-004); compose MUST NOT mention it.
```

Default compose bind is `0.0.0.0:8080` (wide because docker's port mapping is the ingress; host native default remains `127.0.0.1`). `HOST_PUBLIC_HOST` passthrough lets LAN/reverse-proxy deployments advertise the correct host without rebuilding.

### 7. GHCR publish (`docker.yml`)

`.github/workflows/docker.yml` (or `docker.yml`):

- **Triggers**: `push` to `main` (path-filtered to `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `packages/**`, `package.json`, `pnpm-lock.yaml`, workflow itself optional — follow [research.md](./research.md) Finding 4's self-exclusion note) → `:edge`; `push` tag `v*` → versioned `:X.Y.Z` (and optionally `:vX.Y.Z` mirror). Guard: workflow runs only on `github.repository == 'shaunburdick/europa-neo'` (skip forks) via `if:` at job level.
- **Actions SHA-pinned**: `actions/checkout`, `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action`, `docker/metadata-action` — each with version comment.
- **Permissions**: `contents: read` (tag pull), `packages: write` (GHCR push); no `id-token` unless provenance enabled.
- **Image name**: `ghcr.io/shaunburdick/europa-neo`.
- **Tags**: `type=edge,branch=main` + `type=semver,pattern={{version}}` + `type=semver,pattern=v{{version}}` as appropriate; metadata-action derives from ref.
- **Platforms**: `linux/amd64` mandatory; `linux/arm64` non-blocking: build matrix `fail-fast: false` with `continue-on-error: true` on the arm64 leg OR separate jobs where arm64 failure doesn't block amd64 push; header comment documents the ruling per [research.md Finding 4](./research.md). The pushed manifest always includes the `amd64` image even when arm64 leg fails.
- **Build args**: provenance/attestation optional; cache via `gha` is permissible but not required.
- **Concurrency**: `group: docker-${{ github.ref }}` `cancel-in-progress: true` (successive `main` pushes don't pile).
- **Timeout**: `timeout-minutes: 30` on the build job.
- **Version check inside image**: post-build step `curl -s http://localhost:$HOST_PORT/version` or `docker run --rm image node -e "console.log(APP_VERSION)"` proving `/version` matches `APP_VERSION`.
- **Self-exclusion**: The workflow file itself SHOULD be included in its `paths:` filter (unlike `release.yml`'s self-exclusion ruling — here self changes are deployable and never spurious; FR-014 path list is not exclusive).

### 8. Docs

- **README**: Add/replace Docker quick-start section immediately after the `pnpm host` quick-start:

  ```md
  ## Docker quick start (single port)
  docker compose up --build  # first run builds; later runs `docker compose up` suffices
  # lobby at http://localhost:8080/ (single http.Server: static UI + /version + WS on 8080)
  # env overrides: HOST_PORT, HOST_BIND_HOST, HOST_PUBLIC_HOST (no HOST_STATIC_PORT — removed)
  ```

  Also update the earlier "Two-port" paragraph to explicitly declare the single-port topology; retain the `pnpm host` native path but note both share the single port.
- **Player manual**: FR-016 trigger check — `docs/manual/**` change detection MUST be performed; expectation is ZERO two-port references remain (grep `HOST_STATIC_PORT|staticPort|5173` across `docs/manual/`). Either leave `docs/manual/` untouched (counts as passing when zero drift found) or patch stale mentions in the same change set.

### 9. Testing strategy

| Layer | Suite | Covers |
|---|---|---|
| Unit | `packages/networking/src/*` new seam tests | `ServerDeps.httpServer` ownership (listen/close don't create/close external server); `__boundPortForTest` over single server; `wss.handleUpgrade` delegated exactly once per upgrade. |
| Unit | `packages/console/scripts/host.test.ts` expanded | `resolveConfig` rejects `HOST_STATIC_PORT`/`--static-port` (FR-004); parses `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` defaults/`0.0.0.0` requires `HOST_PUBLIC_HOST`; banner format shows single port for both HTTP and WS. |
| Unit | `packages/console/src/state/lobby-view.test.ts` + live-runtime tests | `resolveLobbyServerUrl` same-origin defaults: `http://host:8080` → `ws://host:8080`, `https://` → `wss://`; `location.host` empty → `localhost:HOST_PORT` fallback; `?ws=` same-host/loopback accepted, cross-host/credentials rejected. |
| Integration | `lobby-transport.test.ts` + `full-stack.spec.ts` (already T-015/T-016 style) | Single-server fixtures `port:0` → `__boundPortForTest` ticks flow + fog views + order round-trip over one port; `curl http://:PORT/` + WS handshake on same port succeed; second port absent. |
| Contract | networking contract drift tests | Byte-identity of canonical wire contract unchanged (FR-014 NFR-005: `NETWORK_API_VERSION` untouched). |
| Build gate | `docker build` + `docker compose config -q` | Dockerfile syntax, compose spec, `EXPOSE` count. |
| Manual gate | Per quickstart.md Q-D01..Q-D08 | Fresh-clone compose → two-seat lobby flow; same-origin without `?ws=`; `HOST_*` env overrides; stale-flag hard error; image `/version` == `APP_VERSION`. |

Coverage: ≥80% on every metric for new host/config/client logic (constitution III); existing suites must stay green.

### 10. File surface (authoritative)

```
Dockerfile                         # FR-010 (node:24-slim, corepack pnpm, multi-stage)
.dockerignore                      # FR-012
docker-compose.yml                 # FR-011 (single port, 3-env passthrough)
.github/workflows/docker.yml # FR-014 (edge + v* tags, SHA-pinned, least-privilege)
packages/networking/src/server.ts  # FR-002 seam (+ contracts/network-api.ts docs)
packages/networking/src/contracts/network-api.ts # ServerDeps.httpServer? JSDoc
packages/console/scripts/host.ts   # FR-001/003/004/005 single http.Server + error message
packages/console/scripts/host-config.ts # HostConfig.staticPort removed; parsePort updated
packages/console/src/state/lobby-view.ts # FR-006/008 same-origin fallback
packages/console/src/internal/live-runtime.tsx # FR-006 same-origin fallback
tests/e2e/full-stack.spec.ts       # FR-009 single server fixture (if tracked here else console/tests)
tests/integration/lobby-transport.test.ts # FR-009 single server fixture
README.md                          # FR-015 Docker section
specs/011-…/contracts/             # Docker/GHCR contract (plan artifact, not runtime)
```

No new package, no new dependency (`"private": true` everywhere preserved).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| External `httpServer` ownership confused (double listen/close) | Guard `listen()`/`close()` on the presence of external server; add seam unit tests asserting `close()` does NOT close external server. |
| `resolveLobbyServerUrl` `location.host` empty in non-http test/browser context | Keep `LOBBY_DEFAULT_SERVER_PORT = 8080` as fallback ONLY for `location.host === ''`; tests cover the branch explicitly. |
| Docker build bloat / reproducibility drift | Runtime copies `dist/` + prod `node_modules` only (no devDeps, no source); `--frozen-lockfile` enforced; header pins `node:24-slim` digest; record compressed size in PR description. |
| ARM cross-build flakiness blocks publish | Non-blocking arm64 leg per research Finding 4; `amd64` manifest always published. |
| `HOST_STATIC_PORT`/`--static-port` legacy scripts break | Hard error with actionable message naming the removed flag; README documents migration (`HOST_PORT` single knob). |
| `docker compose up` on host with port 8080 taken still needs actionable msg | Host surfaces `EADDRINUSE` with `host: port N is already in use — try --port <other>`; Docker's mapping conflict surfaces Docker's own message — document both in README troubleshooting. |

## Planned validation

See [quickstart.md](./quickstart.md) Q-D01..Q-D08 mapping each FR/SC/NFR to a concrete command (`docker compose up --build`, two-browser lobby flow, `curl /version`, `curl -i -N -H Upgrade…`, `HOST_PORT=9090` override, hard-error check for removed flags, fixture-green on single server, image-size recording). Six `map.json`/checklist artifacts are not required for this feature; the quickstart IS the validation harness.

## Decisions log (binding for implementation)

| # | Decision | Why |
|---|---|---|
| D1 | `node:24-slim` (Debian bookworm, SHA-pinned) for both build + runtime stages | Latest LTS Aug 2026 (Node 24 Krypton Active LTS 2025-10-28→2028-04-30); `slim` avoids musl audit; digest-pin gives reproducibility (see research Finding 1). |
| D2 | `ServerDeps.httpServer?: HttpServer` (preferred) — alternative `ServerConfig.httpServer?` is acceptable with documented invariant | Ownership lives with deps; atomic single-call seam; `noServer:true` already in place (research Finding 5). |
| D3 | One `http.Server` at `host.ts` boot: `request→serveStatic+handleVersionRoute` and `upgrade→wss.handleUpgrade` share the port; delete `DEFAULT_STATIC_PORT`, `HOST_STATIC_PORT`, `--static-port`, `startStaticServer` | Binding single-port topology; FR-004 hard error instead of silent fallback. |
| D4 | Client same-origin fallback `ws(s)://${location.host}` when `?ws=` absent (both `lobby-view.ts` and `live-runtime.tsx`) | `location.host` already encodes `hostname:HOST_PORT`; works behind reverse proxies with one origin. |
| D5 | Keep `package.json` engines at `>=22.0.0`; Docker base is 24 while devs remain on 22 Maintenance LTS without churn. | Research Finding 1 compatibility table; no proven need to force devs onto 24. |
| D6 | pnpm in Docker via `corepack enable` (not `npm i -g pnpm`) | `packageManager` field is the single source of truth; `corepack` enforces exact 11.22.0 (research Finding 2). |
| D7 | `docker compose config -q` + `docker build` as hard gates; `hadolint` advisory only | Avoids blocking on a new external linter before it's load-bearing (research Finding 3). |
| D8 | `arm64` non-blocking: `amd64` must publish even when `arm64` fails (ruling documented in workflow header) | Spec's documented stretch goal; pragmatic publish guarantee (research Finding 4). |
| D9 | `LOBBY_DEFAULT_SERVER_PORT` retained as fallback only for non-browser/`file://` contexts; JSDoc reworded to "default HOST_PORT" | Preserves graceful handling for test harness without reintroducing a second port concept. |

## Out of scope (not implemented by this plan)

- Private registry / Docker Hub push, Helm/K8s manifests, in-container TLS/ACME, secrets, persistence, chat/ratings, per-package independent versioning.
- Any `ServerConfig` tuning-constant change beyond `httpServer`; lifecycle timers remain authority of matchmaking/engine.
- Bumping dev `engines` to `>=24` if not proven needed during implementation — deferred until Node 22 EOL approaches (2027-04-30).
