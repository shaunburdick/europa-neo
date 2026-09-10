# Architecture and development workflow

Snapshot: 2026-09-09, commit `90a9b4c`. [Notes index](README.md).

## Package map

Paths below are relative to the repository root. Manifests and source were
inspected; this is a responsibility map rather than an exhaustive import graph.

| Package | Responsibility | Useful entry points |
| --- | --- | --- |
| `@europa/core` | Shared game types, seeded PRNG, flow formula, engine constants | `packages/core/src/index.ts`, `types.ts`, `flow-rate.ts` |
| `@europa/engine` | Pure world updates, order validation, resolution, terminal state, replay | `packages/engine/src/tick.ts`, `resolution/`, `replay/` |
| `@europa/terrain` | Seeded symmetric map generation, smoothing, city placement, validation | `packages/terrain/src/generate.ts`, `validate.ts`, `settings.ts` |
| `@europa/fog` | Visible-cell sets, redacted player views and events, spectator views | `packages/fog/src/visibleSet.ts`, `playerView.ts`, `eventsFilter.ts` |
| `@europa/networking` | JSON WebSocket protocol, scheduling, orders, snapshots/deltas, reconnect | `packages/networking/src/server.ts`, `broadcast.ts`, `reconnect.ts`, `browser.ts` |
| `@europa/matchmaking` | Sessions, lobby, match lifecycle, seat assignment, rematch/forfeit | `packages/matchmaking/src/matchmaker.ts`, `matchLifecycle.ts`, `engineSession.ts`, `lobby.ts` |
| `@europa/console` | Browser application, input/render/state pipeline, host composition | `packages/console/src/main.tsx`, `routing/route-tree.tsx`, `scripts/host.ts` |
| `@europa/design` | Tokens, React primitives, generated CSS and brand assets | `packages/design/src/tokens.ts`, `components/`, `package.json` |
| `@europa/logging` | Structured server logging and text sanitization | `packages/logging/src/index.ts`, `logger.ts` |
| `@europa/version` | Application release constant and drift checks | `packages/version/src/app-version.ts` |
| `@europa/manual` | Astro/MDX player documentation, published to Pages | `docs/manual/src/pages/`, `docs/manual/package.json` |

`@europa/core` was extracted to break the engine/terrain dependency cycle.
`ENGINE_CONSTANTS` now originates in `packages/core/src/flow-rate.ts`; the engine
re-exports it. Historical references to engine-local constant definitions need
checking. Application version and protocol/API compatibility versions are distinct.

## Runtime path

```text
Browser: React + TanStack Router + Zustand
    | lobby commands / match orders
    v
One HTTP + WebSocket listener (default port 8080)
    | static console assets + /version + WebSocket upgrades
    v
Networking <--> matchmaking / lobby service
    |                    |
    |             fill seats -> terrain -> engine session
    v
Authoritative tick -> per-recipient fog projection -> snapshot/delta -> browser
```

Composition lives in `packages/console/scripts/host.ts`, especially `buildStack`.
It creates the match server, binds the matchmaker through a forwarding bridge,
and lazily creates the lobby service. Matches and lobby state are in memory;
restart recovery is outside the current product contract.

The production browser bootstrap is `packages/console/src/main.tsx`. It creates
the page-lifetime lobby controller and mounts the route tree. Match layout and
route wrappers coordinate admission and the player/spectator connection.

| Route | Purpose |
| --- | --- |
| `/` | Welcome screen |
| `/profile` | Guest-name onboarding and returning-user profile screen |
| `/lobby` | Match creation/listing and player presence |
| `/match/<id>` | Adaptive match entry |
| `/match/<id>/join` | Explicit player entry |
| `/match/<id>/spectate` | Explicit spectator entry |

The `?e2e` demo and `window.__europaTestMatch` direct-match entry are test seams.
They should not be used to infer production routing behavior.

## Simulation boundaries

`packages/engine/src/tick.ts` executes this sequence:

1. Drain staged orders; apply a deterministic player/kind ordering.
2. Produce city troops.
3. Resolve paratroopers, then guns.
4. Transfer troops through pipes.
5. Resolve combat, then city capture.
6. Compute reserve floors and friendly incoming-pipe topology; resolve decay.
7. Detect elimination and terminal results.

The engine returns a new world and events. Fog projection happens before
network delivery. Clients request orders and render authorized views; they do
not own the simulation. Spectator views are unrestricted but read-only.

At this commit, `PlayerId` is still `1 | 2 | 3 | 4` in core. Numeric ownership
also appears in typed arrays and per-player tally indexing, making issue #74 a
cross-package migration rather than a cosmetic type rename.

## Toolchain and commands

The root manifest pins **pnpm 11.22.0** and requires **Node >=22**. Docker uses
a pinned Node 24 slim image. Commands below are documented from manifests and
scripts; they were not executed during this orientation review.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm host
```

Root `build` targets `packages/*` in dependency order. It does not build the
manual workspace. For the manual, build/stage design assets, then build Astro:

```sh
pnpm --filter @europa/design build
pnpm --filter @europa/design stage:manual
pnpm --filter @europa/manual build
pnpm --filter @europa/manual test:links
```

Useful verification entry points:

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | Build first, then package TypeScript checks |
| `pnpm lint` / `pnpm format:check` | Package Biome checks |
| `pnpm --filter @europa/engine test` | Focused simulation suite |
| `pnpm --filter @europa/console test:unit` | Console node-mode unit suite |
| `pnpm --filter @europa/console test:e2e` | Playwright E2E suite |
| `pnpm coverage` | Package coverage scripts |
| `pnpm version:check` | Lockstep application-version validation |
| `pnpm verify` | Repository-required pre-push verification script |
| `pnpm verify:changed --scope console` | Targeted iteration checks |

The verification/self-host scripts require Bash and Unix utilities; PowerShell
alone does not provide their execution environment. Browser suites require
Chromium. Installation and test tools can write caches outside the checkout;
any future execution must account for the user's `./`-only file constraint.

See [review findings](review-findings.md) for gaps between verification-script
descriptions and their current package coverage.

## Rules for future changes

- Read [the constitution](../../.specify/memory/constitution.md) and
  [the charter](../../AGENTS.md); use approved specs, plans, and tasks.
- Keep deterministic logic pure and integer/fixed-point; centralize tuning.
- Preserve server authority and fog filtering at every transport boundary.
- Maintain the >=80% game-logic coverage gate and appropriate conformance checks.
- Update specs and affected player-manual content in gameplay change sets.
- Keep packages private and self-hostable; use feature branches and conventional commits.
- Treat `europa-source/` as read-only reference; independently implement behavior.
