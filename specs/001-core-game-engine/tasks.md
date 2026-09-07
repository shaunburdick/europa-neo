# Tasks: Combat Winner Capacity Clamping (issue #78)

**Branch**: `issue-78-combat-resolution` | **Date**: 2026-09-07 | **Spec**: 001 v1.5

---

## Wave 1: Fix the defect in combat.ts

- [ ] T-001: Remove `void constants;` on line 85 of `packages/engine/src/resolution/combat.ts` so the `constants` parameter is accessible for `cellCapacity`
- [ ] T-002: In the 2-way combat path (lines 195–205), clamp the winner's remaining troops to `Math.min(remaining, constants.cellCapacity)` — apply to both `attackerRemaining` (line 196) and `defenderRemaining` (line 199) branches
- [ ] T-003: In the 3-way combat path (line 237), clamp the dominant player's count to `Math.min(domPlayer.count, constants.cellCapacity)`

## Wave 2: Update existing tests

- [ ] T-004: Review `packages/engine/tests/unit/combat.test.ts` — the `200v50` test (line 139) asserts `troopCounts[idx] === 150` but `cellCapacity = 30`, so after clamping the expected value becomes 30. Update this assertion and the corresponding `1v100` test (line 381) which asserts 99 (≤ 30, no change needed). Update any other tests where the winner's remaining exceeds `cellCapacity`.
- [ ] T-005: Review `packages/engine/tests/quickstart/combat.test.ts` — check if any assertions on combat outcome troop counts are affected by clamping. Update as needed.

## Wave 3: Add clamping-specific tests

- [ ] T-006: Add unit test: 2-way combat where winner remaining equals `cellCapacity` exactly — no clamping occurs (boundary: remaining === capacity)
- [ ] T-007: Add unit test: 2-way combat where winner remaining is `cellCapacity + 1` — clamped to `cellCapacity` (boundary: remaining = capacity + 1)
- [ ] T-008: Add unit test: 3-way combat where dominant player's count exceeds `cellCapacity` — clamped to `cellCapacity`
- [ ] T-009: Add unit test: 2-way combat where winner remaining is `cellCapacity - 1` — no clamping occurs (boundary: remaining = capacity − 1)

## Wave 4: Final verification

- [ ] T-010: Run full engine test suite: `pnpm --filter @europa/engine test`
- [ ] T-011: Run typecheck: `pnpm --filter @europa/engine typecheck`
- [ ] T-012: Run lint + format: `pnpm --filter @europa/engine lint` + `pnpm --filter @europa/engine format:check`
- [ ] T-013: If golden fixture changed, regenerate `tests/fixtures/golden-1000-tick.json` and verify determinism test passes

---

## Dependency Graph

```
T-001 → T-002 → T-003 (fix the defect)
                    ↓
T-004 → T-005 (update existing tests)
                    ↓
T-006 → T-007 → T-008 → T-009 (new clamping tests)
                            ↓
T-010 → T-011 → T-012 → T-013 (final gate)
```

## Parallel-safe tasks

- T-006, T-007, T-008, T-009 are independent of each other (different boundary conditions) — can be written in any order after T-004/T-005
- T-010, T-011, T-012 are independent of each other — can run in parallel

## Acceptance criteria mapping

| AC | Description | Tasks |
|----|-------------|-------|
| AC-9 | After combat, every cell satisfies `cell.troops ≤ cellCapacity` | T-001..T-003 (fix), T-006..T-009 (verify) |
| AC-10 | Existing tests pass (with updates); new tests exercise clamping boundary | T-004..T-005 (update), T-006..T-009 (new), T-010 (gate) |
