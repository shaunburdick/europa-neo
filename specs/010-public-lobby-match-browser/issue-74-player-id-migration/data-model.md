# Data Model: Universal Player Identity

## 1. Primitive identity types

| Entity | Shape | Invariants |
| --- | --- | --- |
| `PlayerId` | Branded string | Exactly 12 ASCII chars; alphabet `A-Z a-z 0-9 _ -`; canonical regex; non-secret; never a credential. |
| `GuestPlayerId` | Branded string with the same canonical representation | Same value as active `PlayerId`; server-issued; active uniqueness enforced. |
| `PlayerSessionId` | Existing branded session reference | Lifecycle/session correlation only; does not replace `PlayerId` or bearer token. |
| `SessionToken` / `ReconnectToken` | Existing opaque bearer strings | Secret proof; required for privileged actions; never logged or inferred from ID. |
| `SeatIndex` | Dense integer `0..N-1` | Internal/lifecycle coordinate only; may be reassigned without changing `PlayerId`. |
| `DensePlayerIndex` | Dense integer `0..N-1` | Engine hot-path coordinate; valid only through `PlayerRegistry`. |

## 2. `PlayerRegistry`

```text
PlayerRegistry {
  ids: readonly PlayerId[]                 // canonical UTF-16 order
  indexOfId(id: PlayerId): DensePlayerIndex | null
  idAt(index: DensePlayerIndex): PlayerId | null
  has(id: PlayerId): boolean
  count: number
}
```

Construction validates all IDs, rejects malformed/numeric/duplicate entries,
sorts a copied list with the explicit UTF-16 code-unit comparator, and builds
both maps. The registry is immutable after world construction. `indexOfId` must
not coerce strings, numbers, handles, seats, or unknown IDs.

## 3. Identity lifecycle

```text
unallocated
  -> active (mint canonical ID and register atomically)
  -> grace (disconnect; retain ID and seat association)
  -> active (valid reconnect token)
  -> rematch-active (accepted rematch; same ID)
  -> released (expiry, storage reset, server restart, or collection)
```

Only the server transitions this state. A bare ID cannot cause any transition.
Collision during allocation retries using a bounded policy; exhaustion is a
closed failure and must not return a duplicate.

## 4. Match/engine relationships

```text
GuestPlayerIdentity.id ─────┐
SeatRecord.playerId ────────┼── same universal PlayerId
MatchConfig.playerIds ──────┤
World.playerRegistry ───────┤── explicit ID↔DensePlayerIndex mapping
Wire join/tick/result ID ────┘
```

Terrain's `CityPlacement.owner` and placement algorithms use dense numeric slot
values only. The engine creation boundary maps each city slot to an explicit
`PlayerId`; changing IDs cannot alter terrain output.

## 5. Serialization model

The serialized engine payload contains a validated ID table followed by records
that refer to table indexes. The table is canonicalized using explicit UTF-16
ordering. Encoding rejects malformed/duplicate IDs and inconsistent references.
Decoding rejects malformed, duplicate, missing, extra, or unreferenced table
entries according to the approved contract; it never invents IDs or silently
falls back to numeric IDs.

## 6. Wire model

Every gameplay identity field that is currently numeric becomes `PlayerId` (or
`null` for spectators where the existing contract is nullable). The wire envelope
major version changes. A numeric payload is rejected before domain interpretation.
`sessionToken` and `reconnectToken` remain separate fields with separate branded
types and authorization semantics.

## 7. Validation rules

1. Validate raw identity strings at every external trust boundary.
2. Never use a type assertion as runtime validation.
3. Reject numeric JSON values, even if they are in `1..4`.
4. Reject wrong length, non-ASCII, disallowed punctuation, empty, duplicate, or
   missing IDs.
5. Treat IDs as correlation metadata only; authorization resolves the active
   identity and verifies its bearer proof.
6. Sort IDs only with the documented UTF-16 code-unit comparator.
7. Do not feed identity generation into seeded engine/terrain RNG.

## 8. State-transition edge cases

| Case | Required result |
| --- | --- |
| CSPRNG unavailable | Fail closed with an actionable server error; do not use `Math.random`. |
| Generated collision | Retry within bounded policy; then fail closed without overwriting the existing identity. |
| Client submits another active ID | Resolve against connection/session authority; reject or ignore claim and do not switch identity. |
| Seat moves index | Preserve ID; rebuild explicit mappings only. |
| Reconnect token valid, ID omitted | Restore the server-bound ID from token binding. |
| ID valid, token missing/invalid | Reject privileged operation; no view/order/seat access. |
| Terrain receives IDs | API design prevents this; any accidental ID-bearing input fails contract/type checks. |
| Old numeric wire client | Reject major version before payload interpretation. |
