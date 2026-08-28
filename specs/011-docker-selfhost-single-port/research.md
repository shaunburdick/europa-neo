# Research: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Branch**: `issue-5-docker-support` | **Spec**: [spec.md](./spec.md) v1.0 + product-owner gate adjustment 2026-08-26 (Node 24 LTS) | **Date**: 2026-08-26

## Context

Spec 011 phases 4–5 were executed under a product-owner gate adjustment that supersedes FR-010's `node:22-slim` default: **the Docker base image MUST be the latest LTS as of Aug 2026, i.e. `node:24-slim`**. Node 22 was Active LTS Oct 2024–Oct 2025; Node 24 became Active LTS 2025-10-28 (codename Krypton, maintained through 2028-04-30 per `nodejs/Release` schedule) and is therefore the latest LTS at planning time. This research validates that choice and resolves all other plan-gate decisions.

## Finding 1 — Base image: `node:24-slim` (Debian bookworm) is the correct default

**Decision**: Use `node:24-slim` for BOTH build and runtime stages (SHA-pinned with version comment, e.g. `node:24-slim` @ sha256:… `# 24.x — latest LTS Aug 2026`).

**Why not `node:22-slim`**: 22 remains LTS (Maintenance LTS until 2027-04-30) but is no longer *latest* LTS; the gate explicitly requires latest. Staying on 22 would already be one LTS generation behind for a feature that ships post-2026-08. Choosing 24 keeps the image on the recommended production line (`nodejs.org` LTS badge) and on the longest support runway (to 2028-04).

**Why not `alpine`**: Spec assumptions explicitly name `slim` as the safe default because alpine requires libc auditing. `node:24-alpine` uses musl; `ws` 8.x and `vite` 6+ have no native musl-incompatible deps today, but `alpine` adds rebuild risk for any future native addon (e.g. `@resvg/resvg-js` in console, which ships prebuilts per-platform — alpine needs `apk add` for build deps) and changes the glibc behavior of `esbuild` postinstalls. The size win (alpine ~ 174 MB vs slim ~ 220 MB uncompressed) does not justify the compatibility audit for a YAGNI self-host image where reproducibility beats 50 MB.

**Compatibility check**:

| Surface | Requirement | 24 compat | Evidence |
|---|---|---|---|
| `biome-config-shaunburdick@1.0.0` | `Node >=22` | ✅ >=22 satisfied | `biome.jsonc` engines comment documents `Node 22`; 24 trivially satisfies semver. |
| `pnpm@11.22.0` | `Node >=22` (pnpm 11 dropped Node 18) | ✅ supports 22 + 24 | pnpm 11 release notes explicitly list Node 22 and 24. Corepack ships in both images. |
| `ws@8.21.3`, `vite@6+`, `@resvg/resvg-js` | Debian glibc, no musl edge | ✅ `bookworm` is Debian 12; 24-slim tracks the same Debian series as 22-slim | No native `node-gyp` rebuilds needed; `pnpm allowBuilds: esbuild` already approved. |
| `package.json` engines field | currently `>=22.0.0` | Keep `>=22` for dev compat | Docker base is 24; devs may run 22 or 24 locally. Bumping engines to `>=24` would break existing devs still on 22 Maintenance LTS with no gain. Recommendation: leave `engines` at `>=22`, comment in `plan.md` and Dockerfile header that the *container* uses 24. Add `.nvmrc` only if the repo chooses to pin devs explicitly (out of scope for this feature). |

**Reproducibility note**: Pin the image digest (`sha256:`) with a `# node:24.12.0-slim` (or whatever 24.x minor is latest at implementation) version comment so Dependabot / Renovate can bump it and reviewers see the intended tag. The plan's Dockerfile header MUST state "latest LTS Aug 2026 is Node 24 — re-validate at next LTS transition (Node 26 expected Oct 2026 Current → Oct 2027 LTS)".

## Finding 2 — pnpm inside Docker via `corepack enable` (preferred)

**Decision**: Build stage enables pnpm via `corepack enable && corepack prepare pnpm@11.22.0 --activate` (or `RUN corepack enable` then `pnpm --version` to prove activation). No standalone `pnpm` image.

**Why corepack**: `node:24-slim` ships `corepack` (Node's blessed package-manager manager) and the repo already pins `packageManager: pnpm@11.22.0` in root `package.json`. `corepack` reads that field and activates exactly that version — reproducible and trivially verifiable. The alternative "copy from `pnpm` image" or `npm i -g pnpm` adds a network fetch of a different version or a base-image layer mismatch.

**Rejected alternative**: `npm install -g pnpm@11` — works but diverges from the `packageManager` field; a bump there must also be reflected in the `Dockerfile` `npm i` line, adding a manual sync point.

**Verification**: add `RUN pnpm --version` after corepack so build fails early with an actionable message if corepack is missing.

## Finding 3 — Dockerfile / compose lint gates

**Decision**: CI gates are (a) `docker build` itself (syntax + context size) + `docker compose config -q` (valid Compose spec) as hard gates; (b) `hadolint` as advisory (warn, not block) unless the team already runs it elsewhere — none of the six existing workflows run hadolint.

**Why not hard-require hadolint**: Adding a new required external linter for a single feature would violate YAGNI and the "no new required checks without uzasadnienie" discipline. `hadolint` is valuable (it flags `apt-get` hygiene, `COPY` vs `ADD`, etc.) but introduces install time and pin maintenance; the repo can adopt it later when Docker becomes load-bearing. Running it as soft-fail (continue-on-error) during the push workflow satisfies the "lint choice documented" requirement without blocking `main`.

**Compose validation**: `docker compose config -q` is zero-cost (already behind `docker compose` install), deterministic, and catches the exact mistakes the spec cares about (port mapping, env passthrough typos).

## Finding 4 — `arm64` blocking vs non-blocking ruling

**Spec state**: Spec says `linux/amd64` is mandatory; `linux/arm64` is a documented stretch goal; the blocking vs non-blocking decision is deferred to plan time.

**Decision (binding for implementation)**: `amd64` is mandatory AND blocks publish; `arm64` is best-effort **non-blocking** for `main`→`:edge` and for `v*` tags. The publish workflow MUST document this in its header comment and MUST implement it as separate platform build steps where `arm64` failure does not fail the overall job (or as a matrix `fail-fast: false` with `continue-on-error: true` on the arm64 leg plus a conditional `push` that always publishes the `amd64` manifest). Rationale:

- Self-host perf target is "typical broadband + local SSD" — Intel/AMD boxes are dominant for that demographic; arm64 cover is wanted (Raspberry Pi, Mac Docker Desktop) but operator pain from a missing arm64 tag is lower than from a completely missing image when `arm64` emulation flaked.
- `node:24-slim` ships manifest-list multi-arch; QEMU-based cross-build is slow and can OOM on free runners. Non-blocking lets `:edge` stay green on `main` while the stretch converges.
- If the team's later telemetry shows most self-hosters are arm64, flip the workflow to blocking in a one-line change — the spec deliberately leaves the door open.

This matches the sister repo pattern (edge + versioned tags, SHA-pinned actions, GHCR, `packages: write`).

## Finding 5 — Single-port networking seam: prefer optional `httpServer?: HttpServer` over `attachToHttpServer()`

**Decision**: Add an optional `httpServer?: import('node:http').Server` field to EITHER `ServerConfig` (`port` becomes optional when it is present) OR `ServerDeps` (where the http surface lives). Prefer `ServerDeps.httpServer?: HttpServer` because ownership semantics belong with the other ownership-bearing dep (the `logger`, `lobby` factory), and because `ServerConfig` is historically "tuning constants" while `ServerDeps` is "who owns what". If the team chooses `ServerConfig`, add a runtime invariant `if (httpServer) { assert(!port || port === 0) }` so the two sources cannot conflict; if `ServerDeps`, keep `ServerConfig.port` as fallback for native host (used for banner). Both forms satisfy FR-002's "either" clause; the plan MUST pick one and document it in contracts.

**Why optional external server**: `createMatchServer` today creates its own `http.Server` at `listen()` and closes it at `close()`. FR-002 requires that when an external server is supplied, `listen()` does NOT create/destroy it and `close()` does NOT close it. Ownership transfer is the only change; the wire protocol is untouched. Verified by reading `packages/networking/src/server.ts`:

```ts
let httpServer: HttpServer | undefined;
const wss = new WebSocketServer({ noServer: true, ... });
// listen(): httpServer = createHttpServer(...); wss attach on 'upgrade' via httpServer.on('upgrade', ...)
// close(): wss.close(); httpServer.close();
```

The delta is `if (externalHttpServer) { httpServer = externalHttpServer; attachUpgradeListener(externalHttpServer); } else { create own }` plus ownership guards in `close()`.

**Why `noServer: true` stays**: The shipped server already uses `noServer: true` with its own internally-created `http.Server` — the plan's Clarifications v1.0 note "the delta is ownership transfer only" is literally true; audit of `server.ts` confirms `noServer:true`.

**Rejected alternative**: An `attachToHttpServer(server: HttpServer)` post-creation method — functionally equivalent, but it splits ownership negotiation into two calls (factory + attach) and invites ordering bugs (attach before listen). Single-call `createMatchServer(config, { ..., httpServer })` is atomic and easier to type.

**Fixture integration**: `tests/e2e/full-stack.spec.ts:buildStack()` today does `createMatchServer({ port: 0 }) → listen() → __boundPortForTest()`. Post-seam: the fixture becomes

```ts
const httpServer = createHttpServer(); // port: 0, ephemeral
const server = createMatchServer({ ...CONFIG, port: 0 }, { ..., httpServer });
// OR: createMatchServer(CONFIG, { ..., httpServer })
await httpServer.listen(0); // host owns it; or server.listen() attaches upgrade without re-listening
```

The spec's "single http.Server port:0 + __boundPortForTest()" requires that `__boundPortForTest()` still returns the bound port — now it reads `httpServer.address().port`. The host (`packages/console/scripts/host.ts`) will own a single `http.Server` that does BOTH `request→serveStatic + handleVersionRoute` and `upgrade→wss.handleUpgrade`; the networking module merely registers its upgrade handler.

**Alternative kept open**: If implementers prefer `Server.httpServer` exposed for test introspection, document it; either is compliant so long as ownership is guarded and the single `http.Server` invariant holds.

## Finding 6 — Node 24 LTS verification

- Source: `nodejs/Release` schedule confirms 24.x entered Active LTS 2025-10-28 (v24.11.0 Krypton) with EOL 2028-04-30. Verified 2026-08-26 via live search: GitHub Releases issue 1089, nodejs.org blog v24.11.0, and `schedule.json` all list 24.x as Active LTS while 22.x moved to Maintenance LTS 2025-10-21. At Aug 2026, 24 is the latest LTS; Node 25 is Current, Node 26 not yet released.
- `@europa/version` lockstep is unaffected: Docker packages the compiled `APP_VERSION`, not `git describe`.
- No TPM/registry changes needed; all packages stay `private: true`.

## Verification references

- `packages/networking/src/server.ts` — current `noServer:true` + internal `http.Server` pattern (lines 51–244).
- `packages/networking/src/contracts/network-api.ts` — `ServerConfig`/`ServerDeps`/`Server` surface (ServerDeps already carries `lobby`, `logger`; `httpServer` naturally joins it).
- `packages/console/scripts/host.ts` — two-port launcher (`DEFAULT_WS_PORT 8080`, `DEFAULT_STATIC_PORT 5173`, `startStaticServer`, banner showing both ports).
- `packages/console/src/state/lobby-view.ts` — `LOBBY_DEFAULT_SERVER_PORT = 8080`, `resolveLobbyServerUrl` hardcoded default path (to be collapsed to `location.host`).
- `packages/console/src/internal/live-runtime.tsx` — second occurrence of `resolveLobbyServerUrl` consumption.
- `specs/009-shared-app-versioning/spec.md` FR-013 — release workflow self-exclusion ruling reused for `docker.yml`.
- `.github/workflows/release.yml` — SHA-pinned, least-privilege, concurrency, workflow_dispatch guard pattern reused for `docker.yml`.
- `biome-config-shaunburdick@1.0.0` — requires `Node >=22`; Node 24 satisfies.
