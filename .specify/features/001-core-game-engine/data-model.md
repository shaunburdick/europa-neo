# Data Model: Core Game Engine (Feature 001)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `.specify/features/001-core-game-engine/spec.md`

> All entities live in `packages/engine/src/types.ts` and are re-exported
> via `@europa/engine` to downstream packages (002 fog, 003 terrain, 004
> networking, 005 console, 006 matchmaking). Types are `Readonly<...>`
> everywhere outside the engine's own internal mutation during tick
> resolution; the public `World` value is fully immutable.
>
> Field types are described here in TypeScript-flavored notation. PR-002
> surfaces these in `contracts/engine-types.ts`.

---

## 1. `Board` — static terrain definition

The terrain is **immutable within a match** (spec Assumptions). It is
produced by feature 003 (terrain generation) and consumed by feature 001
to create a `World`.

### Fields

| Field         | Type                          | Constraints                | Notes |
|---------------|-------------------------------|----------------------------|-------|
| `width`       | `number` (integer)            | `> 0`, `=== height`        | Square board (FR-001) |
| `height`      | `number` (integer)            | `> 0`, `=== width`         | |
| `cells`       | `ReadonlyArray<Readonly<Cell>>` | length `=== width*height` | Row-major; `cells[y*width + x]` |
| `cities`      | `ReadonlyArray<CityPlacement>` | `≥ 1` per player          | Initial city positions |

### Validation rules

- `width === height` (square grid per FR-001).
- `cells.length === width * height`.
- Each `CityPlacement` references a `Cell` with `terrain === 'land'`.
- No two cities on the same cell.
- City count is symmetric across players (per feature 003 invariant).

### Relationships

- One `Board` → N `Cell` (composition).
- One `Board` → N `CityPlacement` (composition).

---

## 2. `Cell` — one square of the grid

### Fields

| Field        | Type           | Constraints         | Notes |
|--------------|----------------|---------------------|-------|
| `x`          | `number` (int) | `0 ≤ x < width`     | Column |
| `y`          | `number` (int) | `0 ≤ y < height`    | Row |
| `elevation`  | `number` (int) | `0 ≤ elevation ≤ 255` | Reserved for slope math (FR-007) |
| `terrain`    | `Terrain`      | `'land' \| 'water'` | Water cells impassable (FR-002) |

### `Terrain`

```ts
type Terrain = 'land' | 'water';
```

### Validation rules

- Water cells reject all commands except `gun` (which damages but doesn't
  move troops there per FR-014).
- Paratroop/gun/pipes into water fail validation (FR-002, edge cases).
- Elevation difference between adjacent cells drives flow multipliers
  (FR-007); values are signed: `destElev - srcElev`.

---

## 3. `City` — production facility attached to a cell

### Fields

| Field             | Type              | Constraints                  | Notes |
|-------------------|-------------------|------------------------------|-------|
| `cell`            | `Coord`           | land cell with elevation ≥ 0 | Position |
| `productionRate`  | `number` (int)    | `> 0`, from `ENGINE_CONSTANTS.productionRate` | Troops per tick (FR-004) |
| `capacity`        | `number` (int)    | `> 0`, from `ENGINE_CONSTANTS.cityCapacity`  | Saturation cap (FR-004) |
| `owner`           | `PlayerId \| null`| `null` only pre-match        | Cities begin owned; can be captured (FR-005) |

### State transitions

```
               (cell occupied by enemy troops)
       ┌──────────────────────────────────────────┐
       │                                          ▼
  [owned by P]  ─────── combat ───────► [owned by Q]
       │                                          │
       │  (no troops / destroyed)                 │
       ▼                                          ▼
   [no owner]                              [no owner]
```

(Per FR-005 + Edge Case: "What happens when a city is captured
mid-production?" — new owner inherits cell + saturation state.)

---

## 4. `TroopStack` — troops in one cell

### Fields

| Field    | Type              | Constraints              | Notes |
|----------|-------------------|--------------------------|-------|
| `owner`  | `PlayerId \| null`| `null` only if count===0 | Spec `Key Entities` lists `owning player, count` |
| `count`  | `number` (int)    | `≥ 0`                    | Integer (spec) |

**Encoding on `Cell` runtime**: in `World.cells[y*w+x]` we keep a
flattened `Uint32Array` for counts and a parallel `Uint8Array` for
owners (0 = neutral, 1..4 = player index). Public API exposes
`getCell(world, x, y): CellView` which decodes.

### State transitions per tick

```
                  +N (production / flow inflow)
[count: k]  ───────────────────────►  [count: k+N]
   │
   │  -1/tick if no friendly inflow (FR-009)
   ▼
[count: 0]  ── owner becomes null ──►  [count: 0, owner: null]
```

Mutual-feeding exemption: a cell with at least one friendly outgoing
pipe that lands in another friendly cell (and vice versa) exempts both
cells from decay (FR-010).

---

## 5. `PipeSet` — directional pipes on a cell

### Fields

| Field      | Type             | Constraints            | Notes |
|------------|------------------|------------------------|-------|
| `outgoing` | `ReadonlySet<Direction>` | subset of {N,E,S,W} | Up to 4 pipes (FR-006) |
| `mode`     | `'additive' \| 'exclusive'` |                        | Exclusive replaces all (FR-006) |

### `Direction`

```ts
type Direction = 'N' | 'E' | 'S' | 'W';
```

### Validation rules

- A pipe from `(x,y)` to `(nx,ny)` requires `nx,ny` in bounds and
  `cells[ny*w+nx].terrain === 'land'`.
- An order is rejected if the source cell is not owned by the issuer.

### Representation in `World`

Pipes are stored in a flat `Uint8Array` per cell, one bit per direction
(N=0x01, E=0x02, S=0x04, W=0x08). Decoded on read. Keeps tick iteration
allocation-free.

---

## 6. `Reserves` — held troops per cell

### Fields

| Field      | Type            | Constraints                 | Notes |
|------------|-----------------|-----------------------------|-------|
| `percent`  | `number` (int)  | `0 ≤ percent ≤ 9` (10% steps) | FR-012 |

> Spec FR-012 says "0–90% in 10% steps". We model as integer `0..9`
> (multiply by 10 at use-site) to keep the type small and avoid floats.

### Validation rules

- If `reserves.count > stack.count`, all troops are held, nothing flows
  out (edge case).

---

## 7. `Order` — typed command submitted by a player

A discriminated union over `kind`. All variants are validated pre-tick
(FR-018). Invalid orders are rejected and never reach tick state.

```ts
type Order =
  | { kind: 'setPipe';     player: PlayerId; cell: Coord; direction: Direction }
  | { kind: 'clearPipe';   player: PlayerId; cell: Coord; direction: Direction }
  | { kind: 'setPipesExclusive'; player: PlayerId; cell: Coord; direction: Direction }
  | { kind: 'clearAllPipes'; player: PlayerId; cell: Coord }
  | { kind: 'setReserves'; player: PlayerId; cell: Coord; percent: 0|1|2|3|4|5|6|7|8|9 }
  | { kind: 'paratroop';   player: PlayerId; source: Coord; target: Coord }
  | { kind: 'gun';         player: PlayerId; source: Coord; target: Coord }
  | { kind: 'surrender';   player: PlayerId };
```

### Validation outcomes (returned from `applyCommand`)

```ts
type CommandResult =
  | { ok: true }
  | { ok: false; reason: ValidationError };
```

`ValidationError` is a discriminated union covering: out-of-bounds,
pipe-into-water, paratroop-out-of-range, not-owner, reserves-on-enemy,
surrender-already-issued, etc.

---

## 8. `Player` — participant in a match

### Fields

| Field         | Type        | Constraints                | Notes |
|---------------|-------------|----------------------------|-------|
| `id`          | `PlayerId`  | `1 ≤ id ≤ 4`               | Stable for match lifetime (FR-019) |
| `displayName` | `string`    | non-empty, max 32 chars    | Cosmetic only (feature 006 sets it) |
| `status`      | `'alive' \| 'surrendered' \| 'eliminated'` |               | FR-015/FR-016 |
| `citiesOwned` | `number` (int) | `≥ 0`                    | Snapshot for SC purposes |

### `PlayerId`

```ts
type PlayerId = 1 | 2 | 3 | 4;  // spec FR-019: 2-4 players
```

### State transitions

```
                surrender order issued
    ┌──────────────────────────────────┐
    │                                  ▼
[alive] ──── tick: 0 troops & 0 cities ──► [eliminated]
    │                                       │
    │                                       │  match ends if <2 alive
    ▼                                       ▼
 (forfeit by timeout → 006 marks as 'eliminated' with reason)
```

---

## 9. `World` — top-level game state at a tick boundary

### Fields

| Field         | Type                                  | Constraints                       | Notes |
|---------------|---------------------------------------|-----------------------------------|-------|
| `config`      | `MatchConfig`                         | immutable for match lifetime      | |
| `tick`        | `number` (int)                        | `≥ 0`                             | Monotonic tick number |
| `board`       | `Readonly<Board>`                     | immutable per spec                | |
| `players`     | `ReadonlyArray<Readonly<Player>>`     | `length === config.playerCount`   | |
| `state`       | `WorldState`                          | Encoded cell data                 | See below |
| `rngSeed`     | `number` (uint32)                     | non-zero                          | For PRNG-driven future features |
| `rngState`    | `Uint32Array` (length 4)              | sfc32 internal state              | Advanced replays only |

### `MatchConfig`

```ts
interface MatchConfig {
  readonly boardSize: number;        // square; default 32 (FR-001 + Assumptions)
  readonly playerCount: 2 | 3 | 4;   // FR-019
  readonly tickIntervalMs: number;    // server uses this; default 250
  readonly seed: number;              // uint32; for PRNG + future replay
  readonly visibilityRadius: number;  // for feature 002; stored here so engine owns it
}
```

### `WorldState` (internal flat encoding)

```ts
interface WorldState {
  readonly troopCounts: Uint32Array;   // size = w*h
  readonly troopOwners: Uint8Array;    // 0 = neutral, 1..4 = player id
  readonly pipeMasks: Uint8Array;      // N/E/S/W bitmask
  readonly reservesPct: Uint8Array;     // 0..9 (×10 at use-site)
  readonly cityOwners: Uint8Array;      // 0 = none, 1..4 = player id; -1 sentinel for "city exists but uncaptured"
}
```

**Rationale for flat arrays**: A 32×32 board has 1024 cells. Per-tick
resolution iterates all cells many times (flow, combat, decay). Flat
typed arrays = contiguous memory, no per-cell allocation, friendly to
V8's hidden classes. Public read API (`getCell`) decodes on demand.

### Validation rules

- All flat arrays have length `boardSize * boardSize`.
- All player ids in `troopOwners` are within `[1, playerCount]` or `0`.
- `tick` is monotonically non-decreasing across `tick()` calls.

### State transitions

A `World` does not transition states; it's a snapshot. The *match* does:

```
[uninitialized] ── createWorld ──► [tick 0]
[tick n]         ── tick ───────► [tick n+1]
[tick n]         ── tick ───────► [terminal: winner X]
```

`isTerminal(world)` returns a `MatchResult` once applicable.

---

## 10. `TickEvents` — observable per-tick deltas

```ts
interface TickEvents {
  readonly combat:      ReadonlyArray<CombatEvent>;
  readonly captures:    ReadonlyArray<CaptureEvent>;
  readonly eliminations: ReadonlyArray<EliminationEvent>;
  readonly appliedOrders: ReadonlyArray<AppliedOrderRecord>;
  readonly errors:      ReadonlyArray<{ order: Order; reason: ValidationError }>;
}
```

Each event variant carries enough context for fog/networking/console to
present meaningful feedback:

```ts
interface CombatEvent {
  readonly tick: number;
  readonly cell: Coord;
  readonly attacker: PlayerId;
  readonly defender: PlayerId;
  readonly attackerLoss: number;
  readonly defenderLoss: number;
  readonly winner: PlayerId | 'tie';
}

interface CaptureEvent {
  readonly tick: number;
  readonly cell: Coord;
  readonly fromOwner: PlayerId | null;
  readonly toOwner: PlayerId;
  readonly isCity: boolean;
}

interface EliminationEvent {
  readonly tick: number;
  readonly player: PlayerId;
  readonly reason: 'no_troops_no_cities' | 'surrendered' | 'forfeit';
}
```

**Consumers**:
- Feature 002 (fog) — uses `CombatEvent`s to compute visibility changes
  within horizons, but does NOT leak any state outside the horizon.
- Feature 004 (networking) — serializes events for per-tick delta.
- Feature 005 (console) — animates events client-side.

---

## 11. `MatchResult` — terminal state

```ts
type MatchResult =
  | { kind: 'win'; winner: PlayerId; tick: number; reason: 'last_standing' | 'all_surrendered' }
  | { kind: 'draw'; tick: number; reason: 'mutual_elimination' };
```

A match is terminal when fewer than two players remain with status
`'alive'` (FR-015). Once terminal, the `World` is frozen; further
`tick()` calls are a no-op returning the same `MatchResult`.

---

## 12. Indexes and lookup helpers

Engine exports pure lookup helpers (no state of their own):

| Helper                          | Returns                | Use |
|---------------------------------|------------------------|-----|
| `getCell(world, x, y)`          | `CellView`             | Read cell contents |
| `neighborOf(coord, direction)`  | `Coord \| null`        | Out-of-bounds → null |
| `cellsInRange(coord, r)`        | `ReadonlyArray<Coord>` | Chebyshev range; feature 002 will reuse |

### Indexes

- Per-cell data is addressed by `y * width + x` — no separate index.
- `World.players` is keyed by `PlayerId` (`players[id-1]`).
- Events are append-only per tick; consumers filter on `tick`.

---

## 13. Validation rules summary (engine-enforced)

| Rule | Source |
|------|--------|
| Water cells reject pipe / paratroop targets | FR-002 |
| Out-of-board pipes reject | Edge case |
| Paratroop max Chebyshev range = 2 | FR-013 |
| Gun costs troops, applies at tick resolution | FR-014 |
| Reserves 0..9 (×10) per cell, owned cells only | FR-012 |
| Commands rejected without state corruption | FR-018 |
| Tick rate fixed; tick numbers monotonic | FR-003, FR-017 |
| Surrender sets status immediately; forces inert thereafter | FR-016 |
| Player eliminated iff 0 troops AND 0 cities | FR-015 |
| Match ends when <2 alive players | FR-015 |

---

## 14. Entity-relationship overview

```
                            ┌──────────────┐
                            │  MatchConfig │  (immutable per match)
                            └──────┬───────┘
                                   │ config
                                   ▼
   ┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
   │    Board     │◄────────│    World     │────────►│ WorldState (flat)│
   │  (immutable) │  board  │              │  state  │  arrays per cell │
   └──────┬───────┘         └──────┬───────┘         └──────────────────┘
          │ cells                    │ players
          ▼                         ▼
   ┌──────────────┐         ┌──────────────┐
   │     Cell     │         │    Player    │  status: alive|surrendered|eliminated
   │ x,y,elev,..  │         │  id,name,... │
   └──────┬───────┘         └──────────────┘
          │ cell
          ▼
   ┌──────────────┐         ┌──────────────┐
   │     City     │         │   PipeSet    │  outgoing: Set<Direction>
   │ production.. │         │  mode        │
   └──────────────┘         └──────────────┘

        ┌─────────────┐         ┌──────────────┐
        │  TroopStack │         │   Reserves   │
        │ owner,count │         │ percent 0..9 │
        └─────────────┘         └──────────────┘

   Orders (in) ──► applyCommand ──► TickEvents (out)
   TickEvents ──► consumers (fog, networking, console)
```

---

## 15. Invariants maintained by `tick()`

These are the post-conditions every `tick()` call guarantees, and the
engine's tests assert them after every scripted tick:

1. **No floating-point values**: all counts are integers, all masks are
   `Uint8Array` entries, all coordinates are integers.
2. **Cell-level invariants**: `0 ≤ troopCount`, owner ∈
   `{null, 1..playerCount}`, pipe mask bitwise, reserves ∈ `[0,9]`.
3. **Conservation**: total troops in match is non-increasing across
   ticks (only flow + decay reduce total; combat reduces both sides by
   equal or majority amounts; no troops spontaneously appear except via
   `production` from cities).
4. **Determinism**: identical `World` + identical order batch + identical
   tick number → identical next `World` (byte-identical serialized form).
5. **Symmetry**: if player orders are reordered deterministically (e.g.,
   by PlayerId), the resulting `World` is identical (FR-017 "command
   application in a well-defined total order").
