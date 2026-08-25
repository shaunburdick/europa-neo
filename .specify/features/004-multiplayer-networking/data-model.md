# Data Model: Multiplayer Networking & Transport (Feature 004)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: `.specify/features/004-multiplayer-networking/spec.md`

> Every entity, field, transition, and invariant the networking package
> exposes or maintains. Source of truth for the wire types is
> `contracts/network-types.ts`; source of truth for the server-side
> state is this document + `contracts/network-api.ts` (the internal
> `MatchTransport` / `ConnectionRecord` / `SeatRecord` shapes).
>
> Engine types (`World`, `Order`, `PlayerView`) are imported from
> `@europa/engine` and `@europa/fog`; they are not redefined here.
> Drift between this plan and those contracts = bug.

---

## 1. Overview of entities

Networking maintains **three layers of state**, each with its own
visibility:

| Layer | Entity | Lives in | Visibility |
|-------|--------|----------|------------|
| **Wire** | `ProtocolEnvelope<T>`, `NetworkPayload` | on the wire | public |
| **Server-side connection** | `ServerConnection`, `RateLimitBucket`, `ConnectionState` | process memory | internal (`@internal` in contracts) |
| **Server-side match** | `MatchTransport`, `SeatRecord`, `ConnectionRecord` | process memory | internal |

Plus **two reference entities** held by matchmaking (declared in
`matchmaking-to-networking.ts` for symmetry):

- `NetworkingSeatClaimed`, `NetworkingSeatDisconnected`, etc. — the
  events networking reports back to matchmaking.
- `MatchmakingRegisterMatch`, `MatchmakingAttachPlayer`, etc. — the
  requests matchmaking sends to networking.

---

## 2. Wire entities (the universal frame)

### 2.1 `ProtocolEnvelope<TPayload>`

The single shape that wraps every WebSocket frame.

```ts
interface ProtocolEnvelope<TPayload extends NetworkPayload> {
  readonly type: MessageKind;       // string discriminator
  readonly version: string;          // matches NETWORK_API_VERSION at send time
  readonly seq: SequenceNumber;      // monotonic per (session, direction)
  readonly payload: TPayload;        // discriminated body
}
```

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `type` | `MessageKind` (closed union of 12 string literals) | required | Discriminator. Receiver narrows `payload` via `switch (envelope.type)`. |
| `version` | `string` | MUST equal sender's current `NETWORK_API_VERSION` | Spec FR-004 schema versioning. Major-version mismatch → reject. |
| `seq` | `SequenceNumber` (uint32 branded) | monotonic per (session, direction), starts at 1 | Order ack correlation; client drop detection. |
| `payload` | `NetworkPayload` (union of 12 variants) | discriminated by `type` | The message body. |

**Invariants**:
- Every WebSocket text frame parses to exactly one `ProtocolEnvelope`.
- An envelope whose `type` is not in `MessageKind` triggers an
  `error` reply with code `unknown_message_kind` and the connection
  is closed (per `error` enum, FR-004 spirit).
- An envelope whose `version` major differs from `NETWORK_API_VERSION`
  triggers an `error` reply with code `version_mismatch`; connection
  is closed with code 1008 ("policy violation").

### 2.2 `NetworkPayload` (discriminated union)

12 variants, partitioned into transport-layer (networking-owned) and
engine-mirrored (conformed to feature 001's `engine-to-networking.ts`).

| `type` | Direction | Payload | Source-of-truth contract |
|--------|-----------|---------|--------------------------|
| `hello` | C → S | `HelloPayload` | `network-types.ts` |
| `helloAck` | S → C | `HelloAckPayload` | `network-types.ts` |
| `joinMatch` | C → S | `JoinMatchPayload` | `network-types.ts` |
| `joinAck` | S → C | `JoinAckPayload` | `network-types.ts` |
| `ping` | C → S | `PingPayload` | `network-types.ts` |
| `pong` | S → C | `PongPayload` | `network-types.ts` |
| `order` | C → S | `OrderSubmissionPayload` | `engine-to-networking.ts` (conformed) |
| `orderAck` | S → C | `OrderAckPayload` | `engine-to-networking.ts` (conformed) |
| `snapshot` | S → C | `SnapshotPayload` | `engine-to-networking.ts` (conformed) |
| `tick` | S → C | `TickBroadcastPayload` | `engine-to-networking.ts` (conformed); re-projected onto `PlayerView` |
| `terminal` | S → C | `TerminalPayload` | `engine-to-networking.ts` (conformed) |
| `error` | S → C | `ErrorPayload` | `network-types.ts` |

**Field constraints** (per payload):

- `HelloPayload.protocolVersion` — MUST match `NETWORK_API_VERSION` (or
  major-version match if client is older).
- `JoinMatchPayload.matchId` — opaque string (branded `MatchId`).
- `JoinMatchPayload.sessionToken` — required only on reconnect; absent
  for new joins.
- `OrderSubmissionPayload.order` — discriminated union over 8 engine
  `Order` kinds; server validates via `engine.submit`.
- `OrderAckPayload.seq` — MUST equal the inbound `OrderSubmissionPayload`'s
  envelope `seq`.
- `SnapshotPayload.world` — full `World` from engine (for resync).
- `TickBroadcastPayload.view` — fog-filtered `PlayerView` per
  recipient (full board for spectators).
- `TerminalPayload.result` — engine's `MatchResult` (win/draw).
- `ErrorPayload.code` — closed `ErrorCode` union (see §8).

### 2.3 `MessageKind` (the discriminator)

Closed string-literal union of 12 values (see table above). Adding a
kind is an **additive** change (old clients ignore unknown `type`
values). Removing a kind or changing a payload's shape requires a
major version bump of `NETWORK_API_VERSION`.

---

## 3. Connection state machine

### 3.1 `ConnectionState`

8 states, with one terminal success state (`terminal`) and one
terminal failure state (`closed`).

```
                    ┌──────────────────────────────────────┐
                    │                                      │
              ┌─────▼─────┐                                │
              │  pending  │  ← server assigns ConnectionId  │
              └─────┬─────┘    on ws 'connection'           │
                    │ hello(version)                        │
                    │ + version OK                          │
                    ▼                                      │
              ┌───────────┐                                │
              │ greeted   │                                │
              └─────┬─────┘                                │
                    │ joinMatch(token?|new)                │
                    │ + token valid / seat open             │
                    ▼                                      │
              ┌───────────┐                                │
              │  joined   │  ← receives tick broadcasts     │
              └─────┬─────┘                                │
   ws disconnect ┌───┴────┐ reconnect(token)              │
                 ▼        └────────────┐                   │
           ┌───────────────┐          ▼                   │
           │ disconnected  │    ┌───────────┐             │
           └───────┬───────┘    │ rejoined  │             │
                   │            └─────┬─────┘             │
        grace      │                  │ (normal joined)   │
        window     │                  │                   │
        expires    │                  │                   │
                   ▼                  │                   │
           ┌───────────────┐          │                   │
           │   expired     │          │                   │
           └───────┬───────┘          │                   │
                   │ bridge.onSeatExpired                  │
                   │ (matchmaker applies forfeit)         │
                   ▼                                      │
           (connection record dropped; seat → matchmaker)  │
                                                          │
              match terminal:                             │
              joined / rejoined ──────────────────┐       │
                                                 ▼       │
                                          ┌───────────┐  │
                                          │ terminal  │  │
                                          └─────┬─────┘  │
                                                │        │
                                                ▼        │
                              ┌──────────────────────────────────────┐
                              │          closed (any state → close()) │
                              └──────────────────────────────────────┘
```

### 3.2 State transition rules

| From | Event | To | Side effects |
|------|-------|----|--------------|
| (none) | `ws.open` | `pending` | Assign `ConnectionId`; start heartbeat monitor |
| `pending` | valid `hello` received | `greeted` | Send `helloAck`; start `heartbeatIntervalMs` timer |
| `pending` | invalid `hello` (version mismatch / malformed) | `closed` | Send `error`; close ws code 1008 |
| `pending` | `2 × heartbeatIntervalMs` elapsed with no message | `closed` | Server-initiated close (silent) |
| `greeted` | valid `joinMatch` (token matches seat, seat open) | `joined` | Send `joinAck` with `PlayerView`; subscribe to tick broadcasts; fire `bridge.onSeatClaimed` |
| `greeted` | valid `joinMatch` (token matches seat, seat held) | `rejoined` | Send fresh `snapshot`; fire `bridge.onSeatReconnected` |
| `greeted` | invalid `joinMatch` (token unknown, match full, etc.) | `greeted` (no transition) | Send `error`; keep socket open for retry |
| `greeted` | `2 × heartbeatIntervalMs` elapsed | `closed` | Server-initiated close |
| `joined` / `rejoined` | inbound `order` | (no transition) | Validate, stage, ack |
| `joined` / `rejoined` | inbound `ping` | (no transition) | Reply `pong` |
| `joined` / `rejoined` | engine reports `terminal` | `terminal` | Send `terminal`; close after grace period |
| `joined` / `rejoined` | ws close / error | `disconnected` | Fire `bridge.onSeatDisconnected`; start `reconnectGraceMs` timer; keep token valid |
| `disconnected` | new ws connects with same token | `rejoined` | Cancel grace timer; send snapshot; fire `bridge.onSeatReconnected` |
| `disconnected` | grace timer expires | `expired` | Fire `bridge.onSeatExpired`; drop connection record; matchmaker applies forfeit |
| `joined` / `rejoined` / `greeted` | server closes (match unregistered) | `closed` | Send `error` if time; close ws code 1001 |
| any state | explicit `close()` call | `closed` | Send `error` if time; close ws code 1000 |

**Invariants**:
- A connection in `pending` cannot send `order` / `joinMatch`; doing
  so triggers `error` code `protocol_sequence_error`.
- A connection in `disconnected` has no live WebSocket; the
  `ConnectionRecord` is retained in the match's `SeatRecord` until
  grace expiry.
- A connection in `expired` has its `ConnectionRecord` deleted; the
  `SeatRecord`'s `connection` field is set to `null`.

---

## 4. Server-side entities (process memory)

These types are declared in `contracts/network-api.ts` with `@internal`
JSDoc. They are server-only — never serialized to the wire.

### 4.1 `ServerConnection` (lightweight view)

```ts
interface ServerConnection {
  readonly id: ConnectionId;             // server-assigned, opaque
  readonly matchId: MatchId;              // routing key
  readonly role: ConnectionRole;          // 'player' | 'spectator'
  readonly playerId: PlayerId | null;     // null for spectators
  readonly state: ConnectionState;
  readonly sessionToken: SessionToken | null;
  readonly clientSeq: SequenceNumber;
  readonly serverSeq: SequenceNumber;
  readonly lastSeenAtMs: number;          // epoch ms, for heartbeat
  readonly lastSentAtMs: number;
  readonly rateBucket: RateLimitBucket;
}
```

| Field | Type | Set when | Mutates? |
|-------|------|----------|----------|
| `id` | `ConnectionId` (branded string) | ws `connection` | no |
| `matchId` | `MatchId` | first message identifying the match (`hello` or `joinMatch`) | no |
| `role` | `ConnectionRole` | `joinMatch` | no |
| `playerId` | `PlayerId \| null` | `joinMatch` (server-resolved) | no |
| `state` | `ConnectionState` | transitions per §3.2 | yes |
| `sessionToken` | `SessionToken \| null` | `joinAck` send | no |
| `clientSeq` | `SequenceNumber` | every inbound message | yes (increment) |
| `serverSeq` | `SequenceNumber` | every outbound message | yes (increment) |
| `lastSeenAtMs` | `number` | every inbound message | yes (update) |
| `lastSentAtMs` | `number` | every outbound message | yes (update) |
| `rateBucket` | `RateLimitBucket` | every inbound `order` | yes (refill/consume) |

### 4.2 `RateLimitBucket`

Per-connection order rate limit. Token-bucket algorithm.

```ts
interface RateLimitBucket {
  readonly capacity: number;          // max ordersPerSecond * burstFactor
  readonly refillPerSec: number;      // ordersPerSecond
  readonly tokens: number;            // current available (float)
  readonly lastRefillAtMs: number;    // epoch ms of last refill calc
}
```

**Algorithm** (applied on every inbound `order`):
```
now = Date.now()
elapsed = (now - bucket.lastRefillAtMs) / 1000
bucket.tokens = Math.min(capacity, tokens + elapsed * refillPerSec)
bucket.lastRefillAtMs = now
if bucket.tokens >= 1.0:
  bucket.tokens -= 1.0
  accept order
else:
  reject with error code 'rate_limited'
```

**Defaults**: `capacity = ordersPerSecond × 2.0 = 20`; `refillPerSec =
10`. Configurable per server via `ServerConfig`.

**Invariants**:
- Only `order` messages consume tokens. `hello`, `joinMatch`, `ping`,
  `pong`, etc. are NOT rate-limited.
- The bucket is per-connection, not per-IP. NAT'd clients (multiple
  connections behind one IP) get independent buckets.
- The bucket is not persisted across reconnects — a reconnecting
  client gets a fresh bucket. Spec doesn't require otherwise.

### 4.3 `MatchTransport` (per-match server state)

```ts
interface MatchTransport {
  readonly matchId: MatchId;
  readonly engineSession: EngineSession;
  readonly matchConfig: MatchConfig;
  readonly seats: Map<PlayerId, SeatRecord>;
  readonly spectatorConnections: Map<ConnectionId, ConnectionRecord>;
  readonly tickCounter: number;                  // monotonic
  readonly pendingOrders: Array<PendingOrder>;   // drained at tick boundaries
  readonly lastSentView: Map<ConnectionId, PlayerView>;  // delta cache
  readonly spectatorsAllowed: boolean;
  readonly terminalSent: boolean;
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `matchId` | `MatchId` | Routing key from matchmaking |
| `engineSession` | `EngineSession` | The handle to feature 001's pure engine |
| `matchConfig` | `MatchConfig` | Snapshot for version checks, telemetry, log context |
| `seats` | `Map<PlayerId, SeatRecord>` | Per-player bindings (token + optional connection) |
| `spectatorConnections` | `Map<ConnectionId, ConnectionRecord>` | Active spectator connections (no seat) |
| `tickCounter` | `number` | Increments per scheduler tick; used for `TickBroadcastPayload.tick` |
| `pendingOrders` | `Array<PendingOrder>` | Per-tick FIFO of submitted orders, drained at tick boundary |
| `lastSentView` | `Map<ConnectionId, PlayerView>` | Server's cache of last view sent to each connection; used for delta detection (server-side optimization) |
| `spectatorsAllowed` | `boolean` | Set by `enableSpectators` |
| `terminalSent` | `boolean` | Set after `terminal` payload is sent; prevents duplicate sends |

**Invariants**:
- `seats.size` ≤ `matchConfig.playerCount` (2 by v1 default; up to 4).
- `pendingOrders` is drained atomically at tick boundary (sorted by
  `playerId` ascending, then `order.kind` for stability — feature 001
  FR-018).
- `lastSentView` is updated *after* a successful send, not before.
  If the send fails (socket closed mid-tick), the cache stays at its
  last successful value — on reconnect the client gets a full
  snapshot, not a stale delta.
- `tickCounter` increments monotonically across the match's lifetime.
  Resetting (e.g., across rematches) is matchmaking's job via
  `unregisterMatch` + `registerMatch` for a new match.

### 4.4 `SeatRecord`

```ts
interface SeatRecord {
  readonly playerId: PlayerId;
  readonly sessionToken: SessionToken;
  connection: ConnectionRecord | null;          // mutable: detach/attach
  disconnectedAtMs: number | null;             // mutable: grace timer anchor
}
```

| Field | Purpose |
|-------|---------|
| `playerId` | The seat's stable player number |
| `sessionToken` | Issued by matchmaking at lobby entry; opaque to networking |
| `connection` | The currently-attached WebSocket, or `null` if disconnected |
| `disconnectedAtMs` | Epoch ms of last disconnect; `null` if currently connected. Used to compute remaining grace. |

### 4.5 `ConnectionRecord` (richer than `ServerConnection`)

```ts
interface ConnectionRecord {
  readonly id: ConnectionId;
  readonly socket: WebSocket;                  // the underlying ws handle
  readonly matchId: MatchId;
  readonly role: ConnectionRole;
  readonly playerId: PlayerId | null;
  state: ConnectionState;                       // mutable
  sessionToken: SessionToken | null;            // mutable (set at joinAck)
  clientSeq: number;                            // mutable
  serverSeq: number;                            // mutable
  lastSeenAtMs: number;                         // mutable
  lastSentAtMs: number;                         // mutable
  rateBucket: RateLimitBucket;                  // mutable
}
```

`ConnectionRecord` is the rich server-side record; `ServerConnection`
(in `network-types.ts`) is its public projection (no `socket`,
sharper types).

### 4.6 `PendingOrder`

```ts
interface PendingOrder {
  readonly playerId: PlayerId;
  readonly order: Order;
  readonly submittedAtSeq: number;  // client seq for ack correlation
}
```

**Invariants**:
- `submittedAtSeq` echoes the inbound `OrderSubmissionPayload`'s
  envelope `seq`. The server's `OrderAckPayload.seq` echoes it back.
- `playerId` MUST equal `order.player` (engine validation enforces).

---

## 5. Session token model

### 5.1 Token format

A `SessionToken` is a v4 UUID string (36 chars: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`) branded nominally.

**Issuance**: Matchmaking issues tokens via Node's built-in
`crypto.randomUUID()` (Node 20 LTS, RFC 4122 v4). Networking never
generates tokens; it only stores and validates them.

**Validation**: On `joinMatch.reconnectToken`, networking compares
the incoming string to the `SeatRecord.sessionToken` it stored at
`attachPlayer` time. Comparison is constant-time to prevent timing
side-channels (not strictly necessary for v1 since there's no
adversary model beyond self-hosted LAN play, but the cost is
negligible).

**Lifetime**: A token is valid from `attachPlayer` time until
`detachPlayer` (surrender / elimination / match end). Tokens are NOT
expired by `reconnectGraceMs` — that's the grace window for *socket*
reconnection, not the token's lifetime.

### 5.2 Token rotation

Not in v1. The same token is used for the entire seat lifetime. A
future "session security" feature may rotate tokens on every
reconnect.

---

## 6. Tick pipeline (per scheduler tick)

The server's `schedulerTick` callback (driven by `setInterval`) does:

```
for each MatchTransport mt:
  1. Apply pending orders:
     sort mt.pendingOrders by (playerId asc, kind asc)  // feature 001 FR-018
     for each PendingOrder in sorted list:
       result = mt.engineSession.submit(order)
       send orderAck(seq=pendingOrder.submittedAtSeq, result) to source connection
       if !result.ok: log error; continue

  2. Drain queue:
     mt.pendingOrders.length = 0

  3. Tick the engine:
     tickResult = mt.engineSession.advance()
     mt.tickCounter += 1

  4. Compute per-session view:
     world = tickResult.world
     events = tickResult.events
     for each ConnectionRecord conn in (mt.seats connections + mt.spectatorConnections):
       isSpectator = conn.role === 'spectator'
       view = fog.computePlayerView({ world, playerId: conn.playerId ?? 1, spectator: isSpectator })

       5. Delta detection (server-side optimization):
          prev = mt.lastSentView.get(conn.id)
          if prev && viewsEqual(prev, view) && eventsMatchForRecipient(prev.events, view.events):
            continue  // skip the send

       6. Send:
          sendFrame(conn, 'tick', { tick: mt.tickCounter, view })
          mt.lastSentView.set(conn.id, view)

  7. Terminal?
     if tickResult.terminal:
       sendFrame to every connection: 'terminal', { result: tickResult.terminal }
       mt.terminalSent = true
       bridge.onMatchTerminal({ matchId, result: tickResult.terminal, tick: mt.tickCounter })
       // Matchmaking decides when to call unregisterMatch
```

**Invariants**:
- Step 1 is synchronous per match: an `orderAck` is sent for every
  inbound order before the tick advances.
- Step 4 uses fog's `computePlayerView` for both players and
  spectators; the only difference is the `spectator` flag.
- Step 5 (`viewsEqual`) is a structural comparison: row-major cell
  comparison + event list equality. Implementation detail; the wire
  contract is unaffected.
- Step 7 fires the `onMatchTerminal` callback exactly once per match
  end (the `terminalSent` flag guards against re-fire on subsequent
  ticks after the match is already terminal — engine guarantees
  `tick()` on a terminal world is a no-op).

---

## 7. Tick delta detection (server-side optimization)

Networking caches the last `PlayerView` sent to each connection. On
each tick:

```ts
function viewsEqual(a: PlayerView, b: PlayerView): boolean {
  if (a.tick !== b.tick) return false;
  if (a.player !== b.player) return false;
  if (a.visibleCells.length !== b.visibleCells.length) return false;
  // row-major cell-by-cell compare
  for (let i = 0; i < a.visibleCells.length; i++) {
    if (!cellViewEqual(a.visibleCells[i], b.visibleCells[i])) return false;
  }
  return eventsEqual(a.events, b.events);
}
```

**When the delta is non-empty**: send the full `PlayerView` (the
wire payload is *always* a full `PlayerView`; "delta" is purely a
server-side optimization to *skip* the send when nothing changed).

**Client perspective**: the client never sees "nothing happened" —
it simply doesn't receive a `tick` frame for a quiescent tick, and
its local cache stays valid. The next `tick` it receives applies
to its cache as a full `PlayerView` (i.e., replace, not merge).

This satisfies spec FR-006 ("Tick payloads MUST be deltas (changed
cells/events only) relative to the recipient's last known state")
because the effective delta is zero-bytes-omitted in the steady
state.

---

## 8. Error codes

Closed union (`ErrorCode` in `network-types.ts`):

| Code | Trigger | Client behavior |
|------|---------|-----------------|
| `version_mismatch` | `hello.protocolVersion` major mismatch | Re-show lobby; offer upgrade prompt |
| `malformed_payload` | JSON parse error or schema validation failed | Log; retry once; if persists, reconnect |
| `unknown_message_kind` | `envelope.type` not in `MessageKind` | Client bug; should not happen |
| `protocol_sequence_error` | e.g., `order` before `joinMatch` | Reset client state machine; reconnect |
| `match_not_found` | Private match lookup miss (US3 FR-006) | Show "match not found" |
| `match_full` | All seats taken | Show "match full" |
| `match_not_joinable` | Already running, no open seats | Show "match started" |
| `token_invalid` | Reconnect token unknown | Show "session expired" |
| `token_expired` | Token lifetime ended (match unregistered) | Show "match ended" |
| `seat_taken` | Another connection claimed this seat | Re-show lobby |
| `rate_limited` | Token bucket empty | Throttle locally; retry next tick |
| `spectator_readonly` | Spectator submitted order | Disable order UI |
| `internal_error` | Server-side exception | Reconnect; if persists, server bug |

**Invariants**:
- Every `ErrorPayload` has a stable `code` (closed union).
- The optional `detail` field is for debug only; clients should not
  branch on it.
- Errors are advisory; the server typically closes the connection
  after sending an error. The client treats the close as terminal
  and surfaces the error code to the user.

---

## 9. Relationship to engine and fog entities

Networking imports (type-only) the following from `@europa/engine`
and `@europa/fog`:

| Imported type | Where used |
|---------------|------------|
| `World` | `SnapshotPayload.world`; `TickBroadcastPayload.view.config` (transitively) |
| `Order` (8-variant union) | `OrderSubmissionPayload.order` |
| `CommandResult` | `OrderAckPayload.result` |
| `ValidationError` | `OrderAckPayload.result.reason`; `ErrorPayload.detail` |
| `MatchResult` | `TerminalPayload.result`; `MatchmakerBridge.onMatchTerminal.result` |
| `PlayerId` | `JoinAckPayload.playerId`; `ServerConnection.playerId` |
| `TickEvents` | `TickBroadcastPayload.view.events` |
| `PlayerView` | `TickBroadcastPayload.view`; `JoinAckPayload.view`; `lastSentView` value |
| `MatchConfig` | `ServerConfig` validation; `MatchTransport.matchConfig` |

**Drift detection**: a conformance test in
`packages/networking/tests/conformance.test.ts` imports the same
types from both `@europa/engine` and `@europa/fog` and asserts the
declared shapes match. Drift = test failure.

---

## 10. What is **not** in the data model

These are deliberately omitted (deferred or out of scope):

- **Persistent match records** — no DB; in-memory only.
- **Cross-process shared state** — no Redis; single process.
- **Client-side prediction state** — no rollback buffers.
- **Compression state** — `permessage-deflate` disabled by default;
  if enabled in the future, the negotiated params live on the
  `ws` socket, not in our types.
- **Custom binary diff format** — wire is JSON; deltas are
  server-side optimization only.
- **TLS state** — terminated by reverse proxy; networking never sees
  TLS.
- **Authentication state** — no accounts in v1 (matchmaking spec
  Assumptions); `JoinMatchPayload.displayName` is cosmetic only.
