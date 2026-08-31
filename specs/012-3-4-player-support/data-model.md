# Data Model: 3–4 Player End-to-End Support (012)

**Branch**: `issue-6-3+4-player-matches` | **Date**: 2026-08-28 | **Spec**: `specs/012-3-4-player-support/spec.md` v1.0 | **Plan**: `specs/012-3-4-player-support/plan.md`

> Phase 1 delta — extends 006 (matchmaking), 010 (lobby), 005 (console), 011 (host). No new persistent entity; all deltas are constants, derived presentation, or pre-bind CLI config. Keep it minimal — this feature mostly harnesses existing entities.

---

## 0. Prior art (not redefined)

| Entity | Owner | Shape (unchanged) | This feature |
|--------|-------|-------------------|--------------|
| `Match` / `MatchRecord` / `PublicLobbyEntry` | `@europa/matchmaking` (006) + `@europa/networking` (004) | `playerCount:2\|3\|4`, `boardSize∈[8,128]`, `visibility∈{public,private}`, seats append-only, lifecycle `filling→running→finished→collected` | Consumed — `playerCount` already validated `2\|3\|4`; SC-001/SC-002 exercise 3/4 there is no new state shape (FR-004). |
| `GenerationSettings` + `Board` + `Rng` | `@europa/terrain` (003) + `@europa/engine` (001) | `{waterRatio, roughness, octaves, citiesPerPlayer, symmetryStrategy, minCityWaterDistance, minCityCityDistance, maxRegenAttempts}`; `Board {size, elevations, water, cities[]}`; `partnerPlayer` + even-normalization for `playerCount===3` (003 v1.2) | Consumed — no edit; SC-003 audits cover odd/even `citiesPerPlayer` determinism. |
| `World` / `TickResult` / `CellView` | `@europa/engine` (001) | Deterministic integer simulation, victory FR-015/FR-016, tick 250 ms | Consumed — no constants/order/victory change (FR-007). |
| `VisibleSet` + `computePlayerView` | `@europa/fog` (002) | Chebyshev-4 union over own stacks, stateless, spectator full-readonly | Consumed — SC-004 ports audit to N=3,4. |
| `TickPayload` / `SnapshotPayload` | `@europa/networking` (004) | Fog-filtered per-seat broadcast, `tick≥1` after `advance()`, `NETWORK_API_VERSION` stable | Consumed — no envelope/frame bump (FR-010). |
| `GuestPlayerIdentity` + `Handle` | `@europa/matchmaking` lobby (010) | In-memory ephemeral, server-authoritative association, reconnect grace | Consumed — no new persistence. |

---

## 1. `BoardSizeDefault` — mapping `playerCount → boardSize` (single source)

**Owner**: `@europa/matchmaking` (`packages/matchmaking/src/constants.ts` + `contracts/match-types.ts`)

```ts
/** Product-approved default board edge per player count (FR-001). */
export type PlayerCount = 2 | 3 | 4;
export type BoardSize = 32 | 48 | 64; // presentation set; server clamp is [8,128]
export type BoardSizeDefault = Readonly<Record<PlayerCount, BoardSize>>;

export const BOARD_SIZE_DEFAULTS: BoardSizeDefault = {
  2: 32,
  3: 48,
  4: 48,
} as const;
```

**Invariants**:
- `BOARD_SIZE_DEFAULTS` is the **single source** for every default derivation: lobby form pre-select (FR-002), host implied size (FR-011), manual `numbers.md` table. No second table in console/host.
- `DEFAULT_MATCH_SETTINGS.boardSize` stays `32` (engine-facing default) — unchanged for backward API compatibility. The map is additive and referenced only at the *presentation* layer (form default, CLI implied). Direct `createMatch` callers who omit `boardSize` still get `32`; callers whose `playerCount` is 3/4 and who omit `boardSize` via the lobby/host UI path get the N-aware default because **the caller** fills it before calling `createMatch` (the server does not second-guess).
- Every explicit caller-supplied `boardSize ∈ {32,48,64}` overrides without rejection (UI + host allow all three). Server clamp `[8,128]` remains on direct API (spec Edge Cases).

**Validation**: `BOARD_SIZE_DEFAULTS` unit pin asserts byte-identical table; consumers (`lobby-create-form.tsx`, `scripts/host.ts`) import from `@europa/matchmaking` — no mirrored literals.

**Lifecycle**: constant — never mutated after import. `BoardSizeDefault` is not stored per-match; the effective board size is authoritative on the `Board` itself.

---

## 2. `LobbyCapacityChrome` — derived user-visible composite (no new protocol field)

**Owner**: `packages/console/src/ui/lobby-labels.ts` (presentation-only)

Existing upstream entry (unchanged):

```ts
// @europa/matchmaking — lobby types (010)
interface PublicLobbyEntry {
  readonly matchId: MatchId;
  readonly hostDisplayName: string;
  readonly capacity: number;   // === playerCount
  readonly seatsFilled: number; // 1..capacity
  readonly boardSize: number;
  readonly status: LobbyStatus; // 'waiting' | 'in_progress'
  // ... ageSeconds, tickIntervalMs, etc. — unchanged
}
```

Derived chrome (this feature's delta — presentation helpers, already exist; enhanced for N>2):

```ts
// packages/console/src/ui/lobby-labels.ts — pure, DOM-free
export function formatOccupancy(seatsFilled: number, capacity: number): string;
// e.g. 1/2 → "1 of 2 seats filled", 2/3 → "2 of 3 seats filled"
export function formatEntrySettings(entry: PublicLobbyEntry): string;
// e.g. "48×48 board · 250 ms ticks"
export function lobbyStatusLabel(status: LobbyStatus): string;
// 'waiting' → "Waiting for players"; 'in_progress' → "In progress"
export function isJoinable(entry: PublicLobbyEntry): boolean;
// waiting && seatsFilled < capacity
export function rowActionLabel(action: 'join'|'spectate', entry: PublicLobbyEntry): string;
// "Join match — Waiting for players, 1 of 3 seats filled" (WCAG context)
```

**Invariants**:
- For `playerCount>2` the capacity portion `"/ N"` is the deliberate delta over v1's 2p rows (FR-003) — now surfaced via `formatOccupancy` + `capacity` in the row text. Private matches are never projected (010 FR-015) — chrome inherits that boundary.
- State transitions remain observable within one tick (006 FR-012 / 010 FR-013) — projection staleness mitigation unchanged (010 `recomputeAndPublish` diff discipline).
- No `LobbyEntry` shape change; no new `NetworkPayload` kind; conformance suite re-runs green.

**Validation**: component + integration tests pin `k/N` rendering for every `N∈{2,3,4}` plus `Join`/`Spectate` affordance (010 FR-006/FR-007); WCAG row-label tests cover `rowActionLabel`.

---

## 3. `WaitingStatus` — N-aware copy derived from `isAwaitingMatchStart` (no predicate change)

**Owner**: `packages/console/src/state/awaiting-start.ts` + `packages/console/src/ui/waiting-overlay.tsx` + `packages/console/src/render/App.tsx`

Predicate (unchanged — 005 Implementation Notes item 11):

```ts
export function isAwaitingMatchStart(state: ConsoleState): boolean {
  return state.status === 'live'
      && (state.latestView === null || state.latestView.tick === 0);
}
```

New pure helper (this feature's only addition):

```ts
/**
 * N-aware waiting copy for the filling room.
 * @param seatsFilled currently occupied seats (k, 1 ≤ k < N)
 * @param capacity total seats (N, 2|3|4)
 * @returns "Waiting for N-k more players… (k/N)" using correct singular/plural
 */
export function formatWaitingMessage(seatsFilled: number, capacity: number): string {
  const remaining = capacity - seatsFilled;
  if (remaining === 1) return `Waiting for 1 more player… (${seatsFilled}/${capacity})`;
  return `Waiting for ${remaining} more players… (${seatsFilled}/${capacity})`;
}
export const WAITING_FOR_OPPONENT_MESSAGE_LEGACY = 'Waiting for opponent to join…'; // retired for N>2
```

Derived wiring in `App.tsx`:
```ts
const awaitingStart = store !== undefined && isAwaitingMatchStart(resolvedState);
const waitingChrome = (() => {
  if (!awaitingStart) return null;
  const active = lobbyEntryForActiveMatch ?? fallbackFromJoinContext;
  if (active === null) return null;
  return formatWaitingMessage(active.seatsFilled, active.capacity);
})();
{awaitingStart ? <WaitingOverlay message={waitingChrome ?? fallbackLegacy} announcer={…} /> : null}
```

**Invariants** (FR-005):
- Predicate unchanged — no new prop, no tick-zero redefinition.
- Copy derived from authoritative `capacity`/`seatsFilled` available to App (lobby entry for active match or join assignment fallback) — not from tick payload.
- Overlay remains `pointer-events:none`, once-announced via polite live region, `prefers-reduced-motion` honored (modifier class + media query), self-hides on first non-zero tick or status change, never stacks with reconnecting/game-over.
- `1/N` → plural when `N-1>1` (e.g. `1/3` → "2 more players…"), `N-1/N` → singular ("1 more player…"); `2→1/2` retains equivalent meaning as `1/2` via same structure (retired legacy string is not reintroduced).

**Validation**: unit table `formatWaitingMessage` over all `(k,N)` pairs (2: `1/2`; 3: `1/3,2/3`; 4: `1/4,2/4,3/4`) + mounted `App` test visible→hidden across real matchmaking fill per N + `tick≥1` hides regardless of capacity.

---

## 4. `NPlayerHostConfig` — extends `HostConfig` with `playerCount` + `boardSize`

**Owner**: `packages/console/scripts/host-config.ts` + `packages/console/scripts/host.ts`

```ts
/** Existing (011) — unchanged */
export interface HostConfig {
  readonly bindHost: string;
  readonly publicHost: string;
  readonly port: number;     // HOST_PORT single http.Server
  readonly wsPort: number;   // deprecated alias for port
}

/** Additive for 012 (FR-011) */
export interface NPlayerHostConfig extends HostConfig {
  readonly playerCount: 2 | 3 | 4;
  readonly boardSize: 32 | 48 | 64;
}

/**
 * Resolve from argv + env; fail fast with actionable message.
 * consume: --players N / --player-count N / HOST_PLAYER_COUNT (2|3|4, default 2)
 *          --board-size S / --boardSize S / HOST_BOARD_SIZE (32|48|64, default → BOARD_SIZE_DEFAULTS[playerCount])
 * reject: --static-port / HOST_STATIC_PORT, invalid values (allowed set named), mismatched alias values
 */
export function resolveConfig(
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): NPlayerHostConfig | null; // null → caller prints error + exits 1
```

**Invariants** (FR-011 / FR-012):
- Defaults: `playerCount` defaults to `2` when absent (backward compat); `boardSize` when absent implies `BOARD_SIZE_DEFAULTS[playerCount]` (so `--players 3` → `48`, never silently `32`).
- Flags pass through `resolveConfig` the same way `HOST_PORT`/`HOST_BIND_HOST`/`HOST_PUBLIC_HOST` do; env fallback applies only when neither flag present.
- Validated before binding; invalid values fail fast naming ` --players must be 2, 3, or 4` / ` --board-size must be 32, 48, or 64` (no silent fallback, no second listener).
- Single `http.Server` on `HOST_PORT` unchanged; `prepareMatch` drives `createMatch({visibility:'public', displayName, settings:{playerCount, boardSize, tickIntervalMs:250}})`, fills to `playerCount` seats, prints `playerCount` token-bearing join URLs; `GET /version` + same-origin WS over same port both work (011 FR-001..FR-003).

Player IDs are non-secret correlation metadata and may be shown in diagnostic
or contract examples. Token-bearing URLs remain operationally restricted, and
the handle-preferred UI, private-match boundary, and fog-of-war rules remain
unchanged (feature-010 identity-visibility correction).
- `HOST_STATIC_PORT` / `--static-port` passing remains a conformance failure (011 FR-004) — rejected with clear error, no second listener.
- E2E fixtures use `port:0` + `__boundPortForTest()` per 011 FR-009 — no two-port seam.

**State held**: none beyond the returned config object. Host process holds the ephemeral match in the matchmaker until SIGINT — same lifecycle as v1 `prepareMatch`, just parameterized over `N`.

---

## 5. Relationships

```
BoardSizeDefault ──► LobbyCreateForm (pre-select/override) ──► MatchSettings ──► MatchRecord
        │                      │
        └────► NPlayerHostConfig ──► prepareMatch ──► MatchRecord (filling → running)
                 LobbyCapacityChrome ◄── PublicLobbyEntry (capacity/seatsFilled/boardSize/status)
                 WaitingStatus ◄────── ConsoleState + PublicLobbyEntry (capacity/seatsFilled)
```

No new foreign keys. All joins are by `MatchId`. All identities remain `GuestPlayerIdentity` → `SeatRecord` server-authoritative association (010).

---

## 6. Validation & state transitions delta

No new state — lifecycle stays `filling → running → finished → collected` (006 FR-012). What widens is the *exercise* of that machine over `N∈{3,4}`:

- `createMatch` with `playerCount=3|4` still validates `playerCount∈{2,3,4}` with `invalid_request` + `detail {field:'settings.playerCount'}` (FR-004).
- `boardSize` validation: server clamp `[8,128]` with `invalid_request` + field detail; UI/host presentation set `{32,48,64}` is additive validation in the consumer (form `select`, host `resolveConfig`) — not a server shape change.
- Auto-start when seats fill (006 FR-007) triggers atomically for the Nth seat — same path as 2p, now with deterministically larger board (SC-003/S​C-004 audits).
- GC sweeps remain lazy/read-path-collected against injected clock (006 Implementation Notes) — no timer added.
- Forfeit/disconnect/rematch with N>2: only the forfeiting seat is marked; match continues while ≥2 remain (US5 AC-2); terminates into `finished→collected` when `<2` remain (Edge Cases).

---

## 7. No other entities

Spec explicitly disallows: new terrain algorithm, new victory rule, new fog radius/memory, persistence, replay/history, chat/ratings/invitations, TLS/orchestrator, analytics, mobile/touch. No spec amendment to engine/terrain/fog/networking docs.
