# Data Model: Total-Force Combat Resolution (issue #51)

**Branch**: `issue-51-improved-combat` | **Date**: 2026-09-04 | **Specs**: 001 v1.4

> **Delta document** — only the entities this change set adds or alters are specified here. Unchanged entities keep their existing definitions in the original feature data models. Later amendments append further delta sections: §10–§11 (2026-10-11, spec 001 v1.16, issues #136/#132).

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

**Contract surface**: `packages/engine/src/contracts/engine-types.ts` — the ONLY contract surface (`contracts/README.md`); there is no spec-directory mirror and no semantic-diff conformance test (Gate-2 finding 8d). `ENGINE_API_VERSION` does not bump (additive field).

**Consumer impact**: additive — existing consumers that destructure or spread `CombatEvent` will have extra fields they don't read. The fog filter (`packages/fog`) filters by `cell` coordinates only. The console (`packages/console`) reads `attacker` for city capture display only. The networking wire protocol (`packages/networking`) passes `TickEvents` through without field-level inspection.

## 2. `committedFlowTally` — new side-channel (spec 001 FR-008, Clarifications v1.4)

| Property | Type | Layout | Notes |
| --- | --- | --- | --- |
| `committedFlowTally` | `Uint32Array` | `n * 4`, same layout as `inflowTally` | Records raw pipe flow **before** headroom clamping. Slot `(cellIdx * 4) + (playerId - 1)` is the count of troops that player's pipes would have delivered to that cell this tick, ignoring capacity constraints. |

**Population**: written by `resolveFlow` / `transfer()` in the same iteration order as `inflowTally` (row-major, N→E→S→W). For each pipe transfer (Clarifications v1.6 — transfer, not copy):
 - `moved = flowRateForDelta(elevDelta, constants)` — the raw gradient rate
 - `committed = min(moved, currentSourceCount − reserveFloor)` — capped by source availability (source depletion + FR-012 reserves floor)
 - `committedFlowTally[dstIdx * 4 + (srcOwner - 1)] += committed` — recorded BEFORE headroom clamping

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
5. **Attacker/defender labeling**: the `CombatEvent` payload's `attacker`/`defender` fields are assigned by lower owner byte (deterministic payload symmetry) — a labeling convention only; the combat roles in steps 1–3 are unchanged (garrison owner is the defender)
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

## 10. Serialized wire format v2 (spec 001 FR-024..FR-026, Clarifications v1.16 — issue #136, 2026-10-11)

`SERIALIZE_FORMAT_VERSION` bumps **1 → 2**. The payload gains 2 bytes per cell (`elevation`, `terrainFlag`); everything else keeps its position. `ENGINE_API_VERSION` (`@europa/core`, `0.2.0`) is unchanged — the public TypeScript surface does not change, and the layout version exists for exactly this case.

### Payload layout (v2)

```
- version header : 2 magic bytes (0x00 0x00) + 1 length byte + N ASCII chars of ENGINE_API_VERSION
- 1 byte  : payload format version (must equal SERIALIZE_FORMAT_VERSION = 2)
- 1 byte  : board size (>= MIN_BOARD_SIZE=8, <= 255)
- 1 byte  : player count (2..4)
- 4 bytes : tick number (uint32 LE)
- 4 bytes : seed (uint32 LE)
- 4 bytes : tick interval ms (uint32 LE)
- 1 byte  : visibility radius
- 16 bytes: rng state[0..3] (uint32 LE each)
- 1 byte  : ID table count (must equal player count)
- per-ID  : 1 byte length (12) + ASCII ID bytes, canonical strict-ascending UTF-16 order
- per-slot: 1 byte table index (permutation of 0..N-1; placement-slot order)
- per-player record: table index, status, citiesOwned, troopsHeld (uint32 LE),
             displayName length + ASCII bytes (canonical registry order)
- 2 bytes : city count (uint16 LE)
- per-city record: x (u8), y (u8), owner placement slot (u8, 1-based)
- n*n cells, 10 bytes each:
    4 bytes : troopCounts (uint32 LE)
    1 byte  : troopOwners (0..playerCount)
    1 byte  : pipeMasks (<= 0x0f)
    1 byte  : reservesPct (0..9)
    1 byte  : cityOwners (0..playerCount)
    1 byte  : elevation (0..255)            // NEW in v2
    1 byte  : terrainFlag (0 = land, 1 = water, >1 rejected)  // NEW in v2
- (end; trailing bytes rejected)
```

### Decode behavior change (FR-026)

`deserializeWorld` reconstructs `board.cells[i].elevation` and `.terrain` from the payload instead of fabricating an all-land, elevation-0 placeholder board. A deserialized `World` is fully self-contained: tickable, water-impassable, elevation-gradient flow intact, and `hashWorld`-identical to the source. Encode rejects elevation outside `0..255` and unknown terrain values with `EngineSerializationError`.

### Consumer impact

- `hashWorld` output changes (payload bytes change): regenerate `finalStateHash` in `packages/engine/tests/fixtures/sample-2p-match.json` (replay CLI `update` path) in the same change set.
- Payload grows 2 bytes/cell (32×32: 8 KiB → 10 KiB). No golden serialized-byte fixtures exist.
- Hand-built payload helpers in `packages/engine/tests/unit/serialize.test.ts` extend the cell record from 8 to 10 bytes.
- The TypeScript signatures of `serializeWorld`/`deserializeWorld`/`hashWorld` are unchanged; `contracts/engine-api.ts` needs documentation-comment updates only.

## 11. Paratroop landing resolution (spec 001 FR-013 v1.16, FR-008 interaction — issue #132, 2026-10-11)

### Shared two-way attrition helper (new module)

The 1:1 attrition core of `resolveCombat`'s two-way path is extracted into one pure helper used by both the combat phase and the paratroop enemy-landing branch, so attrition math, winner determination, and FR-011/v1.5 capacity clamping exist in exactly one place:

```ts
// packages/engine/src/resolution/attrition.ts (planned)
interface AttritionInput {
    attackerOwner: number;  // 1-based dense owner byte
    attackerTotal: number;  // int >= 0
    defenderOwner: number;  // 1-based dense owner byte
    defenderTotal: number;  // int >= 0
    cellCapacity: number;   // ENGINE_CONSTANTS.cellCapacity (default 30)
}
interface AttritionOutcome {
    winnerOwner: number;    // surviving owner byte; 0 = mutual annihilation (tie)
    winnerCount: number;    // clamped to cellCapacity (FR-011, v1.5)
    damage: number;         // min(attackerTotal, defenderTotal)
}
function resolveTwoWayAttrition(input: AttritionInput): AttritionOutcome;
```

`resolveCombat` behavior is unchanged by the extraction (regression-covered by the existing combat suite).

### Landing state transitions (tick Phase 2, sequential in deterministic sorted order)

For each valid paratroop order (source pays `2N`, `N = ENGINE_CONSTANTS.paratroopCost`, default 10), the target cell transitions by its state at that moment:

| Target state | Count change | Owner change | Pipes | Events |
| --- | --- | --- | --- | --- |
| Water / out-of-bounds | — (rejected at validation, cost not spent) | — | — | `errors` |
| Empty/neutral (`troopOwners = 0`) | `+N`, clamp to capacity | written (landing player) | cleared | none |
| Same owner | `+N`, clamp to capacity | unchanged | cleared | none |
| Enemy garrison `G`, `N > G` | count = `min(N − G, cellCapacity)` | written (landing player) | cleared | `CombatEvent(N vs G)` |
| Enemy garrison `G`, `G > N` | count = `G − N` | **unchanged** (no `newOwners` write) | cleared | `CombatEvent(N vs G)` |
| Enemy garrison `G`, `N = G` | count = 0 | 0 (mutual annihilation) | cleared | `CombatEvent(N vs G)`, `winner: 'tie'` |

- `CombatEvent` fields: `attacker` = landing player, `defender` = garrison owner, `attackerTotal = N`, `defenderTotal = G`, `attackerLoss = defenderLoss = min(N, G)`, `winner` per the shared model.
- City cells are not a special case: capture stays in Phase 6 (FR-005) and transfers the city only when the post-landing occupant differs from the city owner.
- Every resolved landing — including a lost attack (`G > N`, owner unchanged) or a mutual annihilation — is a successfully executed order and appears in `TickEvents.appliedOrders` (FR-023); only validation rejections (water, out-of-bounds, range, source ownership, insufficient source troops) land in `errors`.
- Same-tick composition with FR-008 is unchanged: the Phase 5 pre-flow snapshot is taken after Phase 2/3, so a landing's outcome is part of that cell's garrison when pipe combat resolves.
- `tick.ts` merges the paratroop phase's `CombatEvent`s into `TickEvents.combat` (same pattern as the combat/capture phases).
