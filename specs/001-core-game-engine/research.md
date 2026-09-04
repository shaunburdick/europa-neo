# Research: Total-Force Combat Resolution (issue #51)

**Branch**: `issue-51-improved-combat` | **Date**: 2026-09-04

---

## 1. Current combat resolution (pre-fix)

The current `resolveCombat` in `packages/engine/src/resolution/combat.ts` reads the `inflowTally` to detect multi-owner cells. The tally records only **actual inflow** (what `resolveFlow` delivered after headroom clamping). When a cell is at full capacity (headroom = 0), the inflow tally is 0 for all players — combat does not fire. This is the defect described in issue #51.

The current 2-way attrition model:
- Dominant owner (highest count, tiebreak by ascending PlayerId) is identified from the inflow tally
- 1:1 attrition: `damage = min(dom.count, other.count)`
- Attacker = lower PlayerId (deterministic symmetry)
- Cell's new owner is the surviving side

This model works correctly for cells that are NOT at capacity — inflow accurately represents the attacking force. The bug is specifically when headroom is zero: the attacker sends troops but they can't enter, so the inflow is zero, so combat doesn't fire.

## 2. Flow phase architecture (`resolveFlow`)

`resolveFlow` in `packages/engine/src/resolution/flow.ts`:
- Iterates cells row-major, directions N→E→S→W
- For each pipe: computes `moved = flowRateForDelta(elevDelta, constants)`, clamps at `headroom = cap - current`, transfers `add = min(moved, headroom)`
- Overwrites `newOwners[dstIdx] = srcOwner` (last writer wins — this is why we need preFlowState)
- Writes to `inflowTally[dstIdx * 4 + (srcOwner - 1)] += add` (actual inflow only)
- Returns a new `WorldState`

Key observation: the flow phase already has access to `moved` (the raw committed flow) and `add` (the clamped actual flow). We just need to record `moved` in a separate tally.

## 3. Tick orchestrator architecture (`tick`)

The tick orchestrator in `packages/engine/src/tick.ts`:
- Phase 0: drain staged orders, sort deterministically, apply
- Phase 1: production
- Phase 2: paratroop
- Phase 3: gun
- **Phase 4: flow** — creates `inflowTally = new Uint32Array(n * PLAYERS)`, calls `resolveFlow(state, board, ENGINE_CONSTANTS, inflowTally)`
- **Phase 5: combat** — calls `resolveCombat(state, board, ENGINE_CONSTANTS, world.tick, inflowTally)`
- Phase 6: capture
- Phase 7: decay (uses `inflowTally` for friendly-inflow exemption)
- Phase 8: terminal

The change points:
- Between Phase 3 and Phase 4: capture `preFlowState.troopOwners = new Uint8Array(state.troopOwners)`
- At Phase 4: create `committedFlowTally = new Uint32Array(n * PLAYERS)`, pass to `resolveFlow`
- At Phase 5: pass `committedFlowTally` and `preFlowState` to `resolveCombat`

## 4. CombatEvent type analysis

Current `CombatEvent` in `specs/001-core-game-engine/contracts/engine-types.ts`:
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
```

Adding `attackerTotal` and `defenderTotal` is additive — existing consumers that destructure or spread `CombatEvent` will simply have extra fields they don't read. No breaking change.

**Downstream consumers**:
- `packages/fog/src/` — `filterTickEvents` filters by `cell` coordinates; does not read `attackerTotal`/`defenderTotal`
- `packages/console/src/state/build-map-view.ts` — reads `attacker` from CombatEvent for city capture display; does not read totals
- `packages/networking/` — passes `TickEvents` through the wire; does not reference CombatEvent fields directly
- `packages/engine/tests/unit/events.test.ts` — constructs `CombatEvent` literals; needs new fields added to fixture

## 5. Contract drift detection

The engine's `contracts-drift.test.ts` performs a semantic diff between:
- `packages/engine/src/contracts/engine-types.ts` (local copy)
- `specs/001-core-game-engine/contracts/engine-types.ts` (spec contract)

Both must be updated in the same commit. The test normalizes whitespace and compares — any divergence fails the suite.

## 6. Determinism guarantees

The determinism test (`tests/determinism.test.ts`) runs two independent 10k-tick scenarios and asserts byte-identical serialized worlds. The new `committedFlowTally` is populated in deterministic order (same row-major, N→E→S→W as `inflowTally`). The `preFlowState` is a snapshot at a deterministic point. The total-force computation is pure integer arithmetic. Byte-identical determinism is preserved.

## 7. Performance impact

- `committedFlowTally` = one additional `Uint32Array(n * 4)` allocation per tick (same size as `inflowTally`)
- `preFlowState.troopOwners` = one additional `Uint8Array(n)` snapshot per tick
- Combat resolver: one additional pass per contested cell to compute totals (O(1) per cell)
- Total overhead: O(n) additional typed array allocation + O(contested cells) additional computation
- Well within the SC-004 budget (< 10 ms for 32×32)

## 8. Wire protocol implications

The networking package serializes `TickEvents` which contains `CombatEvent[]`. The wire format uses JSON serialization. Adding fields to `CombatEvent` is additive — the JSON will contain the new fields, and clients that don't know about them will simply ignore them. No wire protocol version bump needed. The `ENGINE_API_VERSION` stays at `0.1.0` because the `CombatEvent` change is additive and the `EngineConstants` type is unchanged.
