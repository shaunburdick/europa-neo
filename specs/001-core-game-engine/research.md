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

Current `CombatEvent` in `packages/engine/src/contracts/engine-types.ts`:
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

There is no drift test: `specs/001-core-game-engine/contracts/engine-types.ts` no longer exists on disk, and the old `contracts-drift.test.ts` that diffed it against the package copy is gone (Gate-2 finding 8d). The package contracts in `packages/engine/src/contracts/` are the single source of truth — see `contracts/README.md` — so there is only one surface to update.

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

---

## 9. v1.16 amendment research — serialization terrain + paratroop attack (2026-10-11, issues #136/#132)

Delta section; see `plan.md` for the full plan. All findings verified against the working tree.

### 9.1 Terrain encoding

- **Elevation is provably a `uint8`**: `createWorld` enforces `[0, 255]` (`packages/engine/src/create.ts:106-110`, `MAX_ELEVATION = 255` at `:42`); the terrain pipeline normalizes fbm output to `[0,255]` (`packages/terrain/src/fbm.ts:95-96`) and validates it (INV-3, `packages/terrain/src/validate.ts:14`). One byte suffices; encode rejects anything else rather than truncating (FR-026).
- **Terrain is not derivable from elevation**: water classification thresholds the lowest-elevation cells and splits ties at the threshold elevation by sorted-index order to hit the exact water count (`packages/terrain/src/water.ts:31-42, 65-66`). Both an `elevation` byte and a `terrainFlag` byte are therefore required per cell.
- **Append-not-interleave**: the pre-v2 cell record is 8 bytes (`serialize.ts:563-571`, `cellsBlockLen = n * 8` at `:498` as surveyed before this change set); appending the two bytes keeps every existing field's offset, so offset-based decode tests remain valid with a helper update only.
- **Version split**: `SERIALIZE_FORMAT_VERSION` (`serialize.ts:120`, 1 before this change set → 2 by it) is the layout guard; `ENGINE_API_VERSION` (`packages/core/src/types.ts:43`, `'0.2.0'`) is the public-surface guard. The module's own doc (`serialize.ts:10-24`) exists for exactly this case — layout change without API change → bump the format byte only.

### 9.2 Hash/fixture impact

`hashWorld` is FNV-1a over the serialized bytes (`serialize.ts` module doc §Hash), so any payload change alters every hash. Audit of pinned hashes: `packages/engine/tests/fixtures/sample-2p-match.json` (`finalStateHash: "0aafe88f"`, line 26) plus two more literal occurrences of the same value — the README example (`packages/engine/README.md:160`) and the quickstart Q-014 expect-line (`quickstart.md:483`); **no test consumes the fixture** (Gate-2 finding 8a — `tests/replay/replay.test.ts` computes hashes at runtime). The regeneration path exists and was read: `packages/engine/scripts/update.ts` replays a fixture from seed + terrain settings and rewrites `finalStateHash` in place.

### 9.3 Paratroop enemy-landing resolution point

- Resolution stays in `resolveParatroop` (Phase 2). Verified that same-tick composition with flow combat works because the Phase 5 pre-flow snapshot is captured after Phase 2/3 (`packages/engine/src/tick.ts:221-226`, combat at `:234-248`).
- Sequential same-target landings are deterministic: orders are sorted once (`tick.ts:133`) and `resolveParatroop` applies them in sequence against its own accumulated `newCounts` (`paratroop.ts:96-201`).
- `appliedOrders` semantics (Gate-1 finding 6): `tick.ts:214-219` admits a deferred order into `appliedOrders` iff its index is in `successfulParatroopIndices`; `resolveParatroop` records success for every order that reaches the apply step (`paratroop.ts:200`) — combat outcome is irrelevant, so a losing landing is an applied order by construction. Verified; now stated in FR-013 and pinned by a test.
- City interaction: Phase 6 capture transfers a city only when the post-landing occupant is non-neutral and differs from the city owner (`capture.ts:69-93`, neutral never captures `:76-78`) — the N=G annihilation case correctly leaves the city put.

### 9.4 Shared-attrition extraction feasibility

The two-way attrition core (`combat.ts:209-240`) depends only on four numbers (`attackerTotal`, `defenderTotal`, `cellCapacity`) and two owner bytes; roles-agnostic extraction is behavior-preserving for both call sites. The event-payload labelling (lower owner byte, `combat.ts:212-214`) and role identification (garrison-is-defender, `:189-207`) both stay at the flow-combat call site — the helper carries neither convention (spec v1.4 is authoritative for roles; Gate-1 finding 7).
