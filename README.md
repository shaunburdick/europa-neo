# Europa Neo

A modern, open-source, self-hostable reimplementation of **Europa** — the groundbreaking 1990s Java applet game of real-time nanobot warfare on Jupiter's icy moon.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Current release: **v0.1.0**

## What is this?

In the late 1990s, [Europa](https://web.archive.org/web/1999*/games.dangerous-minds.net) let two players wage real-time war across the surface of Europa from their browsers — years before "browser game" meant anything. Players commanded colonies of self-replicating nanobots: cities produced troops, pipes directed their flow across a hostile landscape, and paratroopers and artillery broke stalemates. Fog of war meant you only ever saw what your nanobots could sense.

**Europa Neo** rebuilds that experience for the modern web:

- **TypeScript everywhere** — Node.js server, browser client
- **Server-authoritative deterministic simulation** — replayable, testable, fair
- **Real-time multiplayer over WebSockets** — discoverable public matches in a lobby
- **Faithful core loop, modernized UX** — cities, pipes, fog of war, paratroopers, guns; none of the 1990s friction
- **Self-hostable** — run your own server for your friends

## Game concept (the 60-second version)

You land on Europa with a handful of nanobot production facilities (**cities**). Cities produce troops until saturated. You direct troops between cells with **pipes** — downhill flows fast, uphill is slow. Cut off from supply, troops **decay**. Where opposing flows meet, nanobots fight to mutual attrition — bigger forces win. **Paratroopers** (2 spent per 1 landed) hop gaps and sever enemy pipes; **guns** shell anything in range, friend or foe. You see only what your troops sense — no radar memory, no cheating. Last commander standing wins.

## Project status

**v1 implementation complete.** The project follows [spec-driven development](https://github.com/github/spec-kit) via spec-kit: all features are specified, planned, implemented, integrated, and reviewed.

| Feature                                  | Package                                    | Status          |
| ---------------------------------------- | ------------------------------------------ | --------------- |
| 001 core game engine                     | `@europa/engine`                           | ✅ Implemented |
| 002 fog of war & visibility              | `@europa/fog`                              | ✅ Implemented |
| 003 procedural terrain generation        | `@europa/terrain`                          | ✅ Implemented |
| 004 multiplayer networking               | `@europa/networking`                       | ✅ Implemented |
| 005 client console                       | `@europa/console`                          | ✅ Implemented |
| 006 match lifecycle & matchmaking        | `@europa/matchmaking`                      | ✅ Implemented |
| 010 public lobby & match browser         | `@europa/matchmaking`/`@europa/networking`/`@europa/console` | ✅ Implemented |

An integration wave proved the full production path end-to-end: console UI ⇄ browser WebSocket client ⇄ match server ⇄ matchmaking-bound engine + terrain + fog, with two seats playing through the real wire protocol.

Across the monorepo: **more than 1,200 automated tests** (the exact count varies by selected package/configuration), six per-package CI workflows, and ≥80% coverage gates on every metric in every package.

Feature specifications live in `specs/`; the governing principles are in `.specify/memory/constitution.md`.

## Repository layout

```
europa-source/          Trimmed documentation subset of the original game site (reference material)
  └── games.dangerous-minds.net/Europa/html/Europa/
      ├── rules.html    Original mechanics (authoritative gameplay reference)
      ├── controls.html Original control scheme
      └── …             Strategy, rating system, background docs + images
.specify/               Spec-kit tooling: constitution, feature specs, templates, scripts
packages/               pnpm workspace — all first-party code
  ├── engine/           @europa/engine      Deterministic tick simulation: cities, pipes, combat, decay, paratroopers, guns, victory
  ├── terrain/          @europa/terrain     Seed-reproducible, point-symmetric procedural map generation
  ├── fog/              @europa/fog         Per-player sensor horizons with strict no-memory redaction
  ├── networking/       @europa/networking  Authoritative WebSocket protocol, tick scheduling, reconnection, spectating
  ├── matchmaking/      @europa/matchmaking Sessions, public/private matches, lobby, rematch, forfeit policy
  └── console/          @europa/console     React satellite-view client console (renderer + original control scheme + QoL)
```

## Development

This project is developed agent-first but human-governed: AI agents do the heavy lifting under a constitution (`AGENTS.md` at the repo root defines the working rules). Humans review at every phase gate.

pnpm 11 workspace on Node ≥ 22 (the adopted Biome configuration requires Node 22):

```bash
pnpm install --frozen-lockfile
pnpm build        # all six packages in dependency order:
                  #   engine → terrain → fog → networking → matchmaking → console (vite bundle)
pnpm test         # every package's suite
```

Workspace-wide `lint`, `typecheck`, and `coverage` scripts exist too; any single package can be driven directly, e.g.:

```bash
pnpm --filter @europa/engine test
pnpm --filter @europa/console coverage
```

### Lint and formatting

The repository adopts the published [`biome-config-shaunburdick`](https://www.npmjs.com/package/biome-config-shaunburdick)
configuration through the root `biome.jsonc`; package configs inherit it. Run
`pnpm lint` for the lint baseline and `pnpm format:check` to check the adopted
four-space/120-column repository style. Bulk autofixes are intentionally not
used for the migration. See
[`.specify/biome-migration.md`](.specify/biome-migration.md) for the policy,
package order, and exit criteria.

Console extras:

- The Playwright E2E suites need Chromium once: from `packages/console`, run `pnpm exec playwright install chromium`.
- The production bundle carries a gzip budget (~80 KB observed against a hard 150 KB limit), enforced by the self-host check: `pnpm --filter @europa/console test:selfhost`.

## Player manual

New to the game? The [player manual](https://shaunburdick.github.io/europa-neo/)
teaches everything: getting into a match, the objective, mechanics with the real
numbers, and a complete controls reference. It is plain Markdown in-repo at
[`docs/manual/index.md`](docs/manual/index.md) — readable on the published site
or straight from a checkout.

Fork owners: publishing uses GitHub Actions; enable it once via
Settings → Pages → Source = "GitHub Actions" (see
`.github/workflows/pages-deploy.yml`).

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm host
```

`pnpm host` starts a single `http.Server` on `HOST_PORT` (default `8080`) serving
both the console UI and the WebSocket match server on the same origin
(`http://localhost:8080/` + `ws://localhost:8080`, FR-017: one `http.Server`,
one `EXPOSE`, one port mapping, same-origin WS). The default is an empty
public lobby at `/`: choose a guest handle, create a game, or browse and
join/spectate an available public match. It does not create a match at startup.
Use `pnpm host --create` for the explicit two-seat quick flow. The console also
has a deterministic stub board when opened without a server, for renderer work
only.

The host is loopback-safe by default. For a local-area network match, bind
explicitly and advertise the address players can reach:

```bash
HOST_BIND_HOST=0.0.0.0 HOST_PUBLIC_HOST=192.168.1.20 pnpm host
```

The equivalent flags are `--bind-host HOST` and `--public-host HOST` (port
remains configurable with `--port` / `HOST_PORT`). A wildcard bind requires
an explicit public host. Direct internet
exposure is not supported: a public deployment still needs a TLS-terminating
reverse proxy, rate limiting, and origin controls.

### Docker quick start (single port)

No Node toolchain required — just Docker Engine + Compose v2. From a fresh
clone:

```bash
docker compose up --build   # first run builds the image; later `docker compose up` suffices
# lobby at http://localhost:8080/  — single http.Server on HOST_PORT: static UI + /version + WS
```

One firewall/ingress rule is enough: the container exposes a single port
(`EXPOSE 8080`, mapped as `${HOST_PORT:-8080}:${HOST_PORT:-8080}`) and the
browser connects same-origin with no `?ws=` override needed.

| Env var | Default | Purpose |
|---|---|---|
| `HOST_PORT` | `8080` | Single `http.Server` port for HTTP + WebSocket (one knob controls both). |
| `HOST_BIND_HOST` | `0.0.0.0` (compose) / `127.0.0.1` (native) | Interface to bind. Compose defaults wide because Docker's `ports:` is the ingress. |
| `HOST_PUBLIC_HOST` | `localhost` (when loopback) else `bindHost` | Advertised host for banner and join URLs. Required when `HOST_BIND_HOST` is wildcard. |

Examples:

```bash
HOST_PORT=9090 docker compose up --build          # HTTP+WS on 9090
HOST_PUBLIC_HOST=example.com docker compose up    # advertise example.com behind a reverse proxy
```

`docker compose down` resets the
in-memory lobby and matches; restarting gives a fresh lobby.

Published images (no local build): `ghcr.io/shaunburdick/europa-neo:edge`
(`main`) and `ghcr.io/shaunburdick/europa-neo:vX.Y.Z` (release tags) are
built by CI and pullable with `docker compose pull`.

### Lobby, identity, and recovery

The lobby gives each browser an ephemeral guest identity and asks for a
user-facing handle. Handles are trimmed for comparison, unique among active
sessions case-insensitively, and limited to 1–24 Unicode code points after
trimming with at least one non-whitespace character. Accepted handles contain
no control characters, no bidirectional formatting controls, and no unpaired
surrogates; well-formed emoji counts as one code point. Accepted casing is
shown in the lobby and on occupied match seats; handles can be renamed while
the identity remains active and the server propagates the new label into
future match, seat, waiting view, order attribution, and participant labels
without changing the underlying identity association. Handles are overlaid at
the networking boundary and do not mutate engine simulation state. This
is not an account system: browser storage and the server process hold the
state in memory only. Clearing browser storage or restarting the host starts a
fresh identity, handle set, lobby, and match set.

The server is authoritative for identity-to-seat association. Client input
cannot choose another player's seat or attribute orders to another player.
Player views remain fog-filtered; spectators receive full-visibility,
read-only views and have no seat or order permissions. The lobby distinguishes
**Loading public matches…** from **No public matches right now — create one
to get started**, and public waiting matches offer **Join** while running
matches offer **Spectate**; collected matches are not history.

Temporary disconnects use the existing reconnect grace window. A valid
reconnect credential within that window restores the original seat, handle,
view, and order authority. Expired, unknown, or mismatched credentials do not
reassign a connection. The opaque guest identifier is delivered only in the
directed identity event to its owner; public listings, other connections,
URLs, views, and logs remain free of it. Host diagnostics deliberately omit
bearer credentials and opaque identity identifiers.

`GET /version` on the single-port origin returns application and protocol versions:

```bash
curl http://localhost:8080/version
```

The normal lobby derives its WebSocket endpoint from the page host. For a
different port or test harness, `?ws=` may override it, but only a same-host
WebSocket URL is accepted; URLs with embedded credentials or another hostname
are rejected. The direct `?live&ws=&match=&name=` route remains available for
development and test integrations. Normal host output uses the lobby and does
not place identity or credential material in the URL.

## Credits & licensing

- The original **Europa** was created by **Alex Nicolaou** and **Jay Steele** (University of Waterloo, ~1999), whose design this project celebrates. The archived source in `europa-source/` remains © Alex Nicolaou under the SOS Simple Open Source License v1.03 — it is included unmodified as reference material.
- Europa Neo's new code is an independent reimplementation from documented behavior, not a derivative of the original Java code. It is released under the [MIT License](LICENSE), while `europa-source/` remains © Alex Nicolaou under the SOS Simple Open Source License v1.03 as unmodified reference material.
