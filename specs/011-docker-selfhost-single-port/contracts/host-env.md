# Contract: Host Env & Single-Port Client Fallback

**Artifacts**: `packages/console/scripts/host.ts`, `packages/console/scripts/host-config.ts`, `packages/console/src/state/lobby-view.ts`, `packages/console/src/internal/live-runtime.tsx`  
**Applicable FR**: FR-004..FR-008  
**Spec**: [../spec.md](../spec.md)

## Host env contract (single-port canonical)

### Canonical port/host vars

| Var / flag | Default | Valid values | Behavior |
|---|---|---|---|
| `HOST_PORT` / `--port N` | `8080` | `1..65535` integer | Single `http.Server` listen port serving HTTP + WS upgrades. One knob controls both surfaces. |
| `HOST_BIND_HOST` / `--bind-host HOST` | `127.0.0.1` (native host) / `0.0.0.0` (compose default) | Valid host string, wildcard `0.0.0.0`/`::`/`[::]` | Interface the single `http.Server` binds. Compose wide default is `0.0.0.0` since Docker's `ports:` is the ingress. |
| `HOST_PUBLIC_HOST` / `--public-host HOST` | `localhost` (when `bindHost` is `127.0.0.1`) else `bindHost` | Valid host string | Operator-advertised host for banner/join URLs. Required assertion: `isWildcardHost(bindHost) && !publicHost` → fail with actionable error. |

### Removed vars/flags — hard error (FR-004)

Any of the following MUST produce a non-zero exit and an actionable error message naming the removed option, BEFORE opening any listener:

| Removed surface | Error text MUST contain |
|---|---|
| Env `HOST_STATIC_PORT` (set) | `no longer supported` + `--port`/`HOST_PORT` hint + spec link clause | 
| CLI `--static-port N` (flag or `--static-port=N`) | `no longer supported` + `HOST_PORT`/`--port` hint |

Silent ignore or fallback to second port is a review failure.

### Stdout / banner contract

The host banner MUST show a single port for both HTTP and WS, e.g.:

```
Version      : v0.1.0
Mode         : lobby (visitors create/join matches in the browser)
Match server : ws://localhost:8080
Console UI   : http://localhost:8080
→ http://localhost:8080/
```

(`https://` → `wss://` symmetry when `publicHost` terminates TLS downstream.)

`--create` mode's join URLs MUST carry the same origin:

```
Player 1 → http://localhost:8080/match/<matchId>/join
```

Log plumbing (`onSeatClaimed`, `onMatchTerminal`) is unchanged; no extra port is mentioned.

### Validation contract (existing `resolveConfig` semantics collapsed)

```
parsePort(raw): number|null|never  // empty→null (keep default 8080), invalid→ actionable non-zero
requireWildcardAdvertisement(bindHost, publicHost): void  // wildcard without public → actionable non-zero
unknown flag → actionable non-zero ("supported: --create, --port, --bind-host, --public-host")
```

## Client same-origin fallback contract (FR-006..FR-008)

### Fallback string (MUST be byte-identical to spec's wording)

```ts
// When ?ws= is ABSENT and the page is served from the same http.Server on HOST_PORT:
const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
```

- `location.protocol === 'https:'` → `wss://`, else `ws://`.
- `location.host` carries `hostname:port` as the browser sees it — exactly `host:HOST_PORT`.
- Applies to the canonical lobby and semantic match paths (`packages/console/src/state/lobby-view.ts:resolveLobbyServerUrl`). The retired query-selected live entry is not a production or compatibility path. Explicit `?ws=` remains available only as a validated test/operator override, and `?e2e` remains the separate test-only harness.
- Explicit `?ws=` override still consulted FIRST: when present and non-empty, `validateLobbyServerUrl(override, locator)` is called (scheme-normalizes `http→ws`, `https→wss`, bare `host:port` → `ws://host:port`), enforcing same-host alias (`localhost↔127.0.0.1`) + no-credentials + well-formed. Fallback runs ONLY when `?ws=` absent/empty.

### `LOBBY_DEFAULT_SERVER_PORT` role

```ts
// lobby-view.ts
export const LOBBY_DEFAULT_SERVER_PORT = 8080;
```

Semantics post-011: "THE default `HOST_PORT` (8080) — fallback only for non-browser/test contexts where `location.host === ''` (`file://`, unit test without `PageLocator.host`)". It is NOT a second listener. JSDoc MUST say so. Value stays `8080` (aliases `HOST_PORT` default).

### Fixture seam (FR-009)

`tests/e2e/full-stack.spec.ts:buildStack()` and `tests/integration/lobby-transport.test.ts:bootLobbyStack()` MUST build one `http.Server` at `port: 0` + `ServerDeps.httpServer` attachment and expose the bound port via `__boundPortForTest()`. No second `http.Server`. Verification: `ss -tlnp` / `server.address()` shows exactly one port; `curl http://127.0.0.1:$PORT/` and WS handshake to `ws://127.0.0.1:$PORT` both succeed against that port; `curl http://127.0.0.1:${other}` fails.

## Negatives (what this contract does NOT allow)

- No two-port mode anywhere (Docker or native). Any docs mentioning `--static-port`/`HOST_STATIC_PORT`/`:5173` outside a "removed" changelog line is a drift failure.
- No hardcoded non-same-origin WebSocket fallback as primary path (spec FR-008). New shipped consoles MUST derive WS URL from `location.host` at runtime.
- No change to `NETWORK_API_VERSION`, envelope, or order semantics.
