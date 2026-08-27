# `@europa/networking`

Europa Neo real-time multiplayer networking & transport — the
server-authoritative WebSocket layer. It owns the JSON wire protocol,
the tick scheduler, per-connection rate limiting, seat-bound
reconnection with grace windows, late-join spectators, and the
per-tick broadcast pipeline that ships every player their
fog-filtered `PlayerView`.

The package sits **on top of** `@europa/engine` and `@europa/fog`: it
never computes game state itself. Each tick it drains queued orders
into the engine session in canonical `(playerId, kind)` order,
advances the simulation once, asks fog for each connected player's
view, and broadcasts. All tunable numbers (tick rate, grace window,
rate limits, concurrency caps) live in one place
(`NETWORK_DEFAULT_CONFIG` / `NETWORK_CONSTANTS`).

> **Determinism is non-negotiable** (constitution Principle II).
> Networking never feeds wall-clock or randomness into game state:
> `createTickClock` is the sanctioned wall-clock boundary and passes
> `nowMs` *into* handlers; session tokens use the platform CSPRNG but
> are identity artifacts only. Verified end-to-end by a scripted-match
> determinism test (`tests/integration/tick-determinism.test.ts`).

---

## Install

From the monorepo root:

```bash
pnpm install
```

Networking depends on `@europa/engine` and `@europa/fog`
(`workspace:*`) for the simulation types, the engine session factory,
and the per-player view computation. Neither of them imports
networking — this package is a pure downstream consumer.

## Build

```bash
pnpm --filter @europa/networking build
```

Produces `dist/index.js` (ESM) and `dist/index.d.ts` (types) via `tsup`.

## Test

```bash
pnpm --filter @europa/networking test
```

Runs the full Vitest suite (177 tests at last count, ~10 s — dominated
by the 10 s SC-005 cadence soak). Coverage thresholds are 80% on every
metric (constitution Principle III merge gate):

```bash
pnpm --filter @europa/networking coverage
```

## Lint / Format / Typecheck

```bash
pnpm --filter @europa/networking lint          # biome check
pnpm --filter @europa/networking format:check  # biome format --no-write
pnpm --filter @europa/networking typecheck     # tsc --noEmit
```

---

## Quick usage

A minimal host that boots a server, registers a match, seats two
players, and serves ticks:

```ts
import { computePlayerView } from '@europa/fog';
import {
  createMatchServer,
  NETWORK_DEFAULT_CONFIG,
  NULL_LOGGER,
} from '@europa/networking';

const server = createMatchServer(
  { ...NETWORK_DEFAULT_CONFIG, port: 8080 },
  {
    // Engine sessions are constructed by the matchmaker (feature 006)
    // and handed over pre-built via registerMatch; the factory here is
    // a seam for tests. Wire up the real one when 006 lands.
    engine: {
      createMatchSession: (init) => realEngineSession(init),
    },
    fog: {
      computePlayerView: ({ world, playerId, spectator }) =>
        computePlayerView(world, playerId, { spectator }),
    },
    matchmaker: {
      onSeatClaimed: (event) => {/* record binding */},
      onSeatDisconnected: (event) => {/* start grace bookkeeping */},
      onSeatExpired: (event) => {/* forfeit handling */},
      onSeatReconnected: (event) => {/* clear grace state */},
      onMatchTerminal: (event) => {/* persist result, tear down */},
    },
    logger: NULL_LOGGER,
  },
);

await server.listen();

// Matchmaker hands over a filled match (session already constructed):
server.registerMatch({ matchId, engineSession, matchConfig });

// …and seats players. The matchmaking integration supplies the seat
// credentials; clients then complete hello + joinMatch through the lobby.
```

Clients speak a small JSON envelope protocol over one WebSocket per
connection (`{ v, seq, kind, payload }`, monotonically increasing
`seq`). The additive lobby message family establishes identity, sets a handle,
subscribes to public listings, and requests create, join, spectate, leave, or
return-to-lobby actions. The full message catalog lives in
`specs/004-multiplayer-networking/contracts/network-types.ts`.

---

## Public API surface

The full type surface is documented in `dist/index.d.ts` after build;
the source-of-truth contracts live at
`specs/004-multiplayer-networking/contracts/`.

### Server lifecycle

| Symbol | Purpose |
|--------|---------|
| `createMatchServer(config, deps)` | Construct a `Server`. Does not listen until `listen()`. |
| `Server.listen()` / `Server.close()` | Start/stop the listener + tick scheduler (both idempotent). |
| `Server.registerMatch(req)` | Hand a filled match to the server (engine session owned from here). |
| `Server.unregisterMatch(matchId)` | Teardown: clean closes, session release, grace-timer cancellation. |
| `Server.attachPlayer(req)` / `detachPlayer(req)` | Seat binding via session tokens (re-bind invalidates the old token). |
| `Server.enableSpectators(matchId)` / `disableSpectators(matchId)` | Gate late-join spectator attach (US3). |
| `Server.stats()` | Cheap `ServerStats` snapshot for `/health`, metrics, soak tests. |

### Runtime building blocks

| Symbol | Purpose |
|--------|---------|
| `Connection` | One client's framing, heartbeats, rate bucket, and outbound queue. |
| `MatchChannel` | Per-match seats, pending-order queue, canonical drain (FR-018), resync buffers. |
| `acceptOrder` / `applyOrdersAtTickBoundary` | Order validation → enqueue → boundary application pipeline. |
| `buildTickBroadcast` / `sendTickBroadcast` | Per-player view assembly + fan-out. |
| `attachSpectator` / `detachSpectator` / `SPECTATOR_VIEW_SEAT` | US3 spectator plumbing (full-board view, unfiltered events). |
| `ReconnectRegistry` / `ResyncBuffer` | US2 seat reclaim within the grace window + catch-up replay. |
| `StatsCounter` | Monotonic counter primitive behind `ServerStats`. |

### Protocol utilities

| Symbol | Purpose |
|--------|---------|
| `encodeFrame` / `decodeFrame` / `tryDecodeFrame` | Envelope ↔ wire JSON (decode validates; throwing and non-throwing variants). |
| `validateEnvelope` / `validateVersion` | Schema guard + API-version policy check (FR-004). |
| `NetworkError` / `isNetworkError` | Protocol-level rejection hierarchy with stable error codes. |
| `generateSessionToken` / `generateConnectionId` / `toBranded` | Branded identity generation. |
| `createTickClock` | The sanctioned wall-clock boundary (`nowMs` injected into handlers). |

### Lobby transport behavior

Lobby frames establish a guest identity before gameplay's greeted-state gate;
the server resolves the active identity from connection state. Client-supplied
handles, seat numbers, roles, or identity claims are advisory and cannot
override the server record. Every action receives an authoritative acceptance
or an actionable error, and lobby snapshots are applied only when their
revision is newer than the last applied revision. Handle validation requires
1–24 Unicode code points after trimming, at least one non-whitespace character,
no control characters, no bidirectional formatting controls, and no unpaired
surrogates; well-formed emoji counts as one code point and uniqueness compares
trimmed, case-insensitively.

The accepted handle follows the server-owned identity into the matchmaking
session, seat, waiting view, gameplay orders, reconnect state, and participant
labels, overlaid at the networking boundary without mutating engine simulation
state. Orders are always checked against the resolved seat. Player broadcasts
remain fog-filtered; spectator broadcasts are full-visibility and read-only.
The lobby distinguishes an initial loading state from a successfully loaded
empty state. The browser client sends heartbeat traffic and automatically
re-establishes a lobby connection when configured to do so. A reconnect within
`reconnectGraceMs` (60 seconds by default) restores the original association;
an invalid, expired, or mismatched credential cannot attach another player's
seat, orders, or view. The opaque guest identifier is delivered only in the
directed identity event to its owner; public listings, other connections,
URLs, views, and logs remain free of it.

Guest identities and handles are ephemeral process state, not authentication
or persistence. A server restart clears them and all lobby/match state.
Networking diagnostics must not log bearer credentials or opaque identity
identifiers.

### Constants & config

| Symbol | Purpose |
|--------|---------|
| `NETWORK_API_VERSION` | `'0.1.0'` — pin-check at consumer startup. |
| `NETWORK_CONSTANTS` | Tunable numeric rules (seq bounds, close codes, buffer caps). |
| `NETWORK_DEFAULT_CONFIG` | Default `ServerConfig`: 250 ms ticks, 5 s heartbeat, 60 s reconnect grace, 10 orders/s + 2× burst, 64 concurrent matches. |
| `NULL_LOGGER` | The default no-op logger. |

---

## Wire protocol behavior

- **Version policy (FR-004)**: clients hello with
  `payload.protocolVersion`; mismatches get an `error`
  (`version_mismatch`) frame followed by close `1008`. Pre-1.0, any
  minor bump is breaking (`0.1.x` compatible with `0.1.x`; `0.2.0`
  rejects `0.1.x`).
- **Order path**: submissions are validated, rate-limited
  (token bucket: `ordersPerSecond` refill, `rateLimitBurstFactor`
  burst), enqueued, and applied at the next tick boundary in canonical
  `(playerId, kind)` order; every submission gets exactly one
  `orderAck` correlating to its envelope `seq`.
- **Reconnect (US2)**: a dropped seat socket starts a
  `reconnectGraceMs` window; the same token rejoining receives a resync
  replay (snapshot + missed tick broadcasts) before live traffic.
  Expiry notifies the matchmaker (`onSeatExpired`).
- **Spectators (US3)**: when enabled, `joinMatch` with
  `role: 'spectator'` attaches a full-board view seat at any point in
  the match.
- **Terminal (US1)**: after each tick the engine status is checked;
  on terminal the final `MatchResult` is broadcast once and the match
  tears down.

---

## Determinism

1. **No clock reads in game-affecting code**: the scheduler injects
   `nowMs`; connection timeouts and rate refills consume it rather
   than calling `Date.now()` themselves.
2. **Canonical order application**: queued orders drain sorted by
   ascending `(playerId, kind)` — identical inputs produce identical
   simulations regardless of network arrival order (FR-018).
3. **Identity randomness is quarantined**: CSPRNG output appears only
   in session tokens/connection IDs, never in engine state.
4. **Single constants location**: every tunable number lives in
   `NETWORK_CONSTANTS` / `NETWORK_DEFAULT_CONFIG`.

Verified by `tests/integration/tick-determinism.test.ts` (scripted
match replayed byte-for-byte) and the SC-005 soak
(`tests/integration/perf.test.ts`: zero dropped ticks over a ~10 s
window at production cadence, median per-tick processing under budget).

---

## Conformance

The files in `src/contracts/` are byte-identical mirrors of the spec
contracts under `specs/004-multiplayer-networking/contracts/`
(local copies exist because `tsc`'s `rootDir` rejects imports from
outside the package). Drift between mirror and source-of-truth is a
bug caught by `tests/contracts-conformance.test.ts`, which also pins:

- compile-time mutual assignability of the re-exported engine/fog wire
  types (`Order`, `PlayerView`, `MatchResult`) against their canonical
  declarations, and
- exhaustiveness of the twelve-kind message union (a new `MessageKind`
  without a mapping fails `pnpm typecheck` via a `never` guard).

---

## Self-hosting

Zero external service dependencies: one Node process, one TCP port.
No database, no message broker, no native modules beyond `ws`.
TLS termination is a deployment concern (reverse proxy), not part of
this package. `permessage-deflate` ships disabled by default (zlib
memory fragmentation risk; see plan.md "Risk & Open Questions"). It
runs anywhere Node ≥ 22 runs, which keeps any Europa Neo deployment
self-hostable by default.

---

## Project layout

```
packages/networking/
├── src/
│   ├── broadcast.ts         # buildTickBroadcast / sendTickBroadcast
│   ├── clock.ts             # createTickClock (sanctioned wall-clock boundary)
│   ├── connection.ts        # Connection: framing, heartbeat, rate bucket
│   ├── constants.ts         # NETWORK_API_VERSION, NETWORK_CONSTANTS
│   ├── contracts/           # local copies of spec contracts (drift-tested)
│   ├── errors.ts            # NetworkError hierarchy
│   ├── frame.ts             # encodeFrame / decodeFrame / tryDecodeFrame
│   ├── ids.ts               # branded identity generation
│   ├── index.ts             # public barrel
│   ├── internal/            # non-public helpers
│   ├── match-channel.ts     # MatchChannel: seats, queues, canonical drain
│   ├── orders.ts            # acceptOrder / applyOrdersAtTickBoundary
│   ├── reconnect.ts         # ReconnectRegistry (US2 grace windows)
│   ├── resync.ts            # ResyncBuffer (catch-up replay)
│   ├── server.ts            # createMatchServer orchestrator
│   ├── spectator.ts         # attachSpectator / detachSpectator (US3)
│   ├── stats.ts             # StatsCounter
│   ├── types.ts             # public type re-exports + defaults
│   └── validate.ts          # validateEnvelope / validateVersion
└── tests/
    ├── fixtures/            # MockWebSocket / scripted match builders
    ├── integration/         # harness + US1/US2/US3 acceptance, perf,
    │                        # version policy, rate limit, determinism
    ├── unit/                # per-module unit tests
    └── contracts-conformance.test.ts
```

---

## License

Open source; license TBD by the project owner.
