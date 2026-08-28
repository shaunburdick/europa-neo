# PM Handoff: 011 Docker Single-Port Self-Host (Issue #5)

**Branch**: `issue-5-docker-support`
**Spec**: `specs/011-docker-selfhost-single-port/spec.md` v1.0 (2026-08-26)
**Plan**: `specs/011-docker-selfhost-single-port/plan.md` + `research.md` + `data-model.md` + `contracts/` + `quickstart.md`
**Tasks**: `specs/011-docker-selfhost-single-port/tasks.md` (35 tasks, 8 phases)
**Constitution**: `.specify/memory/constitution.md` v1.0.0 — no amendment; VII self-hostable is justification
**Orchestration**: `specs/011-docker-selfhost-single-port/orchestration.md`

## What we're building (plain)
Single-port self-host: one `http.Server` on `HOST_PORT` (8080) serving static UI (`dist/` + SPA fallback + `/version` + security headers) + WS upgrades (`wss.handleUpgrade`, `noServer:true`). Container path: `docker compose up` from fresh clone → lobby `http://localhost:8080/` where two seats play same-origin WS no `?ws=` needed. GHCR `ghcr.io/shaunburdick/europa-neo` (`:edge` on main, versioned on `v*`) amd64-only (arm64 deferred).

## Binding decisions (do not relitigate)
- Single-port is canonical and ONLY topology — no two-port fallback; `HOST_STATIC_PORT`/`--static-port`/`DEFAULT_STATIC_PORT 5173`/`startStaticServer` removed with hard actionable error (FR-004). Product-owner assertion 2026-08-26.
- Base image: `node:24-slim` (latest LTS Aug 2026, Krypton Active LTS 2025-10-28→2028-04-30) both stages, SHA-pinned with version comment; dev `engines` stays `>=22`; pnpm via `corepack`.
- Seam: `ServerDeps.httpServer?: HttpServer` (preferred; `ServerConfig.httpServer?` accepted per FR-002 either). Ownership transfer only, no protocol change, `NETWORK_API_VERSION` untouched.
- Client same-origin fallback `` `${protocol==='https:'?'wss':'ws'}://${location.host}` `` in BOTH `lobby-view.ts` + `live-runtime.tsx`; `?ws=` still validated (same-host alias, no creds); `LOBBY_DEFAULT_SERVER_PORT` retained only as fallback for `location.host===''` with JSDoc "default HOST_PORT, not a second listener".
- GHCR: `linux/amd64` ONLY (arm64 deferred to future issue per 2026-08-26 gate adjustment — supersedes plan D8 / research Finding 4 non-blocking ruling). Workflow SHA-pinned, least-privilege `packages:write` + `contents:read`, timeout 30.
- Docs: README Docker quick-start + env table + single-port topology comment; `docs/manual/**` FR-012 trigger check but no gameplay rewrite.

## Scope assessment
Medium-large (35 tasks) — PM drives Phase 6 orchestration directly (orchestration skill). Waves dispatched via `modern-architect-engineer` subagents.

## Paths
- Networking seam: `packages/networking/src/server.ts` + `packages/networking/src/contracts/network-api.ts`
- Host: `packages/console/scripts/host.ts` + `host-config.ts` + `version-route.ts`
- Client: `packages/console/src/state/lobby-view.ts` + `packages/console/src/internal/live-runtime.tsx`
- Fixtures: `packages/console/tests/e2e/full-stack.spec.ts` + `packages/console/tests/integration/lobby-transport.test.ts` + `packages/console/scripts/test-selfhost.sh`
- Docker: `Dockerfile`, `.dockerignore`, `docker-compose.yml` (repo root)
- GHCR: `.github/workflows/docker.yml`
- README.md, `docs/manual/**`

## Gate adjustments since plan
- 2026-08-26: Node base `node:22-slim` → `node:24-slim` (latest LTS). Reflected in plan D1, research Finding 1/6, contracts.
- 2026-08-26: arm64 deferred — publish is `linux/amd64` only. Supersedes plan D8 / tasks T029 arm64 non-blocking text. Future issue will add arm64 if needed.

## Current state (update as waves land)
- Phases 1–5 complete (spec + plan committed `d0e71f9`).
- Phase 6 Wave 1 (Foundational) pending dispatch.

## How to resume
If this worktree is resumed in a fresh session:
1. `git branch --show-current` → `issue-5-docker-support`
2. Read this file + `orchestration.md` + `tasks.md` checkboxes
3. Continue dispatching next pending wave per `orchestration.md` Task Wave Progress
4. After each wave: verify (tests/lint/build/docker), review (code-quality-reviewer), checkpoint user before next wave
