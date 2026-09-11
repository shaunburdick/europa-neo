# Feature Specification: Core Game Engine

**Feature Branch**: `001-core-game-engine`

**Created**: 2026-08-21

**Status**: Implemented (2026-09-07; hot-path allocation reuse 2026-09-11)

**Input**: User description: "Deterministic tick-based simulation of the original Europa gameplay: grid terrain with elevation and water, cities producing nanobot troops, pipes directing troop flow, attrition combat, decay, cell capacity with reserves, paratroopers, guns, and last-player-standing victory."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tick Simulation Drives Production and Flow (Priority: P1)

As a player, I want the server to advance the game on fixed ticks — cities producing troops, pipes carrying troops between cells — so that the game world evolves at a steady, fair pace regardless of client hardware.

**Why this priority**: Without a running simulation there is no game. Production and pipe flow are the economic heartbeat every other mechanic depends on.

**Independent Test**: Can be fully tested by initializing a small board with two cities, issuing pipe orders, stepping N ticks headlessly, and asserting exact troop counts per cell. Delivers a verifiable simulation core with no UI or networking.

**Acceptance Scenarios**:

1. **Given** a city cell with 0 troops, **When** 10 ticks elapse, **Then** the city contains `10 × productionRate` troops (bounded by saturation capacity).
2. **Given** a saturated city with an eastward pipe into an empty cell, **When** ticks elapse, **Then** troops accumulate in the destination cell while the source is decremented by the equal-split transfer amount each tick (Clarifications v1.6 — flow is a transfer, not a copy; v1.9 — equal-split model; the source does NOT stay at capacity).
3. **Given** identical initial state and identical ordered command lists, **When** the simulation runs twice for N ticks, **Then** both runs produce bit-identical state.
4. **Given** a downhill pipe (destination elevation < source), **When** troops flow, **Then** more troops move per tick than across flat terrain, and the bonus scales with the elevation change; uphill pipes move fewer, and the handicap scales with the elevation change.
5. **Given** an uphill pipe whose elevation change reaches the stall threshold (where the effective per-pipe amount drops to 0), **When** troops flow, **Then** the destination gains 0 troops (stall) and the pipe remains laid and legal.

---

### User Story 2 - Attrition Combat Between Opposing Troops (Priority: P1)

As a player, I want battles to erupt when my pipe flows into enemy-occupied cells, with equal forces trading losses 1:1 and larger forces overwhelming smaller ones, so that aggression has mechanical consequences.

**Why this priority**: Combat resolution is what makes territory contested; without it, pipes are just conveyors.

**Independent Test**: Can be tested by seeding two adjacent cells with known troop counts, opening a pipe between them, stepping ticks, and asserting exact loss ratios.

**Acceptance Scenarios**:

1. **Given** cell A (100 troops) pipes into cell B (100 enemy troops), **When** one tick resolves, **Then** both stacks lose approximately equal numbers (1:1 attrition).
2. **Given** cell A (200 troops) pipes into cell B (50 enemy troops), **When** ticks elapse, **Then** B is eliminated quickly and A captures the cell with majority of its force intact.
3. **Given** two opposing stacks flowing into each other simultaneously, **When** the tick resolves, **Then** combat applies symmetrically regardless of which player issued orders first.
4. **Given** a cell with 30 enemy troops at capacity (zero headroom), **When** the attacker pipes troops into it (producing inflow from the attacker), **Then** combat fires and attrition applies between the attacker's inflow and the defender's garrison — the cell is NOT invulnerable.
5. **Given** a cell with 5 enemy troops and the attacker sends 20 via pipe, **When** ticks elapse, **Then** the attacker captures the cell (20 inflow vs 5 garrison → attacker retains 15).

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
- What happens when an uphill pipe's handicap reaches or exceeds the per-pipe base amount? → Flow amount is floored at 0 (stall — effective per-pipe amount is 0); the pipe remains laid and legal, and the console renders it with the stalled indicator (feature 005 FR-013).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The engine MUST represent the board as a square grid where each cell has an integer elevation and a terrain type (land or water).
- **FR-002**: Water cells MUST be impassable: no troops may occupy, flow into, be paratrooped into, or be produced in them.
- **FR-003**: The engine MUST run on a fixed-rate tick; all state changes occur at tick boundaries.
- **FR-004**: Cities MUST produce troops each tick until the cell reaches its saturation capacity; production rate and capacity MUST be tunable constants.
- **FR-005**: Cities MUST be capturable: when a city cell's occupying troops belong to an enemy, ownership transfers to that enemy.
- **FR-006**: Each land cell MUST support up to four directional pipes (N/E/S/W); players MAY set any combination, and MAY set a single mutually-exclusive direction replacing all others.
- **FR-007**: Each tick, every cell with outgoing pipes MUST transfer troops along each pipe using the equal-split model (integer arithmetic only). The transfer budget per cell per tick is the tunable constant `flowRate` (default 12). Each outgoing pipe receives an equal share: `perPipe = floor(flowRate / numPipes)`, where `numPipes` is the number of outgoing pipes on the source cell. The elevation gradient modifies each pipe's share individually: downhill pipes use `perPipe + flowDownhillStep × min(|Δelev|, flowSlopeDeltaCap)`, flat pipes use `perPipe`, and uphill pipes use `max(0, perPipe − flowUphillStep × |Δelev|)`, where `Δelev = destElev − srcElev`. An uphill pipe whose effective per-pipe amount reaches 0 MUST transfer 0 troops (stall); a stalled pipe is a legal, persistent state, not an error. When the source has fewer troops than `flowRate` (scarcity), troops are split equally across pipes: each pipe receives `min(perPipe, available / remainingPipes)`, where `available = srcCount − reserveFloor` and `remainingPipes` decreases after each pipe is processed. Each pipe reads the source's current count from `newCounts` (the accumulated state after prior transfers in the same tick), so multi-pipe sources deplete naturally across all directions in N→E→S→W order. The source cell IS decremented by the number of troops transferred (Clarifications v1.6 — transfer, not copy).
- **FR-008**: When troops of different owners would occupy the same cell after flow, the engine MUST resolve combat as attrition using **total forces** — not just fresh inflow. For each contested cell, the attacker's total is the sum of their committed flow (what the pipes would have delivered without capacity constraints) plus any pre-existing troops they own in the cell; the defender's total is the garrison (pre-flow troops of the cell's owner) plus the defender's committed flow. Equal totals cause equal losses; a numerically superior force eliminates the smaller and retains the difference. A new `committedFlowTally` side-channel (alongside the existing `inflowTally`) records the raw pipe flow before headroom clamping, enabling combat to fire even when a cell is at full capacity. The `CombatEvent` type includes `attackerTotal` and `defenderTotal` fields recording the pre-attrition totals.
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
- **SC-006**: A V8 heap-profile snapshot of 1000 consecutive ticks on a populated 32×32 board MUST show zero allocations in the `tick()` function body (allocations in setup/teardown outside `tick()` are permitted). This is a regression guard for the scratch-buffer reuse in Clarifications v1.10.

## Assumptions

- Board size defaults to 32×32 (matching the original's tile palette scale) but is configurable per match.
- Exact numeric values not documented by the original (production rate, capacities, gun cost/damage, flow rate and slope gradient constants `flowRate`/`flowDownhillStep`/`flowUphillStep`/`flowSlopeDeltaCap`) will be chosen as sensible defaults during planning and exposed as tunable constants; none require product clarification to start.
- Terrain is static within a match (no terraforming).
- The engine is a pure library: no I/O, no clocks, no networking — those live in features 004/006.
- v1 targets 2-player matches end-to-end; 3–4 player support is required by the engine API but may receive lighter integration testing initially.

## Clarifications

### v1.1 (2026-08-30) — Elevation-gradient pipe flow (issue #30)

- **FR-007 rewritten** from the binary slope model (downhill = flat = `flowBase`, uphill = 0) to the elevation-gradient model: flow rate is a linear function of the elevation change, floored at 0 for uphill. The original game's rules are qualitative only — "troop flow is assisted and impeded by the terrain—troops will flow easily down a hill, but not so easily up a hill" (`europa-source/.../rules.html`) and "Its easy to go down a hill, but much more difficult to come up" (`strategy.html`) — no original numbers exist, so the tuning below is this spec's decision.
- **Tuning (resolves open question 1)**: `flowBase = 3`, `flowSlopeStep = 1`, `flowSlopeDeltaCap = 5`. Effective delta for the downhill bonus is capped at `flowSlopeDeltaCap` (the uphill handicap is uncapped — see v1.3). Resulting per-tick rates: downhill 4/5/6/7/8 (Δ = 1/2/3/4/≥5), flat 3, uphill 2 (Δ = 1), 1 (Δ = 2), 0 (Δ ≥ 3 — stall). `flowBase` rises from 1 to 3 per the issue's proposal — a deliberate 3× pace increase on flat flow, documented in the player manual. The cap bounds the downhill bonus at 2.7× flat and prevents extreme cliffs (observed adjacent-cell deltas reach ~106 on generated terrain) from becoming capacity-filling superhighways.
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

### v1.3 (2026-08-30) — Asymmetric cap correction (PM ruling R-1)

- **R-1 ruling (recorded in tasks.md and data-model.md §2)**: `flowSlopeDeltaCap` bounds the DOWNHILL bonus only; the uphill handicap is UNCAPPED. The operative formula is: downhill `flowBase + flowSlopeStep × min(|Δ|, flowSlopeDeltaCap)`, flat `flowBase`, uphill `max(0, flowBase − flowSlopeStep × |Δ|)`.
- **Why the correction**: the FR-007 text as literally written before this change applied the cap symmetrically — the uphill branch was bounded by `flowSlopeDeltaCap` exactly like the downhill branch. With `flowBase = 7` and `flowSlopeDeltaCap = 5`, a capped uphill branch can never stall (uphill always ≥ 2), contradicting US1 AC-5 (stall at Δ ≥ `flowBase / flowSlopeStep` = 7) and the v1.2 rate listing (uphill 6/5/4/3/2/1, 0 at Δ ≥ 7).
- **Shipped implementation**: `flowRateForDelta` in `packages/engine/src/flow-rate.ts` implements the asymmetric formula — downhill `flowBase + flowSlopeStep × min(|Δ|, flowSlopeDeltaCap)`, flat `flowBase`, uphill `max(0, flowBase − flowSlopeStep × |Δ|)` — stalling at Δ ≥ 7. FR-007 above is corrected to match; the v1.1 "effective delta" sentence is amended to scope the cap to the downhill bonus.

### v1.4 (2026-09-04) — Total-force combat resolution (issue #51)

- **FR-008 rewritten** from inflow-only attrition to total-force attrition. The previous model compared only fresh inflow (troops that arrived via pipes during the current tick), ignoring the existing garrison. This made cells at capacity invulnerable to pipe-based combat — a critical gameplay defect documented in issue #51.
- **The fix**: combat now considers total forces for each owner in a contested cell. For a 2-way conflict, the attacker's total = their committed flow (what the pipes would have delivered without capacity constraints) + any pre-existing troops they own in the cell; the defender's total = the garrison (pre-flow troops of the cell's owner) + defender's committed flow. 1:1 attrition applies between these totals. A new `committedFlowTally` side-channel (alongside the existing `inflowTally`) records the raw pipe flow before headroom clamping, enabling combat to fire even when a cell is at full capacity. The `inflowTally` continues to record actual inflow for decay-exemption logic.
- **CombatEvent extension**: two new fields — `attackerTotal` and `defenderTotal` — record the pre-attrition totals. This makes events self-documenting and avoids clients reverse-engineering the pre-combat state. The existing `attacker`, `defender`, `attackerLoss`, `defenderLoss`, `winner` fields are unchanged.
- **Contract change (additive, non-breaking)**: `CombatEvent` in both contract mirrors gains `attackerTotal: number` and `defenderTotal: number`. Both mirrors (`packages/engine/src/contracts/engine-types.ts` and `specs/001-core-game-engine/contracts/engine-api.ts`) MUST be updated in the same change set.
- **Tick order unchanged**: flow → combat → capture → decay. Combat reads the post-flow state and the inflow tally; it does not modify the flow phase.
- **3-way+ combat unchanged**: the dominant-owner model stays; this improvement targets the 2-way case (the overwhelmingly common case).

#### Attacker vs defender identification

The flow phase (`resolveFlow`) overwrites `troopOwners[idx]` when a new player's troops arrive in a cell. After flow, the cell owner may be the attacker (the last writer), not the original garrison owner. `resolveCombat` needs the pre-flow owner to correctly identify defender vs attacker. Recommended approach: `resolveCombat` accepts a `preFlowState` parameter (or the tick orchestrator captures the pre-flow `troopOwners` before calling `resolveFlow`). When `preFlowState.troopOwners[idx] !== 0` and matches a player in the committed flow tally, that player is the garrison owner (defender); all other committed-flow contributors are attackers. When `preFlowState.troopOwners[idx] === 0` (empty cell before flow), fall back to the existing dominant-owner model.

#### Worked examples

**Scenario A — 2 pipes vs 1 pipe, cell at capacity** (the motivating bug):

Cell has 30 troops belonging to Player 2 (defender). Player 1 (attacker) has 2 pipes flowing in; Player 2 has 1 pipe. Each pipe delivers 7 troops/tick (flowBase on flat terrain). cellCapacity = 30.

Under the OLD model (inflow-only): tick 1 cell full → headroom 0 → nobody flows in → no combat. Cell untouchable forever.

Under the NEW model (total forces, using `committedFlowTally`):
- Tick 1: P1 commits 14 (2×7), P2 commits 7 (1×7). Cell at 30, headroom 0, nobody flows in (`inflowTally` = 0). `committedFlowTally`: P1 = 14, P2 = 7. Combat: P1's 14 vs P2's 30. Both lose 14. P1 = 0; P2 = 16. Cell stays P2's.
- Tick 2: P1 commits 14, P2 commits 7. Cell has 16 (P2), headroom 14. P1's 14 fill headroom (inflow = 14). P2's 7 cannot flow (headroom exhausted). `committedFlowTally`: P1 = 14, P2 = 7. Combat: P1's 14 vs P2's 16 (garrison). Both lose 14. P1 = 0; P2 = 2.
- Tick 3: P1 commits 14, P2 commits 7. Cell has 2 (P2), headroom 28. Both flow in fully. `committedFlowTally`: P1 = 14, P2 = 7. Combat: P1's 14 vs P2's 2 (garrison) + 7 (committed) = 9. Both lose 9. P1 = 5; P2 = 0. **Capture**.

**Scenario B — Garrison vs inflow (headroom-limited attack):**

Cell has 20 troops (P2 garrison). P1 sends 15 via pipe. Cell capacity 30, headroom 10. Flow: P1 committed = 15, headroom 10 → only 10 enter. `committedFlowTally`: P1 = 15. Combat: P1's 15 (committed) vs P2's 20 (garrison). Both lose 15. P1 = 0; P2 = 5. Cell retains 5 P2 troops.

**Scenario C — Successful capture:**

Cell has 5 troops (P2). P1 sends 20 via pipe. All 20 enter (headroom 25). `committedFlowTally`: P1 = 20. Combat: P1's 20 vs P2's 5. Both lose 5. P1 = 15; P2 = 0. Cell captured by P1 with 15 troops.

#### Edge cases

- **Cell at capacity, zero headroom, attacker flows in**: `committedFlowTally` records committed flow; combat fires against the garrison (motivating scenario above).
- **Cell with garrison, no new inflow from garrison owner, only inflow from attacker**: Combat fires. Defender total = garrison (no new inflow); attacker total = inflow. If garrison > inflow, attacker is destroyed.
- **Cell with garrison from A, inflow from both A and B**: Defender total = A's garrison + A's inflow; attacker total = B's inflow. The garrison owner is always the defender.
- **Empty cell, inflow from two owners**: Unchanged — both sides are purely inflow counts, dominant-owner model applies.
- **Cell with garrison, no inflow from anyone**: Single-owner cell → no combat. Unchanged.
- **Attacker inflow exceeds defender garrison + defender inflow**: Attacker captures the cell with the surplus.
- **Defender garrison + defender inflow exceeds attacker inflow**: Defender retains the cell with the surplus.
- **Simultaneous inflow into empty cell (no garrison)**: Falls back to dominant-owner model. Player with highest inflow wins; ties broken by ascending PlayerId.

#### Acceptance criteria

- AC-1: A cell at capacity with zero headroom can be attacked by pipe flow — combat fires using `committedFlowTally`.
- AC-2: Multi-tick attrition progression matches expected trace (Scenario A above).
- AC-3: Garrison-only vs inflow-only — combat compares attacker's inflow vs defender's garrison.
- AC-4: Garrison + inflow from both sides — garrison owner is defender.
- AC-5: Empty cell with simultaneous inflow — unchanged dominant-owner behavior.
- AC-6: `CombatEvent` payloads include `attackerTotal` and `defenderTotal` with correct values.
- AC-7: Byte-identical determinism preserved (SC-001).
- AC-8: Existing combat tests pass (with updated assertions where applicable); new tests cover garrison-vs-inflow model.

### v1.5 (2026-09-07) — Combat winner capacity clamping (issue #78)

- **FR-011 interpretation clarified**: the phrase "transfers that would exceed it MUST be truncated at capacity" applies not only to pipe-based troop transfers but also to combat resolution winners. When combat attrition reduces a cell to fewer troops than the winner's surviving force, the winner's count MUST be clamped to `cellCapacity` — i.e. `Math.min(winnerRemaining, cellCapacity)`.
- **Why this is a clarification, not a new rule**: FR-011 already mandates capacity clamping for "transfers"; combat is a transfer of control — the winning force takes possession of the cell and its contents. Without clamping, the winner could end up with more troops than the cell can hold, violating the invariant that `cell.troops ≤ cellCapacity` at all times. This clarification codifies what the existing FR-011 wording already implies.
- **Applies to all combat paths**: the clamping MUST be applied in both the 2-way combat path (two opposing stacks) and the 3-way+ combat path (dominant-owner model). In each case, after attrition resolves and the winner is determined, the winner's surviving troop count is clamped to `Math.min(surviving, cellCapacity)`.
- **Worked example** — 2-way path: Cell capacity 30. Attacker sends 20 via pipe into a cell with 5 defender troops. Combat: 20 vs 5 → attacker retains 15, defender eliminated. 15 ≤ 30 → no clamping needed. Now suppose cell capacity 10: attacker retains 15, clamped to 10. The surplus 5 troops are lost (never produced — they simply do not exist after clamping).
- **Worked example** — 3-way path: Cell capacity 30. Three owners contribute 25, 15, and 10 committed flow respectively, with no garrison. Dominant player (25) wins against combined 25 (15+10). After attrition, dominant retains 0 (25 − 25 = 0). Cell captured with 0 troops. If dominant had 25 vs 20 combined, dominant retains 5; 5 ≤ 30 → no clamping. If cell capacity were 3 and dominant retained 5, clamped to 3.
- **No contract change**: this is a behavioral clarification of existing FR-011 semantics, not a new field or type change. `CombatEvent` is unaffected; the clamping occurs after combat resolution in the tick orchestrator.
- **AC-9**: After combat resolution, every cell satisfies `cell.troops ≤ cellCapacity` — verified by a post-combat invariant assertion in the tick orchestrator.
- **AC-10**: Existing combat tests pass (with updated assertions where the winning force exceeds cell capacity); new tests specifically exercise the clamping boundary (winner remaining = capacity, capacity − 1, capacity + 1).

### v1.6 (2026-09-08) — Pipe flow is a transfer, not a copy (issue #99)

- **The bug**: `transfer()` in `packages/engine/src/resolution/flow.ts` copied troops into the destination without decrementing the source. Every tick, each pipe delivered `flowRateForDelta(...)` troops to the destination while the source kept its full stack — troops were created from nothing at `flowBase × pipe_chain_length` per tick, inflating the board total without bound. The same defect made US1 AC-2 ("the source stays at capacity") true only by accident of the copy semantics.
- **FR-007 clarified — "transfer" means the source is decremented**: each tick, every cell with outgoing pipes MUST transfer troops along each pipe at the FR-007 rate; the source cell is decremented by the number of troops actually delivered to the destination. Flow is a transfer of existing troops, never a creation of new ones. The destination gains exactly what the source loses (subject to capacity clamping on the destination and the reserves floor on the source). **Conservation invariant**: the board-wide troop total never increases as a result of the flow phase.
- **US1 AC-2 corrected**: a saturated city with an eastward pipe into an empty cell does NOT stay at capacity — it produces `productionRate` troops per tick and transfers them out, so its count oscillates near zero while the destination accumulates. The acceptance scenario text above is amended to match.
- **Source availability is checked before the destination write**: a pipe whose source is empty (or fully reserved) delivers nothing; the destination is never credited from an empty source. Multi-pipe sources deplete across their directions in deterministic N→E→S→W order, reading the CURRENT source count (post-production, post-earlier-transfers) for each transfer.
- **Reserves floor (FR-012) applies per-transfer**: each transfer computes the source's floor as `ceil(currentSourceCount × reservesPct / 10)` and caps the transfer at `currentSourceCount − floor`. A source at or below its floor transfers nothing. When a source reaches 0, its owner is cleared to 0.
- **`committedFlowTally` (FR-008) is capped by source availability**: the raw committed flow recorded for combat is `min(flowRateForDelta(...), currentSourceCount − reserveFloor)` — a pipe cannot commit troops the source does not hold. The `inflowTally` records the actual delivered amount (`deduct`), unchanged in meaning.
- **`reservedFloors` wiring (FR-012 decay)**: `tick.ts` allocated `reservedFloors` but never populated it, so decay fell back to computing the floor from the post-flow count. The array is now populated before `resolveDecay` from the post-capture state (`ceil(count × reservesPct / 10)` per cell with `reservesPct > 0`), making the decay floor deterministic and consistent with the flow-phase floor. No contract change — `reservedFloors` is an internal tick-orchestrator parameter.
- **FR-010 clarified — "sustain" means no decay, not growth**: two cells feeding each other via opposing pipes sustain both stacks indefinitely (friendly inflow exempts both from decay), but under transfer semantics the stacks do not inflate — the total is conserved. The mutual-feeding quickstart test (Q-007) asserts conservation bounds rather than unbounded accumulation.
- **No contract change**: this is a behavioral correction of the existing FR-007 "transfer" wording, not a type or API change. `EngineConstants`, `CombatEvent`, and the engine API surface are unaffected. The engine conformance suite is unchanged.
- **Test updates in the same change set**: `tests/unit/flow.test.ts` (4-way pipe test now asserts source depletion + conservation; new "source depletion (Clarifications v1.6)" suite covering source decrement, short-source capping, owner clearing, reserves floors, multi-pipe depletion order, destination-at-capacity, and board-total conservation), `tests/quickstart/slope-flow.test.ts` (source seeded to `cityCapacity` so FR-007 rates are observable; new multi-tick conservation test), `tests/quickstart/decay-capacity-reserves.test.ts` (mutual-feeding test asserts conservation bounds instead of "20 troops each").

### v1.7 (2026-09-08) — Decay exemption uses pipe topology, not inflow tally (issue #99 follow-up)

- **The bug**: the decay check used the inflow tally (`inflowTally[idx * 4 + (owner - 1)] > 0`) to determine if a cell is "fed". The tally only records ACTUAL troop transfers — not the existence of pipes. When a source cell depletes (which happens fast with transfer semantics from v1.6), the flow resolver skips it (`srcCount === 0 → continue`), no tally entry is written, and decay applies to the destination even though the pipe EXISTS. This caused all non-city tiles to decay every tick, even if they had incoming pipes.
- **The fix**: replace the tally-based check with a pipe-topology check. A cell is "fed" if any same-owner neighbor has a pipe pointing toward it (computed from `pipeMasks` and `preFlowState.troopOwners`). Enemy pipes don't prevent decay — only your own supply network counts. This matches the original game's rule: "Troops that are in a cell that is not fed by any pipes slowly die" — the pipe topology, not the troop flow, determines exemption.
- **Why pre-flow owners**: the pipe topology check uses `preFlowState.troopOwners` for neighbor ownership (not post-flow), because flow depletion during the flow phase can set owners to 0. The pipe was set by the original owner and hasn't been cleared — flow depletion doesn't change who set the pipe.
- **Why post-capture owners for the cell**: the cell's own owner uses `state.troopOwners` (post-capture) because combat/capture may change ownership. If an enemy captures a cell, the pipe from the previous owner is no longer "same-owner" and doesn't prevent decay.
- **Implementation**: `tick.ts` computes `hasIncomingSameOwnerPipe: Uint8Array(n)` — for each cell, checks if any neighbor (N/E/S/W) has a pipe pointing toward it AND that neighbor's pre-flow owner matches the cell's post-capture owner. This array is passed to `resolveDecay` as a new parameter (replacing the old `inflowTally` parameter). `decay.ts` checks `hasIncomingSameOwnerPipe[idx] !== 0` instead of the tally.
- **No contract change**: this is a behavioral correction of FR-009/FR-010 semantics, not a type or API change. The `inflowTally` continues to be used by combat (Phase 5); decay now uses the separate pipe-topology array.

### v1.8 (2026-09-08) — Owner preservation at depletion (issue #99 decay oscillation fix)

- **The bug**: when a pipe chain runs from a city, intermediate cells deplete to 0 troops during flow. Flow's `transfer()` cleared `troopOwners` to 0 for depleted cells (v1.6). The pipe-topology decay check in `tick.ts` used `preFlowState.troopOwners` for neighbors — but the neighbor was depleted, so its owner was 0. The downstream cell didn't see a "same-owner" pipe, so decay applied even though the pipe existed. This caused a 29↔30 oscillation on cells near a full chain tip: the cell decays to 29, production fills it to 30, flow depletes the source to 0 (clearing its owner), decay hits the destination again next tick.
- **The fix (two coupled changes)**:
  1. `flow.ts` `transfer()`: when the source count hits 0, owner is now PRESERVED (not cleared to 0). The pipe was placed by that player and still "belongs" to them — ownership is independent of troop presence.
  2. `tick.ts` pipe-topology check: neighbor ownership now reads `state.troopOwners` (post-flow, post-capture) instead of `preFlowState.troopOwners`. Since owners are no longer cleared by flow depletion, the post-flow state correctly reflects who placed the pipe.
- **Why pre-flow owners are no longer needed**: v1.7 introduced `preFlowState.troopOwners` specifically because flow cleared owners at depletion. With v1.8 preserving owners, `state.troopOwners` (post-flow) already has the correct owner for all cells — the pre-flow snapshot is unnecessary for the decay check. (The pre-flow snapshot is still used by combat to identify the garrison owner.)
- **No contract change**: this is a behavioral correction of the flow and decay interaction, not a type or API change. `EngineConstants`, `CombatEvent`, and the engine API surface are unaffected.

### v1.9 (2026-09-09) — Equal-split pipe flow (issue #50)

- **The problem — branch starvation under fixed-rate flow**: the v1.1–v1.8 model used an absolute troop count (`flowRateForDelta` returning a fixed number of troops per tick). When a source cell had multiple outgoing pipes, the N→E→S→W processing order created a hidden priority: the first pipe processed consumed its full fixed count from the source, depleting it before later pipes could draw. With `flowBase = 7` and a source of 30 troops, a 2-pipe source sent 7 via N (leaving 23), then 7 via E (leaving 16) — each pipe received its full share. But with a source of 10 troops, the N-pipe took 7 (leaving 3), and the E-pipe took only 3 (starved). With a source of 5, the N-pipe took 5 (leaving 0), and the E-pipe got nothing. This made pipe topology strategically meaningless — branches received troops only when the main chain had surplus, and the N→E→S→W order determined which branches were "main" and which were "starved." The fixed-rate model treated pipes as independent consumers of an absolute budget, not as branches of a shared supply.
- **The fix — equal-split flow**: replace the per-pipe fixed count with a shared budget divided equally among outgoing pipes. The total outflow budget per cell per tick is the tunable constant `flowRate` (default 12). Each outgoing pipe receives `perPipe = floor(flowRate / numPipes)`. When the source has fewer troops than `flowRate` (scarcity), troops are split equally: each pipe receives `min(perPipe, available / remainingPipes)`, where `available = srcCount − reserveFloor`. This ensures fair sharing regardless of source size — a 2-pipe cell sends 6+6 = 12 when充足, or 2+3 = 5 when the source holds only 5. The elevation gradient modifies each pipe's share individually after the equal split.
- **Per-pipe transfer algorithm**:
  ```
  perPipe = floor(flowRate / numPipes)
  For each pipe in N→E→S→W order:
      available = srcCount − reserveFloor
      sent = min(perPipe, available / remainingPipes)
      source -= sent
      destination += sent  (clamped to cellCapacity)
  ```
- **Elevation modifier** — applied to each pipe's share AFTER the equal split:
  - Downhill (`Δelev < 0`): `perPipe + flowDownhillStep × min(|Δelev|, flowSlopeDeltaCap)` (capped bonus, same shape as v1.3).
  - Flat (`Δelev = 0`): `perPipe` (the equal share).
  - Uphill (`Δelev > 0`): `max(0, perPipe − flowUphillStep × |Δelev|)` (uncapped penalty — same shape as v1.3).
  - Stall: effective per-pipe amount reaches 0 at `Δelev ≥ perPipe / flowUphillStep`; `sent = 0`.
- **Worked examples** (flowRate = 12):

  | flowRate | Pipes | Source | Pipe 1 | Pipe 2 | Pipe 3 | Pipe 4 | Total out |
  |----------|-------|--------|--------|--------|--------|--------|-----------|
  | 12       | 1     | 30     | 12     | —      | —      | —      | 12        |
  | 12       | 2     | 30     | 6      | 6      | —      | —      | 12        |
  | 12       | 2     | 5      | 2      | 3      | —      | —      | 5         |
  | 12       | 3     | 30     | 4      | 4      | 4      | —      | 12        |
  | 12       | 4     | 30     | 3      | 3      | 3      | 3      | 12        |

  Under scarcity (source = 5, 2 pipes): `perPipe = floor(12/2) = 6`, but `available = 5`. Pipe 1 gets `min(6, 5/2) = 2` (floor), leaving 3. Pipe 2 gets `min(6, 3/1) = 3`. Total = 5.

- **Tuning (resolves issue #50)**: `flowRate = 12` (total outflow budget per cell per tick). The elevation gradient modifiers remain: `flowDownhillStep = 1`, `flowUphillStep = 1`, `flowSlopeDeltaCap = 5`. `flowUphillCap` is removed (the stall threshold is now `perPipe / flowUphillStep`, not a fixed constant). Resulting per-pipe amounts on flat terrain: 1 pipe → 12, 2 pipes → 6 each, 3 pipes → 4 each, 4 pipes → 3 each. With elevation: downhill adds bonus, uphill subtracts penalty, stalling at Δ ≥ `perPipe / flowUphillStep`. The equal-split model means a 2-pipe cell always sends 12 total (6+6) when充足, regardless of source size — this is a deliberate "constant throughput" design that creates a "plateau" flow effect along chains.
- **Tradeoff — plateau flow vs exponential decay**: the equal-split model creates a "plateau" effect along pipe chains. A chain of flat pipes from a city of 30 troops delivers: tick 1 → 12 to cell 2, 12 to cell 3, 12 to cell 4, ... until the source depletes, then drops. Under the percentage-based model (50%), the same chain delivered 15, 7, 3, 1, 0 (exponential decay). The plateau model means chain tips receive full flow until the source runs dry — supply line length matters less than source capacity. This is the intended strategic behavior: a city with a long chain still delivers full flow to the front, but the source depletes faster, creating a "burst" followed by collapse rather than a gradual taper.
- **Backward compatibility**: the engine's public interface does not change. `resolveFlow`, `tick`, `applyCommand`, and all `TickResult` types are unchanged. This is an internal behavioral change to the flow formula — callers see different troop distributions but no API surface change. `ENGINE_API_VERSION` is NOT bumped.
- **Contract change (breaking, internal)**: `FlowConstants` in `@europa/core` replaces `flowBase: number` with `flowRate: number` (the total outflow budget per cell per tick, default 12). `flowUphillCap` is removed (stall threshold is now computed from `perPipe / flowUphillStep`). Both contract mirrors (`packages/core/src/flow-rate.ts` and `specs/001-core-game-engine/contracts/flow-rate.ts`) MUST be updated in the same change set. `EngineConstants` inherits `flowRate` from `FlowConstants`.
- **`flowRateForDelta` becomes a per-pipe modifier**: the function in `@europa/core` that computes the effective per-pipe amount from the elevation delta is updated to take `perPipe` as input (the equal share) and return the elevation-modified amount. The old function returned an absolute troop count based on `flowBase`; the new function applies the elevation gradient to the equal share: `perPipe + flowDownhillStep × min(|Δ|, flowSlopeDeltaCap)` for downhill, `perPipe` for flat, `max(0, perPipe − flowUphillStep × |Δ|)` for uphill. Both functions live in `@europa/core` so terrain validators and the engine share the formula.
- **Source depletion semantics unchanged (Clarifications v1.6)**: each pipe reads the source's current count from `newCounts` (the accumulated state after prior transfers in the same tick), so a multi-pipe source correctly depletes across all directions in N→E→S→W order. The reserves floor (FR-012) is computed per-transfer against the current source count, protecting a percentage of what remains after each prior pipe's deduction. The `committedFlowTally` records `min(sent, srcCount − reserveFloor)`, capped at what the source can actually supply.
- **Acceptance criteria**:
  - **AC-11**: A source with 2 outgoing pipes on flat terrain splits flow equally — each pipe receives `floor(flowRate / 2)` = 6 troops from a充足 source (30 troops), and both branches get troops even when the source is small (scarcity splitting).
  - **AC-12**: A source with 4 outgoing pipes on flat terrain distributes flow equally — each pipe receives `floor(flowRate / 4)` = 3 troops from a充足 source, and the source depletes across N→E→S→W order with all four destinations receiving troops.
  - **AC-13**: Branch starvation is eliminated — branches receive troops even when the main chain is full. A source feeding both a long chain and a short branch sends troops to both; under the equal-split model, each branch gets its fair share of the `flowRate` budget regardless of chain length.
  - **AC-14**: Source depletion across branches is deterministic and conserved — the total troops sent to all destinations plus the source's remaining count equals the original count (minus reserves floor). No troops are created or destroyed. Byte-identical determinism (SC-001) is preserved.
  - **AC-15**: Plateau flow along chains is verified — a chain of N flat pipes from a city delivers the full `flowRate` per tick to each cell until the source depletes, then drops. The chain tip receives full flow (not exponentially reduced flow) while the source has troops.
- **US1 AC-2 updated**: a saturated city with an eastward pipe into an empty cell transfers `floor(flowRate / 1)` = 12 troops each tick (equal-split, single pipe), so the source depletes by 12 per tick and the destination accumulates the received amount.
- **US1 AC-5 updated**: the stall threshold is now expressed as the elevation delta where the effective per-pipe amount reaches 0 (`Δelev ≥ perPipe / flowUphillStep`). With `flowRate = 12` and a single pipe, `perPipe = 12`, so stall at Δ ≥ 12. With 2 pipes, `perPipe = 6`, so stall at Δ ≥ 6. The threshold varies by pipe count — this is a deliberate design choice.
- **Test updates in the same change set**: `tests/unit/flow.test.ts` (all `TEST_CONSTANTS` assertions updated for equal-split formula; new "equal-split" suite covering 1/2/3/4-pipe split scenarios with充足 and scarce sources; new "plateau flow" suite verifying chain-tip behavior; conservation assertions updated to account for equal-split depletion), `tests/quickstart/slope-flow.test.ts` (Q-003 expected values updated for equal-split rates).

### v1.10 (2026-09-11) — Hot-path allocation reuse (issue #135, code review I-28 Thread T-14)

Rationale: code review identified per-tick allocation of typed arrays, per-cell `committedPlayers`, and per-source `TransferParams` as garbage-collection pressure on the hot path. With 250 ms tick cadence, every allocation that can be avoided reduces GC pauses and improves SC-004 compliance.

- **FR-03 added** — scratch buffer reuse: the engine tick MUST reuse pre-allocated scratch buffers across ticks rather than allocating new typed arrays, `committedPlayers` maps, and `TransferParams` objects per tick. Specifically: (a) the `newCounts` / `troopOwners` arrays used during flow resolution MUST be pre-allocated at board construction time and zeroed in-place before each tick (not re-created); (b) `committedFlowTally` (FR-008 side-channel) and `inflowTally` MUST be similarly reused; (c) `TransferParams` objects (used per-source-pipe during flow) MUST be drawn from a pre-allocated pool sized to the maximum pipe count per cell (4 directions × N cells); (d) `committedPlayers` per cell (used by combat) MUST be a fixed-size per-cell array sized to `playerCount`, allocated once at board construction and cleared in-place each tick.
- **Determinism preserved**: in-place zeroing produces identical results to fresh allocation because the engine reads every cell position exactly once per phase (flow, combat, capture, decay). No stale data can leak between phases. Byte-identical determinism (SC-001) is unaffected.
- **Performance target**: the per-tick allocation cost (excluding the one-time board-construction allocation) MUST be zero. This is verifiable by profiling — the tick function must not allocate on the V8 heap after the first tick. SC-004 (tick < 10 ms) remains the pass/fail criterion; the allocation reuse is a means to that end, not a separate metric.
- **No contract change**: this is an internal performance optimization. The engine's public API (`tick`, `applyCommand`, `TickResult`, `GameState`) is unchanged. Callers see identical behavior.
- **Test expectations**: SC-001 determinism tests are unchanged. A new SC-006 is added: a V8 heap-profile snapshot of 1000 consecutive ticks on a populated 32×32 board MUST show zero allocations in the `tick()` function body (allocations in setup/teardown outside `tick()` are permitted).
