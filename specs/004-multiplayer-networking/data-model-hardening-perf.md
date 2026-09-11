# Data Model: Admission Hardening + Hot-Path Performance

**Date**: 2026-09-11 | **Issues**: #151, #135

---

## 1. Modified: `ErrorCode` Union (FR-017 + FR-016)

**Location**: `packages/networking/src/contracts/network-types.ts` (both mirrors)

```typescript
/**
 * Shared protocol error codes. All protocol-level rejections use one
 * of these codes. Client-originated errors use `client_` prefix;
 * server-originated errors are unprefixed.
 *
 * FR-017: shared base type with `client_` prefix convention.
 * FR-016: match-existence errors collapsed to `match_not_joinable`.
 */
export type ErrorCode =
  // Version/protocol errors (server-originated, unprefixed)
  | 'version_mismatch'           // FR-004
  | 'malformed_payload'          // JSON parse / schema validation failed
  | 'unknown_message_kind'       // envelope.type not in MessageKind
  | 'protocol_sequence_error'    // e.g., order before joinMatch
  // Client-originated errors (client_ prefix)
  | 'client_rate_limited'        // FR-010 (was 'rate_limited')
  | 'client_payload_too_large'   // FR-010 frame exceeds maxPayload
  // Match admission errors (collapsed — FR-016 anti-oracle)
  | 'match_not_joinable'         // unified: not found, full, seat taken, disabled
  // Authentication errors (bearer-credential related — not collapsed)
  | 'token_invalid'              // reconnect token unknown
  | 'token_expired'              // reconnect window elapsed
  | 'token_mismatch'             // reconnect token valid but wrong match
  // Authorization errors
  | 'spectator_readonly'         // spectator tried to submit an order
  // Server errors
  | 'internal_error';            // catch-all; logged on the server
```

**Removed codes**: `match_not_found`, `match_full`, `seat_taken`, `rate_limited`
**Added codes**: `client_rate_limited`, `client_payload_too_large`
**Renamed codes**: `rate_limited` → `client_rate_limited`
**Collapsed codes**: `match_not_found` + `match_full` + `seat_taken` → `match_not_joinable`

---

## 2. Modified: `ServerConfig` (FR-012, FR-013, FR-015)

**Location**: `packages/networking/src/contracts/network-api.ts`

```typescript
export interface ServerConfig {
  // ... existing fields unchanged ...

  /**
   * Maximum total concurrent WebSocket connections. When reached,
   * new upgrade requests are rejected with HTTP 429 (FR-012).
   * Default: 1000.
   */
  readonly maxGlobalConnections: number;

  /**
   * Maximum concurrent WebSocket connections from a single IP.
   * When reached, new upgrade requests from that IP are rejected
   * with HTTP 429 (FR-012). Default: 10.
   */
  readonly maxPerIpConnections: number;

  /**
   * Allowed WebSocket origins. When non-empty, connections from
   * origins not in this set are rejected with HTTP 403 (FR-013).
   * Empty = all origins allowed (dev default). Deployments behind
   * a reverse proxy SHOULD set this to the deployed origin.
   */
  readonly allowedOrigins: ReadonlySet<string>;

  /**
   * Maximum length for player display names (handles). Names
   * exceeding this are rejected at handshake (FR-015). Default: 32.
   */
  readonly maxHandleLength: number;

  /**
   * Maximum length for guest identity strings. Identities
   * exceeding this are rejected at handshake (FR-015). Default: 128.
   */
  readonly maxIdentityLength: number;
}
```

**Defaults** (added to `NETWORK_DEFAULT_CONFIG`):
```typescript
maxGlobalConnections: 1000,
maxPerIpConnections: 10,
allowedOrigins: new Set<string>(),  // empty = all allowed
maxHandleLength: 32,
maxIdentityLength: 128,
```

---

## 3. New: `TickScratchBuffers` (Engine FR-03)

**Location**: `packages/engine/src/types.ts` (new interface)

```typescript
/**
 * Pre-allocated scratch buffers for the tick pipeline (FR-03).
 * Allocated once per match at board construction time; zeroed
 * in-place before each tick phase. Eliminates per-tick heap
 * allocations (SC-006).
 */
export interface TickScratchBuffers {
  /** Per-cell per-owner inflow tally (n × PLAYERS). Written by flow, read by combat. */
  inflowTally: Uint32Array;
  /** Per-cell per-owner committed-flow tally (n × PLAYERS). Written by flow, read by combat. */
  committedFlowTally: Uint32Array;
  /** Pre-flow troop owners snapshot (n). Written before flow, read by combat. */
  preFlowOwners: Uint8Array;
  /** Pre-flow troop counts snapshot (n). Written before flow, read by combat. */
  preFlowCounts: Uint32Array;
  /** Per-cell reserves floor (n). Written before decay, read by decay. */
  reservedFloors: Uint32Array;
  /** Per-cell same-owner incoming pipe flag (n). Written before decay, read by decay. */
  hasIncomingSameOwnerPipe: Uint8Array;
  /** Flow output counts buffer (n). Written by flow, read by combat. */
  flowNewCounts: Uint32Array;
  /** Flow output owners buffer (n). Written by flow, read by combat. */
  flowNewOwners: Uint8Array;
  /** Combat output counts buffer (n). Written by combat. */
  combatNewCounts: Uint32Array;
  /** Combat output owners buffer (n). Written by combat. */
  combatNewOwners: Uint8Array;
  /** Reusable TransferParams pool (4 entries — max pipes per cell). */
  transferParams: TransferParams[];
  /** Per-cell committed-players pool (PLAYERS entries per cell, flat). */
  committedPlayersPool: Uint32Array; // interleaved: [owner0, count0, owner1, count1, ...]
}
```

**Sizing**: `n = board.width × board.height`. All `Uint32Array` and `Uint8Array` are `n` or `n × PLAYERS` elements. `transferParams` is always 4 entries. `committedPlayersPool` is `n × PLAYERS × 2` (owner + count pairs).

**Allocation site**: `packages/engine/src/create.ts` — in `createMatchSession`, after board construction, allocate all buffers and attach to the session.

---

## 4. New: Broadcast View Cache (FR-018/FR-019)

**Location**: `packages/networking/src/broadcast.ts` (additive to `MatchChannel`)

The cache is a `Map<string, PlayerView>` keyed by `playerId.toString()` (or `'spectator'` for spectator views). It lives on `MatchChannel` and is rebuilt on every tick.

```typescript
// Added to MatchChannel (in contracts/network-api.ts MatchTransport):
/**
 * Per-tick fog-view cache (FR-018). Maps `playerId.toString()` or
 * `'spectator'` to the most recently computed PlayerView. Rebuilt
 * from scratch on every tick advance. Used by:
 *   - broadcast: avoid redundant fog computation for multiple connections
 *     sharing the same seat (e.g., reconnect race)
 *   - resync: reuse cached view instead of recomputing (FR-019)
 */
readonly broadcastViewCache: Map<string, import('@europa/fog').PlayerView>;
```

---

## 5. Modified: `NetworkConstants` (new constants)

**Location**: `packages/networking/src/constants.ts`

```typescript
export interface NetworkConstants {
  // ... existing fields ...

  /** Global connection cap (FR-012). */
  readonly defaultMaxGlobalConnections: number;
  /** Per-IP connection cap (FR-012). */
  readonly defaultMaxPerIpConnections: number;
  /** Handle length cap (FR-015). */
  readonly defaultMaxHandleLength: number;
  /** Identity length cap (FR-015). */
  readonly defaultMaxIdentityLength: number;
}
```

**Values**:
```typescript
defaultMaxGlobalConnections: 1000,
defaultMaxPerIpConnections: 10,
defaultMaxHandleLength: 32,
defaultMaxIdentityLength: 128,
```

---

## 6. Modified: `NETWORK_API_VERSION`

**Location**: `packages/networking/src/contracts/network-types.ts`

```typescript
// Before:
export const NETWORK_API_VERSION = '0.1.0' as const;
// After:
export const NETWORK_API_VERSION = '0.2.0' as const;
```

**Rationale**: Pre-1.0 semver — minor bump = breaking boundary. The ErrorCode union is a breaking change (codes removed/renamed). Both contract mirrors (source + spec) updated in the same change set.

---

## 7. Relationship Diagram

```
ServerConfig (adds connection caps, origin allowlist, identity/handle caps)
    ↓
createMatchServer (reads config, enforces caps at upgrade)
    ↓
ErrorCode (ProtocolErrorCode base, client_ prefix, collapsed match codes)
    ↓
NetworkError (wraps ErrorCode)
    ↓
Connection (rate bucket now covers all frame kinds)
    ↓
MatchChannel (broadcast view cache)
    ↓
broadcast.ts (structural comparison, view reuse)
    ↓
TickScratchBuffers (engine pre-allocation)
    ↓
tick.ts (zero-fill, reuse buffers)
```
