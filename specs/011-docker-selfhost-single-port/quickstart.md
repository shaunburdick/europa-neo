# Quickstart: One-Command Self-Host Packaging (Docker) — Single-Port Deployment

**Branch**: `issue-5-docker-support` | **Spec**: [spec.md](./spec.md) v1.0 + Node 24 gate | **Plan**: [plan.md](./plan.md)

All commands assume a fresh clone on a host with Docker Engine + Compose v2 (and with no Node toolchain for Q-D01). Every Q-D step maps to a spec success criterion.

---

## Prerequisites

- Docker Engine + `docker compose` v2 (`docker compose version` prints `v2.*`)
- No Node/pnpm required for containerized runs

## Q-D01 — One-command lobby (fresh-clone, no Node) → SC-001

```bash
git clone https://github.com/shaunburdick/europa-neo /tmp/europa-fresh && cd /tmp/europa-fresh
docker compose up --build
# Expect: banner showing "Match server : ws://localhost:8080" and "Console UI : http://localhost:8080"
# Open http://localhost:8080/ in TWO browser profiles → lobby loads → create a public 2P match in profile 1 → join in profile 2 → both reach 'live' → first ticks flow → order acks return (setReserves on own city → "success" feedback)
# Stop: docker compose down  (resets in-memory lobby/matches; restart gives a fresh lobby — spec US1 AC3)
```

Validates: FR-001/010/011, SC-001 (5/5 composed), NFR-001 (lobby reachable within seconds on cached image).

## Q-D02 — Single-server proof → SC-002

Native (no Docker):

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm host &
sleep 2
ss -tlnp | grep -c :8080   # expect exactly 1 listener row
curl -s http://localhost:8080/ | head      # 200 + index.html
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:8080/  # 101 or ws handshake through same port
curl -s http://localhost:5173/ && echo "ERROR: second port still up" || echo "ok: no second listener"
kill %1
```

Containerized:

```bash
docker compose up --build -d && sleep 3
docker port $(docker compose ps -q europa) | grep -c :8080  # exactly 1 mapping
curl -s http://localhost:8080/ | head
curl -s http://localhost:8080/version | jq .  # 200 + {appVersion, protocolVersion}
docker compose down
```

Validates: FR-001/002/003 (same http.Server path), SC-002 (one listener), NFR-004 (traversal guard + security headers still on the single surface).

## Q-D03 — Same-origin without `?ws=` override → SC-003

```bash
pnpm build && pnpm host --port 8080 &
# Open http://localhost:8080/ with NO ?ws= parameter in 10 fresh profile loads
# Expect: lobby WebSocket connects automatically; DevTools → Network → WS URL is ws://localhost:8080 (matching page host)
# For HTTPS check: tunnel the same server behind a TLS reverse proxy and confirm wss:// is derived from location.protocol
#
# Unit coverage:
pnpm --filter @europa/console test -- src/state/lobby-view.test.ts -t "same-origin"
```

Validates: FR-006/007/008, SC-003 (10/10 connects on same-origin fallback), including `https:` → `wss` mapping.

## Q-D04 — Env-var contract + removed-flag hard error → SC-004

```bash
# Each override rewrites BOTH HTTP and WS together:
HOST_PORT=9090 pnpm host &  curl -s http://localhost:9090/version | jq .appVersion ; kill %1
HOST_BIND_HOST=0.0.0.0 HOST_PUBLIC_HOST=192.168.1.99 pnpm host & # banner shows ws://192.168.1.99:8080 ; kill %1

# Malformed:
HOST_PORT=bad pnpm host 2>&1 | grep -q HOST_PORT  # actionable error, non-zero exit
HOST_BIND_HOST=0.0.0.0 pnpm host 2>&1 | grep -q public-host  # missing publicHost → actionable

# REMOVED surfaces:
HOST_STATIC_PORT=5173 pnpm host 2>&1 | grep -q "no longer supported" && echo "correct: hard error"
pnpm host --static-port 5173 2>&1 | grep -q "no longer supported" && echo "correct: hard error"

# Compose mirrors:
HOST_PORT=9090 docker compose up -d && curl -s http://localhost:9090/version | jq . && docker compose down
HOST_STATIC_PORT=5173 docker compose up 2>&1 | grep -q "no longer supported" || echo "compose must reject HOST_STATIC_PORT"
```

Validates: FR-004/005/013, SC-004 (each env behaves per FR-005; removed flag is a hard error with actionable text).

## Q-D05 — Image satisfies self-hostable checklist → SC-005

```bash
docker build -t europa:test .
docker run --rm -p 8080:8080 -d --name europa-check europa:test && sleep 3
curl -s http://localhost:8080/version | jq .  # { appVersion: "0.1.0", protocolVersion: "…" } ; appVersion == APP_VERSION
# Scripted ws handshake against same container: helloAck.appVersion == APP_VERSION
docker logs europa-check | grep -q "v0.1.0"  # boot line logs appVersion
docker stop europa-check && docker rm europa-check

# Published image (post-publish workflow run):
docker pull ghcr.io/shaunburdick/europa-neo:edge && docker run --rm -p 8081:8080 ghcr.io/shaunburdick/europa-neo:edge &
sleep 3 && curl -s http://localhost:8081/version | jq .  # same checks as locally-built
kill %1 2>/dev/null; docker rm -f europa-check 2>/dev/null
```

Validates: FR-014 published artifact behaves identically to local build; feature 009 SC-002/003 over the containerized server.

## Q-D06 — GHCR publish wiring → SC-006

```bash
# Push to main with a Dockerfile-touching change → :edge
git push origin issue-5-docker-support  # merge to main triggers docker.yml
gh run watch $(gh run list --workflow docker.yml --json databaseId --jq '.[0].databaseId') --exit-status
# Expect: SHA-pinned actions in log, least-privilege permissions in workflow header, ghcr login with GITHUB_TOKEN, tag :edge pushed.

# Push v* tag (via release automation or manual tag):
git tag v0.1.0 && git push origin v0.1.0
gh run watch $(gh run list --workflow docker.yml --json databaseId --jq '.[0].databaseId') --exit-status
# Expect: versioned ghcr.io/shaunburdick/europa-neo:0.1.0 (+ :v0.1.0 mirror via metadata-action) pushed.
# Pullable check:
docker pull ghcr.io/shaunburdick/europa-neo:0.1.0 && docker pull ghcr.io/shaunburdick/europa-neo:edge
docker run --rm ghcr.io/shaunburdick/europa-neo:edge cat /etc/os-release | grep PRETTY_NAME  # sanity

# Permissions/fork check in workflow file:
grep -q "packages: write" .github/workflows/docker.yml && echo "least-privilege ok"
grep -q "if:.*github.repository" .github/workflows/docker.yml && echo "fork guard ok"
grep -E "uses:.*@[^#]+# v" .github/workflows/docker.yml && echo "SHA-pinned with version comments"
```

Validates: FR-014 (triggers, image name, GHCR auth, SHA-pin, least-privilege, platform policy), SC-006.

## Q-D07 — Fixtures green on single-port → SC-007

```bash
# Unit + integration (single-server fixtures, port:0 ephemeral)
pnpm --filter @europa/console test -- src/state/lobby-view.test.ts src/internal/live-runtime.test.ts
pnpm --filter @europa/console test -- tests/integration/lobby-transport.test.ts
pnpm --filter @europa/networking test

# E2E (requires built console + Chromium)
pnpm build
pnpm --filter @europa/console exec playwright install --with-deps chromium 2>/dev/null || pnpm --filter @europa/console exec playwright install chromium
pnpm --filter @europa/console test:e2e -- tests/e2e/full-stack.spec.ts
# Expect: two consoles drive one live match end-to-end (fog-filtered ticks + order ack + horizon divergence) over a single http.Server port:0 fixture.
```

Validates: FR-009 (single-server fixtures), NFR-005 (no protocol change, deterministic ticks, fog redaction intact), SC-007.

## Q-D08 — Image size & reproducibility bound → SC-008

```bash
docker build -t europa:size-check .
docker images europa:size-check --format '{{.Repository}}:{{.Tag}} {{.Size}}'  # record compressed size; well under 1 GB (expect 180–420 MB uncompressed on amd64)
docker run --rm europa:size-check node -e "console.log(JSON.stringify(require('./packages/version/src/app-version').APP_VERSION))" # APP_VERSION ping

# Rebuild determinism:
docker build -t europa:size-check2 . && docker run --rm europa:size-check sha256sum /app/packages/console/dist/index.html | head
# Compare dist payload hash between two builds from same commit — MUST match.
```

Validates: NFR-002 (runtime stage minimal — no devDeps/source/tests), NFR-003 (byte-equivalent `dist/` + `/version` on rebuild), SC-008 (size recorded and under stated bound).

## Other gates (run before every commit)

```bash
pnpm typecheck                          # strict TS across all packages
pnpm lint                               # biome lint — zero suppressions
pnpm format:check                       # biome format — four-space/120-col
pnpm --filter @europa/version version:check  # drift check (APP_VERSION lockstep) still independent of Docker
docker compose config -q                # compose spec must be valid
docker build -t europa:lint-check .     # Dockerfile syntax gate
```

## SC → Q-D trace

| SC | Q-D | What is probed |
|---|---|---|
| SC-001 one-command lobby | Q-D01 | Fresh-clone `docker compose up --build` → lobby + two-seat ticks/orders (same-origin WS). |
| SC-002 single server proof | Q-D02 | Netstat/`docker port` + `curl` + WS upgrade on one port; second port absent. |
| SC-003 same-origin no `?ws=` | Q-D03 | 10/10 page loads with absent `?ws=` resolve to `ws(s)://host:HOST_PORT` automatically (`https:`→`wss`). |
| SC-004 env contract | Q-D04 | `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` override single port/host; `HOST_STATIC_PORT`/`--static-port` is a hard error. |
| SC-005 image satisfies checklist | Q-D05 | Container `GET /version` == `APP_VERSION` && ws `helloAck.appVersion` == same; log identity. |
| SC-006 GHCR publish green | Q-D06 | `main` → `:edge` + `v*` → versioned; pullable; SHA-pinned + least-privilege + platform policy verified. |
| SC-007 fixtures single-port | Q-D07 | `buildStack()` + `bootLobbyStack()` port:0 single-server fixtures green incl. deterministic ticks/fog. |
| SC-008 size & reproducibility | Q-D08 | `docker images` compressed size recorded < bound; rebuild yields identical `/version`+`dist/` payload hash. |
