# Europa Neo

A modern, open-source, self-hostable reimplementation of **Europa** — the groundbreaking 1990s Java applet game of real-time nanobot warfare on Jupiter's icy moon.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this?

In the late 1990s, [Europa](https://web.archive.org/web/1999*/games.dangerous-minds.net) let two players wage real-time war across the surface of Europa from their browsers — years before "browser game" meant anything. Players commanded colonies of self-replicating nanobots: cities produced troops, pipes directed their flow across a hostile landscape, and paratroopers and artillery broke stalemates. Fog of war meant you only ever saw what your nanobots could sense.

**Europa Neo** rebuilds that experience for the modern web:

- **TypeScript everywhere** — Node.js server, browser client
- **Server-authoritative deterministic simulation** — replayable, testable, fair
- **Real-time multiplayer over WebSockets** — public matches in a lobby, private matches via shareable links
- **Faithful core loop, modernized UX** — cities, pipes, fog of war, paratroopers, guns; none of the 1990s friction
- **Self-hostable** — run your own server for your friends

## Game concept (the 60-second version)

You land on Europa with a handful of nanobot production facilities (**cities**). Cities produce troops until saturated. You direct troops between cells with **pipes** — downhill flows fast, uphill is slow. Cut off from supply, troops **decay**. Where opposing flows meet, nanobots fight to mutual attrition — bigger forces win. **Paratroopers** (2 spent per 1 landed) hop gaps and sever enemy pipes; **guns** shell anything in range, friend or foe. You see only what your troops sense — no radar memory, no cheating. Last commander standing wins.

## Project status

**v1 implementation complete.** The project follows [spec-driven development](https://github.com/github/spec-kit) via spec-kit: all six features are specified, planned, implemented, integrated, and reviewed.

| Feature                                  | Package               | Status          |
| ---------------------------------------- | --------------------- | --------------- |
| 001 core game engine                     | `@europa/engine`      | ✅ Implemented |
| 002 fog of war & visibility              | `@europa/fog`         | ✅ Implemented |
| 003 procedural terrain generation        | `@europa/terrain`     | ✅ Implemented |
| 004 multiplayer networking               | `@europa/networking`  | ✅ Implemented |
| 005 client console                       | `@europa/console`     | ✅ Implemented |
| 006 match lifecycle & matchmaking        | `@europa/matchmaking` | ✅ Implemented |

An integration wave proved the full production path end-to-end: console UI ⇄ browser WebSocket client ⇄ match server ⇄ matchmaking-bound engine + terrain + fog, with two seats playing through the real wire protocol.

Across the monorepo: **1,283 tests**, six per-package CI workflows, and ≥80% coverage gates on every metric in every package.

Feature specifications live in `.specify/features/`; the governing principles are in `.specify/memory/constitution.md`.

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

pnpm 11 workspace on Node ≥ 20:

```bash
pnpm install
pnpm build        # all six packages in dependency order:
                  #   engine → terrain → fog → networking → matchmaking → console (vite bundle)
pnpm test         # every package's suite
```

Workspace-wide `lint`, `typecheck`, and `coverage` scripts exist too; any single package can be driven directly, e.g.:

```bash
pnpm --filter @europa/engine test
pnpm --filter @europa/console coverage
```

Console extras:

- The Playwright E2E suites need Chromium once: from `packages/console`, run `pnpm exec playwright install chromium`.
- The production bundle carries a gzip budget (~80 KB observed against a hard 150 KB limit), enforced by the self-host check: `pnpm --filter @europa/console test:selfhost`.

## Quick start

The minimal path today is developer-grade — there is no packaged binary yet:

```bash
pnpm install
pnpm build
pnpm --filter @europa/console dev    # vite dev server on :5173
```

Opened bare, the console boots a deterministic stub board — no server needed, enough to see the renderer and drive the controls. To play a real match, run a local match server wired to engine + terrain + fog + matchmaking and open the console's `?live` runtime (`?ws`, `?match`, `?name`, optional `?token`). The full host-wiring recipe lives in [`packages/console/README.md`](packages/console/README.md) and is exercised end-to-end by `packages/console/tests/e2e/full-stack.spec.ts`.

## Credits & licensing

- The original **Europa** was created by **Alex Nicolaou** and **Jay Steele** (University of Waterloo, ~1999), whose design this project celebrates. The archived source in `europa-source/` remains © Alex Nicolaou under the SOS Simple Open Source License v1.03 — it is included unmodified as reference material.
- Europa Neo's new code is an independent reimplementation from documented behavior, not a derivative of the original Java code. It is released under the [MIT License](LICENSE), while `europa-source/` remains © Alex Nicolaou under the SOS Simple Open Source License v1.03 as unmodified reference material.
