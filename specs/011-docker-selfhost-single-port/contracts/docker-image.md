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

COPY --from=build /app/packages/console/dist  ./packages/console/dist
COPY --from=build /app/packages/console/scripts ./packages/console/scripts
COPY --from=build /app/packages ./packages
# Runtime prod deps (prefer pnpm --prod --frozen-lockfile inside runtime stage for exact fidelity)
RUN corepack enable && pnpm install --prod --frozen-lockfile

EXPOSE 8080
CMD ["pnpm", "host"]
```

- Base MUST be the same `node:24-slim@sha256:` as build stage.
- Runtime copies built artifacts + production `node_modules` ONLY. It MUST NOT contain devDependencies, test dirs (`tests/`, `coverage/`, `.playwright`), source TypeScript not transpiled, `.git`, `docs`, `specs`, IDE files.
- `EXPOSE 8080` — single port (variable at `docker run` via `HOST_PORT`, but Dockerfile declares the default).
- `CMD` runs the single-port host (`pnpm host` → `tsx scripts/host.ts` → one `http.Server` on `HOST_PORT`).
- Image MUST report the correct release identity:

  ```bash
  docker run --rm IMAGE node -e "require('./packages/version/dist/app-version').APP_VERSION" | grep -q 0.1.0
  curl -s http://localhost:8080/version | jq -e '.appVersion == "0.1.0" and .protocolVersion != null'
  # WebSocket helloAck.appVersion also equals APP_VERSION (US4 AC3 is checked by compose-level test)
  ```

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
