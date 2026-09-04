# Data Model: Total-Force Combat Resolution (issue #51)

**Branch**: `issue-51-improved-combat` | **Date**: 2026-09-04 | **Specs**: 001 v1.4

> **Delta document** — only the entities this change set adds or alters are specified here. Unchanged entities keep their existing definitions in the original feature data models.

---

## 1. `CombatEvent` — two additive fields (spec 001 FR-008, Clarifications v1.4)

| Field | Type | Change | Notes |
| --- | --- | --- | --- |
| `attackerTotal` | `number` (int ≥ 0) | **ADDED** | Pre-attrition total force of the attacker: committed flow (raw pipe delivery) + any pre-existing troops they own in the cell. |
| `defenderTotal` | `number` (int ≥ 0) | **ADDED** | Pre-attrition total force of the defender: garrison (pre-flow troops of the cell's owner) + defender's committed flow. |

```ts
interface CombatEvent {
    readonly tick: number;
    readonly cell: Coord;
    readonly attacker: PlayerId;
    readonly defender: PlayerId;
    readonly attackerLoss: number;
    readonly defenderLoss: number;
    readonly winner: PlayerId | 'tie';
    readonly attackerTotal: number;   // NEW — pre-attrition attacker force
    readonly defenderTotal: number;   // NEW — pre-attrition defender force
}
```

**Constraints**: `attackerTotal ≥ 0`, `defenderTotal ≥ 0` (integer). `attackerLoss ≤ attackerTotal`, `defenderLoss ≤ defenderTotal`. In 2-way attrition: `attackerLoss === defenderLoss === min(attackerTotal, defenderTotal)`. In 3-way+: dominant retains all, losers lose all (`defenderLoss === defenderTotal`, `attackerLoss === 0`).

**Contract mirrors**: `packages/engine/src/contracts/engine-types.ts` and `specs/001-core-game-engine/contracts/engine-types.ts` change together (semantic-diff conformance test enforces). `ENGINE_API_VERSION` does not bump (additive field).

**Consumer impact**: additive — existing consumers that destructure or spread `CombatEvent` will have extra fields they don't read. The fog filter (`packages/fog`) filters by `cell` coordinates only. The console (`packages/console`) reads `attacker` for city capture display only. The networking wire protocol (`packages/networking`) passes `TickEvents` through without field-level inspection.

## 2. `committedFlowTally` — new side-channel (spec 001 FR-008, Clarifications v1.4)

| Property | Type | Layout | Notes |
| --- | --- | --- | --- |
| `committedFlowTally` | `Uint32Array` | `n * 4`, same layout as `inflowTally` | Records raw pipe flow **before** headroom clamping. Slot `(cellIdx * 4) + (playerId - 1)` is the count of troops that player's pipes would have delivered to that cell this tick, ignoring capacity constraints. |

**Population**: written by `resolveFlow` / `transfer()` in the same iteration order as `inflowTally` (row-major, N→E→S→W). For each pipe transfer:
- `moved = flowRateForDelta(elevDelta, constants)` — the raw committed flow
- `committedFlowTally[dstIdx * 4 + (srcOwner - 1)] += moved` — recorded BEFORE headroom clamping

**Consumption**: read by `resolveCombat` to compute total forces for each side.

**Difference from `inflowTally`**:
- `inflowTally` records `add = min(moved, headroom)` — actual inflow (used by `resolveDecay` for friendly-inflow exemption)
- `committedFlowTally` records `moved` — raw committed flow (used by `resolveCombat` for total-force calculation)

When a cell is at full capacity (headroom = 0): `inflowTally` = 0 for everyone (nobody flowed in), but `committedFlowTally` may be nonzero (pipes tried to deliver). This is the key distinction that enables combat to fire against full cells.

**Constraints**: `committedFlowTally[slot] ≥ 0` for all slots. Deterministic: populated in the same order as `inflowTally` (row-major, N→E→S→W). Pure: no RNG, no wall-clock.

## 3. `preFlowState` — new snapshot parameter (spec 001 FR-008, Clarifications v1.4)

| Property | Type | Notes |
| --- | --- | --- |
| `preFlowState.troopOwners` | `Uint8Array` | Snapshot of `state.troopOwners` taken **before** `resolveFlow` runs. |
| `preFlowState.troopCounts` | `Uint32Array` | Snapshot of `state.troopCounts` taken **before** `resolveFlow` runs. |

**Purpose**: `resolveFlow` overwrites `troopOwners[idx]` when new troops arrive in a cell. After flow, the cell owner may be the attacker (the last writer), not the original garrison owner. `resolveCombat` needs the pre-flow owner to correctly identify defender vs attacker.

**Capture point**: in the tick orchestrator, between Phase 3 (gun) and Phase 4 (flow):
```ts
const preFlowState = {
    troopOwners: new Uint8Array(state.troopOwners),
    troopCounts: new Uint32Array(state.troopCounts),
};
```

**Consumption by `resolveCombat`**:
- `garrisonOwner = preFlowState.troopOwners[idx]` (0 if cell was empty before flow)
- `garrisonCount = preFlowState.troopCounts[idx]` (0 if cell was empty before flow)
- If `garrisonOwner !== 0` and appears in `committedFlowTally`: that player is the **defender** (garrison owner); all other committed-flow contributors are **attackers**
- If `garrisonOwner === 0` (empty cell before flow): fall back to the existing dominant-owner model (unchanged)

**Constraints**: snapshot taken at a deterministic point in the pipeline (before Phase 4). Pure: shallow copy of typed arrays.

## 4. `resolveCombat` — new parameters (spec 001 FR-008)

```ts
function resolveCombat(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    tickNumber: number,
    inflowTally?: Readonly<Uint32Array>,
    committedFlowTally?: Readonly<Uint32Array>,   // NEW
    preFlowState?: Readonly<{                     // NEW
        troopOwners: Uint8Array;
        troopCounts: Uint32Array;
    }>,
): { state: WorldState; events: TickEvents }
```

**Backward compatibility**: both new parameters are optional. When omitted (e.g., in direct unit tests), `resolveCombat` falls back to the existing dominant-owner model (no garrison identification). This preserves backward compatibility with existing unit tests that call `resolveCombat` without the new parameters.

## 5. `resolveFlow` — new parameter

```ts
function resolveFlow(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    inflowTally?: Uint32Array,
    committedFlowTally?: Uint32Array,   // NEW
): WorldState
```

**Backward compatibility**: `committedFlowTally` is optional. When omitted, the function behaves exactly as before (no committed flow recording). This preserves backward compatibility with existing unit tests.

## 6. 2-way combat resolution (rewritten)

For a contested cell with exactly 2 owners in the committed flow tally:

1. **Identify garrison owner** from `preFlowState.troopOwners[idx]`
2. **If garrison exists** (`garrisonOwner !== 0`):
   - `defender = garrisonOwner`
   - `defenderTotal = garrisonCount + committedFlowTally[defender]`
   - `attacker = the other player in the tally`
   - `attackerTotal = committedFlowTally[attacker]`
3. **If no garrison** (`garrisonOwner === 0`):
   - Fall back to dominant-owner model (existing behavior)
   - `attackerTotal = dominant's count`, `defenderTotal = other's count`
4. **1:1 attrition**: `damage = min(attackerTotal, defenderTotal)`
5. **Attacker/defender labeling**: attacker = lower PlayerId (deterministic symmetry, unchanged)
6. **Cell's new owner**: surviving side (or 0 if both 0)
7. **CombatEvent**: includes `attackerTotal` and `defenderTotal`

## 7. 3-way+ combat resolution (unchanged in model, additive in event)

The dominant-owner model stays for 3-way+ conflicts. The `CombatEvent` for each (winner, loser) pair gains `attackerTotal` and `defenderTotal` fields (the dominant's count and the loser's count, respectively).

## 8. Worked examples (from spec Clarifications v1.4)

**Scenario A — 2 pipes vs 1 pipe, cell at capacity** (the motivating bug):

Cell has 30 troops (P2). P1 has 2 pipes (14 committed), P2 has 1 pipe (7 committed). cellCapacity = 30.

| Tick | Headroom | P1 actual inflow | P2 actual inflow | P1 committed | P2 committed | Garrison | Combat | Result |
|------|----------|-----------------|-----------------|-------------|-------------|----------|--------|--------|
| 1 | 0 | 0 | 0 | 14 | 7 | 30 (P2) | 14 vs 30 → both lose 14 | P2 = 16 |
| 2 | 14 | 14 | 0 | 14 | 7 | 16 (P2) | 14 vs 16 → both lose 14 | P2 = 2 |
| 3 | 28 | 14 | 7 | 14 | 7 | 2 (P2) | 14 vs 9 → both lose 9 | P1 = 5, P2 = 0 → **capture** |

## 9. State transitions

No new state machines. The tick pipeline order is unchanged (production → paratroop → gun → flow → combat → capture → decay → terminal). The only changes are:
- Phase 4 (flow) records an additional side-channel (`committedFlowTally`)
- Phase 5 (combat) reads the additional side-channel and a pre-flow snapshot
- Phase 7 (decay) is unchanged (reads `inflowTally` only)
