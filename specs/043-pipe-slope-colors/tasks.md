# Tasks: Pipe Slope Colors (Issue #43)

**Input**: Plan from `specs/043-pipe-slope-colors/plan.md`. Existing implementation from issue #30 (slope color-coding, pipe-slope.ts mirror, canvas drawPipes). Bug: CSS pipe rendering ignores slope.

**Output**: Pipes render slope-colored in both CSS and Canvas paths; intensity encoded as size/thickness; spec + manual updated.

---

## Phase 1 — Data Model (foundation)

- [x] T-001: Add `pipeIntensities: ReadonlyMap<Direction, number>` to `CellRenderInfo` in BOTH contract mirrors (`packages/console/contracts/console-types.ts` and `specs/005-client-console/contracts/console-types.ts`) with JSDoc citing issue #43. Run contract conformance test to confirm byte-identity.

- [x] T-002: Add `pipeIntensity(srcElev, dstElev, slope, constants)` function to `packages/console/src/render/pipe-slope.ts`. Pure function: downhill = `min(|Δ|, flowSlopeDeltaCap) / flowSlopeDeltaCap`; uphill = `min(Δ, flowBase / flowSlopeStep) / (flowBase / flowSlopeStep)`; flat/stalled/fog = 0. Doc comment citing issue #43.

- [x] T-003: [P] Write unit tests for `pipeIntensity` in `packages/console/tests/unit/render/pipe-slope.test.ts`: downhill Δ=0→1→5 (saturates at cap), uphill Δ=0→1→7 (saturates at stall), flat=0, stalled=0, fog=0, boundary values. All integer arithmetic verified.

## Phase 2 — Build Map View (wire intensity into render info)

- [x] T-004: In `packages/console/src/state/build-map-view.ts`, inside the existing pipe-slope computation loop (line ~198), also compute and store intensity via `pipeIntensity()`. Add the new `pipeIntensities` field to the spread. Verify the `pipeIntensities` map is populated for cells with pipes and empty for cells without.

- [x] T-005: [P] Add/update build-map-view tests to verify `pipeIntensities` is populated correctly: downhill/intensity>0, flat/intensity=0, uphill/intensity>0, stalled/intensity=0, fog/intensity=0.

## Phase 3 — CSS Rendering (fix the bug + add intensity)

- [x] T-006: Update `packages/console/src/render/cell-view.tsx` to pass `data-slope` and `data-intensity` attributes on each `<span className="europa-pipe …">`. Read slope from `info.pipeSlopes.get(direction) ?? 'flat'` and intensity from `info.pipeIntensities.get(direction) ?? 0`. Format intensity to 2 decimal places for CSS consumption.

- [x] T-007: Rewrite pipe CSS rules in `packages/console/src/styles/index.css` (lines 93–129):
  - Add `data-slope` attribute selectors mapping to `--europa-pipe-color` custom property using the existing `--europa-color-pipe-*` design tokens
  - Replace all `var(--europa-color-accent)` references with `var(--europa-pipe-color)`
  - Add intensity-based sizing: `--europa-pipe-tri` scales from 2.4px (40% base) at intensity=0 to 6px (100% base) at intensity=1 via `calc(2.4px + var(--pipe-intensity, 1) * 3.6px)`
  - Fix N/S/E/W size consistency: all directions use `--europa-pipe-tri` for the triangle half-width (currently N/S use `--europa-radii-plate` for height — unify)
  - Stalled pipes: fixed 6px size, no intensity scaling

- [x] T-008: [P] Write/update component tests in `packages/console/tests/component/render/pipe-slope.test.tsx` to verify:
  - DOM pipe spans have `data-slope="downhill"` / `"flat"` / `"uphill"` / `"stalled"` attributes
  - DOM pipe spans have `data-intensity` attributes with correct values
  - Canvas still paints correct slope colors (existing tests should pass unchanged)

## Phase 4 — Canvas Rendering (intensity scaling)

- [x] T-009: Update `packages/console/src/render/canvas.ts` `drawPipes` method: scale triangle size by intensity `(0.4 + intensity * 0.6)` where intensity is read from `info.pipeIntensities.get(direction) ?? 0`. Stalled pipes remain full size with hollow stroke (existing behavior). Add JSDoc noting intensity-based sizing.

- [x] T-010: [P] Update canvas component tests to verify triangle size variation: a pipe with intensity=1 should produce larger triangles than intensity=0.5 (pixel area comparison or vertex coordinate comparison).

## Phase 5 — Web Component (intensity prop)

- [x] T-011: Update `packages/design/src/components/game/pipe-slope.ts`:
  - Add `'intensity'` to `observedAttributes`
  - Parse `intensity` attribute as float (0–1), default 1
  - Scale triangle border-widths: `16 * (0.4 + intensity * 0.6)` for bottom, `12 * (0.4 + intensity * 0.6)` for sides
  - Update `aria-label` to include "light" / "moderate" / "strong" intensity description when intensity < 1
  - Keep existing color logic unchanged

- [x] T-012: [P] Update web component tests for `EuropaPipeSlope` to verify:
  - Default intensity = full size (backward compatible)
  - intensity="0.5" produces smaller triangle than intensity="1"
  - intensity="0" produces minimum-size triangle
  - stalled direction ignores intensity (always full size)

## Phase 6 — Spec + Manual Update

- [x] T-013: Amend spec 005 (`specs/005-client-console/spec.md`):
  - Add Clarifications v1.3 section documenting the intensity enhancement
  - Update FR-013 to include intensity encoding (size/thickness scales with normalized 0–1 intensity; stalled pipes fixed size)
  - Note: the prior "no intensity scaling" rationale (v1.2) is superseded by this decision

- [x] T-014: Update `docs/manual/pipes.md` to document:
  - Intensity is shown as triangle size (bigger = stronger slope)
  - Downhill intensity range (Δ=1 small → Δ≥5 max)
  - Uphill intensity range (Δ=1 small → Δ≥7 max = stall)
  - Stalled pipes are fixed size (hollow on canvas, gray in DOM)

- [x] T-015: Update `docs/manual/numbers.md` to add intensity constants row (pipeIntensity formula reference, min 40%, max 100%).

## Phase 7 — Verification + Polish

- [x] T-016: Run full verification suite: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, all package tests, browser-mode tests, E2E tests. Fix any regressions.

- [x] T-017: Update `specs/043-pipe-slope-colors/quickstart.md` with validation results mapping tasks to green tests.

- [x] T-018: Update AGENTS.md Current state section with issue #43 progress. Commit all changes with conventional commit message.
