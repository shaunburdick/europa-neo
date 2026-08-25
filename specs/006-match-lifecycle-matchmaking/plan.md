# Implementation Plan: Match Lifecycle & Matchmaking (Feature 006)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`specs/006-match-lifecycle-matchmaking/spec.md`](./spec.md) (v1.1)

**Input**: Feature specification from `specs/006-match-lifecycle-matchmaking/spec.md` v1.1 — server-authoritative match lifecycle: display name, public/private match creation, lobby browser, shareable join links, auto-start when seats fill, results delivery, rematch, and disconnect-forfeit policy.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 006-match-lifecycle-matchmaking` was deliberately skipped, matching the precedent set by features 001, 002, 003, 004, 005). All artifacts for this feature live under `specs/006-match-lifecycle-matchmaking/`.

---

## Summary

Feature 006 is the **match lifecycle owner**: it constructs engine sessions, seats players, hands off to feature 004 for transport, listens back for terminal / forfeit / disconnect events, and orchestrates results + rematch. It is the only feature that knows the difference between a `public` match (lobby-listed) and a `private` match (URL-only), and it is the source of truth for the durable match record across WebSocket disconnects.

The package is **`packages/matchmaking`** (re-exported as `@europa/matchmaking`), built with the **locked stack from feature 001** (pnpm 11, tsup 8, Vitest 4.1, Biome 2, TypeScript strict). It depends **only on types** from `@europa/engine`, `@europa/terrain`, and `@europa/networking` — at runtime, the host server binary wires the concrete dependencies. It conforms to the boundary declarations already shipped by features 001 (`engine-to-matchmaking.ts`) and 004 (`matchmaking-to-networking.ts`) **without amendment** — feature 006 implements the consumer side.

The matchmaker is **in-memory only** (no SQLite, no Redis). Matches are ephemeral: on server restart, all match state is gone and connected clients receive a `match_terminated` protocol message. This is the spec's explicit assumption and the simplest model that satisfies the constitution's self-hostability requirement (Principle VII).

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (matches all upstream packages). Targets Node.js ≥ 20 LTS.

**Primary Dependencies** (matchmaking-only direct deps):
- `typescript@^5.6` — shared via pnpm `catalog:` (locked in feature 001)
- `vitest@^4.1` — test framework + coverage (v8 provider, 80% threshold)
- `@biomejs/biome@^2` — lint + format (extends root config)

**No runtime dependencies** outside Node built-ins (`node:crypto` for `randomUUID`). The matchmaker depends on the following workspace packages **for types only** (type-only imports are erased at compile time):
- `@europa/engine` (workspace:*) — `MatchConfig`, `MatchResult`, `PlayerId`, `Board`, `Rng`, `MatchInitRequest`
- `@europa/terrain` (workspace:*) — `GenerationSettings`, `TerrainGenerationRequest`, `TerrainGenerationResult`
- `@europa/networking` (workspace:*) — `Server`, `MatchmakerBridge`, `MatchId`, `SessionToken`, `ConnectionId`

In production, the server binary (`packages/server`) instantiates a real `Server` from `@europa/networking` and injects it as a dependency. In tests, the matchmaker receives a fake `Server` (the `MatchmakerBridge` callbacks are stubs that record events).

**Storage**: N/A — fully in-memory. `Map<MatchId, MatchRecord>` plus `Map<PlayerSessionId, PlayerSession>`. On `close()` (server shutdown), all state is dropped. Matches are not persisted; the spec assumption is explicit: "No persistence across server restarts." Constitution Principle VII (self-hostable by default) is satisfied without any DB driver.

**Testing**: Vitest 4.1 with v8 coverage provider. Coverage threshold 80% (constitution Principle III merge gate). Test categories:
- `unit/` — per-module tests (`idGen`, `sessionToken`, `lobby`, `matchLifecycle`, `rematch`, `forfeit`, `store`)
- `fixtures/` — scripted scenarios (a `fakeServer` that records `Server.registerMatch` calls and fires `MatchmakerBridge` callbacks on cue)
- `quickstart/` — runnable validation scenarios (Q-M01..Q-M08 in `quickstart.md`)
- `conformance.test.ts` — imports upstream types; asserts the matchmaker uses them at the documented call sites
- `soak.test.ts` — 50 sequential create/play/finish cycles, asserts no leaked matches/sessions (SC-005)

**Target Platform**: Node.js ≥ 20 LTS (server-side authoritative). The matchmaker does not run in the browser; the console (feature 005) consumes the public lobby API via HTTP and connects to the network transport via WebSocket for in-game activity.

**Project Type**: Library within a pnpm-workspaces monorepo. Re-exported as `@europa/matchmaking`. Sibling of `@europa/engine`, `@europa/terrain`, `@europa/networking`. The host binary `packages/server` wires it together with networking, engine, fog, and terrain.

**Performance Goals**:
- **SC-002**: time from "second seat filled" to first tick received by both clients is under **2 seconds** (map generation included). Terrain's quoted upper bound is 1 s on the default 32×32 board; engine `createWorld` is sub-millisecond; the matchmaker's `registerMatch` + `attachPlayer` × 2 is microseconds. Budget is comfortable.
- **SC-003**: lobby listing reflects lifecycle transitions within **one tick of occurrence** (one tick = 250 ms by default). The matchmaker exposes `listPublicMatches()` as a synchronous snapshot read; mutations publish synchronously and the lobby projection is read-mostly.
- **SC-004**: forfeit policy triggers **exactly at grace-window expiry** in 10/10 scripted drop tests. The matchmaker subscribes to `onSeatExpired`; the timestamp is supplied by networking so no clock skew.
- **SC-005**: 50 sequential create/play/finish cycles leak no matches or sessions. Soak test in Phase 6.

**Constraints**:
- **Server-authoritative** (spec FR-002 / constitution Principle II): the matchmaker is server-only; clients see only the lobby listing and the match ID they've been given.
- **No `any` types; no lint suppressions** (constitution Principles I + code-quality skill).
- **Self-hostable by default** (Principle VII): single Node process, no external services, no DB, no Redis, no message queue.
- **Spec FR-006**: unknown match IDs are rejected with a generic `match_not_found` regardless of whether the match is public, private, or nonexistent — **no existence leak**. Implemented as a single code path; private vs. public vs. nonexistent all collapse to the same error.
- **Spec FR-010**: forfeit reuses the same grace window as feature 004 (`reconnectGraceMs`, default 60 000 ms). The matchmaker receives `expiredAtMs` from networking; the timestamp is the network layer's clock, so the matchmaker does not need its own clock source.

**Scale/Scope**:
- New package: `packages/matchmaking` (~800–1200 LOC of pure logic + tests).
- 2-player matches ship end-to-end in v1 (AGENTS.md binding decision); engine supports 2–4 by contract.
- Up to 64 concurrent matches per server (feature 004's `maxConcurrentMatches`; the matchmaker inherits the constraint).
- No persistence layer.
- No accounts, no ratings, no chat (deferred per AGENTS.md binding decision 2).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/matchmaking/tsconfig.json` | ✅ Planned (extends root `tsconfig.base.json`) |
| Zero `any` types in `src/` | ✅ Enforced by Biome `noExplicitAny` + code review |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome; no suppressions ever |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |
| Branded primitives (`MatchId`, `PlayerSessionId`) prevent type confusion | ✅ Declared in `match-types.ts` |
| Conformance test catches upstream drift | ✅ Planned (`tests/conformance.test.ts`) |
| `MatchId` re-uses networking's `MatchId` brand (no parallel definition) | ✅ Imported via `import type` from `@europa/networking` |

**Verdict**: ✅ passes. Matchmaking re-uses networking's branded `MatchId` and adds a single new brand (`PlayerSessionId`) for matchmaking-owned identity.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| Server is the source of truth for match state | ✅ Architectural — clients never hold a `MatchId` they weren't given |
| Lobby listing is server-curated (private matches are invisible) | ✅ Spec FR-005 / FR-006 / Q1-Q2 clarifications |
| No `Math.random()` / unseeded randomness in src/ | ✅ All randomness goes through injected `randomId()` (default `crypto.randomUUID`) |
| Session tokens are v4 UUIDs (122 bits of entropy) | ✅ Feature 004 boundary rule (`matchmaking-to-networking.ts` line 91) |
| Match creation seed (engine `MatchConfig.seed`) is server-generated; matches are ephemeral so no cross-restart determinism is needed | ✅ Recorded in `MatchResultsRecord.effectiveSeed` per FR-008 |
| Unknown match IDs return `match_not_found` for **both** "nonexistent" and "exists but private, no token" — no existence leak | ✅ Spec FR-006 + Q2 clarification; single code path |
| Server-initiated forfeit: matchmaker injects `OrderSurrender` via `engineSession.submit()` (per `matchmaking-to-networking.ts` rule 4 + rule 6) | ✅ `forfeit.ts` does this directly; not via networking |
| Determinism on the **game-simulation** hot path is unaffected (engine owns determinism; matchmaking is meta) | ✅ Lobby state transitions are not on the tick hot path |

**Verdict**: ✅ passes. The matchmaker is server-authoritative for everything it owns (lobby, seating, tokens, rematch, forfeit); it never bypasses the engine for game-state decisions.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Each module = one file + one test file | ✅ Planned (`src/{idGen,sessionToken,lobby,matchLifecycle,rematch,forfeit,store,constants}.ts` + matching tests) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| Conformance test exists | ✅ Planned (`tests/conformance.test.ts`) — imports networking's `Server` type and asserts the matchmaker's call signatures match |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` (Q-M01..Q-M08 cover FR-001..FR-012) |
| Edge cases covered: race on seat fill, empty-match TTL, all-disconnected past grace, rematch participant absent, private ID lookup miss, lobby staleness | ✅ Each edge case has a unit test + a quickstart scenario |
| 50-cycle soak test (SC-005) | ✅ Planned (`tests/soak.test.ts`) |

**Verdict**: ✅ passes. Coverage is mechanical (Vitest threshold).

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec v1.1 is authoritative for matchmaking behavior | ✅ Plan references spec FRs by number |
| Code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate; CI enforces via PR description |
| `contracts/` folder makes the public surface discoverable | ✅ Three `.ts` files (`match-types.ts`, `matchmaking-api.ts`, `matchmaking-to-networking.ts`) |
| `data-model.md` documents every entity (Match, Seat, LobbyEntry, RematchOffer, PlayerSession, etc.) | ✅ Written |
| `README.md` documents the Matchmaker API with a runnable example | ✅ Planned in `packages/matchmaking/README.md` |
| `quickstart.md` is runnable | ✅ Written; every scenario has a real command |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each subsystem = one file, one responsibility | ✅ `idGen.ts` (MatchId), `sessionToken.ts` (UUID v4), `lobby.ts` (projection), `matchLifecycle.ts` (state machine), `rematch.ts` (rematch coordinator), `forfeit.ts` (grace-window policy), `store.ts` (in-memory maps) |
| Pure functions over classes for hot-path logic | ✅ Lifecycle transitions are pure functions of `(state, event) → state`; the matchmaker holds state in plain `Map`s |
| `Map<MatchId, MatchRecord>` over Redis / SQLite | ✅ YAGNI; ephemeral matches don't need persistence (spec Assumptions) |
| `crypto.randomUUID()` over a custom PRNG | ✅ Standard library, available since Node 14.17 / 19.0 unflagged |
| One tunable-constants file (`MATCHMAKING_CONSTANTS`) | ✅ Mirrors engine's `ENGINE_CONSTANTS` discipline |
| No plugin system, no DI container | ✅ `MatchmakerDeps` is a plain interface; tests inject a `FakeServer` |
| Auto-start on seats-fill, no countdown UI | ✅ Spec says "auto-start" (US1); countdown UI is a v1.1 luxury |
| Quick Match = create public match + seat creator; no matchmaking pool | ✅ Spec says nothing about a pool; direct create+join is the only path |
| Rematch state held in-memory on the original `MatchRecord` | ✅ YAGNI; v1 doesn't persist rematch intent |
| No clock injection needed for the forfeit policy | ✅ Networking passes `expiredAtMs` in the event payload (`matchmaking-to-networking.ts` line 308) — the matchmaker does not read the wall clock |

**Verdict**: ✅ passes. We deliberately chose the simpler primitives and rejected speculative features (no matchmaking pool, no countdown, no rematch persistence, no ratings ladder, no chat).

### Principle VI — Accessibility-Minded UI

Not directly applicable to matchmaking (server-side). The matchmaker exposes data that the **console** (feature 005) renders — and the console is the consumer of accessibility requirements. The matchmaker contributes indirectly:

- `LobbyEntry` includes human-readable fields (`hostName`, `seatOccupancyText`, `mapSizeText`) so the console can render them with screen-reader-friendly labels.
- `MatchResult.error` messages are closed-string codes (`'match_not_found'`, `'match_full'`, etc.) so the console can map them to localized strings without parsing free-form text.

✅ N/A for matchmaking beyond what the data model already provides.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Zero external service dependencies at runtime | ✅ No Redis, no DB, no telemetry, no message queue |
| No remote assets, no analytics | ✅ No client-side code at all (server-only package) |
| All deps permissive-licensed | ✅ Zero runtime deps; dev deps (`vitest`, `@biomejs/biome`, `typescript`) are MIT |
| Single process for development | ✅ `pnpm test` in `packages/matchmaking/` runs all unit + integration + quickstart tests with no external services |
| Single static config file for production | ✅ `MATCHMAKING_DEFAULT_CONFIG` is a const; deployments override via env / file |
| Source available; permissive license | ✅ Matchmaking package has no copyleft deps |
| Runs on plain Node.js | ✅ No native bindings required |

**Verdict**: ✅ passes. A motivated self-hoster can `git clone && pnpm install && pnpm dev` and have a working match in under 5 minutes (the server binary in `packages/server` is what boots; matchmaking is one of its four libraries).

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only (MIT/BSD/Apache-2.0/ISC) | ✅ Zero runtime deps; dev deps all MIT |
| No vendor lock-in | ✅ Standard Node `crypto.randomUUID()`; standard WebSocket transport; no proprietary APIs |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md`, `contracts/`, and `quickstart.md` were written. Key reinforcing decisions:

- **Branded `MatchId` (re-used from networking)** + new `PlayerSessionId` brand reinforce Principle I (no string confusion between match IDs, session tokens, connection IDs, and player sessions).
- **`MatchmakerDeps` interface with `server`, `logger`, `randomId` injection** reinforces Principle III (testability without booting networking) and Principle V (no DI container).
- **Single tunable-constants file (`MATCHMAKING_CONSTANTS`)** reinforces Principle V (single source of truth for tunable numbers).
- **Closed-string error codes (`MatchmakerErrorCode`)** reinforce Principle IV (specs as docs) and Principle VI (the console can localize them).
- **In-memory `Map`-based store** reinforces Principle VII (no DB, no Redis).

**Final verdict**: ✅ Constitution satisfied. No violations to track.

### Proposed additive changes to features 001/003/004's contracts

**None.** Feature 006 conforms to:

- feature 001's `engine-to-matchmaking.ts` (`MatchInitRequest`, `EngineSession`, `createMatchSession`, `MatchResultsRecord`) — used verbatim. The matchmaker calls `createMatchSession(req)` once per match.
- feature 001's `engine-to-terrain.ts` (`TerrainGenerationRequest` with `Rng` + `GenerationSettings`, `TerrainGenerationResult`) — used verbatim. The matchmaker constructs the PRNG via `Rng` factory (or accepts one via `MatchmakerDeps.rngFactory`) and passes it to `generateBoard`.
- feature 003's `terrain-types.ts` (`GenerationSettings`, `DEFAULT_GENERATION_SETTINGS`, `Rng`) — used verbatim for the public default knobs.
- feature 004's `matchmaking-to-networking.ts` (`MatchmakingToNetworking`, `NetworkingToMatchmaking`, `MatchmakingRegisterMatch`, `MatchmakingAttachPlayer`, `MatchmakingDetach`, `NetworkingSeatClaimed`, `NetworkingSeatDisconnected`, `NetworkingSeatReconnected`, `NetworkingSeatExpired`, `NetworkingMatchTerminal`) — used verbatim. The matchmaker is the **consumer** of feature 004's declaration side.
- feature 004's `network-api.ts` (`Server`, `RegisterMatchRequest`, `AttachPlayerRequest`, `DetachRequest`, `MatchmakerBridge`) — used verbatim for the runtime API the matchmaker drives.

The matchmaking-only additions (`MatchVisibility`, `MatchStatus`, `LobbyEntry`, `MatchmakerErrorCode`, `CreateMatchRequest`, etc.) are matchmaking-internal concepts with no engine/fog/terrain/networking equivalent. They live in `match-types.ts` and do not extend any upstream contract.

If a future feature needs a new lifecycle signal (e.g., "match paused"), the convention is: declare it in `@europa/matchmaking/contracts/match-types.ts` and have networking add a corresponding `MatchmakerBridge` callback. That requires a coordinated amendment of both packages in one change set.

---

## Project Structure

### Documentation (this feature)

```text
specs/006-match-lifecycle-matchmaking/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — ID generation, in-memory store, error codes
├── data-model.md        # Phase 1 output — Match, Seat, LobbyEntry, RematchOffer, PlayerSession
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── match-types.ts             # branded primitives, entities, errors, request/response shapes
│   ├── matchmaking-api.ts         # MatchmakerConfig, MatchmakerDeps, Matchmaker, factory
│   └── matchmaking-to-networking.ts # consumer-side conformance assertion to feature 004's boundary
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                       # spec-kit scaffolding + governance
└── packages/
    ├── engine/                     # feature 001
    ├── fog/                        # feature 002
    ├── terrain/                    # feature 003
    ├── networking/                 # feature 004
    ├── matchmaking/                # ← this feature
    │   ├── package.json            # name: "@europa/matchmaking", type: "module"
    │   ├── tsconfig.json           # strict, ES2022, noUncheckedIndexedAccess
    │   ├── vitest.config.ts        # v8 coverage, 80% threshold
    │   ├── tsup.config.ts          # ESM + dts
    │   ├── biome.json              # extends: "//" (root)
    │   ├── src/
    │   │   ├── index.ts            # public surface re-exports
    │   │   ├── constants.ts        # MATCHMAKING_CONSTANTS (single tunable-knobs location)
    │   │   ├── matchmaker.ts       # createMatchmaker(config, deps): Matchmaker
    │   │   ├── idGen.ts            # newMatchId(): MatchId (UUID v4)
    │   │   ├── sessionToken.ts     # newSessionToken(): SessionToken (UUID v4)
    │   │   ├── lobby.ts            # LobbyEntry projection + listPublicMatches
    │   │   ├── matchLifecycle.ts   # createMatch → fill → start → finish → teardown
    │   │   ├── rematch.ts          # rematch coordinator (votes + window)
    │   │   ├── forfeit.ts          # onSeatExpired handling
    │   │   ├── store.ts            # Map<MatchId, MatchRecord>, Map<PlayerSessionId, PlayerSession>
    │   │   ├── errors.ts           # MatchmakerError, MatchmakerErrorCode
    │   │   └── internal/
    │   │       ├── matchRecord.ts  # the MatchRecord shape (state machine)
    │   │       ├── seatRecord.ts   # per-seat binding
    │   │       └── playerSession.ts # ephemeral PlayerSession
    │   └── tests/
    │       ├── unit/
    │       │   ├── idGen.test.ts
    │       │   ├── sessionToken.test.ts
    │       │   ├── lobby.test.ts
    │       │   ├── matchLifecycle.test.ts
    │       │   ├── rematch.test.ts
    │       │   ├── forfeit.test.ts
    │       │   └── store.test.ts
    │       ├── fixtures/
    │       │   ├── fakeServer.ts   # FakeServer records Server.registerMatch / attachPlayer calls
    │       │   ├── scriptedBridges.ts # scripted MatchmakerBridge events for tests
    │       │   └── scriptedBoards.ts  # tiny pre-generated Boards
    │       ├── quickstart/         # Q-M01..Q-M08
    │       ├── conformance.test.ts # imports networking's Server type; asserts call-site shapes
    │       └── soak.test.ts        # SC-005: 50 sequential cycles, no leaks
    ├── console/                    # feature 005 (client)
    └── server/                     # binary host — wires all five packages
```

**Structure Decision**: The matchmaker lives in its own package, mirroring the engine/fog/terrain/networking precedent. The package uses `tsup` (library) — same as engine and terrain, not Vite (the console's choice). It is consumed by the `packages/server` binary, which is the only place all five packages are wired together for production.

---

## Architecture Overview

### Data flow

```
   ┌─────────────────────────┐
   │  Browser client         │  (feature 005 console)
   │  - native WebSocket     │
   │  - calls HTTP API       │
   │    (create/join/lobby)  │
   └────────────┬────────────┘
                │ HTTP (REST-ish)
                │ WebSocket (in-game)
                ▼
   ┌─────────────────────────┐
   │  packages/server        │  (host binary)
   │  - HTTP lobby API       │
   │  - WebSocket listener   │
   │  - wires the packages   │
   └────────────┬────────────┘
                │ createMatchmaker(config, { server, logger, randomId })
                ▼
   ┌─────────────────────────┐
   │  @europa/matchmaking    │  ← this feature
   │  - holds lobby state    │
   │  - holds match records  │
   │  - holds player sessions│
   │  - drives the lifecycle │
   └────────────┬────────────┘
                │ Server.registerMatch / attachPlayer / detachPlayer / unregisterMatch
                │ MatchmakerBridge (onSeatClaimed, onSeatExpired, onMatchTerminal, ...)
                ▼
   ┌─────────────────────────┐
   │  @europa/networking     │  (feature 004)
   │  - WebSocket frames     │
   │  - tick scheduler       │
   │  - rate limiter         │
   └────────────┬────────────┬──────────────────┐
                │            │                  │
                ▼            ▼                  ▼
        ┌───────────┐ ┌──────────────┐ ┌─────────────────┐
        │@europa/   │ │ @europa/     │ │  @europa/terrain│
        │engine     │ │ fog          │ │  (Board gen)    │
        │(sim)      │ │(visibility)  │ │                 │
        └───────────┘ └──────────────┘ └─────────────────┘
```

The matchmaker is the **only** layer that knows the difference between public and private matches. Networking is URL-agnostic; it receives a `MatchId` as a routing key and never inspects visibility.

### Match lifecycle state machine

```
                  createMatch (creator seats themselves)
                  │
                  ▼
            ┌───────────┐    all seats filled + engine session constructed
            │  filling  │ ───────────────────────────────────────────►
            └─────┬─────┘                                              │
                  │ creator / other leaves before start                │
                  │ (or empty TTL expires)                             ▼
                  ▼                                              ┌───────────┐
            ┌───────────┐                                       │  running  │
            │ collected │                                       └─────┬─────┘
            └───────────┘                                             │
                                                                       │ engine reports
                                                                       │ terminal
                                                                       ▼
                                                                 ┌───────────┐
                                                                 │ finished  │
                                                                 └─────┬─────┘
                                                                       │ results delivered
                                                                       │ + rematch window
                                                                       │   (60 s default)
                                                                       ▼
                                                                 ┌───────────┐
                                                                 │ collected │
                                                                 └───────────┘
```

**Notes**:
- `created` is collapsed into `filling`: the spec says "creator's seat is reserved immediately and the match becomes joinable" (FR-004), so `created → filling` happens in one step. We expose `MatchStatus = 'filling' | 'running' | 'finished' | 'collected'` (no `'created'`).
- All transitions emit `MatchStatusChanged` events to the in-process event bus (consumed by the lobby projection).
- `filling → collected` happens via either an explicit `leaveMatch` from the creator (with no other seats taken) OR after `emptyMatchTtlMs` (default 5 min) of no seats.
- `finished → collected` happens via either a rematch resolution OR after `resultsTtlMs` (default 60 s) of no further action.
- `running → collected` (without `finished`) is forbidden — the matchmaker always transitions through `finished` for `MatchResultsRecord` delivery.

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| MatchId | UUID v4 (122-bit entropy) via `crypto.randomUUID()` | Spec doesn't mandate a specific format; UUID is standard, URL-safe, hard to enumerate (`research.md` §1) |
| Join URL | `joinPath` (relative `/join/<MatchId>`); host composes full URL | Matchmaker is URL-agnostic for self-hostability (`research.md` §1) |
| Private match ID exposure | Single code path: all unknown IDs return `match_not_found` | Spec FR-006 + Q2 clarification: no existence leak (`research.md` §2) |
| Lobby persistence | In-memory `Map<MatchId, MatchRecord>` | Spec assumption: "no persistence across server restarts" (`research.md` §3) |
| Match start condition | Auto-start when seats fill (no countdown) | Spec says "auto-start"; countdown UI is a v1.1 luxury (`research.md` §4) |
| Rematch flow | 60 s window; all original participants must accept; new seed + new MatchId | Spec FR-009; both must accept (`research.md` §5) |
| Disconnect forfeit | Matchmaker injects `OrderSurrender` via `engineSession.submit()` | Networking reports `onSeatExpired`; matchmaker decides (`research.md` §6) |
| Quick Match | `createMatch({ visibility: 'public', ...defaults })` — no pool | Spec says nothing about a pool; direct create+join is the only path (`research.md` §7) |
| Determinism | `crypto.randomUUID()` for IDs (no cross-restart determinism needed); engine `seed` derived from UUID-derived uint32 | Matches are ephemeral; replays are out of scope for v1 (`research.md` §8) |
| New runtime deps | NONE — Node built-ins + workspace types only | Constitution Principle VII; `research.md` §9 |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **Private ID enumeration** (scanning UUID v4) | UUID v4 = 122-bit entropy = 2^122 possibilities; brute force is infeasible. Documented in `research.md` §1. |
| **Spectator policy on terminal** (US3 + Feature 004 mentions `enableSpectators`) | v1 enables spectators at `running` only. Not documented in spec FRs (feature 004 inherited it from spec US3); the matchmaker calls `server.enableSpectators(matchId)` once the match enters `running`. |
| **Lobby staleness under high churn** | `listPublicMatches()` reads from a snapshot rebuilt on every mutation. O(N) per call; acceptable for v1 scale (≤64 concurrent matches, ≤32 public joinable). |
| **Rematch requires all original participants** (spec edge case) | If a participant has disconnected beyond grace and been forfeited, they cannot accept. Rematch degrades to a no-op; we surface `rematch_failed` with reason `'participant_unavailable'`. |
| **Server restart = match loss** | On `close()`, the matchmaker iterates all `MatchRecord`s with status `running` or `filling` and calls `server.unregisterMatch` for each (best effort). Connected clients receive no explicit "server shutting down" protocol message in v1; their WebSocket drops with a transport error. Documented in `quickstart.md` Q-M08. |
| **Matchmaker ↔ networking race** (matchmaker calls `registerMatch` then a `joinMatch` arrives for the same `MatchId` before `registerMatch` returns) | The matchmaker atomically transitions `filling → running` inside `joinMatch` *after* `registerMatch` returns. A concurrent `joinMatch` for a match already in `running` sees a full match and returns `match_full`. Documented in `data-model.md` §4. |
| **Visibility flip mid-match** (spec edge case: "creator wanted privacy after all") | Spec says visibility is fixed at creation. The matchmaker rejects any mid-match visibility change (no API exposed). |
| **Empty unstarted matches** (spec edge case) | Garbage-collected after `emptyMatchTtlMs` (default 5 min). A periodic sweep at the top of every `tick()` checks; documented in `matchLifecycle.ts`. |

### Unresolved product ambiguities

None remain. The prompt asked for decisions on nine concrete questions; each is documented in `research.md` and the rationale is summarized in this plan's "Key design decisions" table. The spec's `## Clarifications` section (v1.1) closes the only high-level ambiguity (visibility types); the remaining implementation-time knobs are documented in `research.md` and stored in `MATCHMAKING_CONSTANTS` so they're a single tunable file.

---

## Implementation Phase Hand-off

Phase 5 (tasks) is **not** in this dispatch. The PM will receive:

- `plan.md` (this file)
- `research.md`
- `data-model.md`
- `contracts/` (3 files)
- `quickstart.md`

And dispatch Phase 5 to create `tasks.md`, then Phase 6 to implement.

When implementation begins, the implementer should:

1. Scaffold `packages/matchmaking` per the structure above (the monorepo bootstrap is a separate setup task, not part of this feature's task list — already established by feature 001's plan).
2. Implement in dependency order: `constants.ts` → `errors.ts` → `idGen.ts` → `sessionToken.ts` → `store.ts` → `internal/playerSession.ts` → `internal/seatRecord.ts` → `internal/matchRecord.ts` → `lobby.ts` → `forfeit.ts` → `rematch.ts` → `matchLifecycle.ts` → `matchmaker.ts` → `index.ts` re-exports.
3. Land `quickstart/` tests as the acceptance suite (Q-M01 .. Q-M08 in `quickstart.md`).
4. Run the constitution gates (lint, typecheck, coverage ≥80%, conformance test, soak test).
5. Wire the `packages/server` binary to call `createMatchmaker({ ...MATCHMAKING_DEFAULT_CONFIG, publicBaseUrl: process.env.PUBLIC_BASE_URL }, { server, logger, randomId: crypto.randomUUID })`.

The contracts in `contracts/` are the stable interface. Drift between them and feature 001/003/004's contracts is a bug — the conformance test enforces this.
