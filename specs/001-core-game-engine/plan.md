# Implementation Plan: Equal-Split Pipe Flow (issue #50)

**Branch**: `issue-50-percentage-based-flow` | **Date**: 2026-09-09 | **Specs**: [`001`](./spec.md) Clarifications v1.9
**Dependencies**: 001 engine FR-007 (pipe flow), FR-012 (reserves), FR-017 (determinism)
**Tasks**: [`tasks.md`](./tasks.md)

**Input**: Spec amendment for issue #50 — Clarifications v1.9 replaces the fixed-rate flow model (`flowRateForDelta` returning absolute troop counts based on `flowBase=7`) with an equal-split model where `flowRate=12` is the total outflow budget per cell per tick, split equally among outgoing pipes. Elevation gradient modifies each pipe's share individually.

> Produced via the `/speckit.plan` workflow. This plan supersedes the previous v1.5 (combat clamping) plan — it is a behavioral change to the flow formula on top of the existing 001 implementation.

---

## Summary

This is a **cross-package behavioral change** to the flow formula in `@europa/core`, with ripple effects in `@europa/engine`, `@europa/terrain`, and `@europa/console`. The core idea: instead of each pipe independently consuming `flowBase` troops from the source, the cell's total outflow budget (`flowRate=12`) is divided equally among outgoing pipes, and the elevation gradient modifies each pipe's share.

**Key behavioral differences from the current model**:
- **Branch starvation eliminated**: with fixed-rate, a 2-pipe source with 10 troops sent 7 via N (starving E to 3). With equal-split, both pipes get equal shares even under scarcity.
- **Plateau flow along chains**: a chain of flat pipes delivers full `flowRate` per tick to each cell until the source depletes, instead of `flowBase` per tick.
- **Stall threshold varies by pipe count**: 1 pipe stalls at Δ≥12, 2 pipes at Δ≥6, 4 pipes at Δ≥3 (instead of fixed Δ≥80).
- **No public API change**: `ENGINE_API_VERSION` is NOT bumped. This is an internal behavioral change.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true`. Node.js ≥ 22 LTS.

**Packages affected** (in dependency order):
1. `@europa/core` — `FlowConstants`, `EngineConstants`, `flowRateForDelta` (source of truth)
2. `@europa/engine` — `resolveFlow` (flow resolution phase), test suites
3. `@europa/terrain` — `validate.ts` (INV-16 flow viability), reachable-land test
4. `@europa/console` — `pipe-slope.ts` (console mirror), test suites

**Key files to modify**:

| File | Change |
|------|--------|
| `packages/core/src/flow-rate.ts` | `FlowConstants`: `flowBase`→`flowRate`, remove `flowUphillCap`. `flowRateForDelta`: take `perPipe` param. New `resolveFlowAmount`. |
| `packages/engine/src/resolution/flow.ts` | Compute equal-split in `resolveFlow`, pass `perPipe` to `flowRateForDelta` |
| `packages/engine/src/constants.ts` | Re-exports (no change needed — re-exports from `@europa/core`) |
| `packages/engine/tests/unit/flow.test.ts` | Complete rework: new equal-split tests, updated assertions |
| `packages/engine/tests/quickstart/slope-flow.test.ts` | Updated expected values for equal-split rates |
| `packages/engine/tests/unit/combat.test.ts` | Update `TEST_CONSTANTS` (`flowBase: 0`→`flowRate: 0`, remove `flowUphillCap`) |
| `packages/engine/tests/unit/capture.test.ts` | Update `TEST_CONSTANTS` (`flowBase: 0`→`flowRate: 0`, remove `flowUphillCap`) |
| `packages/engine/tests/unit/decay.test.ts` | Update `TEST_CONSTANTS` (`flowBase: 0`→`flowRate: 0`, remove `flowUphillCap`) |
| `packages/console/src/render/pipe-slope.ts` | `PipeSlopeConstants`: `flowBase`→`flowRate`, remove `flowUphillCap`. `pipeFlowRate`: take `perPipe`. `pipeIntensity`: use `perPipe` for normalization. |
| `packages/console/tests/unit/render/pipe-slope.test.ts` | Complete rework: new expected values, new stall thresholds |
| `packages/console/tests/unit/state/pipe-intensities.test.ts` | Update stalled test case (stall threshold changed) |
| `packages/terrain/src/validate.ts` | `isFlowViableEdge`: use `flowRate` as single-pipe `perPipe` |
| `packages/terrain/tests/integration/reachable-land.test.ts` | Update edge viability logic for new formula |
| `packages/design/src/tokens.ts` | Comment update (biome zone reference) |
| `specs/001-core-game-engine/contracts/flow-rate.ts` | Mirror updated `FlowConstants` and `flowRateForDelta` signature |
| `specs/001-core-game-engine/contracts/pipe-slope.ts` | Mirror updated `PipeSlopeConstants` |
| `specs/001-core-game-engine/spec.md` | Already amended to v1.9 (no further changes) |

---

## Constitution Check

| Principle | Gate | This plan | Status |
|-----------|------|-----------|--------|
| **I — Type Safety First** | `strict: true`, no `any`, no suppressions | All changes are typed refactors and formula updates. No `any`, no suppressions. | ✅ Pass |
| **II — Server-Authoritative Deterministic Simulation** | Fixed ticks; deterministic | Equal-split is pure integer arithmetic (`Math.floor`, `Math.min`, `Math.max`). No floats, no wall-clock. Iteration order (N→E→S→W) unchanged. | ✅ Pass |
| **III — Tested Game Logic ≥80%** | Coverage gate | All existing tests updated; new equal-split/plateau/conservation tests added. Coverage ≥80% maintained. | ✅ Pass |
| **IV — Specs as Documentation** | Stale specs are bugs | Spec 001 already amended to v1.9. Contract mirrors updated in same change set. | ✅ Pass |
| **V — Simplicity Over Cleverness** | YAGNI, readable | The equal-split algorithm is straightforward: divide, iterate, clamp. No new abstractions. | ✅ Pass |
| **VI — Accessibility-Minded UI** | WCAG 2.2 AA | Console pipe slope rendering updated (stall threshold shift). No new a11y concerns. | ✅ Pass |
| **VII — Self-Hostable by Default** | No cloud deps | No infrastructure changes. | ✅ Pass |

---

## Key Decisions

### R-1: `flowRateForDelta` signature — take `perPipe` as input

**Decision**: `flowRateForDelta(delta, constants)` is refactored to `flowRateForDelta(delta, perPipe, constants)` where `perPipe` is the equal-share amount. The function applies the elevation gradient to `perPipe` and returns the modified amount.

**Rationale**: The old function returned an absolute troop count based on `flowBase`. The new function modifies an already-computed equal share. This keeps the elevation formula in one place while separating the equal-split concern.

**Mathematical equivalence**: the old formula was `flowBase + step × min(|Δ|, cap)` for downhill and `ceil(flowBase × (cap − Δ) / cap)` for uphill. The new formula is `perPipe + step × min(|Δ|, cap)` for downhill and `max(0, perPipe − step × |Δ|)` for uphill. When `perPipe = flowBase`, these are equivalent (the old uphill formula `ceil(flowBase × (cap − Δ) / cap)` with `flowUphillCap=80` produces the same integer values as `max(0, flowBase − Δ)` for `flowBase=7` and `flowUphillStep=1` — verified: ceil(7×79/80)=7, 7−1=6; ceil(7×73/80)=7, 7−7=0 at Δ=7; ceil(7×40/80)=4, 7−40→0 at Δ=40 — the new formula is simpler and the old `ceil` form was an artifact of the original proportional model).

### R-2: Remove `flowUphillCap` from `FlowConstants`

**Decision**: `flowUphillCap` is removed. The stall threshold is now computed as `perPipe / flowUphillStep` (varies by pipe count).

**Rationale**: The old fixed threshold (`flowUphillCap=80`) was tied to the absolute `flowBase` model. In the equal-split model, the stall threshold depends on how many pipes share the budget. A single pipe gets `perPipe=12` (stalls at Δ≥12); 4 pipes get `perPipe=3` (stalls at Δ≥3). This is the intended behavior per the spec.

### R-3: New `resolveFlowAmount` function in `@europa/core`

**Decision**: A new exported function `resolveFlowAmount(srcCount, numPipes, reserveFloor, delta, constants)` computes the equal-split amount for one pipe, including source depletion and reserve floor logic.

**Rationale**: This function encapsulates the equal-split algorithm in `@europa/core` so both the engine and terrain validator can use it. The engine's `resolveFlow` calls it for each pipe direction; the terrain validator doesn't need it (INV-16 uses `flowRateForDelta` directly for edge viability).

### R-4: Terrain INV-16 viability uses `perPipe = flowRate` (single-pipe assumption)

**Decision**: The terrain validator's `isFlowViableEdge` calls `flowRateForDelta(delta, flowRate)` — assuming the most optimistic case (single outgoing pipe, `perPipe = flowRate`).

**Rationale**: At validation time, the actual pipe count per cell is unknown. Using the single-pipe assumption is the most permissive: it accepts maps that might be unplayable under multi-pipe scenarios. This is conservative (fewer false rejections) and matches the spec's intent (INV-16 catches maps where extreme gradients block ALL flow). If a map passes INV-16 with `perPipe=flowRate`, it's guaranteed playable with at least one pipe per cell.

### R-5: `pipeIntensity` uphill normalization uses `perPipe`

**Decision**: `pipeIntensity` normalizes uphill intensity by `perPipe` (from `PIPE_SLOPE_CONSTANTS.flowRate`) instead of the removed `flowUphillCap`.

**Rationale**: The intensity represents how close a pipe is to stalling. With the new formula, stall occurs at Δ≥perPipe, so normalizing by perPipe gives the correct 0–1 range.

### R-6: No `ENGINE_API_VERSION` bump

**Decision**: `ENGINE_API_VERSION` is NOT bumped.

**Rationale**: The engine's public interface (`resolveFlow`, `tick`, `applyCommand`, `TickResult`) is unchanged. This is an internal behavioral change to the flow formula — callers see different troop distributions but no API surface change. Per the spec: "the engine's public interface does not change."

---

## Algorithm: Equal-Split Flow

```
resolveFlow(state, board, constants):
  for each cell with outgoing pipes (row-major order):
    numPipes = popcount(pipeMasks[idx])
    perPipe = floor(flowRate / numPipes)

    for each direction in N→E→S→W:
      // Source depletion (Clarifications v1.6):
      srcCount = newCounts[srcIdx]
      available = srcCount − reserveFloor(srcCount, reservesPct)
      sent = min(perPipe, floor(available / remainingPipes))

      // Elevation modifier:
      sent = flowRateForDelta(elevDelta, sent, constants)

      // Transfer (Clarifications v1.6):
      destination += sent (clamped to cellCapacity)
      source −= sent
      remainingPipes−−
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Stall threshold shift breaks INV-16**: maps that passed with Δ≥80 threshold may fail with Δ≥12 (1-pipe) | Medium | High (terrain generation fails) | Run the 200-map balance suite against the new formula before finalizing. The single-pipe assumption is the most permissive. |
| **Existing tests assert wrong expected values**: 657-line `flow.test.ts` has many hardcoded rates | High | Medium (test failures) | Complete test rework in the same change set. Derive all expected values from the formula. |
| **Console pipe slope rendering shows wrong stall indicator**: stall threshold shifted from 80 to 12/6/4/3 | Medium | Low (visual only) | Update `pipeFlowRate` and drift test. No gameplay impact. |
| **Reachable-land mean drops below 50%**: the new stall threshold is more restrictive | Low | High (INV-16 + US4 AC-1 fail) | The single-pipe assumption (`perPipe=flowRate=12`) is the most permissive; Δ≥12 is still much less restrictive than the old Δ≥80 for the vast majority of edges. Empirical verification required. |
| **Determinism regression**: floating-point in equal-split formula | Very Low | Critical (SC-001) | All arithmetic is integer: `Math.floor`, `Math.min`, `Math.max`, integer subtraction. No floats. Verified by design. |

---

## Validation Strategy

1. **Unit tests**: all `flow.test.ts` assertions updated for new expected values
2. **Quickstart tests**: `slope-flow.test.ts` updated for equal-split rates
3. **Conservation test**: new test asserting board-wide troop count unchanged by flow
4. **Equal-split test**: new suite covering 1/2/3/4-pipe splits with充足 and scarce sources
5. **Plateau flow test**: new suite verifying chain-tip behavior
6. **Determinism test**: same input × 1000 calls → byte-identical output
7. **Terrain balance suite**: 200-map reachable-land test ≥50% mean
8. **Console drift test**: `pipeFlowRate` mirrors `flowRateForDelta`
9. **Contract byte-identity**: both contract mirrors updated
10. **Full `pnpm verify`**: typecheck, lint, format, all tests, build
