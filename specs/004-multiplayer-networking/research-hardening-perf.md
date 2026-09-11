# Research: Admission Hardening + Hot-Path Performance

**Date**: 2026-09-11 | **Issues**: #151, #135

---

## 1. Rate-Limiting Approach: Token-Bucket vs Leaky-Bucket

**Decision**: Keep existing token-bucket (already shipped in FR-010).

**Rationale**: The current `MutableRateBucket` in `connection.ts` implements a token-bucket with lazy refill — tokens accumulate up to `capacity` and are consumed one per frame. This is the correct choice for WebSocket traffic because:

- **Burst tolerance**: Browser tab-reload floods hello + subscribe + orders in rapid succession. Token-bucket allows brief bursts (capacity = `ordersPerSecond × burstFactor`); leaky-bucket would drop legitimate frames.
- **Simplicity**: The existing implementation is 15 lines of arithmetic. No external dependencies.
- **Pre-allocated**: The bucket is a fixed-size struct (4 fields). No per-frame allocation.

**Extension for FR-010 (all-frame-kind)**: The existing bucket covers `order` and `lobby*` frames. FR-010 extends it to ALL frame kinds. The simplest approach: one bucket per connection (already exists), every inbound frame consumes one token regardless of kind. This is correct because:
- hello/ping are infrequent (1 per connection / 1 per 5s).
- The bucket capacity (default 20 tokens) easily absorbs normal traffic.
- An attacker flooding any frame kind hits the same bucket and gets throttled.

**Rejected alternative — per-kind buckets**: Would require a `Map<string, MutableRateBucket>` per connection, adding complexity for no practical benefit. The bucket's purpose is DoS prevention, not QoS differentiation.

---

## 2. Connection Cap Implementation (FR-012)

**Decision**: HTTP-level rejection in the `upgrade` handler, before `wss.handleUpgrade`.

**Rationale**: The `ws` library's `WebSocketServer` with `noServer: true` delegates upgrade handling to the host. The `upgrade` event fires with `(request, socket, head)` — we can inspect the request, count connections, and reject before calling `handleUpgrade`.

**Implementation details**:
- **Global cap**: A simple `connections.size` check (the `connections` Map already tracks all active connections).
- **Per-IP cap**: Extract IP from `request.socket.remoteAddress` (handles IPv6→IPv4 mapping via `::ffff:` prefix stripping). Maintain a `Map<string, number>` incremented on accept, decremented on close.
- **HTTP 429 response**: `socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 1\r\n\r\n'); socket.destroy();`
- **Defaults**: global = 1000, per-IP = 10. The per-IP default of 10 accommodates multi-tab browsers (Chrome allows 6 concurrent WS per host; 2 windows = 12 — but the second window usually reuses an existing connection).

**IP extraction**: Use `request.headers['x-forwarded-for']` when behind a reverse proxy (first entry), falling back to `request.socket.remoteAddress`. Strip IPv6 prefix `::ffff:` for consistent counting. This is documented as a deployment concern — self-hosted servers without a proxy get direct IP.

**Alternatives considered**:
- **Middleware approach**: Express-style middleware would add a dependency. Rejected — the `noServer` mode is already a manual upgrade path.
- **Token-bucket for connection rate**: Would allow bursts of rapid reconnects. Rejected — a hard cap is simpler and more predictable.

---

## 3. Origin Validation Approach (FR-013)

**Decision**: Check `Origin` header in the `upgrade` handler against a configurable `Set<string>`.

**Rationale**: The `Origin` header is the standard CSRF mitigation for WebSocket upgrades. Browsers always send it; non-browser clients can set it to anything. The server protects against browser-based attacks.

**Implementation**:
- Add `allowedOrigins: ReadonlySet<string>` to `ServerConfig`. Default = empty set (all origins allowed — dev mode).
- In the `upgrade` handler, after connection-cap checks: `const origin = request.headers.origin; if (config.allowedOrigins.size > 0 && (!origin || !config.allowedOrigins.has(origin))) { /* 403 */ }`
- HTTP 403 response: `socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy();`

**Edge cases**:
- Missing `Origin` header (non-browser clients): reject when allowlist is non-empty. This is correct because browsers always send Origin; missing Origin = non-browser tooling that should be explicitly configured.
- `null` origin (sandboxed iframes): treat as missing. Reject when allowlist is non-empty.

---

## 4. Error Code Migration Strategy (FR-017 + FR-016)

**Decision**: Single breaking change set with minor version bump (0.1.0 → 0.2.0).

**Migration steps**:
1. Define `ProtocolErrorCode` as the shared base type in `contracts/network-types.ts`.
2. Rename `rate_limited` → `client_rate_limited` (FR-017 prefix convention).
3. Add `client_payload_too_large` (FR-017 new code).
4. Collapse `match_not_found`, `match_full`, `seat_taken` → `match_not_joinable` (FR-016 anti-oracle).
5. Keep `token_invalid`, `token_expired`, `token_mismatch`, `spectator_readonly`, `internal_error` unchanged (they don't leak match existence).
6. Update `NETWORK_API_VERSION` from `'0.1.0'` to `'0.2.0'`.
7. Update both contract mirrors (source + spec) in the same change set.
8. Update all test assertions and the conformance suite.

**Backward compatibility**: Pre-amendment clients hit their `default` error branch on unknown codes. The `match_not_joinable` code was already in the union — clients that switch on it handle the collapsed cases. Old `rate_limited` users see a generic error until they update.

**Why minor bump, not major**: Under pre-1.0 semver (the project is at 0.1.0), a minor bump IS the breaking boundary per semver spec. The AGENTS.md confirms: "pre-1.0 minor = breaking boundary for FR-004."

---

## 5. Scratch Buffer Reuse Pattern (Engine FR-03)

**Decision**: Pre-allocate at session creation, zero-fill before each tick phase.

**Pattern**:
```typescript
interface TickScratchBuffers {
    inflowTally: Uint32Array;        // n * PLAYERS
    committedFlowTally: Uint32Array; // n * PLAYERS
    preFlowOwners: Uint8Array;       // n
    preFlowCounts: Uint32Array;      // n
    reservedFloors: Uint32Array;     // n
    hasIncomingPipe: Uint8Array;     // n
    newCountsA: Uint32Array;         // n (flow output)
    newOwnersA: Uint8Array;          // n (flow output)
    newCountsB: Uint32Array;         // n (combat output)
    newOwnersB: Uint8Array;          // n (combat output)
    transferParams: TransferParams[]; // 4 (max pipes per cell)
    committedPlayers: Array<{ owner: PlayerId; count: number }>; // PLAYERS per cell, pre-allocated
}
```

**Allocation**: Once per `createMatchSession`, sized to the board dimensions. Stored on the `EngineSession` object and passed to `tick()`.

**Zero-fill**: Each phase calls `fill(0)` on its relevant arrays before use. This is cheaper than re-allocation because `fill(0)` on a typed array is a single `memset` call in V8.

**TransferParams pool**: A fixed array of 4 objects (max 4 pipes per cell). Each object is mutated in-place by `transfer()`. No allocation per source cell.

**committedPlayers pool**: Pre-allocate an array of `{ owner: 0, count: 0 }` entries sized to `playerCount` (max 4). Reuse by resetting entries to `{ owner: 0, count: 0 }` before each cell's combat resolution.

**SC-006 verification**: A V8 heap profile snapshot of 1000 consecutive ticks must show zero allocations in the `tick()` function body. This is verified by a dedicated test using `process.memoryUsage()` or `v8.getHeapStatistics()`.

---

## 6. BFS Head-Cursor Approach (Terrain)

**Decision**: Replace `queue.shift()` with `queue[head++]`.

**Before**:
```typescript
const queue: number[] = [start];
while (queue.length > 0) {
    const idx = queue.shift(); // O(n) — re-indexes all elements
    // ... process neighbors, push to queue
}
```

**After**:
```typescript
const queue: number[] = [start];
let head = 0;
while (head < queue.length) {
    const idx = queue[head++]; // O(1) — just increment cursor
    // ... process neighbors, push to queue
}
```

**Applies to**: Three BFS functions in `packages/terrain/src/validate.ts`:
1. `bfsLandReachable` (line 98) — INV-12 land connectivity
2. `bfsFlowViableReachable` (line 166) — INV-16 flow-viable connectivity
3. `waterPoolStats` (line 214) — water pool sizing

**Performance**: O(V + E) vs O(V²). For a 32×32 board: ~1024 cells, ~4096 edges. Old: ~10M operations. New: ~5000 operations. 2000× improvement on the BFS component.

**Correctness**: BFS traversal order is determined by neighbor iteration order (N→E→S→W), not by the dequeue mechanism. The output set is identical.

---

## 7. Structural View Comparison (FR-020)

**Decision**: Field-by-field equality check replacing `JSON.stringify`-based fingerprint.

**Current approach** (`broadcast.ts` `fingerprint`):
```typescript
function fingerprint(view: PlayerView): string {
    return stableStringify({
        player: view.player,
        visibleCells: view.visibleCells,
        events: view.events,
        config: view.config,
    });
}
```

This allocates a JSON string per view per tick per connection — O(cells × connections) string allocations.

**New approach**:
```typescript
function viewsEqual(a: PlayerView, b: PlayerView): boolean {
    if (a.player !== b.player) return false;
    if (a.config !== b.config) return false; // reference equality for frozen config
    if (a.events.length !== b.events.length) return false;
    // Compare events structurally if needed (events are rare)
    const ac = a.visibleCells;
    const bc = b.visibleCells;
    if (ac.length !== bc.length) return false;
    for (let i = 0; i < ac.length; i++) {
        const av = ac[i];
        const bv = bc[i];
        if (av.owner !== bv.owner) return false;
        if (av.count !== bv.count) return false;
        if (av.elevation !== bv.elevation) return false;
        if (av.terrain !== bv.terrain) return false;
        if (av.reservesPct !== bv.reservesPct) return false;
        // pipes: Set<Direction> — compare sizes then elements
        if (av.pipes.size !== bv.pipes.size) return false;
        for (const d of av.pipes) {
            if (!bv.pipes.has(d)) return false;
        }
    }
    return true;
}
```

**Performance**: O(visibleCells) with no allocation. Short-circuits on first difference. For identical views (common case — most ticks produce no change for most cells), it's O(cells) with no allocation.

**Alternatives considered**:
- **Version counter**: Each `PlayerView` carries a monotonically incrementing version. Compare integers. Rejected because views are recomputed fresh each tick — there's no version to increment without mutating the view.
- **Hash comparison**: Compute a hash of the view, compare hashes. Rejected — hashing is O(cells) anyway, and collisions would cause silent skip-send bugs.

---

## 8. Broadcast View Reuse Architecture (FR-018/FR-019)

**Decision**: Cache computed views per `(playerId, spectator)` pair in a `Map<string, PlayerView>` on `MatchChannel`.

**Key insight**: In a 2-player match, there are exactly 2 unique `(playerId, spectator=false)` views. Spectators all get the same full-board view. So the cache has at most 3 entries regardless of connection count.

**Current flow** (per tick):
```
for each connection:
    view = fog.computePlayerView(world, playerId, spectator)  // O(cells)
    compare with lastSentView  // O(cells) via fingerprint
    if different: send  // O(cells) via JSON.stringify
```
Total: O(connections × cells) for fog + O(connections × cells) for compare + O(connections × cells) for serialize.

**New flow** (per tick):
```
views = Map<playerId|'spectator', PlayerView>()
for each unique (playerId, spectator):
    view = fog.computePlayerView(world, playerId, spectator)  // O(cells)
    views.set(key, view)

for each connection:
    view = views.get(connection.playerKey)
    if !viewsEqual(view, lastSentView)  // O(cells), no alloc
        send(view)  // O(visibleCells) per connection
```
Total: O(uniquePlayers × cells) for fog + O(connections × cells) for compare + O(connections × visibleCells) for serialize.

**Resync reuse (FR-019)**: When a reconnecting client requests a snapshot, check the broadcast cache first. If the player's view was computed this tick, reuse it. Otherwise compute once and cache.

**Cache invalidation**: The cache is rebuilt from scratch on every tick advance. No stale entries possible — the cache lifetime is one tick (250 ms).
