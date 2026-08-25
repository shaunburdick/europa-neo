# Data Model: Procedural Terrain Generation (Feature 003)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `.specify/features/003-procedural-terrain-generation/spec.md`

> All entities live in `packages/terrain/src/` and are re-exported via
> `@europa/terrain`. Type-only imports come from `@europa/engine`
> (`Board`, `Cell`, `CityPlacement`, `Coord`, `PlayerId`).
>
> Generated values (`Board`, `Cell[]`, `CityPlacement[]`) are deeply
> readonly. The terrain package never mutates engine types.

---

## 1. `MapSeed` — integer driving all generation randomness

The `MapSeed` is the **starting seed** of the match (uint32, exactly the
value passed in `TerrainGenerationRequest.seed`). The engine's sfc32 PRNG
is initialized from this seed before the first call to `generateBoard`.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| (only) | `number` (uint32) | `≥ 1` | The match's seed, propagated from `MatchConfig.seed` |

### Distinction: starting seed vs effective seed

- **`MapSeed`** = the starting seed the engine passes in.
- **`effectiveSeed`** = the seed actually used to produce the output. May
  differ from the starting seed if the generator retried internally to
  satisfy invariants (FR-007). The effective seed is **always** recorded
  in `TerrainGenerationResult.effectiveSeed` and **must** be persisted by
  the match record (FR-009).

### Why not a single seed type?

Because two values are needed and they may differ. The starting seed is
input; the effective seed is output. The generator cannot change the
starting seed (it came from the match config); it can only report the
effective seed it ended up using. A `MapSeed` type is therefore just
`number` (uint32), and the distinction is by *position* (input parameter
vs output field), not by type.

### Validation rules

- Must be a non-zero uint32 (matches engine's `MatchConfig.seed`).
- After initialization, the sfc32 state is advanced only by the
  generator's calls; the engine receives the same instance with whatever
  state remains.

---

## 2. `GenerationSettings` — generator knobs

User-tunable knobs for the generator. All fields have safe defaults
(FR-008) and are clamped to safe ranges.

### Fields

| Field | Type | Default | Safe range | Notes |
|-------|------|---------|------------|-------|
| `waterRatio` | `number` | `0.10` | `[0.02, 0.25]` | Fraction of cells classified as water. Default 10% (spec US3 AC-1: "5–15%"). |
| `roughness` | `number` | `0.5` | `[0.1, 0.9]` | Persistence of fBm. Lower = smoother; higher = more dramatic. |
| `octaves` | `number` (int) | `4` | `[1, 6]` | Number of fBm octaves. |
| `citiesPerPlayer` | `number` (int) | `1` | `[1, 4]` | Per-player starting city count (spec US1 AC-2: "same number of starting cities"). For 3-player games the value is normalized UP to the next even number (see "3-player parity rule" below) so point symmetry can hold; the normalized value is what `effectiveSettings.citiesPerPlayer` reports. |
| `symmetryStrategy` | `SymmetryStrategy` | `'point'` | `'point'` (only) | v1 only supports 180° rotational. Field is here for forward compatibility. |
| `minCityWaterDistance` | `number` (int) | `3` | `[1, 6]` | Min Chebyshev distance from a city to any water cell (FR-005). |
| `minCityCityDistance` | `number` (int) | `5` | `[2, 10]` | Min Chebyshev distance between any two cities (FR-005). |
| `maxRegenAttempts` | `number` (int) | `5` | `[1, 10]` | Bounded retries on invalid output (FR-007). |

### `SymmetryStrategy` (closed enum, v1 only allows `'point'`)

```ts
type SymmetryStrategy = 'point';
```

Note: this is *typed* as a string literal union for forward compatibility
(future `'mirror'` or `'rotational90'` could be added without a breaking
type change), but the v1 implementation only handles `'point'`. The
contract validator rejects anything else with a `GenerationError`.

### Validation rules (FR-008)

- `waterRatio`: clamped to `[0.02, 0.25]`. Outside this range, extreme
  values produce unplayable maps (too much or too little water).
- `roughness`: clamped to `[0.1, 0.9]`. Outside this range, fBm diverges
  (or collapses to flat).
- `octaves`: clamped to `[1, 6]`. Outside this range, perf or quality
  suffers; 6 is the practical upper bound for 32×32.
- `citiesPerPlayer`: clamped to `[1, 4]`. Outside this range, symmetry
  is hard to maintain (4 is the max players).
- `citiesPerPlayer` (3-player parity rule): after clamping, a 3-player
  request normalizes the value UP to the next even number (1→2, 3→4).
  Reason: FR-004 point symmetry maps every city to a distinct partner
  cell on an even-sized board, and the 3-player middle band is
  self-symmetric (its player partners with itself), so that player's
  city count must be even — and FR-005 requires every player's count
  to be equal. An odd per-player count is therefore unsatisfiable for
  3p; rounding up preserves FR-005 equality and stays inside US3's
  clamp-don't-reject philosophy. The normalized value drives placement,
  validation, and `effectiveSettings` (2p/4p requests are unaffected).
- `minCityWaterDistance`, `minCityCityDistance`: clamped to safe ranges.
- `maxRegenAttempts`: clamped to `[1, 10]`. Higher = wasteful retries.
- Out-of-range values are **clamped, not rejected**. The generator emits
  the clamped values in the `ValidationReport` so callers can see what
  was actually used.

### Defaults are chosen for "out of the box playable"

A 32×32 board with `waterRatio: 0.10`, `roughness: 0.5`, `octaves: 4`,
`citiesPerPlayer: 1` produces a map that:
- has 2–3 water pools (typical for 10% on a 32×32 board)
- has elevation variance well above the SC-004 floor
- has 2 cities (1 per player for the 2-player default) at symmetric
  positions
- passes all invariants in <100 ms (well under the SC-003 budget)

---

## 3. `TerrainGenerationRequest` — input to `generateBoard`

> **Note**: this type is **proposed additive change #2** to
> `engine-to-terrain.ts`. The current placeholder
> `options?: Readonly<Record<string, never>>` is replaced with a proper
> typed `settings` field. The `rng` field is **proposed additive
> change #1**. See the contracts folder for the exact change set.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `boardSize` | `number` (int) | Square; must match `MatchConfig.boardSize`. |
| `playerCount` | `2 \| 3 \| 4` | From `MatchConfig.playerCount`. |
| `seed` | `number` (uint32) | Starting seed (see §1). |
| `rng` | `Rng` (engine's sfc32 instance) | The engine's live PRNG. See `engine-to-terrain.ts` proposed change. |
| `settings` | `GenerationSettings` (full) | All knobs. Defaultable. |

### Validation rules

- `boardSize ≥ 8` (anything smaller is unplayable; safe floor).
- `boardSize` is a positive integer.
- `playerCount` is exactly 2, 3, or 4.
- `seed ≥ 1` (matches engine).
- `rng` is a live sfc32 instance (type-system enforced).

---

## 4. `TerrainGenerationResult` — output of `generateBoard`

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `board` | `Board` | The engine-ready terrain definition. See `engine-types.ts`. |
| `effectiveSeed` | `number` (uint32) | The seed actually used (may differ from input if retries happened). FR-009. |
| `startingCitiesByPlayer` | `Readonly<Record<PlayerId, ReadonlyArray<{ x: number; y: number }>>>` | Per-player city coords. Redundant with `board.cities` (the engine reads `board.cities` directly) but exposed for spec-mandated symmetry checks. |

### Validation rules (SC-002)

- `board.width === board.height === req.boardSize`.
- `board.cells.length === req.boardSize²`.
- `board.cities` has exactly `req.playerCount × effectiveSettings.citiesPerPlayer` entries (the 3-player parity rule may raise `citiesPerPlayer`; see §2).
- Every city is on a `land` cell.
- Every city has min spacing from water (per `minCityWaterDistance`).
- Every pair of cities has min spacing (per `minCityCityDistance`).
- 180° rotation symmetry: `cells[y*w+x]` is identical to `cells[(h-1-y)*w+(w-1-x)]` for all `(x,y)`.
- The same symmetry holds for water classification and city coords.

If any rule fails after `maxRegenAttempts` retries with derived seeds,
the function throws `GenerationError` (loud failure).

---

## 5. `ValidationReport` — generator's self-check result

> Returned by the internal `validateBoard` function; not part of the
> public `generateBoard` return value. Exposed via the `validateBoard`
> helper for use by tests and by feature 006 if it wants to pre-check
> a stored Board.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `valid` | `boolean` | `true` iff all invariants pass. |
| `violations` | `ReadonlyArray<Violation>` | Empty when `valid === true`. |
| `attemptsUsed` | `number` (int) | Number of generation attempts before validation. `1` on first try. |
| `finalSeed` | `number` (uint32) | The seed of the attempt that produced the validated Board. |
| `stats` | `MapStats` | Statistics about the final map (water coverage, elevation variance, etc.). |

### `Violation`

```ts
type Violation =
  | { kind: 'asymmetry'; cellA: Coord; cellB: Coord }
  | { kind: 'city_on_water'; coord: Coord }
  | { kind: 'cities_too_close'; coordA: Coord; coordB: Coord; distance: number }
  | { kind: 'city_too_close_to_water'; coord: Coord; nearestWater: Coord; distance: number }
  | { kind: 'wrong_city_count'; expected: number; got: number }
  | { kind: 'isolated_cities'; component: ReadonlyArray<Coord> }  // BFS from city A didn't reach city B
  | { kind: 'water_out_of_bounds'; waterRatio: number; min: number; max: number };
```

### `MapStats`

| Field | Type | Notes |
|-------|------|-------|
| `waterRatio` | `number` | Actual water ratio in the final map. |
| `elevationVariance` | `number` | Sample variance of elevation values. |
| `largestWaterPool` | `number` (int) | Number of cells in the largest connected water region. |
| `numWaterPools` | `number` (int) | Number of distinct water regions. |
| `numCities` | `number` (int) | Total cities placed. |

---

## 6. `GenerationError` — thrown when retries are exhausted

```ts
class GenerationError extends Error {
  readonly kind: 'attempts_exhausted' | 'invalid_request';
  readonly attempts: number;
  readonly lastReport: ValidationReport;
}
```

Throwing (rather than returning `{ ok: false }`) is intentional:
- Constitution Principle V says "complexity must be justified in writing";
  a thrown error at match start is the loudest possible signal that
  something is wrong.
- The server (feature 006) is the only caller; it can catch and surface
  a meaningful error to the matchmaker.
- The alternative (returning `Result<T, E>` everywhere) is added
  complexity for no gain when this is the only error path.

---

## 7. Reused engine types (no changes)

The terrain package produces a `Board` whose shape is **already fully
defined** by feature 001's `engine-types.ts`. We re-declare the relevant
fields here for the reader's convenience, but the canonical source of
truth is the engine contract.

### `Board` (from `engine-types.ts`)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `width` | `number` (int) | `> 0`, `=== height` | FR-001; matches `req.boardSize`. |
| `height` | `number` (int) | `> 0`, `=== width` | |
| `cells` | `ReadonlyArray<Cell>` | length `=== width*height` | Row-major. |
| `cities` | `ReadonlyArray<CityPlacement>` | per-player, on land | From terrain's city-placement phase. |

### `Cell` (from `engine-types.ts`)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `x` | `number` (int) | `0 ≤ x < width` | |
| `y` | `number` (int) | `0 ≤ y < height` | |
| `elevation` | `number` (int) | `0..255` | From fBm noise. |
| `terrain` | `'land' \| 'water'` | | From threshold-flood. |

### `CityPlacement` (from `engine-types.ts`)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `cell` | `Coord` | on land cell | |
| `owner` | `PlayerId` | 1..4 | |

### `Coord` (from `engine-types.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `x` | `number` (int) | |
| `y` | `number` (int) | |

### `PlayerId` (from `engine-types.ts`)

`type PlayerId = 1 | 2 | 3 | 4;`

---

## 8. Internal: elevation intermediate (`Uint8Array`)

A flat `Uint8Array` of length `width*height` holds the elevation
intermediate during generation. It is row-major (`arr[y*w + x]`). The
`Uint8Array` is the same shape as the engine's `WorldState.troopCounts`
in spirit (flat, integer, allocation-free), but lives only inside the
generator.

### State transitions during generation

```
  ┌────────────────────────────┐
  │  Uint8Array(0..255)        │  ← from fBm noise
  │  (one value per cell)      │
  └─────────────┬──────────────┘
                │
                ▼
  ┌────────────────────────────┐
  │  same shape, now also      │  ← symmetry enforced
  │  point-symmetric           │
  └─────────────┬──────────────┘
                │
                ▼
  ┌────────────────────────────┐
  │  Cell[] (engine's type)    │  ← each cell's `terrain` set by
  │  with elevation + terrain  │     threshold comparison
  └─────────────┬──────────────┘
                │
                ▼
  ┌────────────────────────────┐
  │  Board                     │  ← cities added
  └────────────────────────────┘
```

The `Uint8Array` intermediate is GC'd after the `Board` is built. It is
not exposed in any public type.

---

## 9. Internal: candidate city list (test scratch space)

A `ReadonlyArray<{ coord: Coord; distanceFromCenter: number }>` is
sorted by `distanceFromCenter` descending during city placement. The
list is built by iterating land cells, computing Chebyshev distance to
center, and picking the top-K within the player's spawn band (where K
is the band area). This is internal — not exposed in any public type.

---

## 10. Type relationships

```
MatchConfig.seed
    │
    │  engine initializes sfc32
    ▼
Rng (engine's sfc32 instance)
    │
    │  passed to
    ▼
TerrainGenerationRequest
  ├─ boardSize
  ├─ playerCount
  ├─ seed
  ├─ rng: Rng
  └─ settings: GenerationSettings
    │
    │  generateBoard(req)
    ▼
TerrainGenerationResult
  ├─ board: Board
  │    ├─ width, height
  │    ├─ cells: ReadonlyArray<Cell>
  │    │    └─ { x, y, elevation, terrain }
  │    └─ cities: ReadonlyArray<CityPlacement>
  │         └─ { cell: Coord, owner: PlayerId }
  ├─ effectiveSeed
  └─ startingCitiesByPlayer: Record<PlayerId, Coord[]>

  [side-channel, for tests / debug]
  ValidationReport
  ├─ valid
  ├─ violations: Violation[]
  ├─ attemptsUsed
  ├─ finalSeed
  └─ stats: MapStats

  [side-channel, on exhaustion]
  GenerationError
  ├─ kind
  ├─ attempts
  └─ lastReport
```

---

## 11. Validation invariants (consolidated, FR-007)

These are the *exhaustive* set of invariants the generator enforces on
its own output. They map 1:1 to the spec's user stories and FRs.

| ID | Invariant | Source | Test |
|----|-----------|--------|------|
| INV-1 | `board.width === board.height === req.boardSize` | FR-001 | conformance |
| INV-2 | `board.cells.length === req.boardSize²` | FR-001 | conformance |
| INV-3 | Every `Cell.elevation` is integer in `[0, 255]` | FR-001 | unit |
| INV-4 | Every `Cell.terrain` is `'land' \| 'water'` | FR-001 | unit |
| INV-5 | For all `(x,y)`: `cells[y*w+x].terrain === cells[(h-1-y)*w+(w-1-x)].terrain` | FR-004, US1 AC-1 | unit (symmetry) |
| INV-6 | For all `(x,y)`: `cells[y*w+x].elevation === cells[(h-1-y)*w+(w-1-x)].elevation` | FR-004 | unit (symmetry) |
| INV-7 | `board.cities.length === req.playerCount × effectiveSettings.citiesPerPlayer` (3p parity rule may raise the per-player count; see §2) | FR-005 | unit (cities) |
| INV-8 | For all cities `c`: `c.cell.terrain === 'land'` | FR-005, engine pre-condition | unit (cities) |
| INV-9 | For all cities `c`: the 180°-rotated coord is also a city owned by `partnerPlayer(c.owner, playerCount)` — the *opposite* player for 2p/4p pairings, and the *same* player when a player's band is self-symmetric under rotation (3p middle player; also the board-center cell on odd-sized boards) | FR-004, FR-005 | unit (symmetry) |
| INV-10 | For all cities `c`: Chebyshev distance to nearest water cell `≥ minCityWaterDistance` | FR-005 | unit (cities) |
| INV-11 | For all pairs of cities `c1, c2`: Chebyshev distance `≥ minCityCityDistance` | FR-005 | unit (cities) |
| INV-12 | BFS over land cells from any city reaches every other city (no isolated city) | US1 AC-3 | unit (validate) |
| INV-13 | Water ratio within `[0.02, 0.25]` (and within ±10% of target) | US3 AC-1, FR-008 | balance |
| INV-14 | Elevation variance `> 0` (no fully flat map) | US3 AC-2 | balance |
| INV-15 | Water forms ≥ 1 connected pool of size `≥ 4` (no scattered single cells) | FR-003 | unit (water) |

If any of these fail after `maxRegenAttempts` retries, throw `GenerationError`.

---

## 12. State machine for the generator

The generator has no persistent state across calls. Each call to
`generateBoard` is independent (the PRNG state is the only input that
changes across calls, and it's mutated by the engine, not the
generator).

```
  ┌────────────────────┐
  │  initial attempt   │ ← attemptSeed = req.seed
  └─────────┬──────────┘
            │
            ▼
       validate
            │
            ├── pass ──► return result
            │
            └── fail
                │
                │  attemptsUsed < maxRegenAttempts ?
                │
                ├── yes ──► attemptSeed = mix(req.seed, attemptsUsed)
                │             │
                │             └── back to "validate"
                │
                └── no ──► throw GenerationError
```

This is the only state machine in the package. It's explicit, not
implicit in object lifecycle.

---

## 13. What this data model does **not** include

- No persistence schema. Maps are identified by their effective seed; a
  map is "stored" by storing the seed, not the data. (Out of v1 scope;
  spec Assumptions: "Map sharing by seed string is desirable.")
- No animation or runtime modification. The Board is immutable.
- No player customization (names, colors). Feature 006 owns this.
- No map editor data structures. v1 ships the generator only.
