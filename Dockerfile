# syntax=docker/dockerfile:1
# Single-port topology: one http.Server on HOST_PORT (default 8080) serving
# static console UI (packages/console/dist) + GET /version + WebSocket
# upgrades. No second listener, no HOST_STATIC_PORT (removed).
# FR-017: one http.Server, one EXPOSE, one port mapping, same-origin WS.
#
# Node 24 LTS gate: node:24-slim is latest LTS Aug 2026 (Active LTS
# 2025-10-28 → 2028-04-30 per research Finding 1). Re-validate the base
# SHA and LTS status at the next LTS cut. Both stages SHA-pinned.

# Stage 1 — build — 24.x — latest LTS Aug 2026
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate && pnpm --version

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2 — runtime (minimal) — 24.x — latest LTS Aug 2026
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST_PORT=8080
ENV HOST_BIND_HOST=0.0.0.0
ENV HOST_PUBLIC_HOST=localhost

# Copy built artifacts + package manifests; runtime node_modules is
# installed fresh for exact lockfile fidelity. The host launcher
# (packages/console/scripts/host.ts) runs via `tsx`, which lives in
# @europa/console devDependencies — the runtime install keeps it so
# `pnpm host` (tsx scripts/host.ts) works inside the container. If a
# future build compiles the host to JS, this can switch to
# `pnpm install --prod`.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/packages ./packages

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate && pnpm install --frozen-lockfile

EXPOSE 8080
CMD ["pnpm", "host"]
