# Research: Fog of War & Visibility (Feature 002)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `specs/002-fog-of-war-visibility/spec.md`
**Plan**: `specs/002-fog-of-war-visibility/plan.md`

> Decisions captured for the fog package: visibility algorithm, viewer
> definition, redaction policy, determinism strategy, and library needs.
> Each decision cites the spec (FR/AC), the engine's locked contracts, the
> original Europa rules, or external sources consulted via `websearch`.
>
> No new tooling is being introduced. Fog inherits every cross-cutting
> decision (workspace manager, build, test, lint, PRNG, integer-only) from
> feature 001; this research focuses on the *fog algorithm* layer.

---

## 1. Visibility algorithm — **Chebyshev range expansion over friendly unit cells**

**Decision**: For each player, **iterate `world.state.troopOwners` in row-major order**; collect every cell where `troopOwner === player && troopCount > 0` (the "viewers"); then **mark all cells within Chebyshev range `r`** of each viewer cell as visible (where `r = world.config.visibilityRadius`); union all viewers' horizons into a per-player `FogMask`; emit the resulting `PlayerView` with the visible cells decoded.

**Rationale**:

- **Spec FR-001** mandates "compute a per-player visible-cell set each tick from the positions of that player's troop stacks, using a uniform sensor radius (tunable constant)." Range expansion is the literal reading.
- **Spec Assumptions** (final paragraph) is explicit: *"Vision does not require line-of-sight; radius alone determines visibility (consistent with original's flat satellite display)."* This rules out raycasting, elevation-blocked LOS, and any "wall of terrain" computation. The original Europa rules page confirms: *"the satellite console will only be capable of displaying the range visible to the nanobots"* (rules.html line 113) — no terrain blocks, no elevation occlusion, no perspective.
- **Chebyshev distance** (`max(|dx|, |dy|)`) matches the engine's `cellsInRange(world, center, r)` declaration (`engine-api.ts:97`), which already documents "Chebyshev range `r` of `center`, inclusive of center, bounds-checked." Fog reuses this helper directly — no new distance metric, no chance of metric drift between engine and fog.
- The spec's Key Entities lists "SensorRadius: tunable constant (cells, **Chebyshev or Euclidean per plan decision**)." Chebyshev is selected because (a) the engine has already committed to it, (b) Chebyshev = "square" sensor range which matches the original's behavior and the spec's "square sensor radius" framing, (c) Euclidean would require `Math.sqrt` (float) or a fixed-point sqrt, neither of which is justified for a 32×32 board.
- **Spec SC-004** budget: <1 ms/player/tick on 32×32. With ~10 friendly units × `(2r+1)² = 49` cells marked each (for default `r=3`), that's ~490 cell-writes per player. Far under 1 ms even on commodity hardware. No caching, no spatial index needed.

**Alternatives considered**:

- **Raycasting / line-of-sight (LOS) blocking by terrain** — more realistic but explicitly contradicted by spec Assumptions ("Vision does not require line-of-sight"). Even if the spec had permitted LOS, raycasting would be ~4× more expensive per cell (cast 8 rays per friendly unit) for zero gameplay benefit (the original is a flat satellite display). Rejected.
- **Per-elevation LOS** — elevation-based blockers (e.g., hills block sight lines). The engine's `Cell.elevation` field exists, but the spec says "radius alone." Using elevation would conflict with the spec and introduce floating-point slope math in the visibility path (Principle II violation). Rejected.
- **Euclidean radius** — `radius² < r²` disk instead of `|dx| ≤ r && |dy| ≤ r` square. More "physically realistic" but inconsistent with the engine's `cellsInRange`. Rejected.
- **Hybrid (range query + per-cell "can-see" check)** — would let us add LOS later without changing the outer API. Tempting (DRY-friendly), but YAGNI: spec says no LOS, no LOS is implemented. If a future feature adds elevation-blocked vision, the fog API can grow then. Rejected for v1 (Principle V).
- **Pre-computed visibility maps keyed by unit count** — would require caching keyed on full state and is incompatible with the no-memory rule (FR-004). Rejected.
- **Per-cell "viewer count" map** (run-length-encoded scanlines) — micro-optimization that buys nothing on a 32×32 board; over-engineering (Principle V). Rejected.

**Citation**: spec US1, FR-001, FR-008, Assumptions; engine `engine-api.ts:97` (`cellsInRange` Chebyshev); original Europa `rules.html:113` ("satellite console ... limited sensory range").

---

## 2. Viewer definition — **troop stacks only (not cities)**

**Decision**: A "viewer" is a cell where `world.state.troopOwners[i] === player && world.state.troopCounts[i] > 0`. **Cities alone do not project vision**, regardless of ownership or city capacity.

**Rationale**:

- **Spec US1** explicitly says: *"As a player, I want to see terrain, pipes, and troops only within sensor range of my own troops."* The subject is **troops**, not cities.
- **Spec FR-001**: *"compute a per-player visible-cell set each tick from the positions of that player's troop stacks."* Troop stacks, not cities.
- **Spec Edge Case (most decisive)**: *"What happens when a city changes ownership? → Visibility derives from troop presence, not ownership; capturing a city grants no vision without occupying troops."* This is unambiguous: city ownership alone grants no vision.
- **Spec Edge Case**: *"Do reserves affect vision? → No; any occupying troop stack projects vision regardless of reserve status."* Reserves (FR-012) are a retention mechanic, not a vision gating mechanic.
- The dispatch prompt suggested "BOTH cities and units are viewers" as a tie-breaker if the spec were ambiguous. **The spec is not ambiguous** — it explicitly excludes cities-only vision via the Edge Case above. We follow the spec, not the dispatch hint. Flagged in the plan as a deviation from prompt suggestion.
- The original Europa rules page (line 118) says "If you lose nanobots in a cell, the visibility around that cell will be lost until you regain control of the cell." This phrasing is slightly ambiguous in the original (does "regain control" include cities without troops?), but the spec is the authoritative source per AGENTS.md, and the spec resolves this in favor of "troops only."

**Why this matters**:
- Cities are static, durable assets; if they projected vision, every captured city would be a permanent scout tower. That breaks the spec's US2 "no memory" feel (you can park a city somewhere as a permanent eye).
- Troops are mobile, fragile, and contestable. Making vision follow troops means scouting is a real cost (you must commit troops to scout), which is exactly what the original Europa does and what US1's "so that scouting and positioning matter" says is the gameplay intent.

**Implementation**: filter on `troopCounts[i] > 0 && troopOwners[i] === player`. Reserves (`reservesPct`) do **not** affect this filter — even a cell with 100% reserves and 1 troop still projects vision (Edge Case).

**Citation**: spec US1, FR-001, Edge Cases (city ownership, reserves).

---

## 3. Information hiding — **structural redaction (cells outside horizon are absent)**

**Decision**: A cell outside the player's horizon **does not appear in `PlayerView.visibleCells`**. The client knows that any cell not in `visibleCells` is unknown. The redaction is **structural**: there is no "redacted" or "placeholder" cell type — the cell simply isn't there.

For cells **inside** the horizon, `visibleCells[i]` is a full `CellView` (decoded via `engine.getCell`), including:
- `coord`, `cell` (terrain, elevation)
- `troopCount`, `troopOwner` (including enemy owners and counts when visible)
- `pipes` (the pipe mask decoded to a `ReadonlySet<Direction>`)
- `reservesPercent` (even on enemy cells; the spec does not call out reserves as redacted)
- `cityOwner` (the city owner if a city exists on this cell)

**Rationale**:

- **Spec FR-002**: *"Cells outside a player's visible set MUST be transmitted as 'unknown' — no terrain, elevation, pipe, or troop information."* Transmitting "unknown" means *not transmitting any data* about those cells. The cell simply does not appear in the payload.
- **Spec FR-005**: *"Enemy troop stacks MUST be visible (position + owner + count) only while inside the viewer's horizon."* Inside the horizon, you get the full count. Outside, you get nothing.
- **Spec US1 AC-3**: *"Given an enemy stack inside my horizon, When I receive state, Then its position and count are included; enemy stacks outside my horizon are absent entirely."* The "absent entirely" wording is decisive — there's no "redacted" placeholder.
- The dispatch prompt suggested more granular redaction: opponent reserves hidden, opponent city contents hidden, opponent unit count approximated. **The spec does not call for any of these.** Spec FR-005 calls out enemy troop `position + owner + count` as visible inside the horizon; it does not say "approximate count" or "hide reserves" or "hide city contents." Per Principle IV ("specs as documentation"), the spec is the source of truth; the dispatch prompt's suggestions are inferred, not authoritative.
- Following the spec means: inside the horizon = full data; outside = no data. No field-level redaction logic is needed; the algorithm is simpler (Principle V).
- Note: the spec FR-005 wording applies to **enemy troops** specifically. Friendly troops, friendly cities, and friendly pipes are all obviously visible (it's your own stuff). The full-cell visibility applies uniformly to in-horizon cells regardless of ownership — if you can see the cell, you see everything in it.

**What is filtered from `TickEvents`**:
- `CombatEvent` — filtered by `event.cell`. Combat outside the player's horizon is dropped (FR-003: "no payload sent to a player may contain state about cells outside that player's visible set").
- `CaptureEvent` — same.
- `EliminationEvent` — **kept** regardless. It's player-level metadata (no `cell`), and the player needs to know they were eliminated (US3 implicitly; surrender is a UX-critical signal).
- `AppliedOrderRecord` — **kept** regardless. It's player-level metadata (your own orders, no cell).
- `errors` — **kept** regardless. It's player-level metadata (your own order validation results).

The dispatch prompt asked about "reveal-on-attack" (counter-attack intel). **Spec Edge Case is explicit**: *"What happens when opposing stacks occupy adjacent cells? → Both players see each other (each is within the other's radius); combat resolution itself reveals nothing extra beyond the horizon rule."* So fog implements strict horizon-only — combat at an out-of-horizon cell does not reveal the attacker's position to the defender. This is more restrictive than some RTS games (where attacking briefly reveals your position to the defender) but matches the spec's "no reveals, no memory" character.

**Citation**: spec FR-002, FR-003, FR-005, US1 AC-3, Edge Cases (adjacent stacks).

---

## 4. Memory model — **binary mask, no recall (FR-004 / US2)**

**Decision**: The `FogMask` is a `Uint8Array` of size `width * height` with **two states**:
- `0` = unknown (cell not in horizon this tick)
- `1` = visible (cell in horizon this tick)

There is **no third "previously visible / recall" state**. Spec FR-004 and US2 explicitly mandate this: "Visibility MUST have no memory: the visible set is recomputed from current troop positions every tick; previously seen state MUST NOT be cached or re-sent as 'remembered.'"

**Rationale**:

- **Spec FR-004** is non-negotiable: "previously seen state MUST NOT be cached or re-sent."
- **Spec US2**: *"As a player, I want visibility to vanish when my troops leave or die in a region — the map returns to unknown black."* The map literally goes black; it does not gray out.
- The dispatch prompt suggested a 3-state mask: `0 = never visible, 1 = currently visible, 2 = previously visible (gray/recall)`. **The spec forbids state 2.** Following the spec means no recall state. Flagged in the plan as a deviation from the dispatch hint.
- A 2-state mask uses 1 byte per cell (`Uint8Array`) instead of the theoretical 2 bits; the savings of bit-packing (4 cells/byte) are negligible for a 32×32 board (1024 bytes vs 256 bytes) and would harm determinism (byte writes are simpler than bit-set/get operations, no read-modify-write hazards). `Uint8Array` is the right granularity.
- The mask is **allocated fresh each tick** (no carry-over from previous ticks), which makes the no-memory guarantee structural rather than enforced by code review. The mask is purely a working scratch buffer.
- This rules out helpers like `lastSeenTick(cell, playerId)` (suggested by the dispatch prompt) — with no memory, the concept doesn't exist. A cell is either visible *right now* or it's unknown; there is no "last seen at tick X." If a future feature wants recall (the original Europa didn't have it; AGENTS.md makes UI modernization the only kind of feature creep allowed), that would be a new FR added to the spec, not a v1 requirement.

**Citation**: spec FR-004, US2.

---

## 5. Determinism strategy — **pure function + row-major iteration + no PRNG + no clock**

**Decision**: `computePlayerView(world, player, options?) → PlayerView` is a **pure function** of its arguments. Same `(world, player, options)` always produces a byte-identical `PlayerView`. No side effects, no I/O, no wall-clock reads, no unseeded randomness.

**Determinism mechanisms**:

- **Iteration order**: row-major (`y` outer, `x` inner) throughout — in the viewer-collection pass, in the mask-marking pass, in the visibleCells decoding pass. ECMAScript specifies that `for (let i = 0; i < n; i++)` is sequential and platform-independent; this is the canonical deterministic loop. JavaScript's `Array.prototype.sort` is stable since ES2019 (ECMA-262 §23.1.3.30), but fog does not sort — order is purely from row-major index.
- **No `Set` / `Map`**: per the engine plan (feature 001 `research.md` §7), `Set` and `Map` iteration order is insertion order in JS, which is deterministic but easy to break by accidentally iterating while mutating. Fog uses `Uint8Array` exclusively for the working mask and a plain `Array<Coord>` for the viewer list (built by `push` in row-major order). No Set/Map iteration in any output path.
- **Integer-only math**: Chebyshev distance is `Math.max(Math.abs(dx), Math.abs(dy))` over integer coordinates. No `Math.sqrt`, no `Math.sin/cos`, no `Math.pow` in the visibility path.
- **No wall-clock reads**: no `Date.now`, no `performance.now`, no `setTimeout`. The mask allocation is `new Uint8Array(width * height)` — deterministic zero-init, no entropy.
- **No PRNG**: the engine's `Rng` is not used by fog. Visibility is deterministic from `World` alone; the engine's PRNG state does not enter the fog pipeline.
- **Determinism test**: `tests/determinism.test.ts` runs `computePlayerView` 100 times on the same World and asserts byte-identical `PlayerView` (via `hashPlayerView`).

**Citation**: spec FR-007; feature 001 `research.md` §6 (integer-only), §7 (engine API shape); ECMA-262 §23.1.3.30.

---

## 6. Spectator mode — **full board, function-level dispatch**

**Decision**: Spectator mode is handled at the **function level**, not the type level. `computePlayerView(world, player, { spectator: true })` returns a `PlayerView` with `visibleCells` containing every cell on the board (decoded via `getCell`). The `PlayerView` type itself is unchanged — there is no `mode: 'player' | 'spectator'` discriminator on the type. The mode is a function argument; the consequence is structural (all cells visible vs. horizon-filtered).

**Rationale**:

- **Spec US3 / FR-006**: *"A spectator/observer mode MUST receive full board state and MUST be read-only."* Full board = all cells in `visibleCells`. Read-only = networking (feature 004) rejects `Order` from spectator sessions; this is a transport-layer concern, not a fog concern. Fog's only job is to produce the full-board `PlayerView`.
- The dispatch prompt noted: *"If spectator-mode support needs a discriminator on PlayerView, fog handles it via the function signature of computePlayerView (an options.spectator flag), not by modifying the PlayerView type. The type stays clean; the function dispatches behavior."* This is exactly the decision made.
- Adding `mode: 'player' | 'spectator'` to `PlayerView` would be a **breaking change to engine's `engine-to-fog.ts`** (constitution Principle IV: "specs as documentation; stale contracts are bugs"). The engine has already declared `PlayerView` without that field. Keeping the type clean avoids the additive change.
- The `PlayerView.config` field already exposes `MatchConfig`, and the spectator session is tracked at a higher layer (server session state in feature 004 / 006). The fog function takes `options.spectator` as a direct argument because the server already knows whether the requesting session is a spectator — no need to put it in the type.
- Alternative considered: a separate `SpectatorView` type. Rejected because it forces feature 004 to discriminate at the deserialization layer for no benefit — the structural difference is "full board vs horizon-filtered" and that's already expressed by `visibleCells.length`.

**Citation**: spec US3, FR-006; engine `engine-to-fog.ts:57` (`PlayerView` declaration).

---

## 7. Package location — **`packages/fog` as `@europa/fog`**

**Decision**: Fog lives in its own package, `packages/fog`, published internally as `@europa/fog`. It is **not** a sub-folder of `@europa/engine`.

**Rationale**:

- **Engine boundary rule** (`engine-to-fog.ts:21`): *"The fog package depends on `@europa/engine`; the engine does not depend on `@europa/fog`."* This is the authoritative statement. A `packages/engine/src/fog/` subfolder would put fog inside the engine's source tree, which would make the engine self-referential and break the boundary rule.
- **Mirrors `@europa/terrain` precedent** (feature 003). Terrain is a separate package consuming engine types, even though it depends only on `Board` / `Cell` / `Coord` / `PlayerId`. The same logic applies to fog, which depends on `World` / `CellView` / `cellsInRange` / `MatchConfig`. Same shape, same pattern.
- **Enables clean network-side imports** (feature 004). The networking layer will `import { computePlayerView } from '@europa/fog'`. A separate package prevents the network code from accidentally importing engine internals (e.g., tick resolution files) by typing `import { ... } from '@europa/engine/src/...'`.
- **Enables independent versioning** if fog ever needs to evolve separately (e.g., adding elevation-based LOS in a future feature). Same logic as feature 003's "the engine plan is independent from the terrain plan."

**Alternatives considered**:

- `packages/engine/src/fog/` (fog as a subfolder of the engine). Rejected — breaks the boundary rule, creates a circular dependency trap, and obscures the "engine is pure simulation; fog is a downstream filter" separation.
- `packages/shared/` (fog + protocol types in one shared package). Rejected — `packages/shared/` is feature 004's home for protocol types; co-locating fog there mixes the data-shape concern (protocol) with the filter concern (fog).

**Citation**: engine `engine-to-fog.ts:21`; feature 003 `plan.md` §"Project Structure".

---

## 8. Library needs — **none**

**Decision**: Fog ships **zero runtime dependencies** and **zero new dev dependencies** beyond what the engine package already uses (typescript, vitest, biome — all inherited from the root monorepo).

**Rationale**:

- The algorithm is ~100 LOC of TypeScript (range expansion + mask marking + cell decoding). The library survey is brief:
  - **`pixi.js`, `three.js`, `phaser`** — rendering libraries. Fog produces data only; rendering is feature 005's concern (out of scope per AGENTS.md). Rejected.
  - **`@turf/turf`** — geospatial. Useful for polygons, not for axis-aligned integer range expansion. Rejected (wrong domain).
  - **`flatbush`, `rbush`, `kd-tree-javascript`** — spatial indexes. 32×32 = 1024 cells; spatial indexes are pure overhead at this scale (the index itself is larger than the data). YAGNI per Principle V. Rejected.
  - **`immutable.js`, `immer`** — immutable data structures. The engine already uses plain `Readonly<T>` + flat `Uint8Array`. Adding a library for that is over-engineering. Rejected.
- Constitution Principle V (simplicity) and Principle VII (self-hostable) both favor zero new dependencies.
- The only third-party surface that even tempted us was bit-packing libraries for the `FogMask` — and we settled on `Uint8Array` (1 byte per cell) because the determinism and simplicity win outweighs the 4× memory saving.

**Citation**: feature 001 `research.md` §3 (Vitest), §4 (Biome); constitution Principles V and VII.

---

## 9. Event redaction — **cell-level events dropped, player-level events kept**

**Decision**: When constructing `PlayerView`, filter `TickEvents` based on the type of each event:

| Event variant          | Has `cell`? | Filter rule                                  |
|------------------------|--------------|----------------------------------------------|
| `CombatEvent`          | yes          | drop if cell NOT in `visibleCells`           |
| `CaptureEvent`         | yes          | drop if cell NOT in `visibleCells`           |
| `EliminationEvent`     | no           | keep always (player-level)                   |
| `AppliedOrderRecord`   | no           | keep always (player's own order metadata)    |
| `errors`               | no           | keep always (player's own validation result) |

**Rationale**:

- **Spec FR-003**: *"no payload sent to a player may contain state about cells outside that player's visible set (spectators excepted)."* Cell-level events whose `cell` is outside the horizon describe state outside the visible set; they must be dropped.
- `EliminationEvent`, `AppliedOrderRecord`, and `errors` are **player-level metadata** — they describe state about the player themselves, not about any cell. FR-003's restriction does not apply to them; dropping them would break UX (the player needs to know they were eliminated, their own orders were applied, etc.).
- Spec US3 doesn't speak to event redaction for spectators; for spectators, all events are kept (the spectator sees the full board and all state changes).

**Edge case**: a `CaptureEvent` for a city (the `isCity: true` flag exists in the engine's `CaptureEvent`). The event's `cell` is checked against the horizon; city status is irrelevant — if the cell is visible, the event is kept; otherwise dropped.

**Edge case**: an `AppliedOrderRecord` whose order targets an out-of-horizon cell. The order metadata is kept (it's the player's own action), but the result might reference an out-of-horizon cell. We keep the entire `AppliedOrderRecord` because the player needs to see their own order acknowledgment; the order's `cell` field is harmless metadata (the player knows where they sent the order). If a future privacy concern arises (e.g., the player shouldn't see *where* their own out-of-horizon orders went), that would be a new FR. For v1, keep the entire record.

**Citation**: spec FR-003; engine `engine-types.ts:333` (`TickEvents` shape).

---

## 10. What we are *not* doing (deferred)

To keep v1 minimal and to avoid over-engineering the fog layer (Simplicity Principle), the following are explicitly **not** in scope for feature 002:

- **Line-of-sight blocking by terrain** — out of scope per spec Assumptions (radius-only).
- **Elevation-based vision** — same. The `Cell.elevation` field exists in the engine's `Board` but fog does not read it.
- **Recall / previously-seen gray overlay** — out of scope per FR-004 / US2. The map is binary: visible or black.
- **Last-seen-tick tracking** — same. With no memory, there is no last-seen-tick.
- **Reveal-on-attack counter-intel** — out of scope per spec Edge Case ("combat resolution itself reveals nothing extra beyond the horizon rule"). Fog is strict horizon-only.
- **Asymmetric vision (different radii per player or per unit type)** — out of scope per spec FR-008 ("Sensor radius MUST apply uniformly to all players").
- **Variable vision radius per cell** (e.g., high-elevation cells see farther) — out of scope. Same radius everywhere.
- **Network transport** — feature 004's concern. Fog produces the `PlayerView`; networking serializes and broadcasts it.
- **Rendering** — feature 005's concern. Fog outputs structured data; rendering is downstream.
- **Spectator permission enforcement** (read-only) — feature 004's concern. Fog emits the full-board `PlayerView`; the network layer refuses to forward `Order` from spectator sessions.

These boundaries are reflected in the contracts: `fog-api.ts` exports `computeVisibleSet`, `computePlayerView`, and small query helpers. No LOS raycaster, no recall state, no counter-intel leak, no asymmetric logic.

---

## 11. Reuse from feature 001

**Decision**: Fog **imports types and read-helpers** from `@europa/engine`. It does **not** import engine code that mutates state or advances time.

**Specifically imported**:
- Types: `World`, `Coord`, `CellView`, `MatchConfig`, `TickEvents`, `PlayerId`, `CombatEvent`, `CaptureEvent`, etc.
- Read-helpers: `getCell(world, x, y)` (used to decode visible cells into `CellView`), `cellsInRange(world, center, r)` (used to expand Chebyshev ranges from viewer cells), `forEachCell(world, visit)` (optionally used for full-board spectator decode).

**Specifically NOT imported**:
- `tick`, `applyCommand`, `createWorld`, `serializeWorld`, `deserializeWorld`, `isTerminal` — fog does not advance time, stage orders, or serialize the world. Networking (feature 004) calls these.
- `Rng` — fog does not consume randomness. The engine's PRNG is feature 001's and feature 003's concern.

**Dependency direction**: `packages/fog` depends on `@europa/engine`. `@europa/engine` does **not** depend on `@europa/fog`. The dependency edge is one-way; the engine package remains installable independently.

**Citation**: engine `engine-api.ts` (read-helper declarations); engine `engine-to-fog.ts` (boundary rule).

---

## 12. Module structure within `packages/fog`

```
packages/fog/
├── src/
│   ├── index.ts            // public surface re-exports
│   ├── constants.ts        // FOG_CONSTANTS (single tunable-knobs location)
│   ├── types.ts            // re-exports contracts/fog-types.ts
│   ├── visibleSet.ts       // computeVisibleSet: union of friendly horizons
│   ├── playerView.ts       // computePlayerView: horizon-filtered PlayerView payload
│   ├── eventsFilter.ts     // filter TickEvents to horizon + spectator handling
│   └── utils.ts            // isVisible, visibleCellAt (small query helpers)
├── tests/
│   ├── unit/
│   │   ├── visibleSet.test.ts
│   │   ├── playerView.test.ts
│   │   ├── eventsFilter.test.ts
│   │   └── utils.test.ts
│   ├── fixtures/
│   │   └── worlds.ts       // scripted worlds: single-viewer, multi-viewer, edge, water, spectator
│   ├── quickstart/         // Q-F01..Q-F08
│   ├── determinism.test.ts // SC-001: byte-identical PlayerView across 100 runs
│   ├── redaction.test.ts   // SC-001 protocol-level: zero leakage across 500-tick match
│   └── conformance.test.ts // PlayerView satisfies engine-to-fog.ts shape
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── biome.json
```

**Rationale**: mirrors feature 001's structure (one function per file, one test per file). Each pipeline phase is its own pure function, unit-testable in isolation. Constants live in one place. The pipeline order is fixed (no iteration-order dependence → constitution Principle II).

**Citation**: feature 001 `research.md` §10; constitution Principle V.

---

## 13. Resolved unknowns

| Open question (from prompt) | Resolution |
|-----------------------------|------------|
| Visibility algorithm | Chebyshev range expansion over friendly unit cells (§1) |
| Viewer definition | Troop stacks only; cities alone do not project vision (§2) |
| Visibility radius source | `world.config.visibilityRadius` (already in engine `MatchConfig`); no additive change needed |
| Information hiding | Structural redaction — out-of-horizon cells are absent from `visibleCells` (§3) |
| Reveal-on-attack | **No** counter-intel; spec Edge Case is explicit (§3) |
| Determinism | Pure function + row-major iteration + no PRNG + no clock (§5) |
| Performance | Range expansion on 32×32 is trivially under SC-004's 1 ms budget; no caching needed |
| Package location | `packages/fog` (`@europa/fog`) — mirrors `@europa/terrain` precedent (§7) |
| Library needs | None — algorithm is ~100 LOC (§8) |
| `MatchConfig` changes? | **None** — `MatchConfig.visibilityRadius` already exists |
| FogMask recall state? | **No** — spec FR-004 forbids it; binary mask only (§4) |
| `lastSeenTick` helper? | **Omitted** — spec has no memory; no "last seen" concept (§4) |
| Additive engine changes? | **None** — engine's `engine-to-fog.ts` already covers all fog needs |
| Spectator mode handling | Function-level dispatch (`options.spectator`); `PlayerView` type unchanged (§6) |

No `NEEDS CLARIFICATION` markers remain.

---

## 14. Deviations from the dispatch prompt

For PM review — the following items in the dispatch prompt are **resolved differently than the prompt suggested**. Each deviation is grounded in a spec or engine-contract source.

| Prompt suggestion | Dispatch prompt said | Actual decision | Source of truth |
|-------------------|----------------------|-----------------|-----------------|
| Viewer definition | "BOTH cities and units are viewers" if ambiguous | **Troops only** — spec US1 + Edge Case is unambiguous | spec US1, Edge Cases (city ownership) |
| FogMask states | `0 = never, 1 = current, 2 = previously visible (recall)` | **Binary**: `0 = unknown, 1 = visible` (no recall) | spec FR-004, US2 |
| `lastSeenTick` helper | Listed in contract suggestion list | **Omitted** — no memory means no last-seen | spec FR-004, US2 |
| Opponent unit count | "approximate count" | **Exact count** within horizon — spec FR-005 says "position + owner + count" | spec FR-005 |
| Opponent reserves | "hidden" | **Visible** within horizon — spec does not call out redaction | spec FR-005 (the only redaction called out) |
| Feature directory path | `specs/002-fog-of-war/` | `specs/002-fog-of-war-visibility/` (on-disk reality) | on-disk directory listing |

Each deviation is justified in the corresponding section above. The PM can override any of these with a spec amendment, but the current decisions all trace back to the spec text.
