# Wire Contract Update: Admission Hardening + Hot-Path Performance

**Date**: 2026-09-11 | **Issues**: #151, #135

---

## Breaking Change Summary

| Change | Type | Impact |
|--------|------|--------|
| `NETWORK_API_VERSION` 0.1.0 → 0.2.0 | Version bump | Old clients rejected at hello |
| `ErrorCode` union: 4 codes removed, 2 added, 1 renamed | Union change | Old clients hit `default` error branch |
| `ServerConfig`: 5 new fields | Additive | Callers get defaults |
| `TickScratchBuffers`: new engine type | Additive | No wire impact |
| Broadcast view cache | Internal | No wire impact |
| Structural comparison | Internal | No wire impact |
| Head-cursor BFS | Internal | No wire impact |

---

## ErrorCode Union Changes

### Before (v0.1.0 — 14 codes)
```typescript
type ErrorCode =
  | 'version_mismatch'
  | 'malformed_payload'
  | 'unknown_message_kind'
  | 'protocol_sequence_error'
  | 'match_not_found'        // REMOVED — collapsed into match_not_joinable
  | 'match_full'             // REMOVED — collapsed into match_not_joinable
  | 'match_not_joinable'
  | 'token_invalid'
  | 'token_expired'
  | 'token_mismatch'
  | 'seat_taken'             // REMOVED — collapsed into match_not_joinable
  | 'rate_limited'           // RENAMED → client_rate_limited
  | 'spectator_readonly'
  | 'internal_error';
```

### After (v0.2.0 — 12 codes)
```typescript
type ErrorCode =
  | 'version_mismatch'
  | 'malformed_payload'
  | 'unknown_message_kind'
  | 'protocol_sequence_error'
  | 'match_not_joinable'     // unified: not found, full, seat taken, disabled
  | 'token_invalid'
  | 'token_expired'
  | 'token_mismatch'
  | 'client_rate_limited'    // was 'rate_limited'
  | 'client_payload_too_large' // NEW
  | 'spectator_readonly'
  | 'internal_error';
```

### Affected Wire Payloads

**`ErrorPayload`** — the `code` field type changes. All existing error payloads are structurally unchanged; only the string values in the `code` field change.

```typescript
interface ErrorPayload {
  readonly code: ErrorCode;       // type changes (union narrowed)
  readonly message: string;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}
```

**No other payload shapes change.** `TickBroadcastPayload`, `SnapshotPayload`, `JoinAckPayload`, `OrderAckPayload`, `TerminalPayload` are all unchanged.

---

## ServerConfig Additions

Five new optional fields on `ServerConfig` with defaults:

| Field | Type | Default | FR |
|-------|------|---------|-----|
| `maxGlobalConnections` | `number` | `1000` | FR-012 |
| `maxPerIpConnections` | `number` | `10` | FR-012 |
| `allowedOrigins` | `ReadonlySet<string>` | `new Set()` | FR-013 |
| `maxHandleLength` | `number` | `32` | FR-015 |
| `maxIdentityLength` | `number` | `128` | FR-015 |

All are additive — existing callers get defaults via `NETWORK_DEFAULT_CONFIG`.

---

## HTTP-Level Rejection Responses

### HTTP 429 — Connection Cap Exceeded (FR-012)
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1
Content-Length: 0
```

### HTTP 403 — Origin Rejected (FR-013)
```http
HTTP/1.1 403 Forbidden
Content-Length: 0
```

Both are sent before the WebSocket handshake. The socket is destroyed immediately after writing the response.

---

## Contract Mirrors

Two copies of the ErrorCode union and ServerConfig must be updated in the same change set:

1. **Source of truth**: `packages/networking/src/contracts/network-types.ts` + `network-api.ts`
2. **Spec mirror**: `specs/004-multiplayer-networking/contracts/network-types.ts` (via `contracts/hardening-perf/` for this change set, then merged)

The conformance test (`tests/contracts-conformance.test.ts`) asserts byte-identity between the two mirrors.
