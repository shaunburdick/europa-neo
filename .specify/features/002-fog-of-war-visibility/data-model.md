# Data Model: Fog of War & Visibility (Feature 002)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `.specify/features/002-fog-of-war-visibility/spec.md`

> All entities live in `packages/fog/src/types.ts` and are re-exported via
> `@europa/fog` to downstream packages (feature 004 networking, feature
> 005 console). Types are `Readonly<...>` everywhere outside fog's own
> internal mutation during `computePlayerView`; the public `PlayerView`
> value is fully immutable.
>
> Field types are described here in TypeScript-flavored notation. PR-002
> surfaces these in `contracts/fog-types.ts`. The engine's `VisibleSet`
> and `PlayerView` types (declared in `engine-to-fog.ts`) are referenced
> verbatim — fog does not re-declare them.

---

## 1. `FogMask` — binary visibility bitfield

The working scratch buffer used during `computePlayerView` to record
which cells are in the player's horizon this tick. **Not** part of the
public `PlayerView` payload (clients don't need the mask — they get the
decoded `visibleCells` array).

### Fields

| Field      | Type           | Constraints                  | Notes |
|------------|----------------|------------------------------|-------|
| `data`     | `Uint8Array`   | length `=== width * height`  | Row-major: `data[y*width + x]` |
| `width`    | `number` (int) | `> 0`                        | Cached for bounds math |
| `height`   | `number` (int) | `> 0`                        | Cached for bounds math |

### Cell states (values of `data[i]`)

| Value | Meaning                              | Spec reference |
|-------|--------------------------------------|----------------|
| `0`   | Unknown — cell NOT in horizon        | FR-002, FR-004 |
| `1`   | Visible — cell IS in horizon         | FR-002, FR-005 |

There is **no third "previously visible / recall" state**. Spec FR-004 and
US2 explicitly forbid remembering previously seen terrain. The mask is
allocated fresh each tick (zero-init) and overwritten in place.

### Validation rules

- `data.length === width * height`.
- All values are integers in `{0, 1}` (no other values are written).
- `width === world.board.width` and `height === world.board.height`.

### Lifetime

- Allocated at the start of each `computePlayerView` call.
- Reused (overwritten) during the range-marking pass.
- Discarded (garbage-collected) when `computePlayerView` returns.
- Never persisted, never cached, never carried between ticks.

---

## 2. `Viewer` — a cell that projects visibility for a player

Internal record of one friendly troop stack that contributes to the
player's horizon. Not exported; lives only inside `visibleSet.ts`.

### Fields

| Field    | Type           | Constraints                        | Notes |
|----------|----------------|------------------------------------|-------|
| `coord`  | `Coord`        | `0 ≤ x < width && 0 ≤ y < height`  | Position |
| `troopCount` | `number` (int) | `> 0`                          | From `world.state.troopCounts`; filtered to `> 0` |

### Definition (the only "is a viewer" rule)

```ts
function isViewer(world: Readonly<World>, player: PlayerId, index: number): boolean {
  return (
    world.state.troopOwners[index] === player &&
    world.state.troopCounts[index] > 0
  );
}
```

Cities alone are **not** viewers (spec Edge Case: "capturing a city grants
no vision without occupying troops"). Reserves do **not** affect viewer
status (spec Edge Case: "any occupying troop stack projects vision
regardless of reserve status").

### Collection order

Viewers are collected by **row-major iteration** of `world.state.troopOwners`
(`y` outer, `x` inner). The order is deterministic (canonical for-loop)
and is the only order used in the fog pipeline — guarantees byte-identical
output across runs (Principle II).

---

## 3. `VisibleSet` — re-declared from engine `engine-to-fog.ts`

> **Verbatim copy from `engine-to-fog.ts:47`**. Fog does not extend or
> modify this type. Drift between the two is a bug.

```ts
interface VisibleSet {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<Coord>;
}
```

`visibleCells` is an array of `Coord` (lightweight; no decoded cell
data). Returned by `computeVisibleSet`. Most callers want the heavier
`PlayerView` instead (which decodes each cell to a `CellView`); the
lightweight `VisibleSet` is exposed for tests and for callers that need
to reason about cell positions without the full payload.

### Validation rules

- `visibleCells` is row-major (same as the mask iteration that produced it).
- No duplicates (every cell appears at most once).
- Every `Coord` is in-bounds for `world.board`.

### Relationships

- One `VisibleSet` per player per tick (computed once, cached only for
  the duration of one `computePlayerView` call).
- Many cells → one `VisibleSet` (composition).
- `VisibleSet.visibleCells` is a subset of `world.board.cells` (every
  visible cell is a real cell on the board).

---

## 4. `PlayerView` — re-declared from engine `engine-to-fog.ts`

> **Verbatim copy from `engine-to-fog.ts:57`**. Fog does not extend or
> modify this type. Drift between the two is a bug.

```ts
interface PlayerView {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<CellView>;
  readonly events: Readonly<TickEvents>;
  readonly config: Readonly<MatchConfig>;
}
```

This is the **public payload** that fog hands to networking (feature
004) and ultimately to the console (feature 005). It is fully decoded —
no mask, no viewer list, no internal state. The client receives exactly
this object and nothing more.

### Field semantics

| Field           | Source                                                                 | Notes |
|-----------------|------------------------------------------------------------------------|-------|
| `player`        | function argument `player`                                              | |
| `tick`          | `world.tick`                                                            | Monotonic; same as engine's tick number |
| `visibleCells`  | Decoded via `getCell(world, x, y)` for each cell in the player's horizon (or all cells if spectator) | Row-major; no duplicates |
| `events`        | Filtered `world.events` (cell-level events dropped if out of horizon) | See §6 |
| `config`        | `world.config` (snapshot of `MatchConfig`)                              | Console needs `visibilityRadius` for radar overlay |

### Validation rules

- `visibleCells` is row-major (deterministic iteration).
- `visibleCells` may be empty (player has 0 viewers).
- For non-spectator: `visibleCells.length ≤ world.board.width * world.board.height`.
- For spectator: `visibleCells.length === world.board.width * world.board.height`.
- No `visibleCells[i]` may be `null` or missing — every entry is a fully-decoded `CellView`.

### Relationships

- One `PlayerView` per player per tick.
- One `PlayerView` per spectator session per tick (computed via the
  spectator-mode path of `computePlayerView`).
- `PlayerView.visibleCells` contains `CellView` objects (engine-defined)
  with all cell data: terrain, elevation, troopCount, troopOwner, pipes,
  reservesPercent, cityOwner. The engine's `CellView` is the canonical
  decoded form.

---

## 5. `ComputePlayerViewOptions` — fog-owned options bag

Not declared in the engine's `engine-to-fog.ts` (it's a fog-owned
argument to the fog-owned `computePlayerView` function). Allows spectator
mode without modifying the `PlayerView` type.

### Fields

| Field        | Type      | Default     | Notes |
|--------------|-----------|-------------|-------|
| `spectator`  | `boolean` | `false`     | When `true`, `visibleCells` contains every cell on the board |

### Validation rules

- If `spectator === true`, the server is responsible for marking the
  session read-only (feature 004 concern). Fog does not enforce
  read-only at this layer.
- If `spectator === true` for a player who is also marked `eliminated` or
  `surrendered`, the spectator mode still applies — they see the full
  board (matches spec US3 and the original Europa's surrender-then-watch
  behavior).

---

## 6. `FilteredTickEvents` — `TickEvents` after horizon redaction

Internal helper type (not exported). Describes the result of applying
the horizon filter to a `TickEvents` value. Structurally identical to
`TickEvents`; the difference is only in which entries are kept.

### Per-variant filter rule

| Variant                | Filter rule                                                      | Rationale |
|------------------------|------------------------------------------------------------------|-----------|
| `CombatEvent`          | kept iff `event.cell ∈ player's visibleCells`                    | FR-003: no out-of-horizon state |
| `CaptureEvent`         | kept iff `event.cell ∈ player's visibleCells`                    | Same |
| `EliminationEvent`     | kept always (no `cell`)                                          | Player-level metadata; player must know they were eliminated |
| `AppliedOrderRecord`   | kept always (no `cell`)                                          | Player's own order ack |
| `errors`               | kept always (no `cell`)                                          | Player's own validation result |

For spectators, all events are kept (no filtering).

### Determinism

The filter pass iterates the source events array in index order
(preserving the engine's emission order, which is deterministic) and
`push`-es kept events to the output array. No sort, no Set/Map
iteration, no iteration-order dependence.

---

## 7. `RedactedCell` — *not used*

The dispatch prompt suggested a `RedactedCell` type (a placeholder for
out-of-horizon cells). **Spec FR-002 mandates that out-of-horizon cells
are not transmitted at all.** Therefore there is no `RedactedCell` type
in v1. The redaction is structural: out-of-horizon cells are absent
from `visibleCells`, not present as redacted placeholders.

If a future feature needs "redacted" placeholders (e.g., to render a
gray fog overlay with last-known terrain), that would be a new FR — at
which point `RedactedCell` becomes a real type. Out of scope for v1.

---

## 8. `RedactedCity` — *not used*

Same reasoning as §7. Spec does not call out city-content redaction
(spec FR-005 only mentions enemy troop `position + owner + count`; city
contents are visible when the city cell is in the horizon). No
`RedactedCity` type in v1.

---

## 9. `SpectatorFlag` — *not a type*

Spec US3 / FR-006 mentions spectator mode, but fog does not introduce a
separate `SpectatorFlag` type. Spectator status is a function argument
(`ComputePlayerViewOptions.spectator`), not a value carried in the
`PlayerView` payload. The spectator session is tracked at the
server/transport layer (feature 004 / 006), not in the fog layer.

---

## 10. `FOG_CONSTANTS` — single tunable-knobs location

Mirrors the engine's `ENGINE_CONSTANTS` and the terrain's
`TERRAIN_CONSTANTS` discipline (constitution Principle V; spec SC-005).

### Fields

```ts
interface FogConstants {
  /** Sentinel for "cell not visible" in the FogMask. */
  readonly maskUnknown: 0;
  /** Sentinel for "cell visible" in the FogMask. */
  readonly maskVisible: 1;
  /** Default sensor radius if world.config.visibilityRadius is somehow missing.
   *  In practice the engine guarantees this field; this is a defensive default. */
  readonly defaultRadiusFallback: number;
  /** Default sensor radius for tests / quickstart scenarios. Matches the
   *  engine's ENGINE_CONSTANTS.visibilityRadiusDefault expected value. */
  readonly testRadius: number;
}
```

**Justification**: spec SC-005 mandates "every numeric rule is defined
in one tunable-constants location." The engine owns the *primary*
constant (`ENGINE_CONSTANTS.visibilityRadiusDefault`); fog owns only the
mask-state sentinels (which are implementation details, not gameplay
rules) and a defensive fallback (in case a buggy World lacks the
config — should never happen in production).

---

## 11. Entity-relationship overview

```
                                  ┌──────────────┐
                                  │  FogMask     │  (working scratch buffer,
                                  │  Uint8Array  │   per-call allocation,
                                  │  0 or 1      │   never exported)
                                  └──────┬───────┘
                                         │ produces (internal)
                                         ▼
   ┌──────────────┐         ┌──────────────────┐         ┌────────────────┐
   │    Viewer    │────────►│   VisibleSet     │────────►│  PlayerView    │
   │  (internal)  │         │ { player, tick,  │         │ { player, tick,│
   │  coord +     │         │   visibleCells:  │         │   visibleCells:│
   │  troopCount  │         │   ReadonlyArray  │         │   CellView[],  │
   │              │         │   <Coord> }      │         │   events,      │
   └──────┬───────┘         └──────────────────┘         │   config }     │
          │ derives from                                    └───────┬────────┘
          ▼                                                        │
   ┌──────────────────────────────────────┐                        │ handed to
   │  world.state.troopOwners (filtered)  │                        ▼
   │  world.state.troopCounts             │               ┌──────────────────┐
   │  condition: owner === player &&      │               │ feature 004      │
   │  count > 0                            │               │ (networking)     │
   └──────────────────────────────────────┘               └──────────────────┘
```

- `FogMask` is internal — never crosses the package boundary.
- `VisibleSet` is the lightweight test-friendly output of `computeVisibleSet`.
- `PlayerView` is the heavyweight decoded payload handed to networking.
- `Viewer` is an internal scratch record used during collection; not exported.

---

## 12. Validation rules summary (fog-enforced)

| Rule | Source |
|------|--------|
| Mask values are integers in `{0, 1}` | §1 |
| `visibleCells` is row-major | §3, §4 |
| `visibleCells` contains no duplicates | §3, §4 |
| Every `visibleCells[i]` is in-bounds | §3, §4 |
| `visibleCells` is empty iff player has 0 viewers (non-spectator) | §4 |
| Spectator `visibleCells` has every board cell | §4 |
| Cell-level events dropped iff their `cell` is out of horizon | §6 |
| Player-level events (`EliminationEvent`, `AppliedOrderRecord`, `errors`) always kept | §6 |
| Same `(world, player, options)` produces byte-identical `PlayerView` | Principle II |

---

## 13. Invariants maintained by `computePlayerView`

1. **Pure function**: no mutation of input `world`; no side effects; no
   I/O. Same input → same output, byte-identical (SC-001).
2. **Horizon closure**: every cell in `visibleCells` is within
   Chebyshev distance `≤ world.config.visibilityRadius` of at least one
   friendly viewer cell.
3. **No-memory**: a cell visible at tick `t` and not visible at tick
   `t+1` is **not** carried over. The implementation cannot leak
   previous-tick state because the mask is freshly allocated each tick.
4. **Completeness for spectators**: when `options.spectator === true`,
   `visibleCells.length === world.board.width * world.board.height`.
5. **Event filtering**: every entry in the filtered `events` array is
   either (a) a player-level event (always kept) or (b) a cell-level
   event whose `cell` is in the player's visibleCells.
6. **No leakage**: no `PlayerView` field references any cell, player,
   troop, pipe, or city outside the player's horizon (FR-003).

---

## 14. Type-import boundary

Fog imports types from `@europa/engine` via `import type { ... }`. These
are erased at runtime by TypeScript's compiler. The compiled
`@europa/fog` package has **zero runtime dependencies** on
`@europa/engine` for types — it does, however, call engine runtime
helpers (`getCell`, `cellsInRange`) which IS a runtime dependency on the
engine package's code (not just types).

This is consistent with how `@europa/terrain` (feature 003) imports
engine types (via `import type`) and is acceptable because fog is
explicitly a downstream consumer of the engine's public read API (per
`engine-to-fog.ts`'s boundary rule).
