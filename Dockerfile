# syntax=docker/dockerfile:1
# Single-port topology: one http.Server on HOST_PORT (default 8080) serving
# static console UI (packages/console/dist) + GET /version + WebSocket
# upgrades. No second listener — single http.Server on HOST_PORT.
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
# Keep the browser payload separate from TypeScript declarations emitted by the
# console package build. The runtime needs only the SPA entry page and assets.
RUN mkdir -p /runtime/console && cp /app/packages/console/dist/index.html /runtime/console/ && cp -R /app/packages/console/dist/assets /runtime/console/assets && cp -R /app/packages/console/dist/host /runtime/console/host

# Stage 2 — runtime (minimal) — 24.x — latest LTS Aug 2026
# The bundled host has no runtime node_modules. Copy only browser assets and
# the server entry point; no source, tests, package manager, or dev tooling.
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST_PORT=8080
ENV HOST_BIND_HOST=0.0.0.0
ENV HOST_PUBLIC_HOST=localhost

COPY --from=build --chown=node:node /runtime/console ./packages/console/dist
# Corepack is present in the Node base image but unused by this direct-node
# runtime. Remove its shims so a compromised process cannot invoke it.
RUN rm -f /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
USER node

EXPOSE 8080
CMD ["node", "packages/console/dist/host/host.js"]
