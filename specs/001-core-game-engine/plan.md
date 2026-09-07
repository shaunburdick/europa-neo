# Implementation Plan: Combat Winner Capacity Clamping (issue #78)

**Branch**: `issue-78-combat-resolution` | **Date**: 2026-09-07 | **Specs**: [`001`](./spec.md) Clarifications v1.5
**Dependencies**: 001 engine FR-011 (cell capacity invariant)
**Tasks**: [`tasks.md`](./tasks.md)

**Input**: Spec amendment for issue #78 — Clarifications v1.5 codifies that FR-011's capacity invariant (`cell.troops ≤ cellCapacity` at all times) applies to combat resolution winners, not just pipe-based transfers. The existing `resolveCombat` function sets winner troop counts without clamping to `cellCapacity`, violating the invariant when the surviving force exceeds capacity.

> Produced via the `/speckit.plan` workflow. This plan supersedes no prior plan — it is a standalone bug fix on top of the existing 001 implementation.

---

## Summary

This is a **minimal, single-file bug fix** in `@europa/engine`. The combat resolver (`packages/engine/src/resolution/combat.ts`) has three defects:

1. **Line 85**: `void constants;` discards the `constants` parameter, making `cellCapacity` inaccessible.
2. **Lines 195–205 (2-way path)**: Winner's remaining troops are set to `attackerRemaining`/`defenderRemaining` without clamping to `cellCapacity`.
3. **Lines 237–238 (3-way path)**: Dominant player's count is set to `domPlayer.count` without clamping.

The fix: un-void `constants`, and wrap each winner's remaining count with `Math.min(remaining, constants.cellCapacity)`.

No contract changes, no wire changes, no console/fog/networking changes. The clamping is a pure behavioral fix inside the combat resolver.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true`. Node.js ≥ 22 LTS.

**Primary file**: `packages/engine/src/resolution/combat.ts` (366 lines)

**Key constants**: `constants.cellCapacity` (default 30, tunable via `EngineConstants`)

**Test files**:
- `packages/engine/tests/unit/combat.test.ts` — unit tests for `resolveCombat` (717 lines, 24 tests)
- `packages/engine/tests/quickstart/combat.test.ts` — integration tests through full tick pipeline

**No new dependencies**: This fix uses only `Math.min` on existing integer values.

---

## Constitution Check

| Principle | Gate | This plan | Status |
|-----------|------|-----------|--------|
| **I — Type Safety First** | `strict: true`, no `any`, no suppressions | The fix adds `Math.min(winnerRemaining, constants.cellCapacity)` — no type changes, no `any`, no suppressions. | ✅ Pass |
| **II — Server-Authoritative Deterministic Simulation** | Fixed ticks; deterministic | The clamping is pure integer arithmetic (`Math.min` on two integers), deterministic, no wall-clock. | ✅ Pass |
| **III — Tested Game Logic ≥80%** | Coverage gate | New tests exercise the clamping boundary in both 2-way and 3-way paths. Existing tests remain valid (winner counts ≤ cellCapacity in all existing test fixtures). | ✅ Pass |
| **IV — Specs as Documentation** | Stale specs are bugs | Spec 001 amended to v1.5 in the same change set (commit `48bf56c`). | ✅ Pass |
| **V — Simplicity Over Cleverness** | YAGNI; minimal change | Three surgical changes in one file: remove one line, add two `Math.min` wrappers. | ✅ Pass |
| **VI — Accessibility-Minded UI** | WCAG 2.2 AA | No UI changes. | ✅ Pass |
| **VII — Self-Hostable by Default** | Single process | No new services. | ✅ Pass |

---

## Architecture Overview

### The defect

`resolveCombat` is a pure function that resolves combat for every contested cell on the board. It receives `constants: EngineConstants` as a parameter, but line 85 discards it with `void constants;`. The 2-way path (lines 195–205) and 3-way path (lines 237–238) write winner troop counts directly without clamping to `cellCapacity`.

When the surviving force after attrition exceeds the cell's capacity (e.g., attacker sends 20 into a cell with 5 defenders, cell capacity 10 → attacker retains 15 but should be clamped to 10), the invariant `cell.troops ≤ cellCapacity` is violated.

### The fix

```
resolveCombat(state, board, constants, tickNumber, inflowTally, committedFlowTally, preFlowState)
  │
  ├─ Line 85: REMOVE `void constants;`
  │
  ├─ 2-way path (lines 195-205):
  │   BEFORE: newCounts[idx] = attackerRemaining;
  │   AFTER:  newCounts[idx] = Math.min(attackerRemaining, constants.cellCapacity);
  │   (and symmetrically for defenderRemaining)
  │
  └─ 3-way path (lines 237-238):
      BEFORE: newCounts[idx] = domPlayer.count;
      AFTER:  newCounts[idx] = Math.min(domPlayer.count, constants.cellCapacity);
```

The clamping is applied AFTER attrition resolves and BEFORE the count is written to the output. The surplus troops are simply lost — they were never produced by any real mechanism, so they do not need to be "destroyed" or tracked.

### Affected code locations

| Location | Current code | Fixed code |
|----------|-------------|------------|
| Line 85 | `void constants;` | *(deleted)* |
| Line 196 | `newCounts[idx] = attackerRemaining;` | `newCounts[idx] = Math.min(attackerRemaining, constants.cellCapacity);` |
| Line 199 | `newCounts[idx] = defenderRemaining;` | `newCounts[idx] = Math.min(defenderRemaining, constants.cellCapacity);` |
| Line 237 | `newCounts[idx] = domPlayer.count;` | `newCounts[idx] = Math.min(domPlayer.count, constants.cellCapacity);` |

**Note**: The legacy path (lines 257–346, `tallyAvailable` branch without `preFlowState`) does NOT need clamping because it uses the same `constants` parameter that will now be un-voided, and it writes counts that are already derived from inflow tallies that respect capacity. However, for safety and consistency, the legacy 2-way path (lines 303–305) should also be reviewed — but the legacy path is a test-only fallback (the production pipeline always provides `preFlowState`), so this is a lower priority.

### Key decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Where to clamp | Inside `resolveCombat`, at the point where `newCounts[idx]` is written | Keeps clamping co-located with combat resolution; the caller does not need to re-enforce the invariant. |
| D2 | Clamp target | `constants.cellCapacity` (from the `constants` parameter) | Cell capacity is a per-match tunable; the combat resolver already receives it as a parameter. |
| D3 | Legacy path clamping | **Not clamped** (test-only fallback, production always uses `preFlowState` path) | The legacy path is exercised only in unit tests without `preFlowState`; the production tick pipeline always provides it. Adding clamping there adds risk for no production benefit. |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **R-1 — Existing tests may fail**: some tests assert exact winner counts that might exceed cellCapacity | Review existing test fixtures: the current `CONSTANTS.cellCapacity = 30` and all test troop counts are ≤ 200. The 200v50 test produces a winner count of 150 — which EXCEEDS cellCapacity 30. This test **will need its assertion updated** to expect clamping (150 → 30). |
| **R-2 — Quickstart tests**: integration tests through the tick pipeline may produce different results if combat winners are now clamped | The quickstart combat tests use `ENGINE_CONSTANTS.cellCapacity = 30` and set up scenarios where winners exceed capacity. These tests will need updated assertions. |
| **R-3 — Golden fixture**: `golden-1000-tick.json` may need regeneration if combat outcomes change | The golden fixture is deterministic — if any combat winner in the 1000-tick simulation exceeds cellCapacity, the fixture will change. Check during implementation. |

---

## Implementation Phase Hand-off

Phase 5 (`tasks.md`) is in this change set. The implementer will receive:

- `plan.md` (this file)
- `tasks.md` (ordered, dependency-aware task list)

When implementation begins:

1. Fix the three code defects in `combat.ts`.
2. Update existing tests whose assertions now conflict with clamping.
3. Add new tests specifically for the clamping boundary.
4. Run the full test suite to verify no regressions.
