# Feature Specification: Core Game Engine

**Feature Branch**: `001-core-game-engine`

**Created**: 2026-08-21

**Status**: Draft

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
4. **Given** a downhill pipe (destination elevation < source), **When** troops flow, **Then** more troops move per tick than across flat terrain; uphill pipes move fewer.

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

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The engine MUST represent the board as a square grid where each cell has an integer elevation and a terrain type (land or water).
- **FR-002**: Water cells MUST be impassable: no troops may occupy, flow into, be paratrooped into, or be produced in them.
- **FR-003**: The engine MUST run on a fixed-rate tick; all state changes occur at tick boundaries.
- **FR-004**: Cities MUST produce troops each tick until the cell reaches its saturation capacity; production rate and capacity MUST be tunable constants.
- **FR-005**: Cities MUST be capturable: when a city cell's occupying troops belong to an enemy, ownership transfers to that enemy.
- **FR-006**: Each land cell MUST support up to four directional pipes (N/E/S/W); players MAY set any combination, and MAY set a single mutually-exclusive direction replacing all others.
- **FR-007**: Each tick, every cell with outgoing pipes MUST transfer troops along each pipe, modified by slope: downhill transfers more than flat, uphill fewer (tunable slope factors).
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
- Exact numeric values not documented by the original (production rate, capacities, gun cost/damage, slope factors) will be chosen as sensible defaults during planning and exposed as tunable constants; none require product clarification to start.
- Terrain is static within a match (no terraforming).
- The engine is a pure library: no I/O, no clocks, no networking — those live in features 004/006.
- v1 targets 2-player matches end-to-end; 3–4 player support is required by the engine API but may receive lighter integration testing initially.
