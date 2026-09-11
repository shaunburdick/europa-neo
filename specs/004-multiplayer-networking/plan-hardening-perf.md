# Implementation Plan: Admission Hardening + Hot-Path Performance

**Branch**: `networking-fixes` | **Date**: 2026-09-11 | **Specs**: [004 v1.6](./spec.md), [001 v1.10](../001-core-game-engine/spec.md), [003 v1.5](../003-procedural-terrain-generation/spec.md), [006 v1.3](../006-match-lifecycle-matchmaking/spec.md)

**Issues**: #151 (admission hardening + existence oracle) + #135 (hot-path performance)

**Input**: Specs amended at `e97c8e5`. Code review findings I-20 Thread T-09 (security) and I-28 Thread T-14 (performance).

---

## Summary

This effort addresses two P1 concerns identified during code review:

1. **Security hardening (#151)**: Seven admission-layer vulnerabilities — no connection cap, unthrottled hello/ping, no WebSocket origin validation, missing `wss` error listener, unbounded identities/handles, distinguishable match-existence errors enabling oracle attacks, and per-package error unions with no shared base.

2. **Hot-path performance (#135)**: Four bottlenecks affecting tick cadence and broadcast latency — per-tick typed-array allocation in the engine, redundant fog-view computation + JSON-stringify in broadcast, view recomputation on resync, and O(n²) BFS in terrain validation.

Both are spec-amended (spec 004 v1.6, spec 001 v1.10, spec 003 v1.5, spec 006 v1.3) and ready for implementation.

---

## Constitution Alignment

| Principle | Alignment |
|-----------|-----------|
| **I. Type Safety** | All new types use branded primitives and closed unions. No `any`. Error codes are a shared `ProtocolErrorCode` base type. |
| **II. Server-Authoritative Deterministic** | Security hardening is transport-layer only — never touches simulation state. Performance changes preserve byte-identical determinism (engine scratch buffers are zeroed in-place; fog view reuse is semantically identical). |
| **III. Tested Game Logic** | ≥80% coverage maintained. Security hardening adds rate-limit, connection-cap, origin-validation, and error-collapse tests. Performance adds allocation-regression and perf-budget tests. |
| **IV. Specs as Documentation** | All four specs amended in the same change set as the plan (committed at `e97c8e5`). |
| **V. Simplicity Over Cleverness** | Head-cursor BFS is simpler than the array-shift approach. Token-bucket rate limiting is unchanged (already simple). Broadcast view reuse uses a straightforward cache. |
| **VI. Accessibility** | N/A — no UI changes. |
| **VII. Self-Hostable** | Connection caps are configurable with sane defaults. Origin validation defaults to open for local dev. |

---

## Architecture Overview

The work spans four packages across four logical waves, with clear dependency ordering:

```
Wave 1: Security Hardening (#151)
  ├── packages/networking/ — connection caps, origin validation, error listener, identity caps, error unification, anti-oracle, all-frame rate limiting
  ├── packages/networking/contracts/ — ErrorCode union update, ServerConfig additions, NETWORK_API_VERSION bump
  └── packages/matchmaking/ — error-code alignment (FR-006 update)

Wave 2: Engine Performance (#135)
  └── packages/engine/ — scratch buffer reuse, committedPlayers pool, TransferParams pool

Wave 3: Terrain Performance (#135)
  └── packages/terrain/ — head-cursor BFS

Wave 4: Networking Performance (#135)
  └── packages/networking/ — broadcast view reuse, resync view cache, structural comparison
```

**Dependency graph:**
- Wave 1 and Wave 2 are independent (different packages, no cross-dependencies).
- Wave 3 is independent of Waves 1 and 2.
- Wave 4 depends on Wave 1 completing (the error-code and config changes land first, and the broadcast module is modified in Wave 1 for rate-limit changes).
- Within Wave 1: error unification (FR-017) must land before anti-oracle collapse (FR-016) because FR-016 removes codes that FR-017 renames.

---

## Key Decisions

### D1: Connection caps at HTTP upgrade level (FR-012)

**Decision**: Reject WebSocket upgrade requests with HTTP 429 before the handshake completes, using the `upgrade` event's `request` object to extract the client IP.

**Rationale**: Rejecting at the HTTP level is cheaper than accepting the WebSocket and then closing it — the `ws` library has already allocated the socket object. The `upgrade` event fires before `handleUpgrade`, so we can count connections and reject early.

**Implementation**: Add a `Map<string, number>` for per-IP counts and a global counter to the server closure. On `upgrade`, check both caps; if exceeded, respond with 429 + `Retry-After: 1` and destroy the socket. Decrement counts on socket close.

**Alternatives considered**:
- Rejecting after WebSocket accept: wastes a socket allocation. Rejected.
- Using a fixed-size bitset for IP tracking: IPs are variable-length strings (IPv4/IPv6). Rejected.

### D2: Origin validation at upgrade level (FR-013)

**Decision**: Check `Origin` header against configurable `allowedOrigins` set in the `upgrade` handler. Empty set = all origins allowed (dev default). Non-empty = whitelist.

**Rationale**: Standard WebSocket CSRF mitigation. The `Origin` header is set by browsers on WebSocket upgrades; non-browser clients can set it to anything, but the server only needs to protect against browser-based CSRF.

**Implementation**: Read `origin` from the upgrade request headers. If `allowedOrigins` is non-empty and origin is missing or not in the set, respond with HTTP 403 and destroy the socket.

### D3: Error code migration strategy (FR-017 + FR-016)

**Decision**: Introduce the `ProtocolErrorCode` base type with `client_` prefix convention, then collapse match-existence codes in the same change set. The `NETWORK_API_VERSION` gets a minor bump (0.1.0 → 0.2.0) — pre-1.0 semver means minor = breaking.

**Rationale**: Both changes are breaking (FR-017 renames codes, FR-016 removes codes). Doing them together avoids two breaking changes. Old clients that don't recognize `client_rate_limited` hit their `default` error branch and show a generic message — acceptable for pre-1.0.

**Migration path**:
1. Add new `client_` prefixed codes to the union.
2. Remove old unprefixed codes (`rate_limited` → `client_rate_limited`).
3. Collapse `match_not_found`, `match_full`, `seat_taken` → `match_not_joinable`.
4. Both contract mirrors (source + spec) updated in same change set.
5. Update all test assertions expecting old codes.

### D4: Broadcast view reuse architecture (FR-018/FR-019/FR-020)

**Decision**: Compute fog-filtered views once per tick per unique `(playerId, spectator)` pair, then serialize per-connection. Cache the most recent broadcast view per player for resync reuse.

**Rationale**: Currently `buildTickBroadcast` calls `fog.computePlayerView` once per connection per tick. In a 2-player match with spectators, this is 2+ fog computations per tick. With the cache, it's exactly 2 (one per player) regardless of connection count. The resync path (FR-019) reuses the cached view instead of recomputing.

**Implementation**: Add a `Map<PlayerId | 'spectator', PlayerView>` cache to `MatchChannel`. After computing each unique view, store it. On resync, read from cache. On tick advance, invalidate and recompute.

**Structural comparison (FR-020)**: Replace `fingerprint` (JSON.stringify-based) with a field-by-field equality check on `PlayerView.visibleCells`. Since `visibleCells` is a `ReadonlyArray<CellView>`, compare length, then each cell's `owner`, `count`, `elevation`, `terrain`, `pipes` (Set-aware), `reservesPct`. Short-circuit on first difference.

### D5: Engine scratch buffer reuse (FR-03, SC-006)

**Decision**: Pre-allocate all typed arrays at board construction time and zero them in-place before each tick. Use a fixed-size pool for `TransferParams` objects.

**Rationale**: The tick function currently allocates `inflowTally`, `committedFlowTally`, `preFlowState`, `reservedFloors`, `hasIncomingSameOwnerPipe`, and copies `newCounts`/`newOwners` in both flow and combat. With 1024 cells × 4 players = 4096-element arrays, each allocation is small but frequent (every tick, every match). Pre-allocation eliminates GC pressure.

**Implementation**: Add a `TickScratchBuffers` interface holding all reusable buffers. Allocate once per `createMatchSession`, pass through the tick pipeline. Zero via `fill(0)` before each phase. `TransferParams` is a pool of 4 objects (max pipes per cell) reused via index reset.

### D6: Head-cursor BFS (terrain)

**Decision**: Replace `Array.shift()` with a head-cursor integer index. The array grows at `push()` and the cursor advances via `head++`.

**Rationale**: `Array.shift()` is O(n) per call (re-indexes remaining elements). Head-cursor is O(1) per dequeue. BFS becomes O(V + E) instead of O(V²). On a 32×32 board (1024 cells), this is measurable; on larger boards it's significant.

**Implementation**: Add `let head = 0` before the while loop; replace `queue.shift()` with `queue[head++]`; remove the `undefined` check (loop condition already handles exhaustion).

---

## Project Structure

```
packages/networking/src/
├── server.ts          — HTTP upgrade handler (connection caps, origin validation)
├── connection.ts      — rate limiter (all-frame-kind bucket)
├── broadcast.ts       — view reuse cache, structural comparison
├── resync.ts          — resync view cache
├── constants.ts       — new constants (connection caps, identity/handle limits)
├── errors.ts          — NetworkErrorCode (now extends ProtocolErrorCode)
├── contracts/
│   ├── network-types.ts  — ErrorCode union update, ServerConfig additions
│   └── network-api.ts    — ServerConfig additions
├── validate.ts        — identity/handle length validation

packages/engine/src/
├── tick.ts            — scratch buffer orchestration
├── types.ts           — TickScratchBuffers interface
├── resolution/
│   ├── flow.ts        — uses pre-allocated newCounts/newOwners
│   ├── combat.ts      — uses pre-allocated newCounts/newOwners, committedPlayers pool
│   └── (others)       — no changes needed

packages/terrain/src/
├── validate.ts        — head-cursor BFS

specs/004-multiplayer-networking/contracts/
└── wire-types.ts      — ErrorCode union mirror update
```

---

## Risk & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FR-016 breaks existing test assertions | Medium | Update all integration tests expecting `match_not_found`/`match_full`/`seat_taken` in same change set |
| FR-017 renaming breaks console error handling | Low | Console uses `default` error branch; new codes show generic message. Console update is additive. |
| Engine scratch buffers introduce subtle state bugs | High | Byte-identical determinism test (SC-001) catches any drift. Fill(0) verification in unit tests. |
| Broadcast view cache leaks stale views | Medium | Cache is invalidated on every tick advance. TTL is one tick (250 ms). |
| Head-cursor BFS changes traversal order | Low | BFS order is determined by neighbor iteration, not dequeue mechanism. Output is identical. |
| Connection capMap grows unbounded with diverse IPs | Low | Cap map entries are removed when per-IP count drops to 0. Self-hosted servers see few unique IPs. |

---

## Wave Structure

### Wave 1: Security Hardening (#151) — 12 tasks
Foundation: error unification + config additions → connection caps → origin validation → identity caps → anti-oracle → all-frame rate limiting → tests

### Wave 2: Engine Performance (#135) — 6 tasks
TickScratchBuffers type → pre-allocate in create.ts → zero-fill in tick.ts → flow/combat reuse → tests

### Wave 3: Terrain Performance (#135) — 3 tasks
Head-cursor BFS → update all three BFS paths → perf regression test

### Wave 4: Networking Performance (#135) — 6 tasks
Structural comparison → broadcast view cache → resync view cache → perf test → SC-005 validation

**Total: 27 tasks**

---

## Validation Strategy

Each wave ends with a verification checkpoint:
1. **Wave 1**: `pnpm typecheck && pnpm lint && pnpm format:check` + networking test suite (existing tests pass with updated assertions) + new security tests
2. **Wave 2**: engine test suite + SC-006 allocation regression test + determinism hash comparison
3. **Wave 3**: terrain test suite + SC-005 BFS perf test
4. **Wave 4**: networking test suite + SC-005 broadcast perf test + full `pnpm verify`
