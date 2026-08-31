# Orchestration Log: 011 Docker Single-Port Self-Host (Issue #5)

## Status
- **Current Wave**: Wave 4 review remediation — ✅ complete; Wave 5 docs pending by design
- **Branch**: `issue-5-docker-support`
- **Last Updated**: 2026-08-31
- **PM**: project-manager (primary) — orchestrating directly (large: 35 tasks)

## Plan Summary
Collapse two-port self-host to one `http.Server` on `HOST_PORT` (8080) serving HTTP (dist + /version + SPA fallback) + WS upgrades from same port, on `node:24-slim` latest LTS, with `docker compose up` one-command, GHCR `ghcr.io/shaunburdick/europa-neo` amd64-only publish, client same-origin fallback, and single-server fixtures. No protocol change.

## Task Wave Progress

### Wave 0 — Setup — ⏳ Pending
- T001 scaffold contracts dirs — ⏳
- T002 quickstart Q-D01..Q-D08 — ⏳ (already committed in plan but verify)
- T003 inventory grep stale refs — ⏳

### Wave 1 — Foundational (Blocking) — ⏳ Pending — **must complete before any story wave**
- T004 host-config staticPort removal — ⏳
- T005 host.ts two-port removal + hard-error branches — ⏳
- T006 host.ts single http.Server wiring — ⏳
- T007 host-config/host TDD tests — ⏳ (tests FIRST, before T005/T006)
- T008 networking seam ServerDeps.httpServer? — ⏳
- T009 networking seam tests FIRST — ⏳
- T010 host→networking wire-up — ⏳

### Wave 2 — Parallel story starts (after Wave 1) — ⏳ Pending
- T011 lobby-view test cases FIRST — ⏳
- T012 lobby-view same-origin impl — ⏳
- T013 live-runtime test — ⏳
- T014 live-runtime same-origin impl — ⏳
- T015 grep + align location.host usages — ⏳
- T016 lobby-transport fixture single-server — ⏳
- T017 full-stack fixture single-server — ⏳
- T018 test-selfhost.sh update — ⏳
- T019 Dockerfile (node:24-slim, corepack, multi-stage) — ⏳
- T020 .dockerignore — ⏳
- T021 docker-compose.yml single-port — ⏳
- T022 native pnpm host sanity — ⏳
- T023 docker build + compose config + curl /version — ⏳
- T024 lifecycle sanity — ⏳

### Wave 3 — Configurable deployment — ⏳ Pending (after T021)
- T025 compose-override tests — ⏳
- T026 HOST_PUBLIC_HOST advertisement wiring — ⏳
- T027 compose header docs FR-017 wording — ⏳

### Wave 4 — GHCR publish — ⏳ Pending (after T019..T021)
- T028 docker.yml triggers/permissions/concurrency — ⏳
- T029 SHA-pinned actions + metadata + amd64-only (no arm64) — ⏳
- T030 post-build verification curl /version inside workflow — ⏳
- T031 smoke GHCR edge after main push (dry-run if fork-blocked) — ⏳

### Wave 5 — Docs & Polish — ⏳ Pending (LAST, after all code ships)
- T032 README Docker section + fix two-port paragraph — ⏳
- T033 docs/manual FR-012 trigger check + cleanup — ⏳
- T034 operational doc polish (Dockerfile header, compose header, JSDoc) — ⏳
- T035 final gates: typecheck + lint + format:check + tests + e2e + docker build + version:check — ⏳

## Decisions & Rationale
- 2026-08-26: Node base pinned to `node:24-slim` (latest LTS Aug 2026, Krypton 2025-10-28→2028-04-30) both stages, SHA-pinned + version comment; dev engines stays `>=22`. Product-owner gate.
- 2026-08-26: ARM64 deferred to future issue — publish is `linux/amd64` only, superseding plan D8 / research Finding 4 (was "amd64 mandatory, arm64 non-blocking"). Product-owner gate: "let's not worry about ARM64 for now".
- 2026-08-26: Seam chosen `ServerDeps.httpServer?: HttpServer` (ownership semantics belong with deps); `ServerConfig.httpServer?` kept as accepted alternative if reviewers prefer.

## Blockers & Escalations
- (none yet)

## New Tasks Discovered
- (none yet)

## Review Findings
- Wave 4 runtime/remediation — ✅ complete (2026-08-31): Docker now compiles the
  host launcher and uses `pnpm deploy --prod` in the build stage, so the final
  image contains only the explicit runtime artifact set and production
  dependencies; `dist/src`, test-only output, declarations, source maps,
  package READMEs, and production contract `.ts` sources are removed.
- `scripts/docker-smoke.sh` now verifies a real RFC 6455 handshake and confirms
  Docker's HTTP mapping and WebSocket endpoint are the same host port, and
  fails if forbidden runtime artifacts return.
- The `validate` job now explicitly grants only `contents: read`; build/publish
  permissions remain scoped to their existing jobs.
- `.github/workflows/docker.yml` build-amd64 permissions are least privilege:
  `contents: read`, `packages: write`, `attestations: write`, and `id-token: write`.
- Review blocker: none. Wave 5 documentation remains outside this remediation.

## Wave Dispatch Plan
- Wave 1 (Foundational) is blocking and file-coupled (host.ts + networking seam) — dispatch as 2 parallel sub-waves: (a) host-config/host tests+impl (T004+T007+T005+T006), (b) networking seam tests+impl (T008+T009), then merge with wire-up T010.
- To keep branches clean while respecting "[P]" markers, Wave 1 will be dispatched sequentially per file ownership unless the host and networking file sets are disjoint enough for parallel — they are disjoint (`packages/console/scripts/*` vs `packages/networking/src/*`) so T004/T007/T005/T006 and T008/T009 can run in parallel with sibling notice.
- Wave 2 bundles 3 parallelizable stories (client, fixtures, Docker) after Wave 1 — dispatched as parallel agents with file-ownership safety.
