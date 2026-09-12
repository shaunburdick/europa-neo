# Inventory: Numeric PlayerId Surfaces (Issue #74)

**Captured**: 2026-09-11 on branch `issue-74-numeric-playerid`
**Purpose**: Complete typed inventory of every numeric `PlayerId` surface to guide
Wave 1–8 implementation. Each finding is classified as:

- **Public identity**: Exposed in wire, console, or user-facing output
- **Dense index**: Internal-only array position or map key
- **Seat coordinate**: Presentation/lifecycle position (seat index)
- **Negative test**: Deliberately testing rejection of old values

---

## 1. Type definitions

### 1.1 Core `PlayerId` (source of truth)

| File | Line | Code | Classification |
| --- | --- | --- | --- |
| `packages/core/src/types.ts` | 42 | `export type PlayerId = 1 \| 2 \| 3 \| 4;` | **Public identity** — must become branded string |
| `packages/core/src/index.ts` | 27 | Re-exports `PlayerId` | **Public identity** — barrel re-export |

### 1.2 Engine re-exports and usages

| File | Line | Code | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/types.ts` | 70 | Re-exports `PlayerId` from `@europa/core` | **Public identity** — barrel |
| `packages/engine/src/index.ts` | 72 | Re-exports `PlayerId` from `@europa/core` | **Public identity** — barrel |
| `packages/engine/src/contracts/engine-types.ts` | 41 | `export type { ... PlayerId ... }` | **Public identity** — contract mirror |
| `packages/engine/src/contracts/engine-api.ts` | 25, 116, 118 | `PlayerId` in function signatures | **Public identity** — contract API |

### 1.3 Engine model fields using `PlayerId`

| File | Line | Field | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/contracts/engine-types.ts` | 64 | `troopOwners: Uint8Array` (0=neutral, 1..4=PlayerId) | **Dense index** — internal byte storage |
| `packages/engine/src/contracts/engine-types.ts` | 67 | `cityOwners: Uint8Array` (0=none, 1..4=PlayerId) | **Dense index** — internal byte storage |
| `packages/engine/src/contracts/engine-types.ts` | 75 | `Player.id: PlayerId` | **Public identity** — player identity |
| `packages/engine/src/contracts/engine-types.ts` | 97 | `World.players` indexed by `PlayerId - 1` | **Dense index** — array position |
| `packages/engine/src/contracts/engine-types.ts` | 117 | `CellView.troopOwner: PlayerId \| null` | **Public identity** — view payload |
| `packages/engine/src/contracts/engine-types.ts` | 120 | `CellView.cityOwner: PlayerId \| null` | **Public identity** — view payload |
| `packages/engine/src/contracts/engine-types.ts` | 130,138,146,154,161,169,177,185 | Order types (`player: PlayerId`) | **Public identity** — wire commands |
| `packages/engine/src/contracts/engine-types.ts` | 209 | `already_surrendered.player: PlayerId` | **Public identity** — error payload |
| `packages/engine/src/contracts/engine-types.ts` | 227-228 | `CombatEvent.attacker/defender: PlayerId` | **Public identity** — event payload |
| `packages/engine/src/contracts/engine-types.ts` | 231 | `CombatEvent.winner: PlayerId \| 'tie'` | **Public identity** — event payload |
| `packages/engine/src/contracts/engine-types.ts` | 241-242 | `CaptureEvent.fromOwner/toOwner: PlayerId \| null` | **Public identity** — event payload |
| `packages/engine/src/contracts/engine-types.ts` | 248 | `GunEvent.player: PlayerId` | **Public identity** — event payload |
| `packages/engine/src/contracts/engine-types.ts` | 273 | `MatchResult.winner: PlayerId` | **Public identity** — terminal result |

### 1.4 Engine source files using `PlayerId`

| File | Line(s) | Usage | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/create.ts` | 167, 173 | `const id = (i + 1) as PlayerId` — derives PlayerId from array index | **Dense index** — must use registry |
| `packages/engine/src/read.ts` | 69, 72 | `ownerByte as PlayerId` — casts Uint8Array byte to PlayerId | **Dense index** — internal storage |
| `packages/engine/src/read.ts` | 141 | `getPlayer(world, id: PlayerId)` | **Public identity** — lookup by ID |
| `packages/engine/src/read.ts` | 153-154 | `alivePlayers()` returns `PlayerId[]` | **Public identity** — ID list |
| `packages/engine/src/validate.ts` | 151-307 | All validation functions take `player: PlayerId` | **Public identity** — command validation |
| `packages/engine/src/applyCommand.ts` | 118 | `markSurrendered(world, player: PlayerId)` | **Public identity** — mutation |
| `packages/engine/src/tick.ts` | 176-276 | `troopOwners[idx]` byte access, `p as PlayerId` casts | **Dense index** — hot-path array access |
| `packages/engine/src/resolution/combat.ts` | 123-325 | `owner: PlayerId` in combat resolution, `p as PlayerId` casts | **Dense index** — combat internals |
| `packages/engine/src/resolution/capture.ts` | 84-85 | `fromOwner: cityOwner as PlayerId` | **Dense index** — capture resolution |
| `packages/engine/src/resolution/paratroop.ts` | 182 | `newOwners[targetIdx] = order.player as PlayerId` | **Dense index** — paratroop placement |
| `packages/engine/src/resolution/terminal.ts` | 63-79, 129 | `Map<PlayerId, number>` for troop/city counts | **Dense index** — counting |
| `packages/engine/src/serialize.ts` | 311, 345 | `(bytes[p++] ?? 0) as PlayerId` — deserialization | **Public identity** — serialization boundary |
| `packages/engine/src/replay/types.ts` | 26 | `readonly playerId: PlayerId` in replay commands | **Public identity** — replay format |

### 1.5 Networking types

| File | Line(s) | Field | Classification |
| --- | --- | --- | --- |
| `packages/networking/src/contracts/network-types.ts` | 646 | `GuestPlayerId = string & { __brand: 'GuestPlayerId' }` | **Public identity** — lobby identity |
| `packages/networking/src/contracts/network-types.ts` | 181, 414 | `Connection.playerId: PlayerId \| null` | **Public identity** — connection state |
| `packages/networking/src/contracts/network-types.ts` | 392 | Join request `seat (1..playerCount — engine's 1-based PlayerId)` | **Seat coordinate** — provisional |
| `packages/networking/src/contracts/network-types.ts` | 683, 704 | `GuestIdentityClaim.guestPlayerId`, `IdentityState.guestPlayerId` | **Public identity** — lobby identity |
| `packages/networking/src/contracts/network-api.ts` | 349, 378, 412, 488, 756, 765, 845, 852, 868, 888, 951 | Various `playerId` fields in API payloads | **Public identity** — wire protocol |
| `packages/networking/src/contracts/matchmaking-to-networking.ts` | 175, 190, 203, 208, 275, 287, 305 | `playerId` in matchmaking↔networking bridge | **Public identity** — bridge contract |
| `packages/networking/src/broadcast.ts` | 233 | `connection.playerId ?? SPECTATOR_VIEW_SEAT` | **Seat coordinate** — spectator fallback |
| `packages/networking/src/match-channel.ts` | 32 | `readonly playerId: PlayerId` on match channel | **Public identity** — channel identity |
| `packages/networking/src/match-channel.ts` | 276 | `a.order.kind.localeCompare(b.order.kind)` | **Dense index** — ordering (non-identity) |

### 1.6 Matchmaking types and source

| File | Line(s) | Field | Classification |
| --- | --- | --- | --- |
| `packages/matchmaking/src/contracts/lobby-types.ts` | 55 | `GuestPlayerId = string & { __brand: 'GuestPlayerId' }` | **Public identity** — duplicate declaration |
| `packages/matchmaking/src/contracts/lobby-types.ts` | 110, 142 | `GuestIdentityClaim.guestPlayerId`, `IdentityState.guestPlayerId` | **Public identity** — lobby identity |
| `packages/matchmaking/contracts/match-types.ts` | 490, 496, 521 | `guestPlayerId` in contract mirrors | **Public identity** — contract mirror |
| `packages/matchmaking/src/matchLifecycle.ts` | 69-74 | `toPlayerId(value: number): PlayerId` — seat-index derivation | **Seat coordinate** — must be replaced |
| `packages/matchmaking/src/matchLifecycle.ts` | 225 | `seat.playerId = toPlayerId(seat.seatIndex + 1)` | **Seat coordinate** — primary derivation site |
| `packages/matchmaking/src/matchmaker.ts` | 510 | `playerId: toPlayerId(seatIndex + 1)` | **Seat coordinate** — provisional assignment |
| `packages/matchmaking/src/matchmaker.ts` | 595 | `playerId: toPlayerId(index + 1)` | **Seat coordinate** — rematch assignment |
| `packages/matchmaking/src/results.ts` | 79 | `id: (seat.playerId ?? ((seat.seatIndex + 1) as PlayerId)) as PlayerId` | **Seat coordinate** — fallback derivation |
| `packages/matchmaking/src/internal/seatRecord.ts` | 37 | `seatIndex + 1` comment documenting provisional `playerId` | **Seat coordinate** — documentation |
| `packages/matchmaking/src/internal/lobbyService.ts` | 532 | `a.handle.toLowerCase().localeCompare(b.handle.toLowerCase())` | **Dense index** — display sort (non-identity) |

### 1.7 Console types and source

| File | Line(s) | Field | Classification |
| --- | --- | --- | --- |
| `packages/console/src/contracts/console-types.ts` | 355 | `playerColors: Readonly<Record<PlayerId, string>>` | **Public identity** — color map |
| `packages/console/src/contracts/console-types.ts` | 439, 443 | `CellRenderInfo.owner/cityOwner: PlayerId \| null` | **Public identity** — render info |
| `packages/console/src/contracts/console-types.ts` | 527, 538 | `DEFAULT_PLAYER_COLORS: Record<PlayerId, string>` | **Public identity** — color map |
| `packages/console/src/contracts/console-types.ts` | 682, 687, 692 | `Session.playerId`, `playerNames: Map<PlayerId, string>` | **Public identity** — session state |
| `packages/console/src/contracts/console-state.ts` | 136, 265, 423 | `playerId: PlayerId` in state types | **Public identity** — state shape |
| `packages/console/src/state/reducer.ts` | 397-431 | `resolveName(id: PlayerId, ...)` — name resolution | **Public identity** — display |
| `packages/console/src/state/reducer.ts` | 466 | `Map<PlayerId, string>` for player names | **Public identity** — state |
| `packages/console/src/state/action-to-order.ts` | 35 | `actionToOrder(action, playerId: PlayerId, ...)` | **Public identity** — order creation |
| `packages/console/src/state/local-preflight.ts` | 34, 94 | `localPreflightOrder(order, view, playerId: PlayerId)` | **Public identity** — validation |
| `packages/console/src/state/spectator-session.ts` | 106, 205-232 | `Map<PlayerId, string>` player names, `resolveName` | **Public identity** — spectator display |
| `packages/console/src/net/client.ts` | 67, 280 | `playerId(): PlayerId \| null` | **Public identity** — client interface |
| `packages/console/src/net/ws-match-client.ts` | 80, 187, 376 | `playerId: PlayerId \| null` | **Public identity** — client state |
| `packages/console/src/net/lobby-storage.ts` | 54, 216-227 | `guestPlayerId: GuestPlayerId`, `mintGuestClaimId()` | **Public identity** — local storage |
| `packages/console/src/ui/seat-labels.ts` | 34 | `1-based seat number (engine PlayerId domain)` | **Seat coordinate** — display |
| `packages/console/src/create-console.ts` | 68 | `getPlayerId: (): PlayerId \| null` | **Public identity** — API surface |

---

## 2. Seat-index-to-PlayerId derivation sites (critical migration targets)

These are the sites where a numeric identity is **derived from a seat position** rather
than assigned by the server. Every one must be replaced with a universal ID from the
identity registry.

| File | Line | Code pattern | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/create.ts` | 173 | `const id = (i + 1) as PlayerId` | **Dense index** — engine init from city bands |
| `packages/matchmaking/src/matchLifecycle.ts` | 69-74 | `toPlayerId(value: number): PlayerId` | **Seat coordinate** — guard function |
| `packages/matchmaking/src/matchLifecycle.ts` | 225 | `seat.playerId = toPlayerId(seat.seatIndex + 1)` | **Seat coordinate** — match start finalization |
| `packages/matchmaking/src/matchmaker.ts` | 510 | `playerId: toPlayerId(seatIndex + 1)` | **Seat coordinate** — join provisional |
| `packages/matchmaking/src/matchmaker.ts` | 595 | `playerId: toPlayerId(index + 1)` | **Seat coordinate** — rematch assignment |
| `packages/matchmaking/src/results.ts` | 79 | `seat.playerId ?? ((seat.seatIndex + 1) as PlayerId)` | **Seat coordinate** — terminal fallback |

---

## 3. Serialization format carrying numeric identity

### 3.1 Engine binary serialization (`serialize.ts`)

| File | Line(s) | Format detail | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/serialize.ts` | 28-46 | Format doc: per-player record starts with `PlayerId` byte | **Public identity** — wire format |
| `packages/engine/src/serialize.ts` | 311 | `const id = (bytes[p++] ?? 0) as PlayerId` — 1-byte player ID | **Public identity** — must become ID table |
| `packages/engine/src/serialize.ts` | 345 | `owner: (bytes[p++] ?? 0) as PlayerId` — cell owner byte | **Dense index** — Uint8Array encoding |

### 3.2 Replay format

| File | Line(s) | Format detail | Classification |
| --- | --- | --- | --- |
| `packages/engine/src/replay/types.ts` | 26 | `readonly playerId: PlayerId` in replay commands | **Public identity** — replay command identity |
| `packages/engine/src/replay/replay.ts` | — | Uses `playerId` from replay commands | **Public identity** — replay execution |
| `packages/engine/src/replay/validate.ts` | — | Validates replay `playerId` values | **Public identity** — replay validation |

---

## 4. Test fixtures with hardcoded numeric PlayerIds

### 4.1 Engine tests (180+ `as PlayerId` casts)

| File | Pattern | Count | Classification |
| --- | --- | --- | --- |
| `packages/engine/tests/determinism.test.ts` | `[1, 1, 1 as PlayerId]`, `[6, 6, 2 as PlayerId]` | ~6 | **Negative test** (will become valid fixture IDs) |
| `packages/engine/tests/unit/tick.test.ts` | `1 as PlayerId`, `2 as PlayerId` in boards/orders | ~50 | **Negative test** — will become explicit IDs |
| `packages/engine/tests/unit/combat.test.ts` | `garrisonOwner: PlayerId \| 0` | ~20 | **Dense index** — combat internals |
| `packages/engine/tests/unit/create.test.ts` | `owner: 1 as PlayerId` | ~4 | **Negative test** |
| `packages/engine/tests/unit/serialize.test.ts` | `owner: 1 as PlayerId` | ~4 | **Negative test** |
| `packages/engine/tests/unit/validate-command.test.ts` | `1 as PlayerId`, `2 as PlayerId` | ~6 | **Negative test** |
| `packages/engine/tests/unit/paratroop.test.ts` | `player: 1 as PlayerId` | ~12 | **Negative test** |
| `packages/engine/tests/unit/gun.test.ts` | `player: 1 as PlayerId` | ~8 | **Negative test** |
| `packages/engine/tests/unit/capture.test.ts` | owner/PlayerId patterns | ~8 | **Negative test** |
| `packages/engine/tests/unit/read.test.ts` | PlayerId patterns | ~6 | **Negative test** |
| `packages/engine/tests/unit/flow.test.ts` | owner patterns in board setup | ~10 | **Dense index** — flow internals |
| `packages/engine/tests/unit/decay.test.ts` | owner patterns | ~8 | **Dense index** |
| `packages/engine/tests/unit/terminal.test.ts` | PlayerId patterns | ~4 | **Negative test** |
| `packages/engine/tests/unit/events.test.ts` | PlayerId patterns | ~4 | **Negative test** |
| `packages/engine/tests/unit/production.test.ts` | owner patterns | ~4 | **Dense index** |
| `packages/engine/tests/unit/scratch-buffers.test.ts` | — | ~2 | **Dense index** |
| `packages/engine/tests/unit/scenarios.test.ts` | — | ~2 | **Negative test** |
| `packages/engine/tests/quickstart/*.test.ts` | various `as PlayerId` | ~40 | **Negative test** |
| `packages/engine/tests/replay/*.test.ts` | `playerId: 1 as PlayerId` | ~20 | **Negative test** |
| `packages/engine/tests/fixtures/board.ts` | `owner: PlayerId` parameter | — | **Negative test** — fixture builder |
| `packages/engine/tests/perf/tick-perf.bench.ts` | `1 as PlayerId`, `2 as PlayerId` | ~4 | **Negative test** |
| `packages/engine/scripts/capture.ts` | `playerId: PlayerId` in capture script | — | **Negative test** |

### 4.2 Networking tests

| File | Pattern | Classification |
| --- | --- | --- |
| `packages/networking/tests/fixtures/match.ts:90` | `owner: seat as PlayerId` | **Seat coordinate** — fixture derivation |
| `packages/networking/tests/fixtures/match.ts:267` | `playerId: (i + 1) as PlayerId` | **Seat coordinate** — fixture derivation |
| `packages/networking/tests/unit/server.test.ts` | `1 as PlayerId`, `2 as PlayerId` | **Negative test** |
| `packages/networking/tests/unit/connection.test.ts:194` | `1 as PlayerId` | **Negative test** |
| `packages/networking/tests/unit/broadcast.test.ts:314` | `winner: 1 as PlayerId` | **Negative test** |
| `packages/networking/tests/integration/harness.ts:225` | `seat as PlayerId` | **Seat coordinate** — test harness |
| `packages/networking/tests/integration/fog-leakage-n-players.test.ts` | `(index + 1) as PlayerId` | **Seat coordinate** — test harness |

### 4.3 Matchmaking tests

| File | Pattern | Classification |
| --- | --- | --- |
| `packages/matchmaking/tests/conformance.test.ts:170` | `playerId = seatIndex + 1` — conformance assertion | **Seat coordinate** — conformance guard |
| `packages/matchmaking/tests/unit/matchLifecycle.test.ts:209` | `seatIndex + 1` comment | **Seat coordinate** — documentation |
| `packages/matchmaking/tests/unit/lobby.list.test.ts:182` | `P${String(seat + 1)}` — display name | **Seat coordinate** — display |

### 4.4 Console tests

| File | Pattern | Classification |
| --- | --- | --- |
| `packages/console/tests/fixtures/determinism-scenario.ts:238,252` | `localeCompare` in sort | **Dense index** — determinism fixture |
| `packages/console/tests/e2e/full-stack-n-players.spec.ts:289,334` | `P${String(seat + 1)}` — display name | **Seat coordinate** — E2E display |

---

## 5. `GuestPlayerId` surfaces

| File | Line(s) | Usage | Classification |
| --- | --- | --- | --- |
| `packages/networking/src/contracts/network-types.ts` | 646 | Type definition: branded string | **Public identity** — lobby identity type |
| `packages/matchmaking/src/contracts/lobby-types.ts` | 55 | Duplicate type definition | **Public identity** — duplicate declaration |
| `packages/matchmaking/contracts/match-types.ts` | 490, 496, 521 | Contract mirror declarations | **Public identity** — contract mirror |
| `packages/console/src/net/lobby-storage.ts` | 54, 216-227 | `StoredLobbyClaim.guestPlayerId`, `mintGuestClaimId()` | **Public identity** — local storage |
| `packages/console/src/net/ws-lobby-client.ts` | 253, 615-639 | Claim factory, `adoptServerGuestId()` | **Public identity** — lobby client |
| `packages/console/tests/fixtures/lobbyTransports.ts` | 51-52 | `guestIdOf(value)` helper | **Negative test** — test helper |
| `packages/networking/tests/fixtures/lobbyWire.ts` | 59-70 | `nextGuestPlayerId()` minter | **Negative test** — fixture minter |
| `packages/matchmaking/tests/fixtures/lobbyIdentities.ts` | 46-48 | `nextGuestPlayerId()` minter | **Negative test** — fixture minter |

---

## 6. Router handoffs using `history.push`/`history.replace`

All `history.pushState`/`replaceState` references found are in **test setup/teardown**
code (E2E tests preserving `?ws=` query params) or in `profile-url.ts` (reading
history state, not mutating). No authoritative routing uses raw history mutation.
Console routing uses TanStack Router exclusively.

| File | Context | Classification |
| --- | --- | --- |
| `packages/console/tests/e2e/lobby.spec.ts:71-74` | E2E test: intercept pushState/replaceState to preserve `?ws=` | **Negative test** — test infrastructure |
| `packages/console/tests/e2e/routing.spec.ts:40-73` | E2E test: intercept pushState/replaceState | **Negative test** — test infrastructure |
| `packages/console/tests/e2e/shareable-links.spec.ts:51-54` | E2E test: intercept pushState/replaceState | **Negative test** — test infrastructure |
| `packages/console/tests/e2e/spectator-sidebar.spec.ts:62-65` | E2E test: intercept pushState/replaceState | **Negative test** — test infrastructure |
| `packages/console/src/ui/profile-url.ts:23` | `history.pushState` — read-only comment about URL state | **Dense index** — documentation only |

**Verdict**: No authoritative routing uses raw `history.push`/`history.replace`.
All TanStack Router navigation is via `useNavigate()` or `<Link>`.

---

## 7. `localeCompare` in authoritative ordering paths

| File | Line | Code | Classification | Risk |
| --- | --- | --- | --- | --- |
| `packages/networking/src/match-channel.ts` | 276 | `a.order.kind.localeCompare(b.order.kind)` | **Dense index** — order drain sort tiebreak | **High** — must replace with explicit comparator |
| `packages/matchmaking/src/internal/lobbyService.ts` | 532 | `a.handle.toLowerCase().localeCompare(b.handle.toLowerCase())` | **Dense index** — roster display sort | **Medium** — plan calls for explicit comparator |
| `packages/design/tests/tokens.test.ts` | 75-111 | `localeCompare` in token ordering tests | **Negative test** — test assertions |
| `packages/design/scripts/build-css.ts` | 80, 165 | `localeCompare` in CSS variable sorting | **Low** — build script, not runtime |
| `packages/console/tests/fixtures/determinism-scenario.ts` | 238, 252 | `localeCompare` in determinism fixture | **High** — must replace for determinism |
| `packages/console/scripts/build-assets.ts` | 101 | `localeCompare` in asset sorting | **Low** — build script |
| `packages/matchmaking/tests/unit/roster.test.ts` | 634 | `localeCompare` in test assertion | **Negative test** — test assertion |
| `packages/networking/tests/integration/rate-limit.test.ts` | 112 | `localeCompare` in comment | **Negative test** — documentation |

---

## 8. `nanoid` direct imports

**Result**: Zero `nanoid` imports or dependencies found anywhere in the repository.
No `nanoid` in any `package.json` (dependencies or devDependencies). Clean baseline.

---

## 9. Numeric `owner`, `winner`, and identity fields in type definitions

### 9.1 Engine types (all `PlayerId`)

| File | Line | Field | Current type | Target |
| --- | --- | --- | --- | --- |
| `engine-types.ts` | 75 | `Player.id` | `PlayerId` (= `1\|2\|3\|4`) | Branded string |
| `engine-types.ts` | 117 | `CellView.troopOwner` | `PlayerId \| null` | Branded string \| null |
| `engine-types.ts` | 120 | `CellView.cityOwner` | `PlayerId \| null` | Branded string \| null |
| `engine-types.ts` | 130-185 | All order `.player` fields | `PlayerId` | Branded string |
| `engine-types.ts` | 209 | `already_surrendered.player` | `PlayerId` | Branded string |
| `engine-types.ts` | 227-228 | `CombatEvent.attacker/defender` | `PlayerId` | Branded string |
| `engine-types.ts` | 231 | `CombatEvent.winner` | `PlayerId \| 'tie'` | Branded string \| 'tie' |
| `engine-types.ts` | 241-242 | `CaptureEvent.fromOwner/toOwner` | `PlayerId \| null` | Branded string \| null |
| `engine-types.ts` | 248 | `GunEvent.player` | `PlayerId` | Branded string |
| `engine-types.ts` | 273 | `MatchResult.winner` | `PlayerId` | Branded string |

### 9.2 Console types

| File | Line | Field | Current type | Target |
| --- | --- | --- | --- | --- |
| `console-types.ts` | 355 | `playerColors` | `Record<PlayerId, string>` | `Record<PlayerId, string>` (key changes) |
| `console-types.ts` | 439, 443 | `CellRenderInfo.owner/cityOwner` | `PlayerId \| null` | Branded string \| null |
| `console-types.ts` | 538 | `DEFAULT_PLAYER_COLORS` | `Record<PlayerId, string>` | Key changes |
| `console-types.ts` | 682 | `Session.playerId` | `PlayerId \| null` | Branded string \| null |
| `console-types.ts` | 692 | `playerNames` | `Map<PlayerId, string>` | Key changes |
| `console-state.ts` | 136, 265, 423 | `playerId` fields | `PlayerId` | Branded string |

---

## 10. Summary statistics

| Category | Source files | Test files | Total sites |
| --- | --- | --- | --- |
| Type definitions (PlayerId) | 6 | 0 | 6 |
| Engine model fields | 12 | 0 | 12 |
| Engine source usages | 10 | 29 | 39 |
| Networking types/source | 8 | 12 | 20 |
| Matchmaking types/source | 8 | 15 | 23 |
| Console types/source | 12 | 15 | 27 |
| Seat-index derivation | 4 | 3 | 7 |
| Serialization format | 2 | 2 | 4 |
| GuestPlayerId surfaces | 4 | 4 | 8 |
| `localeCompare` (authoritative) | 2 | 0 | 2 |
| `localeCompare` (test/build) | 0 | 6 | 6 |
| Router handoffs | 0 | 5 | 5 (all test infra) |
| **Total unique files** | **~68** | **~82** | **~150** |

---

## 11. Blockers and risks

1. **Dual `GuestPlayerId` declarations**: `networking/src/contracts/network-types.ts:646`
   and `matchmaking/src/contracts/lobby-types.ts:55` declare the same branded type
   independently. Plan must consolidate to a single source (likely `@europa/core`) and
   synchronize both contract mirrors.

2. **`toPlayerId()` gate function**: `matchmaking/src/matchLifecycle.ts:69-74` is the
   single guard that validates seat-index derivation. It is called from 4 sites. Replacing
   it with a universal ID allocator changes the calling convention entirely — every caller
   must pass an explicit `PlayerId` from the identity registry.

3. **Engine `Uint8Array` storage**: `troopOwners` and `cityOwners` are `Uint8Array` where
   byte value = PlayerId. String IDs cannot fit in a byte. The plan must address whether
   these stay as dense indexes (private implementation detail) with an explicit mapping
   layer, or change representation.

4. **Engine serialization format**: The 1-byte-per-player format (`serialize.ts:311,345`)
   must gain an ID table. This is a breaking wire format change that must be coordinated
   with `ENGINE_API_VERSION`.

5. **`localeCompare` in determinism fixture**: `console/tests/fixtures/determinism-scenario.ts`
   uses `localeCompare` for `playerColors` and `playerNames` sorting. This MUST be replaced
   with the explicit UTF-16 comparator to maintain byte-identical determinism.

6. **`localeCompare` in match-channel order drain**: `networking/src/match-channel.ts:276`
   uses `localeCompare` for order kind tiebreaking. Not identity-related, but must be
   replaced per plan decision for locale-independent determinism.

7. **No existing guards**: No Biome lint rule, ESLint rule, or conformance test exists
   to prevent regression (e.g., reintroducing numeric IDs or `nanoid` imports). T003
   will create a minimal guard.
