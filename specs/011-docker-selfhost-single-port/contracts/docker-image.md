# Contract: Docker Image Build

**Artifact**: `Dockerfile` at repo root  
**Applicable FR**: FR-010, FR-012, FR-013 (image facets)  
**Spec**: [../spec.md](../spec.md)

## Build contract

### Stage 1 — `build`

```dockerfile
# Header MUST state: single-port topology; node:24-slim is latest LTS Aug 2026.
FROM node:24-slim@sha256:<pinned-digest> AS build # 24.x — latest LTS Aug 2026
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
RUN pnpm --version   # fails fast if corepack/prepare misconfigured

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build
```

- Base image MUST be `node:24-slim` (or `node:24.12.0-slim` at implementation, with SHA digest pin and `# 24.x — latest LTS Aug 2026` comment).
- Package manager activation MUST be via `corepack` reading `package.json#packageManager` (no `npm i -g pnpm`).
- Install MUST use `--frozen-lockfile` and MUST fail when lockfile mismatches.
- Build MUST be `pnpm build` across all workspaces (engine→terrain→fog→networking→matchmaking→console→version), producing `packages/console/dist/` and host launcher.

### Stage 2 — `runtime`

```dockerfile
FROM node:24-slim@sha256:<pinned-digest> AS runtime # 24.x — latest LTS Aug 2026
WORKDIR /app
ENV NODE_ENV=production
ENV HOST_PORT=8080

COPY --from=build --chown=node:node /runtime/console ./packages/console/dist
USER node

EXPOSE 8080
CMD ["node", "packages/console/dist/host/host.js"]
```

- Base MUST be the same `node:24-slim@sha256:` as build stage.
- Runtime copies an explicit allowlist: console `index.html`, console `assets/`, and compiled `host/host.js`. Its host bundle contains the workspace and `ws` runtime closure, so the final image has no `node_modules` or package-manager/tooling binaries (`npm`, `npx`, pnpm, Corepack, pnpx, or `tsx`). It MUST NOT contain devDependencies, test dirs (`tests/`, `coverage/`, `.playwright`), source TypeScript, declarations, source maps, `.git`, `docs`, `specs`, or IDE files.
- `EXPOSE 8080` — single port (variable at `docker run` via `HOST_PORT`, but Dockerfile declares the default).
- `CMD` runs the compiled single-port host directly through Node (`node packages/console/dist/host/host.js` → one `http.Server` on `HOST_PORT`).
- Runtime MUST execute as the image's unprivileged `node` user.
- Image MUST report the correct release identity:

  ```bash
  curl -s http://localhost:8080/version | jq -e '.appVersion == "0.1.0" and .protocolVersion != null'
  # WebSocket helloAck.appVersion also equals APP_VERSION (US4 AC3 is checked by compose-level test)
  ```

  The final image deliberately excludes `packages/version` and all workspace
  source. `/version` is therefore the supported release-identity probe; do not
  add a runtime workspace import merely to inspect the version.

### Reproducibility

The compile-time constant `packages/version/src/app-version.ts` (`APP_VERSION`) is the sole source of truth inside the image (no `git describe`, no `ARG` from shallow-clone). A rebuild from the same commit + same `node:24-slim` digest + same `pnpm-lock.yaml` yields a byte-equivalent `dist/` and `/version` payload.

### Ignore file (`.dockerignore`)

Required to exclude context bloat while preserving multi-stage semantics:

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

Ignored files never reach the build context; the `runtime` stage copies from `build` stage (not context), so `dist/` produced inside `build` is still available.

## Lint / validation

- `docker build -t europa:test .` MUST succeed with no syntax error and a measured compressed size recorded (SC-008).
- `docker compose config -q` MUST succeed (zero exit) — catching port/env typos.
- Optional `hadolint` advisory (`hadolint Dockerfile`): SHOULD pass; soft-fail (continue-on-error) is acceptable per research Finding 3.
