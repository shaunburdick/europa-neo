# Feature Specification: Core Game Engine

**Feature Branch**: `001-core-game-engine`

**Created**: 2026-08-21

**Status**: Implemented

**Input**: User description: "Deterministic tick-based simulation of the original Europa gameplay: grid terrain with elevation and water, cities producing nanobot troops, pipes directing troop flow, attrition combat, decay, cell capacity with reserves, paratroopers, guns, and last-player-standing victory."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tick Simulation Drives Production and Flow (Priority: P1)

As a player, I want the server to advance the game on fixed ticks — cities producing troops, pipes carrying troops between cells — so that the game world evolves at a steady, fair pace regardless of client hardware.

**Why this priority**: Without a running simulation there is no game. Production and pipe flow are the economic heartbeat every other mechanic depends on.

**Independent Test**: Can be fully tested by initializing a small board with two cities, issuing pipe orders, stepping N ticks headlessly, and asserting exact troop counts per cell. Delivers a verifiable simulation core with no UI or networking.

**Acceptance Scenarios**:

1. **Given** a city cell with 0 troops, **When** 10 ticks elapse, **Then** the city contains `10 × productionRate` troops (bounded by saturation capacity).
2. **Given** a saturated city with an eastward pipe into an empty cell, **When** ticks elapse, **Then** troops accumulate in the destination cell while the source stays at capacity.
3. **Given** identical initial state and identical ordered command lists, **When** the simulation runs twice for N ticks, **Then** both runs produce bit-identical state.
4. **Given** a downhill pipe (destination elevation < source), **When** troops flow, **Then** more troops move per tick than across flat terrain, and the bonus scales with the elevation change; uphill pipes move fewer, and the handicap scales with the elevation change.
5. **Given** an uphill pipe whose elevation change reaches the stall threshold (`flowBase / flowSlopeStep`), **When** troops flow, **Then** the destination gains 0 troops (stall) and the pipe remains laid and legal.

---

### User Story 2 - Attrition Combat Between Opposing Troops (Priority: P1)

As a player, I want battles to erupt when my pipe flows into enemy-occupied cells, with equal forces trading losses 1:1 and larger forces overwhelming smaller ones, so that aggression has mechanical consequences.

**Why this priority**: Combat resolution is what makes territory contested; without it, pipes are just conveyors.

**Independent Test**: Can be tested by seeding two adjacent cells with known troop counts, opening a pipe between them, stepping ticks, and asserting exact loss ratios.

**Acceptance Scenarios**:

1. **Given** cell A (100 troops) pipes into cell B (100 enemy troops), **When** one tick resolves, **Then** both stacks lose approximately equal numbers (1:1 attrition).
2. **Given** cell A (200 troops) pipes into cell B (50 enemy troops), **When** ticks elapse, **Then** B is eliminated quickly and A captures the cell with majority of its force intact.
3. **Given** two opposing stacks flowing into each other simultaneously, **When** the tick resolves, **Then** combat applies symmetrically regardless of which player issued orders first.

---

### User Story 3 - Decay, Capacity, and Reserves (Priority: P2)

As a player, I want unfed troops to slowly die, cells to have capacity limits, and reserves to hold a percentage of troops in place, so that supply lines matter and positions can be defended.

**Why this priority**: These rules create the strategic tension (cutting pipes kills armies) but are refinements on top of production/flow/combat.

**Independent Test**: Can be tested by isolating a stack from any pipe (assert −1 troop/tick), overfilling a cell (assert cap), and setting reserves (assert held percentage never flows out).

**Acceptance Scenarios**:

1. **Given** a cell with 50 troops receiving no pipe inflow, **When** 5 ticks elapse, **Then** the stack has exactly 45 troops.
2. **Given** two adjacent cells each piping into each other, **When** all cities are lost, **Then** both stacks persist indefinitely (mutual feeding prevents decay).
3. **Given** reserves set to 30% on a cell holding 100 troops, **When** the cell pipes outward, **Then** at least 30 troops remain in the cell at all times.

---

### User Story 4 - Paratroopers and Guns (Priority: P2)

As a player, I want to launch paratroopers (2 troops spent per 1 landed, range 2) that break enemy pipes, and fire guns that damage a distant cell with possible friendly fire, so that I have tactical strikes beyond pipe networks.

**Why this priority**: These are the game's signature special attacks and enable its famous strategies (pipe-cutting raids), but they operate on top of the core economy.

**Independent Test**: Can be tested by issuing para/gun commands against scripted boards and asserting costs, landing counts, pipe resets, and damage.

**Acceptance Scenarios**:

1. **Given** a source cell with 20 troops, **When** paratroopers target a cell 2 units away, **Then** the source loses 2×N troops and the destination gains N (landing losses applied).
2. **Given** an enemy cell with active pipes, **When** paratroopers land in it, **Then** that cell's pipe configuration is cleared.
3. **Given** a gun fired from A into B where B holds only friendly troops, **When** the shot resolves, **Then** friendly troops take damage (friendly fire is real).
4. **Given** a gun fired at an empty cell, **When** it resolves, **Then** no state changes except the attacker's spent troops.

---

### User Story 5 - Victory and Surrender (Priority: P3)

As a player, I want the game to declare a winner when all opponents surrender or are obliterated, so matches conclude decisively.

**Why this priority**: Concluded matches matter for the full loop but cannot be exercised until armies can actually annihilate each other.

**Independent Test**: Can be tested by scripting boards down to one remaining player and asserting terminal state emission.

**Acceptance Scenarios**:

1. **Given** a 2-player match where one player's last troops and cities are destroyed, **When** the tick resolves, **Then** the engine emits a terminal state naming the survivor.
2. **Given** a player issues surrender, **When** the tick resolves, **Then** their forces become inert/removable and if one player remains, victory is declared.

---

### Edge Cases

- What happens when a pipe targets a water cell or points off the board? → Order rejected at validation; existing pipes into newly flooded terrain (not possible in v1 — terrain static) n/a.
- What happens when multiple players' flows enter the same neutral cell in one tick? → Deterministic resolution order (by player id) applied consistently.
- What happens when a city is captured mid-production? → Production ceases for the previous owner; new owner inherits the cell and its saturation state.
- What happens when paratroopers land in a water cell? → The launch fails validation; troops are not spent.
- What happens when reserves exceed current troop count? → All troops are held; nothing flows out.
- What happens when a gun hits a cell whose occupants changed between order and tick? → Damage applies to occupants present at resolution time (tick-time snapshot).
- What happens when an uphill pipe's handicap reaches or exceeds the base flow? → Flow is floored at 0 (stall); the pipe remains laid and legal, and the console renders it with the stalled indicator (feature 005 FR-013).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The engine MUST represent the board as a square grid where each cell has an integer elevation and a terrain type (land or water).
- **FR-002**: Water cells MUST be impassable: no troops may occupy, flow into, be paratrooped into, or be produced in them.
- **FR-003**: The engine MUST run on a fixed-rate tick; all state changes occur at tick boundaries.
- **FR-004**: Cities MUST produce troops each tick until the cell reaches its saturation capacity; production rate and capacity MUST be tunable constants.
- **FR-005**: Cities MUST be capturable: when a city cell's occupying troops belong to an enemy, ownership transfers to that enemy.
- **FR-006**: Each land cell MUST support up to four directional pipes (N/E/S/W); players MAY set any combination, and MAY set a single mutually-exclusive direction replacing all others.
- **FR-007**: Each tick, every cell with outgoing pipes MUST transfer troops along each pipe at a rate determined by the elevation change between source and destination (integer arithmetic only): downhill pipes move `flowBase + flowSlopeStep × min(|Δelev|, flowSlopeDeltaCap)` troops, flat pipes move `flowBase` troops, and uphill pipes move `max(0, flowBase − flowSlopeStep × min(|Δelev|, flowSlopeDeltaCap))` troops, where `Δelev = destElev − srcElev` and `flowBase`, `flowSlopeStep`, and `flowSlopeDeltaCap` are tunable constants. An uphill pipe whose handicap reaches `flowBase` MUST move 0 troops (stall); a stalled pipe is a legal, persistent state, not an error.
- **FR-008**: When troops of different owners would occupy the same cell after flow, the engine MUST resolve combat as attrition: equal numbers cause equal losses; a numerically superior force eliminates the smaller and retains the difference (subject to tuning constants).
- **FR-009**: Troops in a cell with no incoming pipe flow MUST lose exactly 1 troop per tick (decay); cells receiving flow from any friendly source are exempt.
- **FR-010**: Two cells feeding each other via opposing pipes MUST sustain both stacks indefinitely without city supply.
- **FR-011**: Every cell MUST enforce a maximum troop capacity; transfers that would exceed it MUST be truncated at capacity.
- **FR-012**: Players MUST be able to set a reserves percentage (0–90% in 10% steps) per cell; the reserved count MUST be retained in the cell before any outward flow or decay exemption logic.
- **FR-013**: Paratroop commands MUST cost 2 troops per 1 trooper landed, MUST have maximum range of 2 cells (Chebyshev distance), and MUST clear the destination cell's pipe configuration on landing.
- **FR-014**: Gun commands MUST cost troops (tunable), MUST damage troops occupying the destination cell at tick time regardless of owner (friendly fire), and MUST NOT move any troops to the destination.
- **FR-015**: The engine MUST detect terminal conditions: a player is eliminated when they hold zero troops AND zero cities; the match ends when fewer than two players remain.
- **FR-016**: Surrender MUST immediately mark the player eliminated (forces removed or rendered inert per plan decision).
- **FR-017**: The simulation MUST be deterministic: fixed tick rate, integer (or fixed-point) arithmetic only, no wall-clock reads inside tick logic, and command application in a well-defined total order.
- **FR-018**: The engine MUST accept ordered command batches per tick (set/clear pipes, set reserves, paratroop, gun, surrender) and validate them against pre-tick state, rejecting invalid orders without state corruption.
- **FR-019**: The engine MUST support 2–4 players per match (the original supported 2/3/4-player games).

### Key Entities *(include if feature involves data)*

- **Board**: square grid of Cells; fixed dimensions per match; immutable terrain.
- **Cell**: position, elevation (int), terrain type (land/water), optional City, troop stack, pipe directions, reserves percentage.
- **City**: production rate, saturation capacity, owner.
- **TroopStack**: owning player, count (int ≥ 0).
- **PipeSet**: subset of {N,E,S,W}; exclusive mode flag semantics.
- **Order**: typed command (pipe set/clear/exclusive, reserves, paratroop, gun, surrender) with source/target cells; validated pre-tick.
- **Player**: stable id, alive/eliminated status.
- **GameState**: board + players + tick number; serializable for replay and sync.
- **TickResult**: state deltas + events (battles, captures, eliminations) for clients.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the same seed-less scenario twice with identical inputs produces byte-identical final state (replay determinism verified by hash comparison over ≥10,000 ticks).
- **SC-002**: All acceptance scenarios in User Stories 1–5 pass as automated headless tests.
- **SC-003**: Game-logic modules maintain ≥80% test coverage (constitution gate).
- **SC-004**: A full tick of a default-size board (32×32, 2 players) completes in under 10 ms on commodity hardware, supporting smooth real-time play.
- **SC-005**: Every numeric rule (production, decay, attrition, costs, ranges) is defined in one tunable-constants location, not scattered through logic.

## Assumptions

- Board size defaults to 32×32 (matching the original's tile palette scale) but is configurable per match.
- Exact numeric values not documented by the original (production rate, capacities, gun cost/damage, slope gradient constants `flowBase`/`flowSlopeStep`/`flowSlopeDeltaCap`) will be chosen as sensible defaults during planning and exposed as tunable constants; none require product clarification to start.
- Terrain is static within a match (no terraforming).
- The engine is a pure library: no I/O, no clocks, no networking — those live in features 004/006.
- v1 targets 2-player matches end-to-end; 3–4 player support is required by the engine API but may receive lighter integration testing initially.

## Clarifications

### v1.1 (2026-08-30) — Elevation-gradient pipe flow (issue #30)

- **FR-007 rewritten** from the binary slope model (downhill = flat = `flowBase`, uphill = 0) to the elevation-gradient model: flow rate is a linear function of the elevation change, floored at 0 for uphill. The original game's rules are qualitative only — "troop flow is assisted and impeded by the terrain—troops will flow easily down a hill, but not so easily up a hill" (`europa-source/.../rules.html`) and "Its easy to go down a hill, but much more difficult to come up" (`strategy.html`) — no original numbers exist, so the tuning below is this spec's decision.
- **Tuning (resolves open question 1)**: `flowBase = 3`, `flowSlopeStep = 1`, `flowSlopeDeltaCap = 5`. Effective delta is `min(|Δelev|, flowSlopeDeltaCap)`. Resulting per-tick rates: downhill 4/5/6/7/8 (Δ = 1/2/3/4/≥5), flat 3, uphill 2 (Δ = 1), 1 (Δ = 2), 0 (Δ ≥ 3 — stall). `flowBase` rises from 1 to 3 per the issue's proposal — a deliberate 3× pace increase on flat flow, documented in the player manual. The cap bounds the downhill bonus at 2.7× flat and prevents extreme cliffs (observed adjacent-cell deltas reach ~106 on generated terrain) from becoming capacity-filling superhighways.
- **Terrain-roughness finding (grounds the tuning)**: an empirical sample of the shipped terrain generator (200 seeds × 32×32, 396,800 adjacent edges, replicating `fbm.ts` exactly) shows adjacent-cell elevation deltas are large — near-uniform across |Δ| = 1..50, max 106 — so 93% of uphill edges have Δ ≥ 3 and stall under this tuning. The uphill gradient is therefore visible mainly on gentle slopes (Δ 1–2); the downhill bonus is visible everywhere. Terrain smoothing would be a separate balance change and is out of scope (recorded for a future issue).
- **Contract change (breaking, internal)**: `EngineConstants` replaces `flowDownhillFactor`/`flowUphillFactor` with `flowSlopeStep`/`flowSlopeDeltaCap` — the multiplicative-factor model is gone. Both contract mirrors (`packages/engine/src/contracts/engine-api.ts` and `specs/001-core-game-engine/contracts/engine-api.ts`) MUST be updated in the implementation change set; the engine conformance suite fails until both are in sync. Existing tests asserting the multiplicative model (`tests/unit/flow.test.ts` `TEST_CONSTANTS`, `tests/quickstart/slope-flow.test.ts` comments and expected-value derivation) MUST be updated in the same change set.
- **Open question 3 ruling — no rebalance**: the flow-rate change does not warrant rebalancing in this change set. Most uphill edges still stall (ridges remain mostly impassable), the downhill bonus is bounded and symmetric (point-symmetric maps guarantee both players face identical terrain), and the flat-flow pace increase affects both players equally. All values remain tunable in `ENGINE_CONSTANTS`; a follow-up balance issue can adjust them if playtesting shows elevation is now too dominant.
- **Product decisions taken as given** (from issue #30): steep uphill may stall at 0 flow; a stalled pipe must be visually distinct in the console (feature 005 FR-013).

### v1.2 (2026-08-30) — Tuning re-validated against smoothed terrain (issue #30 scope extension)

- **`flowBase` raised 3 → 7** (supersedes the v1.1 value). The owner's scope extension added configurable terrain smoothing (spec 003 FR-010, default `terrainSmoothing: 4`). Re-running the empirical delta sampling (200 seeds × 32×32, replicating `fbm.ts` + the smoothing pass exactly) showed the v1.1 tuning was untenable: at `flowBase = 3` the stall threshold (Δ ≥ 3) is below the bulk of even smoothed terrain, leaving only **0.1%–6.6% of land reachable** from a starting position via flow-viable edges (k = 0..8) — exactly the owner's "1–2 cross-map paths" complaint, quantified. The smoothing alone cannot fix traversal at `flowBase = 3`.
- **Re-validated tuning (unchanged except `flowBase`)**: `flowBase = 7`, `flowSlopeStep = 1`, `flowSlopeDeltaCap = 5`, with the default smoothing k = 4. Resulting per-tick rates: downhill 8/9/10/11/12 (Δ = 1/2/3/4/≥5), flat 7, uphill 6/5/4/3/2/1 (Δ = 1..6), 0 (Δ ≥ 7 — stall). At the default: **31.5% of uphill edges stall** (handicap clearly visible) and **53.6% of land is reachable** via flow-viable edges (ridges passable-but-slow; the owner's complaint is decisively addressed). Elevation variance stays at 393.7 (maps keep character; SC-004 floor is only "> 0").
- **Determinism across the smoothing range**: verified empirically — the smoothing pass is a pure function of the elevation field + setting (no RNG, no wall-clock), byte-identical on re-run and exactly 180°-symmetric at k = 0, 1, 2, 3, 4, 5, 8 (spec 003 Clarifications v1.3). FR-017 (determinism) is unaffected.
- **Tradeoff curve (for owner veto)**: the (flowBase, smoothing-default) pair sits on a curve — flowBase 6/k=5 (stall 34.0%, reachable 50.9%, pace 6/tick) and flowBase 8/k=3 (stall 31.3%, reachable 56.4%, pace 8/tick) also meet the targets. flowBase 7/k=4 was chosen as the middle: moderate pace, moderate smoothing, maps keep the most character while meeting both targets. All values remain tunable in `ENGINE_CONSTANTS` / `DEFAULT_GENERATION_SETTINGS`.
- **Contract note**: the `EngineConstants` change from v1.1 stands (replace `flowDownhillFactor`/`flowUphillFactor` with `flowSlopeStep`/`flowSlopeDeltaCap`); the values of the constants are what v1.2 revises. The engine flow unit tests and quickstart Q-003 expected-value derivations update in the implementation change set.
