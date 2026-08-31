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

# Prepare a standalone production dependency tree and a separately compiled
# host launcher. The runtime stage never needs workspace source or pnpm.
RUN pnpm deploy --filter @europa/console --prod --legacy /runtime
RUN cp -R packages/console/dist-host/scripts /runtime/scripts
RUN cp packages/console/dist-host/src/state/awaiting-start.js /runtime/scripts/awaiting-start.js
RUN sed -i 's#../src/state/awaiting-start.js#./awaiting-start.js#' /runtime/scripts/host.js
# The host only serves the Vite shell and assets. Remove generated library
# output, type/source metadata, and workspace contract sources from the deploy
# tree instead of relying on pnpm's package-file selection.
RUN rm -rf /runtime/README.md /runtime/contracts /runtime/dist/src \
    /runtime/dist/internal/test-state.js /runtime/dist/internal/test-state.d.ts \
    /runtime/dist/internal/test-state.js.map
RUN find /runtime/dist -mindepth 1 -maxdepth 1 ! -name index.html ! -name assets -exec rm -rf {} +
RUN find /runtime/dist -type f \( -name '*.d.ts' -o -name '*.map' \) -delete
RUN find /runtime/node_modules -type d -name contracts -prune -exec rm -rf {} +
RUN find /runtime/node_modules -type f \( -name '*.d.ts' -o -name '*.map' \) -delete
RUN find /runtime/node_modules -type f -name 'README*' -delete
RUN node -e "const fs=require('fs'); const file='/runtime/package.json'; const pkg=JSON.parse(fs.readFileSync(file)); delete pkg.devDependencies; delete pkg.scripts; delete pkg.packageManager; fs.writeFileSync(file, JSON.stringify(pkg)+'\\n');"

# Stage 2 — runtime (minimal) — 24.x — latest LTS Aug 2026
FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST_PORT=8080
ENV HOST_BIND_HOST=0.0.0.0
ENV HOST_PUBLIC_HOST=localhost

# `pnpm deploy --prod` creates only the console's production dependency graph,
# package manifests, and built package files. It excludes source, tests, and all
# devDependencies; no package manager or workspace checkout enters this stage.
COPY --from=build /runtime ./

EXPOSE 8080
CMD ["node", "scripts/host.js"]
