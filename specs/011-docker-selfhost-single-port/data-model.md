# Data Model: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Branch**: `issue-5-docker-support` | **Spec**: [spec.md](./spec.md) v1.0 + gate 2026-08-26 (Node 24) | **Plan**: [plan.md](./plan.md)

All entities are either runtime process shapes (`Deployment`, `SinglePortServer`, `NetworkingSeam`) or build/distribution artifacts (`DockerImage`, `ComposeProject`, `PublishedImage`). None introduce persistence beyond process memory; constitution VII in-memory contract is preserved.

## 1. Deployment (spec entity: "The single-process self-hosted unit")

The running self-hosted instance — one OS process, one `http.Server`, one config resolution.

| Field | Type | Constraints / origin |
|---|---|---|
| `bindHost` | `string` | From `HOST_BIND_HOST` (default `127.0.0.1` native; `0.0.0.0` in `docker-compose.yml`). Wildcard (`0.0.0.0` / `::` / `[::]`) requires `publicHost`. Same rule as pre-011 host. |
| `publicHost` | `string` | From `HOST_PUBLIC_HOST`; defaults to `localhost` when `bindHost === '127.0.0.1'`, otherwise `bindHost`. Printed in banner/join URLs. |
| `port` | `number` | From `--port` / `HOST_PORT`; default `8080`; range `1..65535`; non-integer / out-of-range → fail fast. Single knob for BOTH HTTP and WS. |
| `mode` | `'lobby' \| 'explicitCreate'` | `lobby` is default (empty lobby visitantes create/join); `explicitCreate` when `--create` flag present. |

**Invariants**

- Exactly one TCP listener: `http.Server` at `bindHost:port`.
- `publicHost` derivation is deterministic and reproducible given inputs.
- `HOST_STATIC_PORT` / `--static-port` is NOT a field — its presence is a *hard error*, not a silent fallback (FR-004).

**Validation** (host-config seam):

```ts
parsePort(value: string): number | null | never  // 1..65535, throws actionable message
isWildcardHost(host: string): boolean            // 0.0.0.0 | :: | [::]
requirePublicHostWhenWildcard(bindHost, publicHost): void // reject actionable if wildcard w/o advertisement
```

## 2. SinglePortServer (spec entity: "The shared http.Server")

The single `node:http` `Server` instance owned by the host, shared between static and WebSocket concerns.

| Concern | Handler | Responsibility |
|---|---|---|
| HTTP `request` | `serveStatic(req,res)` + `handleVersionRoute(req,res,urlPath)` pre-SPA-fallback | `GET /` → `dist/index.html`; `GET /assets/*` → MIME-mapped static; `GET /version` → `{appVersion, protocolVersion}` JSON (200) / `Allow: GET` on non-GET; otherwise SPA fallback or 404; traversal guard (`isPathInside` + `realpath` containment) + `STATIC_SECURITY_HEADERS`. |
| WS `upgrade` | `wss.handleUpgrade` via `NetworkingSeam` | Delegates to networking's `WebSocketServer(noServer:true)` with `handleUpgrade` → `wss.emit('connection', ws, req)` dispatch. No HTTP auth. |
| Lifecycle | `server.listen(port, bindHost)` / `server.close` | `EADDRINUSE` → actionable banner naming the port + `--port` hint; `close()` drains lobby sockets before facade/matchmaker teardown (existing order preserved). |

**State transitions**

| From | Event | To | Note |
|---|---|---|---|
| absent | `createHttpServer()` | `created` | Host owns the object; networking attaches its upgrade handler before `listen`. |
| created | `listen(port)` | `listening` | Single `listen` call; port `0` allowed for `__boundPortForTest()` ephemeral suites only. |
| listening | `close()` | `closed` | Networking's `close()` does NOT close this server when externally owned. |

**Ownership invariant** (FR-002): when `ServerDeps.httpServer` is supplied, `createMatchServer(...).close()` closes the `WebSocketServer` but never calls `httpServer.close()`.

## 3. NetworkingSeam (spec entity: "The attachment point in @europa/networking")

The extension point that collapses two listeners into one.

**Chosen shape** (see [plan.md](./plan.md) D2):

```ts
// packages/networking/src/contracts/network-api.ts
export interface ServerDeps {
    readonly engine: EngineFactory;
    readonly fog: FogFactory;
    readonly matchmaker: MatchmakerBridge;
    readonly logger: Logger;
    readonly lobby?: LobbyServiceSource;
    /**
     * Optional externally-owned http.Server for single-port deployment
     * (FR-002 — issue #5). When supplied, createMatchServer:
     *  - attaches its noServer WS server to `httpServer.on('upgrade', …)`
     *  - does NOT create its own http.Server in listen()
     *  - does NOT close httpServer in close() (ownership stays with host)
     * When absent, the server behaves exactly as before (owns its own
     * http.Server lifecycle) — preserves existing test callers.
     */
    readonly httpServer?: import('node:http').Server;
    // Alternative contract-equivalent spelling kept accepted:
    // ServerConfig also accepts { readonly httpServer?: Server } — implementers
    // may choose either; both satisfy FR-002's "either" clause.
}
```

**Behavioral contract**

| Parameter | `createMatchServer` | `listen()` | `close()` | `__boundPortForTest()` |
|---|---|---|---|---|
| `httpServer` supplied | Store external server, wire `upgrade` | `tickClock.start()`, assert external server is already listening or will be listened by host (host's `server.listen()` externally); do NOT call `createHttpServer`. | Stop clock, `wss.close()`, drop upgrade listener, do NOT close external `httpServer`. | Read from `httpServer.address().port`. |
| not supplied | Own internal server path (legacy) | Create `http.Server`, start it on `config.port`, attach upgrade, start clock. | Stop clock, `wss.close()`, `httpServer.close()`. | Read from owned `httpServer.address().port` (existing behavior). |

**Wire impact**: NONE. `NETWORK_API_VERSION`, envelope, frame, rate-limit, heartbeat, resync contracts are unchanged.

## 4. DockerImage (spec entity: "Multi-stage build artifact")

The OCI image built from `Dockerfile`.

| Field | Type | Value / constraint |
|---|---|---|
| `baseImage` | `string` | `node:24-slim` (Debian bookworm) + pinned `sha256:` digest + `# 24.x — latest LTS Aug 2026` version comment. Both stages same base. |
| `buildToolchain` | `string` | `corepack enable` + `pnpm@11.22.0` (via `packageManager` field). |
| `installStep` | `string` | `pnpm install --frozen-lockfile`. Fail on mismatch. |
| `buildStep` | `string` | `pnpm build` (engine→terrain→fog→networking→matchmaking→console). Produces `packages/console/dist/` + `packages/*/dist/` + `packages/version` constant. |
| `runtimeContents` | `string[]` | Built artifacts (`packages/console/dist/`, `packages/*/dist/`, `packages/version`) + production `node_modules` via `pnpm install --prod --frozen-lockfile` scoped to prod deps. No devDependencies, no source, no test dirs, no `.git`. |
| `expose` | `number` | `8080` (Dockerfile `EXPOSE 8080`). Runtime port mapping is the single port; `HOST_PORT` env overrides at `docker run` time. |
| `cmd` | `string[]` | `["pnpm", "host"]` (which runs `tsx scripts/host.ts` → the single-port server). `HOST_PORT=8080` default ENV. |

**Build ignore** (`.dockerignore`): excludes `node_modules`, `dist`, `coverage`, `.playwright`, `packages/*/dist`, `packages/*/coverage`, `docs`, `.git`, `.github` (except needed `Dockerfile`), `specs`, `.agent`, `.opencode`, `*.tsbuildinfo`.

**Reproducibility**: `APP_VERSION` comes from compiled `packages/version/src/app-version.ts` (not `git describe`); same commit + same `node:24-slim` digest + `--frozen-lockfile` → same `dist/` and `/version` payload.

## 5. ComposeProject (spec entity: "The docker-compose.yml project")

```yaml
services:
  europa:
    build: .
    image: ghcr.io/shaunburdick/europa-neo  # optional; implied by build
    ports: ["${HOST_PORT:-8080}:${HOST_PORT:-8080}"]
    environment:
      HOST_PORT: ${HOST_PORT:-8080}
      HOST_BIND_HOST: ${HOST_BIND_HOST:-0.0.0.0}
      HOST_PUBLIC_HOST: ${HOST_PUBLIC_HOST:-}
    expose: ["${HOST_PORT:-8080}"]
```

| Field | Type | Notes |
|---|---|---|
| `portMapping` | `string` | Single `${HOST_PORT:-8080}:${HOST_PORT:-8080}` — no second mapping. Compose default uses `0.0.0.0:8080` wide because Docker's port mapping is the ingress; native host still defaults to loopback. |
| `envPassthrough` | `enum` | Exactly `HOST_PORT`, `HOST_BIND_HOST`, `HOST_PUBLIC_HOST`. No `HOST_STATIC_PORT`. `HOST_PUBLIC_HOST` optional; container may log a hint when omitted on `0.0.0.0`. |
| `oneCommand` | `string` | `docker compose up` (first run `docker compose up --build`). No extra setup. |

## 6. PublishedImage (spec entity: "ghcr.io/shaunburdick/europa-neo:{edge|vX.Y.Z}")

| Field | Type | Notes |
|---|---|---|
| `registry` | `string` | `ghcr.io` via `GITHUB_TOKEN` (`packages: write`, `contents: read`). |
| `imageName` | `string` | `ghcr.io/shaunburdick/europa-neo` (lowercase owner, spec-fixed). |
| `edgeTag` | `string` | `vX.Y.Z` extracted from `packages/version/src/app-version.ts` not used for edge; tag is literal `edge` on pushes to `main`. |
| `versionedTag` | `string` | `vX.Y.Z` and/or `X.Y.Z` semver derived from `v*` tag push (e.g. `v0.2.0` → `0.2.0` + `v0.2.0`). The matching `/version` payload equals `APP_VERSION`. |
| `triggers` | `enum` | `push` to `main` (path-filtered to `Dockerfile`/`docker-compose.yml`/`.dockerignore` + source surfaces) → `:edge`; `push` tag `v*` → `:vX.Y.Z` (via `feature 009` release flow). Guarded `if: github.repository == 'shaunburdick/europa-neo'`. |
| `platforms` | `enum` | `linux/amd64` mandatory (blocking); `linux/arm64` best-effort non-blocking (workflow header documents non-blocking ruling; impl separates legs with `fail-fast:false` + `continue-on-error:true` on arm64). |
| `permissions` | `object` | `packages: write`, `contents: read` top-level; `id-token: write` only if provenance enabled; all `uses:` SHA-pinned with version comments. |
| `privacy` | `string` | No auth on `GET /version` inside image (FR-009 FR-006 reused); logs never leak bearer tokens. Non-secret player IDs may be logged for correlation. |

## Entity relationships

```
Deployment ──1────1──► SinglePortServer (owns the one http.Server)
     │                    ▲
     │                    │ delegates upgrade
     ▼                    │
NetworkingSeam ────────────┘   (ServerDeps.httpServer? seam)
     │
     │ packaged as
     ▼
DockerImage ──1────1──► ComposeProject ──publishes──► PublishedImage
                (builds)          (maps HOST_PORT)       (GHCR: edge / v*)
```

No new tables, no migrations, no cross-entity persistence. All lifecycle events are origin `Deployment` → `SinglePortServer` → `NetworkingSeam`.
