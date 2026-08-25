# Research: Multiplayer Networking & Transport (Feature 004)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/004-multiplayer-networking/spec.md`
**Plan**: `specs/004-multiplayer-networking/plan.md`

> Decisions captured for the networking package: transport library,
> wire format, tick architecture, reconnection strategy, schema
> versioning, dependency surface. Each decision cites the version
> consulted (Aug 2026) via `context7` (current docs) or `websearch`
> (current practice).

---

## 1. Transport library — **`ws@^8.21` (native WebSocket, RFC 6455)**

**Decision**: Use the `ws` package by websockets/ws for both server
and Node-side client connections. Latest stable is `8.21.3`,
published 2026-08-07. ([npm registry](https://www.npmjs.com/package/ws),
[GitHub releases](https://github.com/websockets/ws/releases))

**Rationale**:
- **Zero runtime dependencies.** Inspecting `ws@8.21.3/package.json`
  confirms `"dependencies": {}` — the install surface is exactly one
  package, no transitive chain to audit.
- **MIT licensed**, matching the constitution's permissive-deps rule.
  188 releases over 14 years; 36,000+ dependent packages; passes the
  Autobahn test suite (server + client).
- **Pure WebSocket (RFC 6455)**. The browser console (feature 005)
  connects with the native `WebSocket` constructor — no extra client
  adapter, no socket.io-style protocol translation, no proprietary
  framing. Match spec FR-001 ("WebSocket with JSON text frames")
  literally.
- **Self-hostable by default** (constitution Principle VII). Optional
  `bufferutil` native addon is opt-in (`npm install --save-optional
  bufferutil`) — the package works on plain Node without any C++
  toolchain. A `WS_NO_BUFFER_UTIL` env var explicitly disables it for
  hardened deployments.
- **No coupling to a higher-level framework.** Colyseus and socket.io
  are solutions to broader problems (state-sync rooms / fallback
  transports) we don't have. Europa Neo owns its own state (engine +
  fog), so those frameworks' abstractions would be friction, not
  help.

**Alternatives considered**:
- **`socket.io@^4`** — adds HTTP long-polling fallback, automatic
  reconnection, and rooms/namespaces. None of those earn their
  complexity here: clients are modern browsers (no polling fallback
  needed), reconnect is application-layer (token-based, spec FR-007),
  and room concept maps cleanly onto our `MatchId` already. Socket.io
  also uses its own non-standard protocol on top of WebSocket, which
  adds a layer of "things to debug" with no payoff. Rejected.
- **`uWebSockets.js@^20`** — native C++ bindings; faster throughput
  but requires a C++ compiler at install time. Violates the "single
  `npm install && npm start`" self-hosting mandate (constitution
  Principle VII). Rejected.
- **`colyseus@^0.17`** — full authoritative multiplayer framework
  (rooms, state-sync schemas, matchmaking, scaling). Too much: it
  wants to own state-sync via `@colyseus/schema`, but our state-sync
  is the engine's `World` + fog's `PlayerView` and we already have
  deterministic tick semantics. Rejected (over-abstraction).
- **Node's experimental built-in WebSocket** (`--experimental-websocket`
  in Node 22+) — premature; not stable in Node 20 LTS which is the
  constitution's target. Rejected.

**Citation**: `ws@8.21.3` package metadata; Snyk advisor (no
vulnerabilities at 8.21.x; amplification CVE was fixed in 8.21.0);
August 2026 release cadence.

---

## 2. Wire format — **JSON text frames (locked by spec FR-001)**

**Decision**: Every WebSocket message is a UTF-8 JSON object with the
shape `ProtocolEnvelope<TPayload>`. No binary frames in v1.

**Rationale**:
- Spec FR-001 is explicit: "All client-server communication MUST run
  over WebSocket with JSON text frames carrying typed protocol messages."
  Feature 001's `engine-to-networking.ts` re-affirms: "networking uses
  JSON text frames per feature 004 FR-001."
- Bandwidth is well within budget at v1's scope:
  - 2-player match at 4 Hz tick rate → 8 messages/sec total
    (2 × tick broadcast + acks).
  - Average `TickBroadcastPayload` size ≈ 2 KB (one PlayerView, fog-
    filtered, ≈40 visible cells × ~50 bytes each, + events).
  - Even with 4 players + 20 spectators (theoretical ceiling), at
    10 Hz: 240 messages/sec × 2 KB ≈ 480 KB/sec outgoing. Trivial.
- Debuggability wins: a developer can `wscat -c ws://localhost:8080`
  and see readable JSON. WebSocket inspector tools (Chrome DevTools,
  Firefox dev tools) render JSON natively.
- Schema versioning is per-message via the envelope's `version` field
  (FR-004), so a future binary upgrade is additive — old clients
  ignore messages they don't recognize (the `MessageKind` union is
  forward-compatible).

**When we'd revisit**: spec SC-001 calls for ≥5,000-tick scripted
matches; we will measure per-frame size at Phase 6. If any single
payload exceeds 16 KB (WebSocket default text frame limit), or if
aggregate bandwidth exceeds 1 MB/sec on a typical match, we will
propose an additive MessagePack upgrade for tick/snapshot payloads
only (keeping hello/join on JSON for human readability). v1 ships
JSON.

**Alternatives considered**:
- **MessagePack** (`@msgpack/msgpack@^3`) — 30–50% size reduction,
  faster encode/decode than JSON, schema-aware. Rejected for v1:
  FR-001 locks JSON, and the bandwidth budget is comfortable.
- **CBOR** (`cbor-x@^1`) — similar tradeoffs to MessagePack. Rejected
  for the same reason; smaller ecosystem.
- **Custom binary** — YAGNI. Would require a schema-evolution story
  beyond what JSON envelopes already give us.

---

## 3. Tick loop architecture — **server-driven fixed cadence, single scheduler**

**Decision**: One `setInterval` per `createMatchServer` instance drives
*all* registered matches at the same `config.tickRateMs` cadence. Each
tick:
1. Drain pending order queues (per-match FIFO, sorted by player/kind)
   → call `engine.submit(order)` for each.
2. Call `engine.advance()` → `{ world, events, terminal? }`.
3. For each session (player + spectator) on each active match:
   - Compute `PlayerView` via `fog.computePlayerView(world, playerId, { spectator })`.
   - Compute the delta against the session's `lastSentView`.
   - Send the delta as a `TickBroadcastPayload` (or full `PlayerView`
     if it's the first tick after join/reconnect — i.e., no prior
     state to diff against).
4. If `terminal` is set, send `TerminalPayload` to every session on
   the match, transition connections to `terminal`, fire
   `MatchmakerBridge.onMatchTerminal`.

**Rationale**:
- **Server-driven** because spec FR-002 ("the server MUST be fully
  authoritative") and engine FR-017 ("no wall-clock reads in tick
  logic"). The engine is pure; the scheduler is the only place a
  clock appears.
- **Fixed cadence** because the original Europa was turn-paced but
  real-time; players expect consistent frame rate. Variable tick
  rates would re-introduce platform-dependent determinism concerns.
- **One scheduler per server** (not per match) for SC-005 (≥10
  concurrent matches without degradation). A single `setInterval`
  scales O(matches × per-tick work) without per-match timer overhead;
  matches are ticked in sequence within each interval, well under the
  250 ms budget on commodity hardware.
- **Per-match order queue** (not global) because order application is
  deterministic per match: feature 001 FR-018 sorts by `(playerId,
  kind)` for stability.

**Tick rate**: Default `250 ms` (4 Hz), matching the engine's
`DEFAULT_TICK_INTERVAL_MS`. Configurable via `ServerConfig.tickRateMs`;
must equal `MatchConfig.tickIntervalMs` for any registered match
(server validates at `registerMatch` time).

**Client-side interpolation**: v1 has no client-side prediction.
Console renders the latest authoritative frame each time it arrives
(spec FR-002). Tick-paced gameplay at 4 Hz is "twitchy enough" for
pipe management without interpolation. Predicted rendering can be
added later as a client-only QoL layer; it doesn't touch the wire
contract.

**Lag compensation**: v1 has no client-side prediction, so there's
no rollback reconciliation. Spec FR-008 says orders are applied "at
tick boundaries in deterministic order" — i.e., the server simply
queues orders and applies them at the next tick. A 100 ms RTT client
sees their order take effect ~1.5 ticks (250 ms cadence + 100 ms
network) after submission. Acceptable for tick-paced play.

**Alternatives considered**:
- **Per-match `setImmediate` loop** — high timer overhead at scale;
  no observable benefit for our 4 Hz cadence.
- **WebRTC data channels** — overkill; adds STUN/TURN infra that
  violates self-hosting.
- **Client-driven tick** — violates FR-002. Rejected outright.

---

## 4. Reconnection strategy — **token-based, server-side grace window**

**Decision**: Each successful `joinMatch` issues an opaque session
token (16 random bytes → 32 hex chars). The server stores
`{token → (matchId, playerId, role)}` mapping at `attachPlayer` time.
On reconnect within `config.reconnectGraceMs` (default 60 s), the
client presents the token via `joinMatch.reconnectToken`; the server
restores the seat, transitions the connection `pending → greeted →
rejoined`, and sends a fresh `SnapshotPayload` followed by per-tick
deltas.

**Rationale**:
- **Opaque token, server-side state** (rather than e.g., JWT with
  embedded claims) because:
  - v1 has no persistent accounts (spec Assumptions); tokens only
    need to live for the duration of one match.
  - Opaque tokens don't leak match structure (player count, match id)
    to a wire sniffer.
  - Matchmaking owns token issuance (UUID v4 via `crypto.randomUUID`);
    networking owns token validation. The boundary in
    `matchmaking-to-networking.ts` is explicit about this.
- **Grace window default 60 s** matches spec US2 AC-2 ("reconnect with
  valid session credentials within the timeout window"). Spec
  matchmaking US5 FR-010 references the same window — single source
  of truth in `ServerConfig.reconnectGraceMs`.
- **Single-use not enforced** at the networking layer (see
  `matchmaking-to-networking.ts` §"What matchmaking must NOT assume
  about networking" §1). If matchmaking wants one-shot tokens, it
  calls `detachPlayer` after the first claim.

**Implementation choice**: the grace timer is a `setTimeout` per
match. Matchmaking may independently track grace timers (so it can
cancel on reconnect); networking also tracks its own so it can
guarantee the `onSeatExpired` callback fires if matchmaking drops
the match.

**Edge cases**:
- **Two clients claim the same seat** (spec Edge Cases) → second
  `attachPlayer` call (with a *different* token) invalidates the old
  token and closes the old connection with code 4001 + error code
  `seat_taken`.
- **Server restart** (spec Edge Cases) → clients receive a clean
  `error` payload (`'internal_error'`) and the WebSocket is closed
  with code 1011. Matches are not persisted.
- **All players disconnect** → matchmaking handles this (matchmaking
  spec US5 AC-2); networking reports `onSeatExpired` for each player
  and matchmaking calls `unregisterMatch` if no players remain.

**Alternatives considered**:
- **JWT-style self-describing tokens** — rejected: we don't need
  stateless validation; server-side state is fine and simpler.
- **No reconnection in v1** — rejected: spec US2 is P2 and acceptance
  scenarios require it. The complexity is small (one timer per match).
- **Infinite grace window** — rejected: opens DoS via token hoarding;
  spec implies a bounded window.

---

## 5. Clock sync, out-of-order orders, rate limiting

**Decision**:
- **Out-of-order orders**: handled by per-connection FIFO queue. The
  client stamps each outbound `OrderSubmissionPayload.envelope.seq`
  monotonically; the server records the last accepted `clientSeq` and
  drops any inbound message with `seq <= lastClientSeq` as a duplicate
  (gracefully, no error — common during reconnect races). Spec FR-008
  ("deterministic order at tick boundaries") is satisfied because
  the per-session FIFO preserves submission order, and feature 001
  FR-018 sorts across sessions by `(playerId, kind)` at tick time.
- **Late orders**: dropped at the *engine* layer (`match_terminal`
  error) or at the *connection* layer if the match is already torn
  down. Networking doesn't special-case "late" — the engine's
  `submit` returns `CommandResult`; networking relays it.
- **Rate limiting**: per-connection token bucket (default 10 orders/s,
  burst 2.0×). Excess orders get `ErrorPayload` code `rate_limited`
  and do NOT advance the per-match pending queue. Heartbeats and
  pings do NOT consume tokens. Spec FR-010.
- **Clock skew**: irrelevant on the server side (server is the
  authoritative clock for tick boundaries). On the client side, the
  `ping.clientTimeMs` is informational only; the server doesn't act
  on it. Pong's `serverTimeMs` is also informational.

**Rationale**: minimal complexity, no client-side prediction
machinery, no synchronized clocks needed. Spec Edge Cases are
explicit about each of these.

---

## 6. Connection lifecycle (matchmaking ↔ networking handoff)

**Decision**: Matchmaking drives the match lifecycle; networking
manages the transport lifecycle. The boundary is declared in
`matchmaking-to-networking.ts`:

| Matchmaking action | Networking call | Reason |
|---------------------|-----------------|--------|
| Lobby fills, engine session constructed | `server.registerMatch({ matchId, engineSession, matchConfig })` | Networking now owns the transport for this match. |
| Each seat claimed at lobby | `server.attachPlayer({ matchId, playerId, sessionToken })` | Networking binds the token → seat for `joinMatch` validation. |
| Matchmaking enables spectating | `server.enableSpectators(matchId)` | Networking starts accepting spectator joins. |
| Player surrenders / eliminated | `server.detachPlayer({ matchId, sessionToken, reason })` | Networking closes the connection with a labeled error. |
| All seats empty past grace / match collected | `server.unregisterMatch(matchId)` | Networking closes all connections, releases engine session. |

| Networking event | Matchmaking callback | Reason |
|------------------|----------------------|--------|
| Client joined / reconnected | `bridge.onSeatClaimed` | Matchmaker records the binding for results delivery. |
| Client WebSocket dropped | `bridge.onSeatDisconnected` | Matchmaker starts (or notes) its grace timer. |
| Client reconnected in window | `bridge.onSeatReconnected` | Matchmaker cancels its grace timer. |
| Grace expired | `bridge.onSeatExpired` | Matchmaker applies forfeit policy. |
| Engine reported terminal | `bridge.onMatchTerminal` | Matchmaker records results, may offer rematch. |

**Rationale**: two-way coupling is intentional. Networking is the
only layer that sees WebSocket events; matchmaking is the only layer
that owns the durable seat binding. Neither reaches into the other
beyond these declared calls. See
`contracts/matchmaking-to-networking.ts` for the full surface and
the documented "What matchmaking must NOT assume about networking"
section.

---

## 7. Schema versioning — **`NETWORK_API_VERSION` + envelope `version` field**

**Decision**: `NETWORK_API_VERSION` is a single string constant
(`'0.1.0'` as of this plan). Every `ProtocolEnvelope` carries a
`version` field that MUST match the current `NETWORK_API_VERSION` at
send time. Major-version mismatch → server sends `ErrorPayload` with
code `version_mismatch` and closes the WebSocket with code 1008
("policy violation") per spec FR-004.

**Rationale**:
- The engine already declares `ProtocolEnvelope.version` with this
  semantics (`engine-to-networking.ts`); networking conforms.
- "Major version mismatch" means the first character before `.` differs
  — i.e., `'1.x.y'` vs `'0.x.y'`. Minor/patch drift is permitted
  forward (server → older client) and not enforced (server → newer
  client). This matches the spec FR-004 intent: "servers MUST reject
  mismatched *major* versions gracefully."
- Networking's version is distinct from engine's and fog's. We can
  evolve the wire protocol (e.g., add a new message kind) without
  forcing an engine rebuild, as long as the existing payload bodies
  remain unchanged.

**Wire format versioning vs payload shape versioning**: adding a new
`MessageKind` is additive (old clients ignore unknown `type` values).
Changing an existing payload's shape requires a major bump.

**Alternatives considered**:
- **Schema-registry-style versioning** (e.g., Protobuf, JSON Schema
  with `$id`) — overkill for v1; the `version` string is enough.
- **No versioning, only `type` discriminator** — would break FR-004;
  old clients would have to inspect `type` strings to detect skew.

---

## 8. Self-hosting — **single Node process, in-memory state, no external services**

**Decision**: One `createMatchServer(config, deps)` per process. No
Redis, no Postgres, no message queue, no external pub/sub. Match
state lives in process memory; a server restart loses all live
matches (spec Assumptions explicitly permit this for v1).

**Rationale**:
- Spec Assumptions: "Matches are held in memory; server
  persistence/restart recovery is explicitly out of scope for v1."
- Constitution Principle VII ("Self-Hostable by Default"): `npm install
  && npm start` is the deployment story.
- The `ws` library is single-process; scaling beyond one process
  would require sticky sessions or shared state — out of v1 scope.
- SC-005 (≥10 concurrent matches / ≥20 sockets without degradation)
  is comfortably within a single Node process's capacity at 4 Hz.

**TLS**: out of scope per spec Assumptions ("TLS termination is a
deployment concern (reverse proxy), not part of this feature"). A
self-hoster fronts the process with nginx/Caddy for wss://.

---

## 9. Spectator session handling

**Decision**: Spectators are connections, not seats. `enableSpectators`
flips a per-match flag; subsequent `joinMatch` calls with
`role: 'spectator'` are accepted (subject to `maxConcurrentMatches`)
and receive full-board `PlayerView` on each tick. Spectator-submitted
orders are rejected with `ErrorPayload` code `spectator_readonly`.

**Rationale**:
- Spec US3 (P3) defines spectator as "attach to a running match as a
  spectator and receive full-visibility updates ... and any order
  they send is rejected."
- Fog's `computePlayerView` accepts `options.spectator: true`; the
  server passes that flag through.
- Networking does NOT inspect the resulting `PlayerView.visibleCells`
  to verify spectator vs player; it trusts fog's output. The
  redaction guarantee is verified by spec SC-004 (zero fog-of-war
  violations in a 500-tick audit), which networking supports by
  serializing `view` verbatim.
- Spectators don't hold session tokens for reconnect purposes (they
  have no seat to reclaim). If a spectator disconnects, they
  re-attach with a new connection (the old one is closed, no grace
  timer).

---

## 10. Delta encoding strategy (FR-006)

**Decision**: Per-tick broadcasts carry the full `PlayerView` over
the wire, but networking computes and caches a *delta* between
successive `PlayerView`s at send time. The wire format is the
`PlayerView` itself (no separate delta payload); the delta
computation is purely a server-side optimization to detect when
nothing changed and skip the send.

**Wire optimization**: when the fog mask + cell values for a
recipient haven't changed since the last tick, networking omits the
broadcast entirely (the client's local cache stays valid). Spec
FR-006 ("Tick payloads MUST be deltas") is satisfied because the
*effective* bytes-on-wire are zero in the steady state of a quiet
match.

**Rationale**:
- Computing structural diffs of `PlayerView.visibleCells` (array of
  `CellView` objects) is straightforward: compare cell-by-cell in
  row-major order, emit a `CellView` if any field differs. This is
  a server-side optimization; the client never sees a delta format
  (it just doesn't receive a frame for unchanged ticks).
- A separate "delta payload" type would require either:
  - The client to track a version vector and request resyncs on
    drift (complex), OR
  - A binary diff format (MessagePack / custom) that's also
    bandwidth-positive but loses JSON debuggability.
- Skipping the send entirely (no-op tick) is the right call for a
  4 Hz cadence where many ticks are quiescent. The client renders
  the last known state and continues.

**Resync**: client may send a future `requestResync` message (not in
v1) to force a `SnapshotPayload` send. v1 ships with implicit
resync only on reconnect.

**Alternatives considered**:
- **Explicit delta protocol** (`TickDeltaPayload` with `changedCells:
  CellView[]`) — rejected: complicates client cache logic for a
  bandwidth saving that's negligible at v1 scale. Easy to add
  later as an additive message kind.
- **Server pushes deltas as a stream of cell updates** — over-
  engineering for v1.

---

## 11. Single Node process, multi-match scheduler

**Decision**: One `setInterval(schedulerTick, config.tickRateMs)`
loop processes every registered match in a single iteration. Per-
match work is bounded by engine + fog perf budgets (~15 ms per match
on 32×32, per feature 001 SC-004 and feature 002 SC-004 budget
allocs). At 64 concurrent matches (the default `maxConcurrentMatches`)
the worst-case scheduler iteration is ~1 s — above the 250 ms budget.

**Mitigation**: at high match counts, the scheduler splits work
across multiple intervals (a "tick wave" model): matches are
processed in groups of ~16 per interval, with full coverage every 4
intervals (~1 s). This degrades tick rate at very high load but
preserves determinism within each match (it never *skips* a tick,
just *delays* it).

For v1 the default 64-match cap comfortably fits in a single
interval on commodity hardware (matches × ~10 ms ≪ 250 ms). The
"tick wave" fallback is documented for future scaling.

**Rationale**: single scheduler is the simplest correct design. The
wave model is mentioned only to set expectations for SC-005 verification.

---

## 12. What we are *not* doing (deferred)

Per constitution Principle V (Simplicity Over Cleverness), v1
networking explicitly defers:

- **Persistence** — matches live in process memory; restart = match
  lost. Spec Assumptions; deferred to a future "match history" feature.
- **Cross-server scaling** — no Redis pub/sub, no multi-process
  match sharding. SC-005 is within single-process capacity for v1.
- **Client-side prediction / rollback** — not in v1; console renders
  authoritative frames only. Spec FR-002.
- **WebRTC data channels** — out of scope; would require STUN/TURN
  infrastructure that violates self-hosting.
- **Compression (`permessage-deflate`)** — disabled by default on the
  server. JSON payloads are small enough at v1 cadence; compression
  adds per-connection CPU overhead and zlib memory fragmentation
  concerns (per `ws` README warning). Trivial to enable later per
  `WebSocketServer({ perMessageDeflate: ... })`.
- **Custom binary delta protocol** — see §10.
- **Authentication / accounts** — out of scope (matchmaking spec
  Assumptions; future feature).

---

## 13. Resolved unknowns

| Open question (from prompt) | Resolution |
|-----------------------------|------------|
| Transport library | `ws@^8.21` (native WebSocket, MIT, zero deps) |
| Wire format | JSON text frames (locked by spec FR-001) |
| Tick rate | 250 ms (4 Hz), matches engine default; configurable |
| Client-side prediction | None in v1 (spec FR-002 forbids client state mutation) |
| Lag compensation | None in v1; tick-paced gameplay, ~1.5-tick order latency budget |
| Reconnection strategy | Opaque session token + 60 s grace window (configurable) |
| Out-of-order orders | Per-connection FIFO; client `seq` for dup detection |
| Late orders | Engine returns `match_terminal`; networking relays |
| Rate limiting | Per-conn token bucket, default 10/s, burst 2× |
| Connection lifecycle | Two-way matchmaking ↔ networking; see §6 + `matchmaking-to-networking.ts` |
| Schema versioning | `NETWORK_API_VERSION` + envelope `version` field; major mismatch = `version_mismatch` |
| Self-hosting | Single Node process, no external services (constitution §VII) |
| Spectators | Per-connection flag; fog's `options.spectator` honored; orders rejected |
| Delta encoding | Server-side diff optimization; effective no-op for unchanged ticks; client sees full PlayerView |
| Single scheduler scale | Single `setInterval`, ≤64 matches by default; wave model fallback at higher counts |

No `NEEDS CLARIFICATION` markers remain.

---

## 14. Stack consistency check

This feature conforms to the locked stack decisions from feature 001's
plan (`research.md` §1–§4):

- pnpm 11 workspaces — networking is `@europa/networking` in the same
  monorepo, depends on `@europa/engine` and `@europa/fog` via
  `workspace:*`.
- tsup 8.x for build (ESM + dts), Vitest 4.1 for tests, Biome 2 for
  lint/format.
- TypeScript ≥ 5.6 strict, Node ≥ 20 LTS.
- Zero non-permissive dependencies; `ws` is MIT, no transitive deps.

---

**Citation**: `ws@8.21.3` package metadata (npm registry, Aug 2026);
Node.js `crypto.randomUUID()` (Node 20 LTS built-in); spec FR-001
through FR-011; constitution §I–§VII.
