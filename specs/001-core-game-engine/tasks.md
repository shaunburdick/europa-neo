# Tasks: Equal-Split Pipe Flow (issue #50)

**Branch**: `issue-50-percentage-based-flow` | **Date**: 2026-09-09 | **Spec**: 001 v1.9

---

## Wave 1: Core formula change (`@europa/core`)

The foundation — all other packages depend on this.

- [x] T-001: **Refactor `FlowConstants` interface** in `packages/core/src/flow-rate.ts`:
  - Rename `flowBase` → `flowRate` (the total outflow budget per cell per tick, default 12)
  - Remove `flowUphillCap` (stall threshold now computed from `perPipe / flowUphillStep`)
  - Update JSDoc to describe the equal-split model
  - Update `DEFAULT_FLOW_CONSTANTS` value: `flowRate: 12`, remove `flowUphillCap: 80`
  - Update `ENGINE_CONSTANTS` value: `flowRate: 12`, remove `flowUphillCap: 80`

- [x] T-002: **Refactor `flowRateForDelta` signature** in `packages/core/src/flow-rate.ts`:
  - Change from `flowRateForDelta(delta, constants)` to `flowRateForDelta(delta, perPipe, constants)`
  - The function applies the elevation gradient to `perPipe`:
    - Downhill: `perPipe + flowDownhillStep × min(|Δ|, flowSlopeDeltaCap)`
    - Flat: `perPipe`
    - Uphill: `max(0, perPipe − flowUphillStep × |Δ|)`
  - Remove the `flowUphillCap`-based stall check; stall occurs when the formula returns 0
  - Update JSDoc to describe the equal-split modifier semantics

− [x] T-003: **Add `resolveFlowAmount` function** in `packages/core/src/flow-rate.ts`:
  - Export a new function that encapsulates the per-pipe transfer amount:
    ```
    resolveFlowAmount(
      srcCount: number,    // current source troop count (from newCounts)
      numPipes: number,    // total outgoing pipes on the source cell
      pipeIndex: number,   // 0-based index of this pipe (for remaining-pipes calc)
      reserveFloor: number, // source's reserve floor (computed before call)
      delta: number,       // dstElev − srcElev
      constants: FlowConstants,
    ): number
    ```
  - Algorithm:
    ```
    perPipe = floor(flowRate / numPipes)
    remainingPipes = numPipes − pipeIndex
    available = srcCount − reserveFloor
    base = min(perPipe, floor(available / remainingPipes))
    return flowRateForDelta(delta, base, constants)
    ```
  - Pure integer arithmetic, deterministic (FR-017)
  - Update the file's top-level JSDoc to describe the equal-split model

---

## Wave 2: Engine flow resolution (`@europa/engine`)

Depends on Wave 1 — imports the new formula from `@europa/core`.

− [x] T-004: **Update `resolveFlow` in `packages/engine/src/resolution/flow.ts`**:
  - Before iterating pipe directions, compute `numPipes = popcount(mask)` and `perPipe = Math.floor(constants.flowRate / numPipes)`
  - Track `pipeIndex` (0..numPipes−1) across the N→E→S→W iteration
  - In `transfer()`, replace `flowRateForDelta(elevDelta, constants)` with `resolveFlowAmount(srcCount, numPipes, pipeIndex, reserveFloor, elevDelta, constants)` (or equivalent inline logic)
  - Remove the `flowUphillCap`-based stall check comment; stall is now formula-result-based
  - Update JSDoc to describe the equal-split model
  - **Key invariant**: `pipeIndex` must be deterministic (tied to N→E→S→W order and `mask` popcount)

− [x] T-005: **Update `transfer()` function** in `packages/engine/src/resolution/flow.ts`:
  - The `moved` variable now comes from `resolveFlowAmount` (or inline equivalent) instead of `flowRateForDelta(elevDelta, constants)`
  - The reserve floor check (`maxDeductable`) and source depletion logic remain unchanged
  - The `committed` and `deduct` calculations remain unchanged
  - Update JSDoc and inline comments to reference equal-split semantics

---

## Wave 3: Engine tests

Depends on Wave 2 — tests exercise the updated flow resolution.

− [x] T-006: **Update `TEST_CONSTANTS` in `packages/engine/tests/unit/flow.test.ts`**:
  - Replace `flowBase: 7` with `flowRate: 12`
  - Remove `flowUphillCap: 80`
  - Keep all other constants unchanged

− [x] T-007: **Rework "FR-007 gradient slope rates" test suite** in `packages/engine/tests/unit/flow.test.ts`:
  - Update all expected values for the equal-split model (single pipe, `perPipe = 12`):
    - Downhill Δ=1: `12 + 1×1 = 13`
    - Downhill Δ=5: `12 + 1×5 = 17` (capped bonus: `min(5, 5) = 5`)
    - Downhill Δ=10: `12 + 1×5 = 17` (capped at `flowSlopeDeltaCap = 5`)
    - Flat: `12` (perPipe for single pipe)
    - Uphill Δ=1: `max(0, 12 − 1) = 11`
    - Uphill Δ=6: `max(0, 12 − 6) = 6`
    - Uphill Δ=11: `max(0, 12 − 11) = 1`
    - Uphill Δ=12: `max(0, 12 − 12) = 0` (stall)
    - Uphill Δ=100: `0` (stall)
  - Update test descriptions to reference equal-split model
  - Update the "downhill > flat > uphill" ordering test with new values

− [x] T-008: **Add "equal-split" test suite** in `packages/engine/tests/unit/flow.test.ts`:
  - **2-pipe flat**: source at elevation 5, both neighbors at elevation 5. Source has 30 troops. Each pipe gets `floor(12/2) = 6`. Assert both destinations gain 6.
  - **3-pipe flat**: source with 3 outgoing pipes. Each gets `floor(12/3) = 4`.
  - **4-pipe flat**: source with 4 outgoing pipes. Each gets `floor(12/4) = 3`.
  - **Scarcity 2-pipe**: source has 5 troops, 2 pipes. Pipe 1: `min(6, floor(5/2)) = 2`. Pipe 2: `min(6, floor(3/1)) = 3`. Total = 5.
  - **Scarcity 4-pipe**: source has 10 troops, 4 pipes. Pipe 1: `min(3, floor(10/4)) = 2`. Pipe 2: `min(3, floor(8/3)) = 2`. Pipe 3: `min(3, floor(6/2)) = 3`. Pipe 4: `min(3, floor(3/1)) = 3`. Total = 10.
  - **Unequal elevation split**: 2-pipe source, one downhill Δ=−5, one flat. PerPipe = 6. Downhill pipe gets `6 + 5 = 11`. Flat pipe gets `6`. Verify both pipes receive troops.

− [x] T-009: **Add "plateau flow" test suite** in `packages/engine/tests/unit/flow.test.ts`:
  - Build a chain of 4 cells in a line (E pipe from each to the next), all at the same elevation. Seed the first cell with 30 troops.
  - Tick 1: cell 1→cell 2 transfers 12 (perPipe for single pipe). Cell 2→cell 3 transfers from cell 2's post-production count. Verify chain-tip receives full perPipe amount.
  - Run 3 ticks and verify the "plateau" pattern: each cell in the chain receives 12/tick until the source depletes.

− [x] T-010: **Update "source depletion" tests** in `packages/engine/tests/unit/flow.test.ts`:
  - Update the 4-way pipe test: with `flowRate=12` and 4 pipes, each gets `floor(12/4) = 3`. Source 30 → sends 3+3+3+3 = 12, leaving 18. Update assertions.
  - Update the reserves floor test: with `flowRate=12`, the rate is now 12 (not 12 from the old downhill). Re-derive expected values.
  - Update the multi-pipe depletion test: re-derive the N→E→S→W depletion chain with `flowRate=12`.
  - Update conservation assertions.

− [x] T-011: **Update remaining test suites** in `packages/engine/tests/unit/flow.test.ts`:
  - Update "FR-006 pipe support" tests (4-way pipe, exclusive mode)
  - Update "water-target rejection" tests (no formula change, but update comments)
  - Update "capacity clamp" tests (re-derive expected values)
  - Update "defensive branches" tests
  - Update "determinism" tests (no change needed — same input → same output)

− [x] T-012: **Update `slope-flow.test.ts`** in `packages/engine/tests/quickstart/`:
  - Update expected values: downhill Δ=−10 → `12 + 5 = 17` (capped), flat → `12`, uphill Δ=40 → `max(0, 12−40) = 0` (stall), uphill Δ=100 → `0` (stall)
  - Update the "downhill > flat > uphill" ordering assertion (17 > 12 > 0)
  - Update the explicit value assertion (derive from `flowRateForDelta` with new signature)
  - Update the stall test (Δ=100 stalls, pipe remains laid)
  - Update conservation test (total troops conserved)

---

## Wave 4: Engine test files with `TEST_CONSTANTS`

Depends on Wave 1 — these files use `FlowConstants` shape in their test constants.

− [x] T-013: **Update `packages/engine/tests/unit/combat.test.ts` TEST_CONSTANTS**:
  - Replace `flowBase: 0` with `flowRate: 0`
  - Remove `flowUphillCap: 80`
  - No other changes needed (combat tests use `flowBase: 0` to disable flow)

− [x] T-014: **Update `packages/engine/tests/unit/capture.test.ts` TEST_CONSTANTS**:
  - Replace `flowBase: 0` with `flowRate: 0`
  - Remove `flowUphillCap: 80`

− [x] T-015: **Update `packages/engine/tests/unit/decay.test.ts` TEST_CONSTANTS**:
  - Replace `flowBase: 0` with `flowRate: 0`
  - Remove `flowUphillCap: 80`

---

## Wave 5: Console mirror (`@europa/console`)

Depends on Wave 1 — mirrors the formula for rendering.

− [x] T-016: **Update `PipeSlopeConstants` in `packages/console/src/render/pipe-slope.ts`**:
  - Rename `flowBase` → `flowRate` (value 12)
  - Remove `flowUphillCap`
  - Update JSDoc

− [x] T-017: **Update `pipeFlowRate` in `packages/console/src/render/pipe-slope.ts`**:
  - Change signature to `pipeFlowRate(delta, perPipe, constants)` (mirror of `flowRateForDelta`)
  - Update formula: downhill `perPipe + step × min(|Δ|, cap)`, flat `perPipe`, uphill `max(0, perPipe − step × |Δ|)`
  - Remove `flowUphillCap`-based stall check

− [x] T-018: **Update `classifyPipeSlope` in `packages/console/src/render/pipe-slope.ts`**:
  - The stall check now calls `pipeFlowRate(delta, constants.flowRate, constants) === 0` instead of checking `delta >= flowUphillCap`
  - (Or use `delta >= perPipe` as an optimization since `perPipe = flowRate` for single-pipe classification)

− [x] T-019: **Update `pipeIntensity` in `packages/console/src/render/pipe-slope.ts`**:
  - Uphill normalization: `Math.min(delta, constants.flowRate) / constants.flowRate` (was `flowUphillCap`)
  - Downhill normalization unchanged (uses `flowSlopeDeltaCap`)

− [x] T-020: **Update `PIPE_SLOPE_CONSTANTS` in `packages/console/src/render/pipe-slope.ts`**:
  - Update values: `flowRate: 12`, remove `flowUphillCap: 80`

---

## Wave 6: Console tests

Depends on Wave 5 — tests exercise the updated console mirror.

− [x] T-021: **Update `pipe-slope.test.ts`** in `packages/console/tests/unit/render/`:
  - Update `PIPE_SLOPE_CONSTANTS` assertion (new fields)
  - Update `pipeFlowRate` expected values:
    - Downhill: `-1 → 13`, `-2 → 14`, `-3 → 15`, `-4 → 16`, `-5 → 17`, `-6 → 17` (capped)
    - Flat: `0 → 12`
    - Uphill: `1 → 11`, `6 → 6`, `11 → 1`, `12 → 0` (stall)
    - Stall: `12 → 0`, `80 → 0`, `100 → 0`
  - Update `classifyPipeSlope` tests:
    - Uphill flowing: Δ=1..11 (was Δ=1..79)
    - Stalled: Δ≥12 (was Δ≥80)
  - Update `pipeIntensity` tests:
    - Uphill normalization by `flowRate` (was `flowUphillCap`): `Δ=1 → 1/12`, `Δ=6 → 6/12`, `Δ=12 → 1.0`

− [x] T-022: **Update `pipe-intensities.test.ts`** in `packages/console/tests/unit/state/`:
  - Update the stalled pipe test case: previously stalled at Δ≥80, now stalls at Δ≥12
  - The test at line 116 uses `src elev 100, dst elev 180 → Δ=80` — this is now stalled (Δ=80 ≥ 12)
  - Verify the test still passes or update the elevation values

---

## Wave 7: Terrain package

Depends on Wave 1 — uses the formula for flow viability.

− [x] T-023: **Update `isFlowViableEdge` in `packages/terrain/src/validate.ts`**:
  - The function currently calls `flowRateForDelta(delta)` (single arg — uses default constants)
  - Update to call `flowRateForDelta(delta, ENGINE_CONSTANTS.flowRate, ENGINE_CONSTANTS)` — using `flowRate` as the single-pipe `perPipe` assumption
  - This is the most permissive assumption: single pipe → `perPipe = flowRate = 12` → stall at Δ≥12
  - Update JSDoc to explain the single-pipe assumption

− [x] T-024: **Update `reachable-land.test.ts`** in `packages/terrain/tests/integration/`:
  - Update the `isFlowViableEdge` function to use the new `flowRateForDelta` signature
  - Update comments to reference the new stall threshold (`perPipe / flowUphillStep` instead of `flowUphillCap`)
  - Run the 200-map balance suite and verify mean ≥ 0.50
  - **CRITICAL**: if the mean drops below 0.50, the single-pipe assumption may be too restrictive — investigate and report

---

## Wave 8: Contract mirrors

Depends on Wave 1 — must be updated in the same change set.

− [x] T-025: **Update `specs/001-core-game-engine/contracts/flow-rate.ts`**:
  - Update `flowRateForDelta` declaration signature to take `perPipe` parameter
  - Update `FLOW_CONSTANTS` declaration: `flowRate: 12`, remove `flowUphillCap`
  - Update JSDoc to describe equal-split model

− [x] T-026: **Update `specs/001-core-game-engine/contracts/pipe-slope.ts`**:
  - Update `PipeSlopeConstants` declaration: `flowRate: number`, remove `flowUphillCap`
  - Update `pipeFlowRate` declaration signature to take `perPipe` parameter
  - Update JSDoc

---

## Wave 9: Design tokens (comment update)

− [x] T-027: **Update `packages/design/src/tokens.ts`** comment at line 47:
  - Change `flowBase=7, flowDownhillStep=1, flowUphillStep=1, flowSlopeDeltaCap=5, flowUphillCap=80`
  - To `flowRate=12, flowDownhillStep=1, flowUphillStep=1, flowSlopeDeltaCap=5`

---

## Wave 10: Final verification

Depends on all previous waves.

− [x] T-028: **Run engine test suite**: `pnpm --filter @europa/engine test` — all tests pass
− [x] T-029: **Run terrain test suite**: `pnpm --filter @europa/terrain test` — all tests pass, reachable-land ≥ 0.50
− [x] T-030: **Run console test suite**: `pnpm --filter @europa/console test` — all tests pass
− [x] T-031: **Run full verification**: `pnpm verify` — typecheck, lint, format, all tests, build, conformance
− [x] T-032: **Verify determinism**: engine golden fixture test passes (if applicable), byte-identical re-run test in `flow.test.ts`
− [x] T-033: **Update spec 001 quickstart.md**: update any flow-rate examples or expected values in the quickstart appendix

---

## Dependency Graph

```
Wave 1 (Core):
  T-001 → T-002 → T-003

Wave 2 (Engine flow):         Wave 4 (Engine test constants):   Wave 5 (Console mirror):
  T-004 → T-005                 T-013, T-014, T-015 [P]          T-016 → T-017 → T-018 → T-019
       ↓                                                                              ↓
Wave 3 (Engine tests):                                                            T-020
  T-006 → T-007 → T-008 → T-009 → T-010 → T-011 → T-012                         ↓
       ↓                                                                     Wave 6 (Console tests):
                                                                                   T-021 → T-022
Wave 7 (Terrain):
  T-023 → T-024

Wave 8 (Contracts):           Wave 9 (Design tokens):
  T-025, T-026 [P]              T-027

                     ↓ ↓ ↓ ↓ ↓
Wave 10 (Final verification):
  T-028 → T-029 → T-030 → T-031 → T-032 → T-033
```

## Parallel-safe tasks

- **T-013, T-014, T-015**: independent `TEST_CONSTANTS` updates in different test files — can be done in parallel
- **T-025, T-026**: independent contract mirror updates — can be done in parallel
- **T-027**: independent design token comment update — can be done in parallel with Waves 5–8
- **Wave 4, Wave 5, Wave 7, Wave 8, Wave 9** are independent of each other (all depend only on Wave 1) — can be done in parallel
- **Wave 6** depends on Wave 5; **Wave 3** depends on Wave 2; **Wave 10** depends on all

---

## Estimated Effort

| Wave | Tasks | Estimated Effort |
|------|-------|-----------------|
| Wave 1: Core formula | T-001–T-003 | Medium (3 files, formula rewrite) |
| Wave 2: Engine flow | T-004–T-005 | Low (1 file, integration) |
| Wave 3: Engine tests | T-006–T-012 | High (2 test files, complete rework) |
| Wave 4: Engine test constants | T-013–T-015 | Low (3 files, mechanical rename) |
| Wave 5: Console mirror | T-016–T-020 | Medium (1 file, formula mirror) |
| Wave 6: Console tests | T-021–T-022 | Medium (2 test files) |
| Wave 7: Terrain | T-023–T-024 | Low-Medium (2 files) |
| Wave 8: Contracts | T-025–T-026 | Low (2 files, declarations) |
| Wave 9: Design tokens | T-027 | Trivial (1 comment) |
| Wave 10: Verification | T-028–T-033 | Medium (gate run) |

**Total**: ~33 tasks, primarily concentrated in Waves 1, 3, and 5.
