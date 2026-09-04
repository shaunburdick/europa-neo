# Tasks: Total-Force Combat Resolution (issue #51)

**Branch**: `issue-51-improved-combat` | **Date**: 2026-09-04 | **Spec**: 001 v1.4

---

## Wave 1: Contract Mirrors (blocks all downstream)

- [ ] T-001: Update `CombatEvent` in `specs/001-core-game-engine/contracts/engine-types.ts` — add `attackerTotal: number` and `defenderTotal: number` fields with JSDoc
- [ ] T-002: Copy updated spec contract to `packages/engine/src/contracts/engine-types.ts` (byte-identical per conformance test)
- [ ] T-003: Verify contract drift test passes (`pnpm --filter @europa/engine test -- --run contracts-drift`)

## Wave 2: Committed Flow Tally (flow phase)

- [ ] T-004: Add `committedFlowTally: Uint32Array` parameter (required, not optional) to `resolveFlow` signature in `packages/engine/src/resolution/flow.ts` — update JSDoc
- [ ] T-005: Update `TransferParams` interface to include `committedTally: Uint32Array | null`
- [ ] T-006: In `transfer()`, record `committedTally[dstIdx * 4 + (srcOwner - 1)] += moved` BEFORE headroom clamping (after the `moved === 0` early return, before the `current >= cap` early return)
- [ ] T-007: Wire `committedFlowTally` through from `resolveFlow` to `transfer()` (same pattern as `tally`/`inflowTally`)
- [ ] T-008: Write unit tests for `committedFlowTally` recording — verify it records raw `moved` values, not clamped `add` values (cell at capacity → inflowTally = 0, committedFlowTally = moved)

## Wave 3: Tick Orchestrator (pre-flow snapshot + wiring)

- [ ] T-009: In `packages/engine/src/tick.ts`, capture `preFlowState` between Phase 3 (gun) and Phase 4 (flow): `const preFlowState = { troopOwners: new Uint8Array(state.troopOwners), troopCounts: new Uint32Array(state.troopCounts) };`
- [ ] T-010: Create `committedFlowTally = new Uint32Array(n * PLAYERS)` alongside `inflowTally` in Phase 4
- [ ] T-011: Pass `committedFlowTally` to `resolveFlow(state, world.board, ENGINE_CONSTANTS, inflowTally, committedFlowTally)`
- [ ] T-012: Pass `committedFlowTally` and `preFlowState` to `resolveCombat(state, world.board, ENGINE_CONSTANTS, world.tick, inflowTally, committedFlowTally, preFlowState)`

## Wave 4: Combat Resolver (total-force logic)

- [ ] T-013: Update `resolveCombat` signature — add `committedFlowTally: Readonly<Uint32Array>` and `preFlowState: Readonly<{ troopOwners: Uint8Array; troopCounts: Uint32Array }>` parameters (required, not optional)
- [ ] T-014: Update `resolveCombat` JSDoc to document the new parameters and total-force semantics
- [ ] T-015: In the 2-way branch: extract `garrisonOwner` and `garrisonCount` from `preFlowState`; if garrison exists, identify defender = garrison owner, compute `defenderTotal = garrisonCount + committedFlowTally[defender]`, compute `attackerTotal = committedFlowTally[attacker]`; if no garrison, fall back to existing dominant-owner model
- [ ] T-016: Add `attackerTotal` and `defenderTotal` to all `CombatEvent` object literals in `resolveCombat` (2-way and 3-way branches)
- [ ] T-017: Update the 3-way branch to include `attackerTotal`/`defenderTotal` in emitted events

## Wave 5: Events Fixture + Test Updates

- [ ] T-018: Update `packages/engine/tests/unit/events.test.ts` `COMBAT` fixture — add `attackerTotal: 10` and `defenderTotal: 10` (or appropriate values matching the fixture's semantics)
- [ ] T-019: Update existing combat unit tests (`packages/engine/tests/unit/combat.test.ts`) — add `attackerTotal`/`defenderTotal` assertions to existing 2-way tests (100v100, 200v50, 1v100, 1v1)

## Wave 6: New Tests (garrison-vs-inflow model)

- [ ] T-020: Write unit test: cell at capacity with zero headroom — committed flow fires combat (AC-1). Set up state with 30 P2 troops, P1 pipe delivers 14 committed, headroom 0 → combat fires with attackerTotal=14, defenderTotal=30
- [ ] T-021: Write unit test: multi-tick attrition progression matches Scenario A from the spec (AC-2). Run 3 ticks with the exact numbers from the worked example, verify intermediate states
- [ ] T-022: Write unit test: garrison-only vs inflow-only — combat compares attacker's inflow vs defender's garrison (AC-3). Cell has 20 P2 troops, P1 sends 15 via pipe → attackerTotal=15, defenderTotal=20
- [ ] T-023: Write unit test: garrison + inflow from both sides — garrison owner is defender (AC-4). Cell has 10 P1 troops (garrison), P1 has 1 pipe (7 committed), P2 has 1 pipe (7 committed) → defenderTotal=10+7=17, attackerTotal=7
- [ ] T-024: Write unit test: empty cell with simultaneous inflow — unchanged dominant-owner behavior (AC-5). Both P1 and P2 pipe into empty cell → falls back to dominant-owner model, attackerTotal/defenderTotal reflect the dominant/other counts
- [ ] T-025: Write unit test: CombatEvent payloads include attackerTotal and defenderTotal with correct values (AC-6). Assert exact values on emitted events
- [ ] T-026: Write determinism test: same input × 1000 calls → byte-identical output including new fields (AC-7). Verify determinism is preserved with the new tallies

## Wave 7: Quickstart + Integration

- [ ] T-027: Update quickstart combat test (`packages/engine/tests/quickstart/combat.test.ts`) — add assertions for `attackerTotal`/`defenderTotal` in CombatEvent payloads where combat fires
- [ ] T-028: Run engine determinism test (`packages/engine/tests/determinism.test.ts`) — verify 10k-tick byte-identical output still passes (may need golden fixture regeneration)

## Wave 8: Final Gate

- [ ] T-029: Run full engine test suite: `pnpm --filter @europa/engine test`
- [ ] T-030: Run typecheck: `pnpm --filter @europa/engine typecheck`
- [ ] T-031: Run lint + format: `pnpm --filter @europa/engine lint` + `pnpm --filter @europa/engine format:check`
- [ ] T-032: Run contract drift test: `pnpm --filter @europa/engine test -- --run contracts-drift`
- [ ] T-033: Run coverage check: verify ≥80% on every metric for engine package
- [ ] T-034: If golden fixture changed, regenerate `tests/fixtures/golden-1000-tick.json` and verify determinism test passes with the new fixture

---

## Dependency Graph

```
T-001 → T-002 → T-003 (contract mirrors)
                ↓
T-004 → T-005 → T-006 → T-007 → T-008 (flow phase)
                ↓
T-009 → T-010 → T-011 → T-012 (tick orchestrator)
                                ↓
T-013 → T-014 → T-015 → T-016 → T-017 (combat resolver)
                                        ↓
T-018 → T-019 (test fixture updates)
            ↓
T-020 → T-021 → T-022 → T-023 → T-024 → T-025 → T-026 (new tests)
                                                    ↓
T-027 → T-028 (quickstart + determinism)
            ↓
T-029 → T-030 → T-031 → T-032 → T-033 → T-034 (final gate)
```

## Parallel-safe tasks

- T-001 and T-004 are independent (contract mirror + flow parameter) — can start in parallel
- T-018 and T-020 are independent (fixture update + new test) — can start in parallel after T-017
