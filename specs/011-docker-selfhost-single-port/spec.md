# Feature Specification: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Feature Branch**: `issue-5-docker-support` (spec directory `011-docker-selfhost-single-port`, next available ID per `create-new-feature.sh`)
**Dependencies**: Feature 004 (multiplayer networking), Feature 005 (client console), Feature 006 (match lifecycle & matchmaking), Feature 010 (public lobby & match browser), Feature 009 (shared app versioning)
**Created**: 2026-08-26
**Last Updated**: 2026-08-26 (v1.0)
**Version**: 1.0
**Status**: Implemented (2026-08-27)
**GitHub Issue**: #5
**Input**: Product-owner request — "Binding decision: self-hostable by default. Today that means Node ≥22 + pnpm + pnpm build + pnpm host. Provide a container path so self-hosters don't need a toolchain." Single-port topology per 2026-08-26 decision.

## Problem Statement

Europa Neo is self-hostable by default (constitution Principle VII), but today self-hosting requires a full toolchain on the operator's machine: Node ≥22, `pnpm`, `pnpm install`, `pnpm build`, and `pnpm host` with two local ports (8080 for WebSocket, 5173 for static UI). An operator who wants to run a public game for friends must install the toolchain, open two ports/firewall rules, and keep the two origins consistent — complexity that defeats the "single process, plain instructions" promise for non-developers and for internet self-hosting where one ingress rule is the norm. This feature provides a container path: `docker compose up` from a fresh clone yields a single-port server (`http://localhost:8080/` serving both the console UI and WebSocket upgrades) that an operator can expose with one firewall/ingress rule. No toolchain is required on the host beyond Docker.

## User Scenarios & Testing

### User Story 1 — Fresh-Clone One-Command Launch (Priority: P1)

As a self-hoster, I want to clone the repo and run one command and reach a playable lobby at `http://localhost:8080/` where two browser seats can join and play, so that I can host public games without installing Node or pnpm.

**Why this priority**: This is the core promise of #5 — "self-hostable by default" made frictionless. Every other story is in service of this flow.

**Independent Test**: From a fresh clone (no Node toolchain required on the test host beyond Docker), run `docker compose up --build`, open `http://localhost:8080/` in a clean browser profile, verify the lobby loads, create a public match, join it from a second profile, and verify first authoritative ticks and orders flow.

**Acceptance Scenarios**:

1. **Given** a fresh clone on a machine with Docker (no Node/pnpm), **When** the operator runs `docker compose up` (or `docker compose up --build` on first run), **Then** the compose project builds a reproducible image and starts a container that becomes reachable at `http://localhost:8080/` within a short startup window (see NFR-001) without manual `pnpm` steps.
2. **Given** the container is running and the lobby is reachable, **When** two browser seats open `http://localhost:8080/` and create-then-join a public 2-player match, **Then** both enter the live console, receive fog-filtered ticks, and can issue pipe/reserve orders through the normal console with same-origin WebSocket (no `?ws=` required).
3. **Given** the container stops, **When** the operator restarts it, **Then** the lobby is reachable again at the same URL without leftover state from the prior run (in-memory-only lifecycle preserved).

---

### User Story 2 — Single-Port Canonical Deployment (Priority: P1)

As an internet self-hoster, I want one exposed port serving both the static console UI and the WebSocket match server from the same `http.Server` so that one firewall/ingress rule, one `EXPOSE`, and same-origin WebSocket is all I need.

**Why this priority**: Two-port mode is the direct cost the product owner rejected. Single-port is the binding topology.

**Independent Test**: Can be tested without Docker by inspecting the host launcher: one `http.Server` handles HTTP requests (`/` → `dist/` + `/version` + SPA fallback) and `Upgrade: websocket` → WS match server; `netstat`/port probe shows only `HOST_PORT` listening; a `curl http://host:HOST_PORT/` and a WebSocket handshake to `ws://host:HOST_PORT` both succeed against the same port and no second port is open. Also tested inside the container.

**Acceptance Scenarios**:

1. **Given** the host launcher is running (native `pnpm host` or inside the container), **When** a browser requests `http://host:HOST_PORT/` and a WebSocket client handshakes `ws://host:HOST_PORT`, **Then** the same `http.Server` on `HOST_PORT` answers both: HTTP requests route to the static/UI handler (`dist/` + `/version` + SPA fallback) and `Upgrade: websocket` frames are handed to the networking `wss.handleUpgrade` path, with no second listening port.
2. **Given** the single-port server is running, **When** a client opens `http://host:HOST_PORT/` without any `?ws=` parameter, **Then** the lobby/match WebSocket connects same-origin automatically (no manual override) and the lobby is usable.
3. **Given** an explicit `?ws=` override is present (operators/tests), **When** it is same-host/local-loopback and well-formed, **Then** it is honored; otherwise it is rejected before identity setup (preserving the existing cross-host/credential rejection policy of `validateLobbyServerUrl`).
4. **Given** the two-port legacy configuration, **When** the new codebase is used, **Then** `HOST_STATIC_PORT` / `--static-port` no longer exist as accepted env vars/CLI flags — using them produces a clear error rather than silent fallback.

---

### User Story 3 — Configurable Deployment Without Rebuilding (Priority: P2)

As an operator deploying on LAN or the internet, I want to configure port, bind address, and advertised host via environment variables so that one image covers localhost, LAN, and reverse-proxy deployments.

**Why this priority**: Self-hosting covers more than localhost; configurability must not require rebuilding.

**Independent Test**: Run the container with overridden `HOST_PORT`, `HOST_BIND_HOST`, or `HOST_PUBLIC_HOST` and verify the printed/banner URL and actual reachability follow the override; invalid values fail fast with an actionable message.

**Acceptance Scenarios**:

1. **Given** default environment, **When** the container/host starts, **Then** it binds `127.0.0.1:8080` (or the Dockerfile default 8080) and advertises `localhost` in banner URLs.
2. **Given** `HOST_PORT=9090`, **When** the container/host starts, **Then** the single server listens on 9090 and both `http://host:9090/` and same-origin WS on 9090 work.
3. **Given** a wildcard bind such as `HOST_BIND_HOST=0.0.0.0` with `HOST_PUBLIC_HOST=example.com`, **When** the server starts, **Then** it binds the wildcard and advertises `example.com` in lobby/join URLs; missing `HOST_PUBLIC_HOST` with a wildcard bind is rejected with an actionable error.
4. **Given** invalid env values (port out of range, malformed host), **When** start is attempted, **Then** the process exits non-zero with a message naming the offending variable — no silent fallback to defaults.

---

### User Story 4 — Verifiable Published Image (Priority: P2)

As an operator who prefers pulling over building, I want a CI-published image at `ghcr.io/shaunburdick/europa-neo` with clear tags (`:edge` for `main`, `vX.Y.Z` for releases) so that `docker compose up` can pull a tested image without building locally.

**Why this priority**: Publishing removes the "must build" step and ties image tags to the versioned releases already established by feature 009.

**Independent Test**: Push to `main` triggers an `:edge` publish; pushing a `v*` tag triggers a versioned image; both are pullable and `docker run` shows the correct `APP_VERSION` at `/version` and in hello-ack.

**Acceptance Scenarios**:

1. **Given** a push to `main` that changes any watched path, **When** the publish workflow runs, **Then** it builds and pushes `ghcr.io/shaunburdick/europa-neo:edge` with the `main` commit's content.
2. **Given** a `v*` tag push (e.g. `v0.1.0` via the release workflow of feature 009 FR-013), **When** the publish workflow runs, **Then** it builds and pushes `ghcr.io/shaunburdick/europa-neo:v0.1.0` (and `:latest` only if the project decides it — otherwise exactly the versioned tag is required).
3. **Given** the published image is pulled on a fresh host, **When** it runs, **Then** `GET /version` reports the image's `APP_VERSION` matching the tag, and the lobby/match flow is identical to a locally-built image.

---

### User Story 5 — Documentation That Makes the Path Obvious (Priority: P3)

As a newcomer reading the README, I want a Docker quick-start that tells me "run this, open that URL, you're playing" so that the one-command path is not tribal knowledge.

**Why this priority**: A container with no docs is not self-hostable in practice.

**Independent Test**: Grep README for the Docker section; follow it verbatim from a fresh clone without reading any other doc; lobby appears on the documented URL.

**Acceptance Scenarios**:

1. **Given** the README on `main`, **When** a reader follows the Docker section step-by-step, **Then** they reach a working lobby at the single-port URL (default `http://localhost:8080/`) with env-var overrides documented nearby.
2. **Given** the manual or docs site, **When** reviewed for FR-012 triggers, **Then** no manual update is required for this change set (gameplay behavior unchanged), but the docs check confirms zero stale two-port references remain.

---

### Edge Cases

- **No second port**: Setting `HOST_STATIC_PORT` or passing `--static-port` produces an explicit "unsupported" error instead of opening a second listener.
- **Port in use**: `HOST_PORT` already bound on the host produces an `EADDRINUSE`-style actionable message; Docker's port mapping conflict surfaces the host-side equivalent.
- **Invalid env**: Non-integer, out-of-range (not 1–65535), or empty `HOST_PORT` fails fast; blank/unset keeps default 8080 (not "port 0"). Malformed `HOST_BIND_HOST`/`HOST_PUBLIC_HOST` characters are rejected before listening.
- **Wildcard without advertisement**: `HOST_BIND_HOST=0.0.0.0` or `::` without `HOST_PUBLIC_HOST` is rejected — same rule as the existing host script.
- **`?ws=` override still respected**: Same-host and loopback aliases (`localhost`↔`127.0.0.1`) still pass; cross-host or credential-bearing overrides are still rejected. Same-origin fallback only applies when `?ws=` is absent.
- **HTTPS page → WSS fallback**: When `location.protocol === "https:"`, the same-origin fallback uses `wss://`; otherwise `ws://`. Mixed-content blocking remains the browser's responsibility.
- **Browser-less / `file://`**: `window.location.host` empty (e.g. `file://` tests) falls back to `localhost:HOST_PORT` or the `LOBBY_DEFAULT_SERVER_PORT` default only in test/demo contexts; production same-origin path is always `location.host`.
- **Ephemeral test ports**: Integration/E2E fixtures (`buildStack()` in `tests/e2e/full-stack.spec.ts`, `bootLobbyStack()` in `tests/integration/lobby-transport.test.ts`) continue to use `port: 0` + `__boundPortForTest()` against the single server; the seam supports injecting an externally-owned `http.Server` so the ephemeral server is the same single port for HTTP + WS.
- **`.dockerignore` completeness**: Build context excludes `node_modules`, test dirs, `docs`, `.git`, and local artifacts so the image stays reproducible and small; the ignore file does not exclude the built `dist/` when the build stage produces it internally (multi-stage copy semantics apply).
- **GHCR auth**: Publish job uses `GITHUB_TOKEN` with minimal `packages: write` + `contents: read`; forks cannot publish (workflow is tag/`main` on the canonical repo only).
- **Multi-platform stretch**: `amd64` is mandatory; `arm64` is best-effort and the workflow documents whether it is included per trigger (failure to build `arm64` does not block `amd64` if the stretch goal is explicitly marked as non-blocking — otherwise it is required).
- **Image size**: Base is `node:22-slim`; runtime stage copies built artifacts only (no `node_modules` dev deps, no source, no test harnesses).
- **Shallow clone / detached build**: The image's version comes from compiled `APP_VERSION` (`@europa/version`), not `git describe`, so Docker builds are reproducible from any checkout depth.
- **Docs drift check untouched**: `pnpm version:check` (`@europa/version` lockstep FR-009) remains independent of Docker surfaces; no new package versions are introduced by this feature.

## Requirements

### Functional Requirements

#### Single-Port Host & Networking Seam

- **FR-001**: The deployment MUST run a single `http.Server` on `HOST_PORT` that serves ALL production surfaces: static console UI (`packages/console/dist/`), `GET /version` (feature 009 FR-006), and WebSocket upgrades for the match/lobby server. No second HTTP listener may be opened in the default or container deployment.
- **FR-002**: `@europa/networking` MUST expose a seam for single-port operation: `ServerConfig`/`ServerDeps` (or equivalent) MUST accept an externally-owned `http.Server`, OR the server MUST expose an `attachToHttpServer(httpServer)` operation. When an external server is supplied, `listen()` MUST NOT create/destroy it and `close()` MUST NOT close it (ownership stays with the host). The WebSocket server MUST use `noServer: true` and attach its `upgrade` listener to the supplied server; no protocol/frame/contract change (feature 004 FR-001..FR-011 unchanged).
- **FR-003**: `packages/console/scripts/host.ts` MUST create exactly one `http.Server` at boot: its `request` handler MUST serve `dist/` (with the existing SPA fallback, MIME map, path-traversal guard, and `STATIC_SECURITY_HEADERS`) plus the existing `/version` security handling before fallback; its `upgrade` handler MUST delegate to the networking server's `handleUpgrade` (or equivalent) path.
- **FR-004**: The existing two-port configuration MUST be removed: `HOST_STATIC_PORT` (env) and `--static-port` (CLI) MUST no longer be accepted. Passing or setting either MUST fail fast with an actionable error message naming the removed option (no silent ignore, no fallback to a second port).
- **FR-005**: The canonical single-port configuration MUST be: flag `--port N` / env `HOST_PORT` (default `8080`), env `HOST_BIND_HOST` (default `127.0.0.1`; wildcard hosts require `HOST_PUBLIC_HOST`), env `HOST_PUBLIC_HOST` (advertised host for banner/join URLs; defaults to `localhost` when binding loopback, otherwise to `bindHost`). The host script's banner/log lines and join/lobby URLs MUST reflect the single `HOST_PORT` for both HTTP and WS (i.e., `http://host:HOST_PORT/` and `ws(s)://host:HOST_PORT`).

#### Console Client — Same-Origin Fallback

- **FR-006**: The console's WebSocket URL resolution MUST default to same-origin when no explicit `?ws=` override is present: `ws(s)://` scheme derived from `location.protocol` (`https:` → `wss`, else `ws`) and `location.host` (hostname + port as the browser sees it). Applies to BOTH (a) the normal lobby path (`packages/console/src/state/lobby-view.ts:resolveLobbyServerUrl`) and (b) the direct `?live` path (`packages/console/src/internal/live-runtime.tsx`). Opening `http://host:HOST_PORT/` MUST just work with no `?ws=` needed.
- **FR-007**: The explicit `?ws=` override MUST remain supported with its existing validation: scheme-normalized via `normalizeWsUrl`, rejected when cross-host (outside the `localhost`↔`127.0.0.1` alias allowance) or when containing credentials; validation error surfaces before identity setup. The override is consulted only when present — the same-origin fallback runs otherwise.
- **FR-008**: The shipped console MUST NOT embed a hardcoded non-same-origin default port as its primary fallback (the current `LOBBY_DEFAULT_SERVER_PORT = 8080` mirror becomes the same-origin host fallback only for non-browser/test contexts or when `location.host` is unavailable — e.g. `file://` or unit test — where it remains documented as the default `HOST_PORT` value, not a second port).

#### Test Fixtures

- **FR-009**: The integration and E2E host-wiring fixtures MUST be updated to the single-server topology while preserving ephemeral-port determinism: `tests/e2e/full-stack.spec.ts:buildStack()` and `tests/integration/lobby-transport.test.ts:bootLobbyStack()` MUST build one `http.Server` at `port: 0` (or `HOST_PORT: 0` equivalent), attach the networking WS server to it, and expose the bound port via `__boundPortForTest()` for drivers. Two-port test fixtures are removed.

#### Docker Packaging

- **FR-010**: The repository MUST include a multi-stage `Dockerfile` at the repo root:
  - Build stage: `node:22-slim` (pinned digest or explicit tag with comment), installs `pnpm` (via corepack or pinned `pnpm` image), `pnpm install --frozen-lockfile` with workspace deps, `pnpm build` of all workspace packages producing `packages/console/dist/` and the host launcher.
  - Runtime stage: `node:22-slim` (same base), copies built artifacts only (`packages/console/dist/`, `packages/*/dist/`, `packages/version`, compiled `host` entry) — no `node_modules` dev deps, no source, no test dirs. `CMD` runs the host launcher (`node packages/console/scripts/host.ts` or its compiled form via `pnpm host`) on the single `HOST_PORT`. `EXPOSE 8080` (single port; override at runtime via `HOST_PORT` and `docker compose` mapping).
- **FR-011**: The repository MUST include a `docker-compose.yml` at the repo root that maps the single container port (`HOST_PORT:HOST_PORT` or `8080:8080` default), passes through `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` env vars (with defaults), and starts correctly with `docker compose up` (and `docker compose up --build` on first run). One-command remains `docker compose up` — no extra setup steps required beyond Docker itself.
- **FR-012**: The repository MUST include a `.dockerignore` that excludes `node_modules`, test directories (`coverage`, Playwright artifacts), `docs`, `.git`, and other local artifacts (e.g. `dist` output when not produced in-build, IDE files). The ignore file MUST NOT break multi-stage semantics (the build stage produces `dist/` internally; the runtime stage copies from the build stage, not the host context).
- **FR-013**: Environment variables honored by the image/host at runtime MUST be exactly `HOST_PORT`, `HOST_BIND_HOST`, `HOST_PUBLIC_HOST` (plus any future image-level passthrough documented in the Dockerfile/compose). `HOST_STATIC_PORT` MUST NOT be honored by any surface (Docker or native).

#### GHCR Publish

- **FR-014**: The repository MUST include `.github/workflows/docker.yml` (or equivalent name) building and publishing to GHCR (`ghcr.io/shaunburdick/europa-neo`):
  - **Image name**: `ghcr.io/shaunburdick/europa-neo`.
  - **Triggers**: `push` of tags matching `v*` → tagged release image (e.g. `v0.1.0` → `ghcr.io/shaunburdick/europa-neo:0.1.0` plus `v0.1.0` tag form when appropriate), and `push` to `main` → `:edge` tag. The workflow MUST NOT publish from forks or non-canonical refs.
  - **Build**: Multi-platform minimum `linux/amd64`; `linux/arm64` is a documented stretch goal. Dockerfile target is the single-port image; the tag is derived from the triggering ref or from `APP_VERSION` when a main-push edge is built (edge tag does not encode a semver).
  - **Security**: All `uses:` actions are SHA-pinned with version comments; top-level permissions are least-privilege (`packages: write`, `contents: read` — plus whatever `id-token` if provenance is enabled); `GITHUB_TOKEN` flow for GHCR.
  - **Reproducibility**: Build uses `--frozen-lockfile`, no network at runtime, and the pushed image's `/version` content matches the built `APP_VERSION`.

#### Documentation

- **FR-015**: The README MUST gain (or update) a Docker/self-host section in the same change set: `docker compose up` → lobby URL on the single port (default `http://localhost:8080/`), env-var table (`HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST`), and the fact that `HOST_STATIC_PORT` no longer exists. A stale two-port reference in docs is a review failure.
- **FR-016**: Player-manual updates are NOT required for this change set (FR-012 of spec 007 — gameplay behavior unchanged). The spec's normal trigger check (`docs/manual/**` change detection) MUST still be performed and the change set MUST confirm zero stale two-port references in `docs/manual/` or leave it untouched (either satisfies FR-012).
- **FR-017**: Operational docs (README, `docker-compose.yml` comments, Dockerfile header comment) MUST state the single-port topology explicitly: one `http.Server`, one `EXPOSE`, one port mapping, same-origin WS, and the env vars that control it.

### Key Entities

- **Deployment**: The single-process self-hosted unit: one `http.Server` on `HOST_PORT` serving static UI + `/version` + WS upgrades. Configured by `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST`.
- **SinglePortServer**: The `http.Server` instance that is owned by the host launcher and shared between the static handler (`serveStatic`+`handleVersionRoute`) and the networking `WebSocketServer(noServer:true)` upgrade path.
- **NetworkingSeam**: The attachment point in `@europa/networking` (`ServerConfig.httpServer?` / `attachToHttpServer()` or equivalent) that binds `wss.handleUpgrade` to an externally-owned server without changing the wire protocol.
- **DockerImage**: Multi-stage build artifact (`node:22-slim` build + `node:22-slim` runtime), `EXPOSE 8080`, `CMD` launches the single-port host.
- **ComposeProject**: The `docker-compose.yml` project mapping one host port to one container port with passthrough env vars; `docker compose up` is the one-command entry point.
- **PublishedImage**: `ghcr.io/shaunburdick/europa-neo:{edge|vX.Y.Z}` produced by the publish workflow on `main` and `v*` tag pushes.

## Non-Functional Requirements

- **NFR-001 (Startup responsiveness)**: From `docker compose up` of a cached image on a typical self-host (broadband + local SSD), the lobby MUST be reachable at `http://localhost:8080/` within a short startup window on the order of seconds (image cold-pull is excluded; include a visible progress/ready log line indicating the single port so the operator knows when to open the browser).
- **NFR-002 (Image size & attack surface)**: Runtime stage MUST be minimal: `node:22-slim` + built artifacts only. No devDependencies, no source, no test harnesses, no extra package managers. Image size is documented as the compressed `docker images` size on `amd64` for the `edge` build (see SC).
- **NFR-003 (Reproducibility)**: A clean `docker build` from the same commit MUST produce a byte-equivalent application payload inside the image (same `APP_VERSION` at `/version`, same `dist/` content) and the build MUST be reproducible across hosts given the same `node:22-slim` digest and `--frozen-lockfile` inputs.
- **NFR-004 (Security)**: The single `http.Server` MUST retain existing static-UI hardening: path-traversal guard (`isPathInside` + `realpath` containment), `STATIC_SECURITY_HEADERS` baseline, `/version` security headers, no credential-bearing URL acceptance, and no bearer-token leakage in logs. Non-secret player/guest IDs may appear in logs for correlation; private-match existence, authorization, and fog boundaries remain those of spec 010 (NFR-003/FR-024).
- **NFR-005 (Compatibility)**: No wire protocol / frame / contract change. `NETWORK_API_VERSION` is unchanged. The `?ws=` override remains valid for tests/operators. Existing `full-stack` and `lobby-transport` integration tests continue to pass over the single-port fixture with ephemeral ports.
- **NFR-006 (Operational simplicity)**: One exposed port, one port mapping, one env var for the port, one origin for WS. Overriding the port changes BOTH HTTP and WS together (no split). Docs describe exactly one firewall/ingress rule.
- **NFR-007 (CI cost)**: GHCR publish does not run on every PR push (only `main` and `v*` tags); it does not block faster per-package CI jobs. `amd64` is mandatory; `arm64` inclusion is best-effort and documented as blocking or non-blocking per the stretch-goal ruling below.

## Success Criteria

### Measurable Outcomes

- **SC-001 — One-command lobby (fresh-clone)** — In 5/5 trials on a host with Docker but without a Node toolchain, `docker compose up --build` from a fresh clone yields a lobby at `http://localhost:8080/` where two seats can create/join/spectate and exchange at least one order and one tick (same-origin WS, no `?ws=`). Measured: compose exits with a "listening on HOST_PORT" banner and `curl -s http://localhost:8080/ | grep` plus a scripted two-seat WS flow both succeed.
- **SC-002 — Single server proof** — The running host (native or containerized) exposes exactly one listening TCP port for the app. Probe: `ss -tlnp`/`lsof` (native) or `docker port` + `curl http://host:HOST_PORT/` + `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://host:HOST_PORT/` (or a WS handshake) both reach the same port; `curl http://host:HOST_STATIC_PORT/` fails (no second listener). Host logs state a single `http.Server` / single `HOST_PORT` and no `staticPort` mention.
- **SC-003 — Same-origin without override** — With `?ws=` absent, 10/10 page loads at `http://host:HOST_PORT/` resolve their WS URL to `ws(s)://host:HOST_PORT` (scheme matching the page's `http(s):`) and connect successfully. Unit tests cover `https:`→`wss` mapping.
- **SC-004 — Env-var contract** — Setting each of `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` changes the effective behavior as described in FR-005. `HOST_STATIC_PORT` (or `--static-port`) is not consumed: passing it causes an actionable error and the process does not start with a second listener. Pinned by `resolveConfig`/`resolveLobbyServerUrl` unit tests and a compose-level override test.
- **SC-005 — Image satisfies self-hostable checklist** — The published or locally-built `ghcr.io/shaunburdick/europa-neo:edge` (or `docker build` image) reports (a) `curl -s http://localhost:HOST_PORT/version | jq .` returns `{appVersion, protocolVersion}` with `appVersion === APP_VERSION` and (b) the WebSocket hello-ack's `appVersion` equals the same `APP_VERSION` (same checks as feature 009 SC-002/SC-003 but against the containerized server). `docker images` compressed size for `linux/amd64` is recorded and under a documented "reasonable" bound (see SC-008).
- **SC-006 — GHCR publish green** — A `v*` tag push publishes `ghcr.io/shaunburdick/europa-neo:vX.Y.Z` and a `main` push publishes `:edge`; both are pullable and the publish workflow run is green with SHA-pinned actions and least-privilege permissions (`packages: write`, `contents: read`). Verified by inspecting Actions logs and a pull-and-run on a second host.
- **SC-007 — Fixtures green on single-port** — `tests/e2e/full-stack.spec.ts` and `tests/integration/lobby-transport.test.ts` (and their imported lobby fixtures) pass on the new single-server fixtures with `port: 0` + `__boundPortForTest()`, including deterministic two-seat ticks and fog-filtered view assertions.
- **SC-008 — Image size & reproducibility bound** — The built image's compressed size on `linux/amd64` is measured and recorded in the implementation PR description and (optionally) in docs; it sits below a stated bound that demonstrates runtime-stage minimalism (e.g. well under 1 GB; the reviewed OSS expectation for `node:22-slim` + Vite `dist/` is on the order of 200–400 MB uncompressed, documented precisely at implementation time). Rebuilding from the same commit digest yields an image whose `/version` and `dist/` payload hash matches the first.

## Assumptions

- Docker Engine + Compose v2 are available on the operator's host. The repo's `docker-compose.yml` is Compose-spec compatible (no v1 `docker-compose` legacy).
- Node 22 and pnpm remain the build toolchain inside the image (constitution VII + biome `>=2.5.0` requirement). The host operator never installs them when using Docker.
- Base image is `node:22-slim` (Debian slim) for both stages unless a lighter `alpine` variant is explicitly chosen at plan time and documented; `slim` is the safe default because `alpine` needs `libc` compatibility auditing for `ws`/`vite` native deps (none today, but not assumed).
- The app version surface is unchanged by Docker packaging (`@europa/version` lockstep FR-009). Docker does not mint versions; it packages whatever `APP_VERSION` the commit carries.
- Network exposure is plain HTTP + WS on `HOST_PORT`. TLS termination remains a reverse-proxy concern (spec 004/009 assumption retained).
- Published images target `ghcr.io/shaunburdick/europa-neo` (lowercase owner). GHCR is the distribution registry; Docker Hub or other registries are out of scope.
- The `?live&ws=&match=` direct-match routes remain functional for Playwright/E2E via the explicit `?ws=` path (tests bypass the lobby entirely — spec 010 compatibility contract preserved).

## Out of Scope

- Two-port deployment or a `--static-port`/`HOST_STATIC_PORT` legacy mode.
- Kubernetes manifests, Helm charts, systemd units, or any orchestrator beyond `docker-compose.yml`.
- TLS/ACME in-container, secrets management, authentication, or persistent storage/replays.
- Private registry distribution, Docker Hub publishing, or `npm publish` (all packages stay `private: true` per binding decision 6 / spec 009 Clarifications v1.2).
- Base-image pinning to a digest vs tag policy beyond "either with version comment" — decided at implementation.
- Multi-stage caching details (Buildx cache mounts) beyond correctness.
- 3–4 player Docker flows beyond what the existing 2-player engine contract already supports inside the image (no new matchmaking modes).
- Manual publishing (README) or draft `release-notes/` handling — governed by spec 009 FR-013's release workflow.

## Clarifications

### Session 2026-08-26 — Binding product decision: single-port canonical (v1.0 — no open questions)

No interactive clarification loop was required — the product owner asserted the topology as a binding decision that eliminates the usual open question:

- **(Resolved 2026-08-26)** Single-port is the canonical and ONLY deployment topology for this feature. The `http.Server` serving the WebSocket match/lobby server and the static console UI plus `/version` on one port (`HOST_PORT`, default `8080`) is what makes internet self-hosting simple (one firewall/ingress rule, same-origin WS, one `EXPOSE`). The product owner's verbatim assertion — *"this app should always be single-port when it comes to deployments. I can't think of a reason to deploy them separately"* — is treated as a binding decision, not an open question. There is no two-port fallback in scope; the two-port mode of `packages/console/scripts/host.ts` (`HOST_STATIC_PORT`/`--static-port` + `startStaticServer` on `DEFAULT_STATIC_PORT 5173` + `createMatchServer`'s internally-owned http server) is removed. Reason this would otherwise need clarification: otherwise the spec would have to carry an `isSinglePort` flag or compatibility matrix — binding it now lets every downstream decision (Dockerfile `EXPOSE`, compose mapping, GHCR docs, client same-origin fallback, fixture rewrites) assume one port.

- **(Resolved 2026-08-26)** Environment variables are `HOST_PORT`, `HOST_BIND_HOST`, `HOST_PUBLIC_HOST` (no `HOST_STATIC_PORT`). Default `HOST_PORT` is `8080`. This mirrors the existing host script's defaults collapsed onto one port (current `DEFAULT_WS_PORT 8080` becomes the single default; `DEFAULT_STATIC_PORT 5173` is removed with the second server). Bind/advertisement validation keeps the existing wildcard-host rule (wildcard `HOST_BIND_HOST` requires `HOST_PUBLIC_HOST`).

- **(Resolved 2026-08-26)** The networking seam SHALL be either an optional `httpServer` in `ServerConfig`/`ServerDeps` or an `attachToHttpServer()` operation on the server instance, using `ws` `noServer: true` with an `upgrade` listener — the current `ws` server already uses `noServer:true` with its own internally-created `http.Server`, so the delta is ownership transfer only. No protocol/frame/contract change.

- **(Resolved 2026-08-26)** Console fallback SHALL be `${location.protocol==="https:"?"wss":"ws"}://${location.host}` when `?ws=` is absent, applied in BOTH `src/internal/live-runtime.tsx` (`?live` path) and the normal lobby path (`state/lobby-view.ts:resolveLobbyServerUrl`). This is the correct fallback because `HOST_PORT` is now the origin's port — `location.host` already carries it. Tests/E2E fixtures keep `port: 0` ephemeral semantics but now on the single server (`__boundPortForTest()`).

- **(Resolved 2026-08-26)** Dockerfile is multi-stage: build stage (`node:22-slim` + pnpm: install workspace deps → build all packages → produce `packages/console/dist/` + host entry), runtime stage (`node:22-slim`: copy built artifacts only, `CMD` runs the host). `EXPOSE 8080` (the single host port, override via `HOST_PORT`). GHCR image is `ghcr.io/shaunburdick/europa-neo`; triggers are `v*` tag pushes → versioned image, `main` push → `:edge`. SHA-pinned actions, least-privilege (`packages: write`, `contents: read`). Multi-platform stretch goal is `amd64` mandatory, `arm64` best-effort — the spec deliberately does not require `arm64` blocking until plan time.

- **(Resolved 2026-08-26)** Documentation: README gains a section showing `docker compose up` → lobby on `http://localhost:8080/` (single port). No manual update required per spec 007 FR-012 trigger check (gameplay unchanged), but the same change set performs that check. This resolves the "do we update the player manual?" ambiguity without adding docs work that would violate the FR-012 trigger semantics.

- **(Resolved 2026-08-26)** Residual non-questions handled conservatively (spec-driven planner discretion per "Ambiguity is Your Enemy" when the product has already ruled on the material choice):
  - `.dockerignore` entries are the standard `node_modules`, test dirs, `docs`, `.git`, etc. — not expanded into a formal list in this spec because the implementation will enumerate them and the review gate verifies `docker build` context size.
  - `docker-compose.yml` passthrough env set is exactly the three `HOST_*` vars (plus Docker's own interpolation); no secrets or extra vars.
  - GHCR publish uses the canonical `shaunburdick/europa-neo` lowercase name already used by every other CI reference; no naming clarification needed.

## Dependencies & Cross-Spec Impact

| Spec | Relation | Impact of this feature |
| --- | --- | --- |
| 004 multiplayer networking | Consumed | Adds the externally-owned `http.Server` seam. No envelope/contract change. Fixture `__boundPortForTest()` remains the ephemeral-port accessor. |
| 005 client console | Consumed | `resolveLobbyServerUrl` + `live-runtime` gain same-origin fallback. LOBBY_DEFAULT_SERVER_PORT docs updated (now a default `HOST_PORT`, not a second port). |
| 006 match lifecycle & matchmaking | Preserved | Matchmaking's `bindMatchmaker` bridge already rides the server's seam; single-port does not change match lifecycle semantics or `MatchRegistry`/`LobbyService` interfaces. |
| 010 public lobby & match browser | Preserved | Lobby wires through the same `ServerDeps.lobby` seam. Two-seat `prepareMatch`/`bootLobbyStack` fixtures now target the single server; lobby list/wait/Join/Spectate behavior unchanged. |
| 009 shared app versioning | Preserved | `/version` stays on the same `http.Server`. `APP_VERSION` inside the image equals the workspace lockstep; no new version surfaces. |
| 007 player manual | Trigger check only | No gameplay numbers or controls change; FR-012 check runs but no page rewrite expected. |
| 008 CI workflows | Extended | New `docker.yml` path-gated (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, relevant source + workflow file). Existing per-package CIs unchanged except their test fixtures now use the single-server fixture. |

Constitution alignment: Principle VII (self-hostable by default — single process, config via env, no cloud service) is the direct justification; Principles I/III (type safety + tested game logic — shared frame codec / lobby鏡像 invariants) constrain the seam to ownership-transfer only; Principle V (simplicity over cleverness — one port, one image, one command) rejects a two-mode matrix.

## Implementation Notes (to be filled during planning)

- Base-image choice (`node:22-slim` vs `-alpine`) and digest pinning are plan-phase decisions; this spec mandates `node:22-slim` as the default.
- `pnpm` inside Docker via corepack vs standalone `pnpm` image is a plan-phase choice; either satisfies the frozen-lockfile build.
- The exact lint/typecheck gates for `Dockerfile`/`docker-compose.yml` (e.g. `hadolint`, `compose config` validation) are plan-phase choices.
- Multi-platform (`arm64`) blocking vs non-blocking is finalized at plan time and documented in the workflow header before implementation begins.
