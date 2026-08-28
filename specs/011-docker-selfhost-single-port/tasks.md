# Tasks: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Feature Branch**: `issue-5-docker-support` | **Spec**: [spec.md](./spec.md) v1.0 + Node 24 gate | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)  
**Principles**: Constitution I–VII hold; WG: Node 24 LTS base verified per [research.md Finding 1](./research.md); no new runtime dep; no wire change.

**Organization**: Phases are dependency-ordered. Tasks marked `[P]` touch disjoint files and may run in parallel when their phase's prerequisites are done. Tasks marked `[Story]` trace to US1..US5. Check off with `- [x]`. All six per-feature plans require no code during phases 4–5 — tasks describe the work Phase 6 WILL do; Phase 4–5 commit is doc-only.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold artifacts that do not depend on any application code change

- [x] T001 Create `specs/011-docker-selfhost-single-port/contracts/` dir and ensure `plan.md`, `research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md` exist (Phase 4 gates)
- [x] T002 Add `specs/011-docker-selfhost-single-port/quickstart.md` Q-D01..Q-D08 harness (SC→Q-D trace table) — docs-only
- [x] T003 [P] Inventory current host ports in docs: grep `HOST_STATIC_PORT|staticPort|5173|LOBBY_DEFAULT_SERVER_PORT` across `README.md`, `docs/manual/**`, `packages/console/scripts/**`, `packages/console/src/state/lobby-view.ts` — record stale references for the cleanup tasks

**Checkpoint**: Plan artifacts committed; stale-ref inventory in hand.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Collapse host-config types + remove two-port constants — blocks every story that touches `host.ts`

> No user-story work can begin until Phase 2 is complete.

- [x] T004 [P] [US1/US2] In `packages/console/scripts/host-config.ts` — remove `staticPort` from `HostConfig`, delete `DEFAULT_STATIC_PORT`-related constant if re-exported, and update `resolveConfig` unit tests to expect the new shape (config still has `wsPort`/`port` but renamed to the single `port`/`HOST_PORT` per plan — keep a forward-compatible rename `wsPort→port` with deprecation note)
- [x] T005 [US1/US2] In `packages/console/scripts/host.ts` — remove `DEFAULT_STATIC_PORT`, `HOST_STATIC_PORT` parsing, `--static-port` flag branch, `startStaticServer`, and `staticServer` teardown; add hard-error branches for both `HOST_STATIC_PORT` (env) and `--static-port` (flag) with message including "no longer supported" + `HOST_PORT/--port` hint; keep `resolveConfig` unit-testable (exported function)
- [x] T006 [US1/US2] In `packages/console/scripts/host.ts` — replace `createHttpServer` + `listen` / `staticServer` pair with single `createHttpServer((req,res)=>void serveStatic)` owning `request→serveStatic+handleVersionRoute` and an `upgrade→wss.handleUpgrade` delegation; keep `serveStatic`, `writeStaticHead`, `isPathInside`/`realpath`, `STATIC_SECURITY_HEADERS`, `handleVersionRoute` unchanged on the single surface; collapse `HostLaunchConfig` to `{ bindHost, publicHost, wsPort, createMatch }` where `wsPort→port` becomes the single `HOST_PORT`; update `printLobbyBanner`/`printCreateBanner` to show one port for both `Match server : ws://…:PORT` and `Console UI : http://…:PORT`
- [x] T007 [US1/US2] [P] Write host-config/host unit tests FIRST (TDD): cases for `null staticPort flap` → actionable error, unknown flag → error, wildcard bind without `publicHost` → error, banner format has single port on both lines; prove they FAIL before T005/T006 land
- [x] T008 [US1/US2] In `@europa/networking` — implement seam: add optional `httpServer?: import('node:http').Server` to `ServerDeps` (preferred) OR `ServerConfig` (accepted alternative per FR-002); in `src/server.ts` conditionalize `httpServer` creation vs external ownership: external path wires `WebSocketServer(noServer:true)` to `externalServer.on('upgrade', …)` and guards `listen()`/`close()`/`__boundPortForTest()` accordingly; export not required but TYPE must be re-exported from `contracts/network-api.ts`; update JSDoc with ownership-transfer contract
- [x] T009 [US1/US2] [P] Write networking seam unit tests FIRST: external-httpServer given → `listen()` does not create second server, `close()` does not close it, `__boundPortForTest()` reads external port, `noServer:true` upgrade still fires exactly once; then implement T008 until green
- [x] T010 [US1/US2] Wire host → networking: `buildStack(wsPort, bindHost)` now takes single port + `createHttpServer()` it owns → `ServerDeps.httpServer`; host registers `httpServer.on('upgrade', (req,socket,head)=>wss.handleUpgrade(...))` via the returned `wss` handle (minimal accessor `getWss()` if needed) — teardown closes networking's `wss` before facade/matchmaker, then `httpServer.close()`

**Checkpoint**: Host is single-port at code level; `pnpm --filter @europa/console typecheck` green; `packages/console/scripts/host.test.ts`-equivalent suites prove hard error + banner + wildcard semantics.

---

## Phase 3: US2 — Single-Port Client Fallback (Priority: P1)

**Goal**: Opening `http://host:HOST_PORT/` without `?ws=` just works (same-origin WS).  
**Independent Test**: Q-D03 — 10/10 loads with no override resolve to `ws(s)://host:HOST_PORT`; explicit `?ws=` still validated.

- [x] T011 [P] [US2] Write `packages/console/src/state/lobby-view.test.ts` cases FIRST: `resolveLobbyServerUrl('', { protocol:'http:', host:'localhost:8080' }) → ws://localhost:8080`; `https:` → `wss`; `host===''` → `localhost:8080` fallback; `?ws=` same-host/loopback alias allowed, cross-host/credentials rejected; `LOBBY_DEFAULT_SERVER_PORT` JSDoc assert it is "default HOST_PORT, not a second listener"
- [x] T012 [US2] Update `packages/console/src/state/lobby-view.ts`: widen `PageLocator` to include `readonly host: string` (`location.host`), change default branch to `` `${locator.protocol === 'https:' ? 'wss' : 'ws'}://${locator.host}` `` when `?ws=` absent, keep `validateLobbyServerUrl` path for overrides, retain `LOBBY_DEFAULT_SERVER_PORT = 8080` only for `host === ''` fallback with updated JSDoc
- [x] T013 [US2] Write `packages/console/src/internal/live-runtime.test.ts` (or component test) case: missing `?ws=` no longer bootErrors but same-origin connects; `?ws=` cross-host still hard-error before client construction
- [x] T014 [US2] Update `packages/console/src/internal/live-runtime.tsx`: consume same-origin fallback when `?ws=` absent (tolerate missing `ws` query param on `?live&match=&name=` entry) via `resolveLobbyServerUrl(window.location.search, window.location)` same path as lobby-view; do not regress direct `?live&ws=` compatibility for Playwright fixtures
- [x] T015 [US2] Grep `LOBBY_DEFAULT_SERVER_PORT` usages + `location.hostname` call sites across `packages/console/src/` and align both lobby-view and live-runtime to the same `location.host` path

**Checkpoint**: `pnpm --filter @europa/console test` green; Q-D03 manually verified (10/10 no-override connects).

---

## Phase 4: US1 — Single-Port Fixtures (Priority: P1)

**Goal**: Integration/E2E fixtures use one `http.Server` at `port: 0` + `__boundPortForTest()` and remain deterministic.  
**Independent Test**: Q-D07 — `full-stack` + `lobby-transport` green over single-server fixtures; `ss -tlnp` shows exactly one listener.

- [x] T016 [P] [US1] Write / update `packages/console/tests/integration/lobby-transport.test.ts:bootLobbyStack()` to build `createHttpServer()` at `port: 0` → `ServerDeps.httpServer` → `createMatchServer` → `httpServer.listen(0)`; assert `server.__boundPortForTest()` equals `httpServer.address().port`; assert `curl http://127.0.0.1:PORT/` and WS handshake on same PORT succeed, second port absent
- [x] T017 [US1] Rewrite `packages/console/tests/e2e/full-stack.spec.ts:buildStack()` to the same single-server recipe; keep `TICK_MS=100`, `BOARD_SIZE=32` (terrain placement requires 32); keep `browser.newContext()` two-console flow; assert auto-start still registers channel after `joinMatch` fills second seat, and ticks/orders flow over the single port
- [x] T018 [US1] Update any other test helper mirroring `host.ts` wiring (e.g. `packages/console/scripts/test-selfhost.sh` if it hard-codes `5173`) to the single-port banner/port derivation; `pnpm --filter @europa/console test` and `pnpm --filter @europa/console test:e2e` MUST both pass on the new fixtures

**Checkpoint**: `packages/console` e2e (Chromium) + integration suites green on single port.

---

## Phase 5: US1 — Dockerfile / Compose Packaging (Priority: P1)

**Goal**: Fresh-clone `docker compose up --build` serves the lobby on `http://localhost:8080/` with no toolchain.  
**Independent Test**: Q-D01 + Q-D02 + Q-D08 — compose up → lobby + two-seat flow + single-port proof + `docker images` size + rebuild determinism.

- [x] T019 [P] [US1] `Dockerfile` (repo root): author per `contracts/docker-image.md` — `node:24-slim@sha256:<pinned> # 24.x — latest LTS Aug 2026` build stage (`corepack enable` + `pnpm install --frozen-lockfile` + `pnpm build` all workspaces) + `node:24-slim@sha256:<pinned>` runtime stage copying built artifacts + prod `node_modules` only, `EXPOSE 8080`, `CMD ["pnpm","host"]`, `ENV HOST_PORT=8080 NODE_ENV=production`; header MUST state single-port topology + Node 24 LTS gate with re-validation note
- [x] T020 [US1] `.dockerignore` (repo root): per `contracts/docker-image.md` (exclude `node_modules`, `dist`, `coverage`, `.playwright`, `packages/*/dist`, `docs`, `.git`, `specs`, IDE files) — must NOT exclude build-stage-internal `dist/` copy via `COPY --from=build`
- [x] T021 [P] [US1] `docker-compose.yml` (repo root): per `contracts/docker-compose.md` — single service `europa` `build: .` + `ports: ["${HOST_PORT:-8080}:${HOST_PORT:-8080}"]` + `environment: HOST_PORT/HOST_BIND_HOST/HOST_PUBLIC_HOST` defaults (`0.0.0.0` compose default), `expose`, single-port header comment; no `HOST_STATIC_PORT` anywhere
- [x] T022 [US1] Host native path still works: `pnpm host` / `pnpm host --port 9090` / `pnpm host --create` all serve correctly on the single port; `pnpm host --static-port` / `HOST_STATIC_PORT=5173` still fail with the actionable error from T005 (FR-004 honored natively AND inside the container's ENTRYPOINT)
- [x] T023 [US1] Build gates: `docker build -t europa:test .` exits 0; `docker compose config -q` exits 0; `docker run -d -p 8080:8080 europa:test && sleep 2 && curl -s http://localhost:8080/version | jq -e '.appVersion'` succeeds and equals `APP_VERSION`; record `docker images europa:test --format '{{.Size}}'` in PR description (SC-008)
- [x] T024 [US1] Lifecycle sanity: `docker compose down` resets lobby/matches; restarting `docker compose up` gives a fresh lobby (no persisted matches); `curl -s http://localhost:8080/` still SPA-fallback and `/version` still 200 with `cache-control: no-store`

**Checkpoint**: `docker compose up --build` from `/tmp` fresh clone (no Node) reaches lobby at `http://localhost:8080/` and two seats can create/join/tick (Q-D01 5/5 composed, Q-D02 proof, Q-D08 size/determinism).

---

## Phase 6: US3 — Configurable Deployment Without Rebuilding (Priority: P2)

**Goal**: One image covers `localhost` / LAN / reverse-proxy via three env vars.  
**Independent Test**: Q-D04 — each var override rewrites BOTH HTTP+WS together; malformed → actionable non-zero.

- [x] T025 [P] [US3] Add compose-override tests: `HOST_PORT=9090 docker compose up -d && curl -s http://localhost:9090/version | jq .` and `HOST_BIND_HOST=0.0.0.0 HOST_PUBLIC_HOST=example.com pnpm host --dry-run` banner asserts WS+HTTP advertise `example.com:PORT`; wildcard-without-publicHost still rejects (both native `pnpm host` and container-run branches)
- [x] T026 [US3] Wire `HOST_PUBLIC_HOST` advertisement into join/lobby URLs consistently when `bindHost` is wildcard: banner `Match server : ws://HOST_PUBLIC_HOST:PORT`, `Console UI : http://…:PORT`, join URLs carry `HOST_PUBLIC_HOST:PORT`; native host `resolveConfig` already derives `publicHost` — ensure compose passthrough `HOST_PUBLIC_HOST` reaches it
- [x] T027 [US3] Document the `HOST_*` trio in `docker-compose.yml` header comment and inline env comments (FR-017 single-port topology wording reused: "one http.Server, one EXPOSE, one port mapping, same-origin WS")

**Checkpoint**: Q-D04 green: each valid env changes behavior per FR-005; invalid env fails fast naming the var (SC-004).

---

## Phase 7: US4 — Verifiable Published Image (Priority: P2)

**Goal**: `main` → `:edge`, `v*` tag → versioned `:X.Y.Z` at `ghcr.io/shaunburdick/europa-neo`.  
**Independent Test**: Q-D06 — publish workflow run is green, SHA-pinned, least-privilege, pullable, `/version` matches tag.

- [x] T028 [US4] `.github/workflows/docker-publish.yml`: per `contracts/ghcr-publish.md` — triggers `push` `main` paths (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `packages/**`, `package.json`, `pnpm-lock.yaml`, workflow itself) + `push` tags `v*` + `workflow_dispatch`; guarded `if: github.repository == 'shaunburdick/europa-neo'`; `permissions: { contents: read, packages: write }` (add `id-token: write` only if provenance); `concurrency: docker-publish-${{ github.ref }}` `cancel-in-progress: false`; `timeout-minutes: 30` on build job
- [x] T029 [US4] Pin all `uses:` actions to SHAs with `# vX.Y.Z` comments: `actions/checkout`, `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (GHCR login via `secrets.GITHUB_TOKEN`), `docker/metadata-action` (`images: ghcr.io/shaunburdick/europa-neo` + `type=edge,branch=main` + `type=semver,pattern={{version}}`), `docker/build-push-action`; platforms `linux/amd64` ONLY — arm64 deferred to future issue per 2026-08-26 gate (no arm64 leg; workflow header documents "amd64-only for now, arm64 in future issue")
- [x] T030 [US4] Post-build verification step INSIDE the workflow (runs on the fresh image): `curl -s http://localhost:8080/version | jq -e '.appVersion == "<APP_VERSION>"'` AND scripted `helloAck.appVersion` check == same; log `docker images --format '{{.Size}}'` compressed size; push only after verification
- [x] T031 [P] [US4] Smoke `ghcr.io/shaunburdick/europa-neo:edge` after a `main` push on the feature PR's staging run (if the repo's fork policy blocks actual push, dry-run `docker/metadata-action` tag generation and QEMU-disabled build still prove tag derivations); document the live proof as post-merge SC-006 but provide fork-safe evidence for Phase 6 review (action logs + pullability from a second host)

**Checkpoint**: Workflow file lands SHA-pinned, least-privilege, non-blocking arm64 ruling documented, and a workflow run is inspectably green (at minimum on `docker/metadata-action` dry step).

---

## Phase 8: US5 — Documentation & Polish (Priority: P3)

**Goal**: README's Docker section IS the quick-start; manual trigger check finds zero stale two-port refs.  
**Independent Test**: Grepping (`HOST_STATIC_PORT|staticPort|5173`) across `README.md` + `docs/manual/**` returns zero outside "removed" changelog lines; following README Docker section verbatim from a fresh clone without reading any other doc reaches `http://localhost:8080/`.

- [x] T032 [P] [US5] `README.md`: add/replace Docker quick-start section (per `contracts/host-env.md` + [plan.md §8](../plan.md)) immediately after `pnpm host` quick-start: `docker compose up --build` command, `http://localhost:8080/` single-port URL, three-env table (`HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST`) with defaults, `no HOST_STATIC_PORT` deprecation callout, one-firewall/ingress line, fresh-clone requirement stated; fix earlier "two-port" paragraph (was `ws://:8080` + `http://:5173`) to single-port canonical; remove stale `--static-port`/`HOST_STATIC_PORT` mentions if any remain
- [x] T033 [P] [US5] `docs/manual/**` FR-012 trigger check + cleanup (or attest): grep and, if stale refs found, patch them to the single-port wording in the SAME change set; if zero refs, leave manual untouched and record "no update required" in the PR description (either satisfies FR-012/FR-016)
- [x] T034 [US5] Operational doc polish: `Dockerfile` header comment (topology + Node 24 LTS gate + re-validation note), `docker-compose.yml` header comment (FR-017 wording), `packages/networking/src/contracts/network-api.ts` seam JSDoc + `host.ts` comment referencing plan's D3/D4 decisions; keep `README` in sync with the two contract files
- [x] T035 [US5] Final gates: `pnpm typecheck` + `pnpm lint` + `pnpm format:check` zero errors; `pnpm test` (all packages, each ≥80% on every metric where the metric applies) green; `pnpm --filter @europa/console test:e2e` full-stack deterministic proof passes on the single-server fixture; `docker compose config -q && docker build -t europa:final . && docker run --rm europa:final pnpm --version | grep 11` exits 0; `pnpm --filter @europa/version version:check` still green (Docker packaging didn't add a new `package.json` version)

**Checkpoint**: README doctrine done; `pnpm version:check` independent of Docker; manual drift check is documented as executed.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — can start immediately.
- **Foundational (Phase 2: T004..T010)**: depends on Setup — BLOCKS US2/US1/US3/US4.
- **US storytelling (Phases 3..7)**: once Phase 2 is complete, phases may overlap:
  - Phase 3 (client fallback) + Phase 4 (fixtures) are disjoint files — fully parallelizable.
  - Phase 5 (Docker packaging) requires Phase 2's single-port `host.ts` shape but not client fixes — may start parallel with Phases 3/4.
  - Phase 6 (3-env passthrough) is a follow-on to Phase 5 (compose env completeness) — sequential after T021.
  - Phase 7 (GHCR publish) requires Dockerfile/compose to exist (Phase 5) but not client fixes — may start parallel with Phase 3/4 once T019..T021 land.
  - Phase 8 (docs) is LAST — depends on all code ships to state the final topology exactly once.

### Within-phase parallel opportunities

- T001..T003 in Setup: T003 is parallel-safe alongside T001/T002.
- T004 + T007 in Foundational: config removal + its TBD tests touch the same area — write tests FIRST (T007 before T005), pair via wave.
- T008 + T009 in Foundational: networking seam + its seam tests — tests first, same file pair.
- Phase 3: T011 + T013 are pure tests, parallel-safe with T012/T014 once test files exist.
- Phase 5: T019 + T020 + T021 are distinct artifacts — parallel-safe (different files, no compile coupling).
- Phase 8: T032 + T033 are separate trees (`README.md` vs `docs/manual/**`) — parallel-safe.

### Parallel Team Strategy (if orchestrated)

| Wave | Owner | Tasks | Rationale |
|---|---|---|---|
| Wave A (post-Foundation) | Dev A | Phase 3 (T011..T015) | Console client is self-contained. |
| Wave A | Dev B | Phase 4 (T016..T018) | Fixtures are console-tests tree. |
| Wave A | Dev C | Phase 5 (T019..T024) | Dockerfile/compose are repo-root; no file conflict with src/. |
| Wave B | Dev D | Phase 6 (T025..T027) after T021 | Env passthrough needs compose. |
| Wave B | Dev A | Phase 7 (T028..T031) after T019..T021 | Publish workflow needs Dockerfile. |
| Final | Orchestrator | Phase 8 (T032..T035) | Docs synthesize all code ships. |

---

## Parallel Example: Phase 5

```bash
# Three writers, no merge conflict (disjoint files):
Task T019: Dockerfile at repo root
Task T020: .dockerignore at repo root
Task T021: docker-compose.yml at repo root
# All three can land in the same commit or three parallel branches rebased onto Foundational.
```

---

## Implementation Strategy

### Incremental delivery (single dev)

1. Setup + Foundational → single-port host at source level.
2. Add Phase 3 (client fallback) → `http://host:HOST_PORT/` without `?ws=` works on native `pnpm host`.
3. Add Phase 4 (fixtures) → E2E green on single port proves nothing broke.
4. Add Phase 5 (Docker artifacts) → `docker compose up` green (Q-D01 5/5).
5. Add Phase 6 (env passthrough completeness) → Q-D04 green.
6. Add Phase 7 (GHCR workflow) → Q-D06 inspectably green.
7. Docs polish (Phase 8) → targets the final README/deploy topology text once.

### Notes

- [P] = safe to run in parallel with the current phase's other [P] items (different files, no dependency).
- [Story] = traceability to spec user story for reviewer cross-check (US1 Fresh-Clone, US2 Canonical Deployment, US3 Configurable, US4 Published Image, US5 Docs).
- Each code task MUST be prefaced by the companion "write failing tests first" task where noted; tests are NOT deferred to Polish — constitution III is a merge gate.
- Commit after each logical group; never batch unrelated phases into one commit (reviewability).
- Stop at any checkpoint to validate that story independently before moving to the next priority.
