# Implementation Plan: Real-Time Multiplayer Networking (Feature 004)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`.specify/features/004-multiplayer-networking/spec.md`](./spec.md)

**Input**: Feature specification from `.specify/features/004-multiplayer-networking/spec.md` — server-authoritative WebSocket protocol connecting clients to running matches: command submission, per-tick state broadcast with fog-of-war filtering, delta sync, reconnection handling.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 004-multiplayer-networking` was deliberately skipped, matching the precedent set by features 001, 002, 003). All artifacts for this feature live under `.specify/features/004-multiplayer-networking/`.

---

## Summary

The Multiplayer Networking & Transport feature is the **transport layer** that sits between the engine (feature 001, source of truth for `World`) and the client console (feature 005, source of UI). It exposes a server-authoritative WebSocket protocol that:

1. **Carries orders** from clients to the engine (`OrderSubmissionPayload` → `engine.submit`).
2. **Broadcasts per-tick state** to each client, fog-filtered via feature 002 (`computePlayerView`) so each recipient sees only their own horizon (or full board for spectators).
3. **Manages sessions**: opaque reconnect tokens, grace windows, rate limiting, heartbeats.
4. **Hands off cleanly** to feature 006 (matchmaking): matchmaking owns the durable match record; networking owns the transport.

The package is `packages/networking` (re-exported as `@europa/networking`), built with the locked stack from feature 001 (pnpm 11, tsup 8, Vitest 4.1, Biome 2, TypeScript strict). It depends on `@europa/engine` and `@europa/fog` for canonical types and pure functions; the matchmaking boundary is declared in `contracts/matchmaking-to-networking.ts` (networking declares, matchmaking implements).

It conforms to feature 001's `engine-to-networking.ts` and feature 002's `fog-to-networking.ts` **without modification** (no additive changes to those contracts were required).

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (matches engine + fog). Targets Node.js ≥ 20 LTS.

**Primary Dependencies** (networking-only direct deps):
- `ws@^8.21` — WebSocket server (RFC 6455, MIT, zero deps). See `research.md` §1.
- `typescript@^5.6` — shared via pnpm `catalog:`
- `vitest@^4.1` — test framework + coverage (v8 provider)
- `@biomejs/biome@^2` — lint + format (extends root config)
- `@types/ws` — TypeScript declarations for `ws`

**No other runtime deps**. Networking depends on:
- `@europa/engine` (workspace:*) — `World`, `Order`, `PlayerId`, `CommandResult`, `MatchResult`, etc.
- `@europa/fog` (workspace:*) — `PlayerView`, `VisibleSet`

**Storage**: N/A — networking holds all state in process memory (matches, connections, rate buckets). No persistence. Spec Assumptions: "Matches are held in memory; server persistence/restart recovery is explicitly out of scope for v1."

**Testing**: Vitest 4.1 with v8 coverage provider. Coverage threshold 80% (constitution Principle III merge gate). Test categories:
- `unit/` — per-module tests (envelope builder, rate limiter, delta detection, state machine transitions, version checks)
- `fixtures/` — scripted connection scenarios (hello/join/order/spawn/disconnect/reconnect/terminal)
- `quickstart/` — runnable validation scenarios (Q-N01..Q-N09 in `quickstart.md`)
- `determinism.test.ts` — same order sequence → identical broadcast frames (SC-001 protocol-level)
- `conformance.test.ts` — engine + fog types imported; matches declared contract shapes
- `perf.test.ts` — SC-005: 10+ concurrent matches without tick degradation

**Target Platform**: Node.js ≥ 20 LTS (server-side authoritative). Browser clients connect via the native `WebSocket` constructor — no extra client adapter needed.

**Project Type**: Library + server binary within a pnpm-workspaces monorepo. The library exports the `createMatchServer` API; the server binary (`packages/server/src/index.ts`) wires matchmaking + networking + engine + fog for production deployment.

**Performance Goals**:
- SC-002: order-to-ack round-trip under 100 ms on localhost/LAN (tick-paced cadence = ~250 ms baseline; 100 ms leaves headroom for 1 tick of latency).
- SC-003: reconnect-to-first-payload under 2 seconds for default-size match.
- SC-005: ≥10 concurrent matches (≥20 sockets) on commodity hardware without tick degradation beyond 10%. The default `maxConcurrentMatches = 64` leaves headroom.
- Per-tick server-side budget: ~15 ms per match (engine + fog budgets), so the 250 ms tick interval has 16× headroom per match at single-match load.

**Constraints**:
- Server-authoritative (spec FR-002): clients render state and submit orders only; no client message may directly mutate state outside validation.
- Determinism discipline (constitution Principle II): the scheduler is the *only* place a wall-clock appears in tick logic; everything else is pure functions over the engine's `World`.
- ≥80% coverage (constitution Principle III).
- No `any` types; no lint suppressions (constitution Principles I + code-quality skill).
- Self-hostable by default — no proprietary services, no required cloud (constitution Principle VII).
- No `permessage-deflate` by default (per `ws` README warning about zlib memory fragmentation).
- Spec FR-001: WebSocket with JSON text frames (locked).

**Scale/Scope**:
- New package: `packages/networking` (~600–1000 LOC of networking logic + tests).
- New package: `packages/server` (the binary that hosts `createMatchServer` + matchmaking + engine + fog; ~200 LOC shell).
- 2–4 player matches (engine supports 2–4; v1 ships 2-player end-to-end per AGENTS.md binding decision).
- Up to 64 concurrent matches per server (configurable; default sized for self-hosted headless boxes).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/networking/tsconfig.json` | ✅ Planned |
| Zero `any` types in `src/` | ✅ Enforced by Biome `noExplicitAny` + code review |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome; no suppressions ever |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |
| Branded primitives (`SessionToken`, `MatchId`, `ConnectionId`, `SequenceNumber`) prevent type confusion | ✅ Declared in `network-types.ts` |
| Conformance test catches engine/fog drift | ✅ Planned (`tests/conformance.test.ts`) |
| `@types/ws` provides types for `ws` package | ✅ Direct devDependency |

**Verdict**: ✅ passes. Networking extends the engine's type discipline with branded primitives for transport-layer concerns.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| Server is the source of truth for game state | ✅ Architectural — clients receive authoritative `PlayerView`, never compute state |
| Clients render state and submit orders only | ✅ Spec FR-002 enforced; orders validated by engine before staging |
| Tick logic is pure (no wall-clock in `tick`; scheduler drives cadence) | ✅ Engine unchanged; scheduler uses `Date.now()` once per tick for *ordering*, not for state |
| Commands applied in deterministic order | ✅ Engine FR-018 sort; networking preserves submission order via per-session FIFO before tick boundary |
| No `Math.random()` / no unseeded randomness in src/ | ✅ Networking has no randomness; reconnect tokens issued by matchmaking via `crypto.randomUUID()` (deterministic PRNG is engine's concern, not networking's) |
| Integer-only sequence numbers | ✅ `SequenceNumber = number` constrained to uint32 range |
| Tick payloads deterministic given same input | ✅ `PlayerView` is fog's pure output; no networking-side mutation |
| Reconnect resync = fresh `SnapshotPayload` (full PlayerView) | ✅ Spec FR-006 satisfied by resending on `joined → rejoined` transition |

**Verdict**: ✅ passes. The scheduler is the only clock; everything else is pure.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Each module = one function + one test file | ✅ Planned (`src/{envelope,stateMachine,rateLimit,delta,scheduler,connectionLifecycle,server}.ts`) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| Determinism test exists | ✅ Planned (`tests/determinism.test.ts` — SC-001 protocol-level) |
| Conformance test exists | ✅ Planned (`tests/conformance.test.ts` — engine/fog shape match) |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` |
| Edge cases covered: duplicate order, late order, rate limit, seat takeover, reconnect race, server crash mid-tick | ✅ Planned (Q-N06, Q-N07, Q-N09) |
| ≥5,000-tick scripted match (SC-001) | ✅ Planned (`tests/perf.test.ts` quickstart scenario) |
| 10+ concurrent matches soak test (SC-005) | ✅ Planned (`tests/perf.test.ts` quickstart scenario) |

**Verdict**: ✅ passes. The transport layer is highly testable (in-memory state, dependency injection via `ServerDeps`).

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec is authoritative for networking behavior | ✅ Plan references spec FRs by number |
| Code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate this; CI enforces via PR description |
| `contracts/` folder makes the public surface discoverable | ✅ Three `.ts` files (`network-types.ts`, `network-api.ts`, `matchmaking-to-networking.ts`) |
| README documents the Server API with a runnable example | ✅ Planned in `packages/networking/README.md` |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each subsystem = one file, one responsibility | ✅ `envelope.ts`, `stateMachine.ts`, `rateLimit.ts`, `delta.ts`, `scheduler.ts`, `connectionLifecycle.ts`, `server.ts` |
| Pure functions over classes for hot-path logic | ✅ Tick pipeline is a sequence of pure functions; classes only for the `Server`/`MatchTransport` records |
| Standard `ws` over higher-level frameworks (colyseus, socket.io) | ✅ Justified in `research.md` §1 |
| One scheduler per server (not per match) | ✅ Simpler; degrades gracefully via tick-wave fallback at >64 matches |
| No plugin system, no DI container | ✅ `ServerDeps` is a plain interface; tests inject fakes directly |
| Single tunable-constants location | ✅ `NETWORK_DEFAULT_CONFIG` in `network-api.ts` (mirror of engine's `ENGINE_CONSTANTS` discipline) |
| Server-initiated forfeit NOT in networking | ✅ Networking reports `onSeatExpired`; matchmaker decides (separation of concerns) |
| Delta protocol on the wire is the same `PlayerView`; "delta" is server-side skip-send | ✅ Simpler than a custom delta payload |

**Verdict**: ✅ passes. We deliberately chose the simpler algorithm (skip-send vs delta payload) and the simpler library (`ws` vs colyseus/socket.io).

### Principle VI — Accessibility-Minded UI

Not directly applicable to networking. The console (feature 005) is the consumer of accessibility requirements; networking exposes plain data + protocol messages that any console can render accessibly. Networking does, however, expose connection state in a way that the console can render accessibly:
- `error.code` is a closed union (screen-reader-friendly)
- `terminal.result` carries structured winner/tick (renderable as text)
- `connection.status` is a closed state (renderable as text)

✅ N/A for networking beyond what the protocol already provides.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Networking has zero external service dependencies | ✅ No Redis, no DB, no telemetry |
| Networking is a single npm package installable independently | ✅ pnpm workspace member; pure TypeScript + `ws` |
| Source available; permissive license | ✅ `ws` is MIT; no copyleft deps in tree |
| Runs on plain Node.js | ✅ No native bindings required (the optional `bufferutil` is opt-in via `--save-optional`; the package works without it) |
| Single process (`npm install && npm start` is enough) | ✅ Matches the constitution's "self-hostable by default" |
| TLS is a deployment concern (reverse proxy) | ✅ Out of scope per spec Assumptions |

**Verdict**: ✅ passes.

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only (MIT/BSD/Apache-2.0/ISC) | ✅ `ws` is MIT; `vitest`, `@biomejs/biome`, `typescript` are MIT |
| No vendor lock-in | ✅ Standard WebSocket protocol; standard JSON wire format; no proprietary APIs |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md` and `contracts/` were written. Key reinforcing decisions:

- **Branded primitives** (`SessionToken`, `MatchId`, `ConnectionId`, `SequenceNumber`) reinforce Principle I (no string confusion between connection IDs, session tokens, and match IDs).
- **Two-way matchmaking ↔ networking boundary** (`MatchmakerBridge` callbacks + `Server` methods) reinforces Principle V (separation of concerns).
- **`@internal` annotation** on server-only types (`MatchTransport`, `ConnectionRecord`, `SeatRecord`, `PendingOrder`) reinforces Principle IV (public surface is the contracts folder; internals stay documented but out of the public API).
- **Single scheduler with tick-wave fallback** (`research.md` §11) reinforces Principles II and VII (deterministic at moderate scale, self-hostable).

**Final verdict**: ✅ Constitution satisfied. No violations to track.

### Proposed additive changes to feature 001's and feature 002's contracts

**None.** Feature 004 conforms to:
- feature 001's `engine-to-networking.ts` (5 declared payload kinds + envelope) — used verbatim.
- feature 002's `fog-to-networking.ts` (`PlayerView`, `VisibleSet`, `PerTickBroadcast`, `SerializedPlayerViewFields`) — used verbatim.

The transport-layer additions (hello, joinMatch, ping, etc.) are networking's own concern and live in `network-types.ts`. They do not extend the engine or fog contracts because they have no engine/fog equivalent — they are pure session lifecycle.

If a future feature needs an additional payload shape (e.g., a chat message), the convention is: declare it in `@europa/networking/contracts/network-types.ts` and add it to the `NetworkPayload` union. This does not require engine or fog amendments.

---

## Project Structure

### Documentation (this feature)

```text
.specify/features/004-multiplayer-networking/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — tooling + design decisions with citations
├── data-model.md        # Phase 1 output — entities, fields, relationships, transitions
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── network-types.ts             # wire envelope, transport-layer payloads, branded primitives
│   ├── network-api.ts               # createMatchServer, Server interface, config, deps
│   └── matchmaking-to-networking.ts # boundary declarations (networking declares; matchmaking implements)
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                       # spec-kit scaffolding + governance
└── packages/
    ├── engine/                     # feature 001 — emits World, accepts Orders
    ├── fog/                        # feature 002 — emits PlayerView
    ├── terrain/                    # feature 003 — produces Board
    ├── networking/                 # ← this feature
    │   ├── package.json            # name: "@europa/networking", type: "module"
    │   ├── tsconfig.json           # strict, ES2022, noUncheckedIndexedAccess
    │   ├── vitest.config.ts        # v8 coverage, 80% threshold
    │   ├── tsup.config.ts          # ESM + dts
    │   ├── biome.json              # extends: "//" (root)
    │   ├── src/
    │   │   ├── index.ts            # public surface re-exports
    │   │   ├── config.ts           # NETWORK_DEFAULT_CONFIG (single tunable-knobs location)
    │   │   ├── envelope.ts         # buildEnvelope, parseEnvelope, validateEnvelope
    │   │   ├── stateMachine.ts     # ConnectionState transitions + guards
    │   │   ├── rateLimit.ts        # token-bucket algorithm
    │   │   ├── delta.ts            # PlayerView diff (server-side optimization)
    │   │   ├── scheduler.ts        # setInterval-driven tick pipeline
    │   │   ├── connectionLifecycle.ts # ws event handlers; bridge callbacks
    │   │   ├── server.ts           # createMatchServer, registerMatch, attachPlayer, ...
    │   │   ├── persistence.ts      # (none in v1; placeholder for future)
    │   │   └── internal/
    │   │       ├── matchTransport.ts # per-match server state
    │   │       ├── connectionRecord.ts # per-connection server state
    │   │       └── seatRecord.ts     # per-seat binding
    │   └── tests/
    │       ├── unit/
    │       │   ├── envelope.test.ts
    │       │   ├── stateMachine.test.ts
    │       │   ├── rateLimit.test.ts
    │       │   ├── delta.test.ts
    │       │   └── connectionLifecycle.test.ts
    │       ├── fixtures/
    │       │   ├── worlds.ts       # scripted engine worlds
    │       │   ├── matches.ts      # scripted match lifecycles
    │       │   └── clients.ts      # mock WebSocket clients
    │       ├── quickstart/         # Q-N01..Q-N09
    │       ├── determinism.test.ts # SC-001 protocol-level: same orders → same broadcast frames
    │       ├── conformance.test.ts # imports engine/fog types; asserts shape match
    │       └── perf.test.ts        # SC-005: 10+ concurrent matches
    └── server/                     # feature 006 + 004 + 002 host (binary)
        ├── package.json            # name: "@europa/server", type: "module"
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts            # entry point: load config, call createMatchServer
        │   ├── wiring.ts           # engine + fog + matchmaking + networking wiring
        │   └── shutdown.ts         # graceful close (close all matches)
        └── tests/
            └── e2e.test.ts         # boots the binary end-to-end
```

**Structure Decision**: networking lives in its own package, mirroring the engine/fog/terrain precedent. The server binary (`packages/server`) is a thin shell that wires the four packages together. This separation lets:
- Networking be tested in isolation (dependency injection via `ServerDeps`).
- The server binary be deployed independently of feature development.
- The browser client (feature 005) consume `@europa/networking`'s *types* (and optionally the client adapter if shipped) without taking a server-side dep on `@europa/engine`.

---

## Architecture Overview

### Data flow

```
                      ┌─────────────────────────┐
                      │  Browser client         │   (feature 005 console)
                      │  - native WebSocket     │
                      │  - renders PlayerView   │
                      │  - emits Order          │
                      └────────────┬────────────┘
                                   │ WebSocket JSON frames
                                   │ (RFC 6455, text frames)
                                   ▼
                      ┌─────────────────────────┐
                      │  @europa/networking     │   ← this feature
                      │  packages/server        │
                      │  - WebSocket listener   │
                      │  - per-match scheduler  │
                      │  - fog filter (fog 002) │
                      │  - delta optimization   │
                      │  - rate limit / heartbeat│
                      └────────────┬────────────┘
                                   │ tick(world), submit(order)
                                   ▼
                      ┌─────────────────────────┐
                      │  @europa/engine         │   (feature 001)
                      │  - createWorld          │
                      │  - tick                 │
                      │  - serializeWorld       │
                      └────────────┬────────────┘
                                   │ World, TickEvents
                                   ▼
                      ┌─────────────────────────┐
                      │  @europa/fog            │   (feature 002)
                      │  - computePlayerView    │
                      └─────────────────────────┘
                                   ▲
                                   │ PlayerView
                                   │
                      ┌────────────┴────────────┐
                      │  @europa/matchmaking    │   (feature 006)
                      │  packages/server        │
                      │  - lobby                │
                      │  - seating              │
                      │  - terminal / rematch   │
                      │  - forfeit policy       │
                      └─────────────────────────┘
```

Networking is the **only** layer that speaks WebSocket. It sits
between the wire and the engine/fog/matchmaking stack. Matchmaking
drives networking via the `Server` methods; networking reports back
via the `MatchmakerBridge` callbacks.

### Per-tick pipeline

```
  setInterval(config.tickRateMs) — single scheduler, all matches
  │
  ▼
  For each MatchTransport mt in activeMatches:
  │
  ├── 1. Drain pending orders
  │     sort mt.pendingOrders by (playerId asc, kind asc) per feature 001 FR-018
  │     for each order:
  │       result = mt.engineSession.submit(order)
  │       send orderAck(seq, result) to source connection
  │       if !result.ok: log; continue
  │
  ├── 2. Advance engine
  │     tickResult = mt.engineSession.advance()
  │     mt.tickCounter += 1
  │
  ├── 3. Broadcast per session
  │     for each ConnectionRecord conn in mt:
  │       view = fog.computePlayerView({ world, playerId, spectator })
  │       if lastSentView matches view: skip
  │       sendFrame(conn, 'tick', { tick: mt.tickCounter, view })
  │       lastSentView[conn.id] = view
  │
  └── 4. Terminal?
        if tickResult.terminal:
          for each conn in mt: sendFrame(conn, 'terminal', { result })
          mt.terminalSent = true
          bridge.onMatchTerminal(...)
          matchmaking decides next steps
```

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| Transport library | `ws@^8.21` | Zero deps, MIT, RFC 6455, self-hostable (`research.md` §1) |
| Wire format | JSON text frames | Locked by spec FR-001; bandwidth within budget at v1 scale (`research.md` §2) |
| Tick rate | 250 ms (4 Hz) | Matches engine `DEFAULT_TICK_INTERVAL_MS`; configurable per server |
| Tick scheduler | One `setInterval` for all matches | Simpler; degrades via tick-wave at >64 matches |
| Order queuing | Per-session FIFO; engine sorts at tick boundary | Spec FR-008 determinism |
| Rate limiting | Per-connection token bucket (10/s, burst 2×) | Spec FR-010 |
| Reconnection | Opaque session token + 60 s grace | Spec FR-007, US2 |
| Schema versioning | `NETWORK_API_VERSION` + envelope `version` field | Spec FR-004 |
| Delta encoding | Server-side skip-send; full `PlayerView` on the wire | Simpler than custom delta protocol; satisfies FR-006 |
| Spectators | Per-connection flag; fog's `options.spectator` honored | Spec US3 + fog `fog-to-networking.ts` boundary |
| Self-hosting | Single Node process, in-memory state | Constitution Principle VII; spec Assumptions |
| Matchmaking boundary | Two-way: matchmaking calls `Server`; networking fires `MatchmakerBridge` callbacks | Separation of concerns; documented in `matchmaking-to-networking.ts` |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **SC-005 perf at high match counts** | Default `maxConcurrentMatches = 64`; tick-wave fallback at higher counts; perf test in Phase 6 measures the actual ceiling. |
| **WebSocket message size limits** | JSON text frames default to 16 KB; v1 payloads estimated at ~2 KB (full PlayerView). If any payload exceeds 16 KB, the server should compress or fragment — deferred until measured. |
| **Zlib memory fragmentation** (`ws` README warning) | `permessage-deflate` disabled by default; opt-in only when bandwidth requires. |
| **Reconnect race: two simultaneous `joinMatch` with same token** | First valid `joinMatch` consumes the slot; the second sees `seat_taken` error and is closed (matches spec Edge Case "two clients claim the same player seat"). |
| **Server clock drift** | Server is the authoritative clock for tick boundaries; clients don't synchronize. If a self-hoster's clock drifts, only their match suffers (matches already terminated for other players don't move). |
| **Browser client `WebSocket` quirks** (auto-reconnect, visibility API) | Client adapter lives in feature 005; networking provides the protocol contract only. |
| **Token reuse across reconnects** | Spec doesn't forbid. A future "session security" feature may rotate tokens; v1 doesn't. |
| **Compression** | Disabled by default; opt-in via `WebSocketServer({ perMessageDeflate: ... })`. |
| **3/4-player tests lighter than 2-player** | Per AGENTS.md binding decision. The networking layer supports all 2–4 player counts by contract (engine FR-019); the v1 2-player test path is fully exercised. |

### Unresolved product ambiguities

None remain for networking. Every spec FR maps to a concrete design:

- **Transport**: `ws` chosen (`research.md` §1).
- **Wire format**: locked by FR-001.
- **Tick rate**: configurable, defaults to engine's 250 ms.
- **Reconnection**: token + 60 s grace (configurable).
- **Spectators**: per-connection role; full-board via fog.
- **Rate limiting**: per-conn token bucket; defaults tunable via `ServerConfig`.
- **Delta encoding**: server-side skip-send (simpler than custom delta protocol).
- **Schema versioning**: `NETWORK_API_VERSION` string + envelope `version`.
- **Self-hosting**: single Node process; no external services.

The implementation phase (Phase 6) will exercise the spec's Success
Criteria (SC-001 through SC-005) as Vitest benchmarks, surfaced in
`quickstart.md` Q-N01..Q-N09.

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
1. Scaffold `packages/networking` per the structure above (the monorepo bootstrap is a separate setup task, not part of networking's task list — already established by feature 001's plan §"Implementation Phase Hand-off").
2. Implement in dependency order: `config.ts` → `envelope.ts` → `stateMachine.ts` → `rateLimit.ts` → `delta.ts` → `internal/*` records → `connectionLifecycle.ts` → `scheduler.ts` → `server.ts` → `index.ts` re-exports.
3. Land `quickstart/` tests as the acceptance suite (Q-N01 .. Q-N09 in `quickstart.md`).
4. Run the constitution gates (lint, typecheck, coverage ≥80%, determinism test, conformance test).
5. Wire the `packages/server` binary to call `createMatchServer` with the production deps (real engine, real fog, real matchmaking).

The contracts in `contracts/` are the stable interface; they are
referenced by features 005 (console, client side), 006 (matchmaking,
server side). Drift between this plan and feature 001's or 002's
contracts is a bug — the conformance test enforces this.
