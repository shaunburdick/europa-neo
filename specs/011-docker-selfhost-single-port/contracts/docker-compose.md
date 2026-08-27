# Contract: Compose Project (`docker-compose.yml`)

**Artifact**: `docker-compose.yml` at repo root  
**Applicable FR**: FR-011, FR-013 (compose facets)  
**Spec**: [../spec.md](../spec.md)

## Topology contract (normative)

The compose file declares a single service with a single port mapping onto the single `http.Server`'s `HOST_PORT`. The browser sees one origin for both HTTP and WebSocket.

```yaml
# Single-port topology: one http.Server on HOST_PORT serving static UI + /version + WS upgrades.
# Override at runtime via HOST_PORT / HOST_BIND_HOST / HOST_PUBLIC_HOST (no HOST_STATIC_PORT).
services:
  europa:
    build: .
    image: ghcr.io/shaunburdick/europa-neo
    ports:
      - "${HOST_PORT:-8080}:${HOST_PORT:-8080}"
    environment:
      HOST_PORT: ${HOST_PORT:-8080}
      HOST_BIND_HOST: ${HOST_BIND_HOST:-0.0.0.0}
      HOST_PUBLIC_HOST: ${HOST_PUBLIC_HOST:-}
    expose:
      - "${HOST_PORT:-8080}"
```

Where `image:` is optional for local builds; the publish workflow populates GHCR tags remotely.

## Field contract

| Field | Value | Constraint |
|---|---|---|
| `build` | `.` | Must point at repo-root `Dockerfile`. |
| `ports` | `"${HOST_PORT:-8080}:${HOST_PORT:-8080}"` | Exactly ONE mapping interpolating `HOST_PORT`. No `5173`, no `HOST_STATIC_PORT`. Compose v2 spec. |
| `environment.HOST_PORT` | `"${HOST_PORT:-8080}"` | Single env controls both surfaces. Default `8080`. |
| `environment.HOST_BIND_HOST` | `"${HOST_BIND_HOST:-0.0.0.0}"` | Compose default is wide (`0.0.0.0`) because Docker's networking is the ingress; native `pnpm host` default remains `127.0.0.1`. |
| `environment.HOST_PUBLIC_HOST` | `"${HOST_PUBLIC_HOST:-}"` | Passthrough only when LAN/reverse-proxy needs distinct advertisement; blank means host uses default derivation (loopback → `localhost`). |
| `expose` | `"${HOST_PORT:-8080}"` | Single exposed port (informational; Compose ignores it for host mapping). |
| `HOST_STATIC_PORT` | absent | MUST NOT appear anywhere in `docker-compose.yml` (FR-013/FR-004). Review failure if present. |

## One-command guarantee (SC-001 entry point)

From a fresh clone without Node installed:

```bash
docker compose up --build   # first run (builds node:24-slim image)
docker compose up            # subsequent runs (reuse cached image)
# Lobby at http://localhost:8080/  — no pnpm steps
```

Subsequent lines of the contract doc or README MUST state `docker compose down` suffices to reset in-memory lifecycle (matches/lobby/identities).

## Validation

```bash
docker compose config -q            # MUST exit 0; validates spec syntax + var interpolation
docker compose build                 # MUST succeed; respects Dockerfile contract above
docker compose port europa 8080      # inside running project: maps host:8080 → container:8080
curl -s http://localhost:${HOST_PORT:-8080}/ | grep -q lobby  # HTTP reachable on same port as WS
```

## Comments

The file MUST carry a header comment stating the single-port topology explicitly (one `http.Server`, one `EXPOSE`, one port mapping, same-origin WS, and the env vars that control it — FR-017).
