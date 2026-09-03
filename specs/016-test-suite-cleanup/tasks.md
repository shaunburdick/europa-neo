# Tasks: Test Suite Cleanup (Feature 016)

> Date: 2026-09-02
> Phase: 5 (Tasking)
> Spec: `specs/016-test-suite-cleanup/spec.md`
> Plan: `specs/016-test-suite-cleanup/plan.md`
> Branch: `issue-56-test-cleanup`

## Task Organization

Tasks are ordered by dependency and risk. Low-risk packages first (easy to
verify, easy to revert). Console last (largest, most complex). CI restructuring
after all removals.

Each task is a single commit. Each commit must pass `pnpm test` for the
affected package before proceeding.

---

## Wave 1: Low-Risk Packages (engine, terrain, fog)

### T001 — Engine: remove fixture test [P]
**Package**: engine
**FR**: FR-002
**Files to remove**:
- `packages/engine/tests/fixtures/board.test.ts`

**Rationale**: Fixture construction assertions overlap with engine unit tests
that use the same fixtures (`unit/combat.test.ts`, `unit/flow.test.ts`, etc.).
The fixture helpers themselves are retained — only the test file asserting their
shape is removed.

**Verification**: `pnpm --filter @europa/engine test` passes.
**Coverage check**: `pnpm --filter @europa/engine coverage` ≥ 80%.

---

### T002 — Terrain: remove redundant unit tests [P]
**Package**: terrain
**FR**: FR-002, FR-005
**Files to remove**:
- `packages/terrain/tests/unit/index.test.ts` (FR-005: re-export barrel)
- `packages/terrain/tests/unit/board-fixtures.test.ts` (FR-002: overlaps board.test.ts)
- `packages/terrain/tests/unit/seed-fixtures.test.ts` (FR-002: overlaps generate.test.ts)
- `packages/terrain/tests/unit/value-noise.test.ts` (FR-002: overlaps fbm.test.ts + elevation.test.ts)

**Rationale**: `index.test.ts` asserts module exports exist — covered by TypeScript.
Fixture test files assert fixture construction patterns that are already tested
indirectly by every unit test that uses them. `value-noise.test.ts` exercises the
same noise-generation path tested by `fbm.test.ts` and `elevation.test.ts`.

**Verification**: `pnpm --filter @europa/terrain test` passes.
**Coverage check**: `pnpm --filter @europa/terrain coverage` ≥ 80%.

---

### T003 — Fog: remove acceptance + barrel tests [P]
**Package**: fog
**FR**: FR-002, FR-005
**Files to remove**:
- `packages/fog/tests/unit/index.test.ts` (FR-005: re-export barrel)
- `packages/fog/tests/acceptance/us1-acceptance.test.ts` (FR-002: re-import + basic shape)
- `packages/fog/tests/acceptance/us2-acceptance.test.ts` (FR-002: same pattern)
- `packages/fog/tests/acceptance/us3-acceptance.test.ts` (FR-002: same pattern)
- `packages/fog/tests/unit/utils.test.ts` (FR-002: overlaps playerView.test.ts)

**Rationale**: Acceptance tests re-import modules and assert basic contract shape.
All behavioral coverage is already in quickstart tests (Q-F01 through Q-F08) and
unit tests (playerView, mask, range, visibleSet, eventsFilter). `utils.test.ts`
exercises helper functions already covered by `playerView.test.ts`.

**Verification**: `pnpm --filter @europa/fog test` passes.
**Coverage check**: `pnpm --filter @europa/fog coverage` ≥ 80%.

---

## Wave 2: Medium-Risk Packages (design, networking)

### T004 — Design: consolidate brand tests [P]
**Package**: design
**FR**: FR-002, FR-005
**Files to remove**:
- `packages/design/tests/brand/generate.test.ts` (FR-002: overlaps generated-output.test.ts)
- `packages/design/tests/brand/generator-ico.test.ts` (FR-002: overlaps ico.test.ts)
- `packages/design/tests/brand/paths.test.ts` (FR-002: overlaps drift.test.ts path assertions)
- `packages/design/tests/brand/vendor-to-docs.test.ts` (FR-002: overlaps drift.test.ts)
- `packages/design/tests/brand/inventory.test.ts` (FR-005: manifest shape, covered by other brand tests)
- `packages/design/tests/brand/package-surface.test.ts` (FR-005: re-export, covered by typecheck)

**Rationale**: Brand tests have significant overlap — `drift.test.ts` already
asserts cross-surface identity. `generate.test.ts` and `generated-output.test.ts`
test the same pipeline. `ico.test.ts` and `generator-ico.test.ts` test the same
ICO packaging. `inventory.test.ts` and `package-surface.test.ts` are re-export
checks.

**Verification**: `pnpm --filter @europa/design test` passes.
**Coverage check**: `pnpm --filter @europa/design coverage` ≥ 80%.

---

### T005 — Design: consolidate generic component tests [P]
**Package**: design
**FR**: FR-002
**Files to remove**:
- `packages/design/tests/components/generic/badge.test.ts`
- `packages/design/tests/components/generic/banner.test.ts`
- `packages/design/tests/components/generic/card.test.ts`
- `packages/design/tests/components/generic/chip.test.ts`
- `packages/design/tests/components/generic/container.test.ts`
- `packages/design/tests/components/generic/grid.test.ts`
- `packages/design/tests/components/generic/page.test.ts`
- `packages/design/tests/components/generic/plate.test.ts`
- `packages/design/tests/components/generic/stack.test.ts`
- `packages/design/tests/components/generic/typography.test.ts`
- `packages/design/tests/components/generic/waiting.test.ts`
- `packages/design/tests/components/modal.integration.test.ts`

**Files to KEEP**:
- `packages/design/tests/components/generic/button.test.ts` (form-associated — complex behavior)
- `packages/design/tests/components/generic/modal.test.ts` (focus trap — complex behavior)
- `packages/design/tests/components/conformance.test.ts` (contract enforcement)
- `packages/design/tests/components/register.test.ts` (registration guard)
- All game component tests (city-marker, elevation-swatch, fog-overlay, etc.)

**Rationale**: The 11 generic component tests follow identical patterns:
register → attach shadow → assert basic properties (tag name, shadow root exists,
attribute reflection). These are structural tests that verify web component
plumbing, not behavior. `button.test.ts` and `modal.test.ts` test complex
behavior (form association, focus trap) and are retained. `modal.integration.test.ts`
overlaps with `modal.test.ts`. The `conformance.test.ts` enforces the component
catalog contract and stays.

**Verification**: `pnpm --filter @europa/design test` passes.
**Coverage check**: `pnpm --filter @europa/design coverage` ≥ 80%.

---

### T006 — Networking: remove barrel, fixture, and redundant unit tests [P]
**Package**: networking
**FR**: FR-001, FR-002, FR-005
**Files to remove**:
- `packages/networking/tests/unit/index.test.ts` (FR-005: barrel smoke)
- `packages/networking/tests/unit/constants.test.ts` (FR-002: overlaps conformance byte-identity)
- `packages/networking/tests/unit/fixtures.conn.test.ts` (FR-002: overlaps connection.test.ts)
- `packages/networking/tests/unit/fixtures.match.test.ts` (FR-002: overlaps matchChannel.test.ts)
- `packages/networking/tests/unit/stats.test.ts` (FR-001: asserts internal stats tracking)
- `packages/networking/tests/unit/version-logging.test.ts` (FR-002: overlaps integration/version-mismatch.test.ts)
- `packages/networking/tests/unit/server-display-names.test.ts` (FR-002: overlaps server-lobby-validation.test.ts)
- `packages/networking/tests/unit/server-lobby-revisions.test.ts` (FR-002: overlaps server-lobby-reconnect.test.ts)

**Rationale**: `index.test.ts` is a pure barrel smoke test. `constants.test.ts`
asserts hardcoded values that `contracts-conformance.test.ts` already checks via
byte-identity. Fixture tests construct test doubles that are already tested by
the modules that use them. `stats.test.ts` asserts internal tracking patterns.
The remaining unit tests (server, connection, frame, orders, etc.) test distinct
behavioral contracts.

**Verification**: `pnpm --filter @europa/networking test` passes.
**Coverage check**: `pnpm --filter @europa/networking coverage` ≥ 80%.

---

## Wave 3: High-Risk Packages (matchmaking)

### T007 — Matchmaking: remove implementation-detail unit tests [P]
**Package**: matchmaking
**FR**: FR-001
**Files to remove**:
- `packages/matchmaking/tests/unit/matchmaker.lifecycleListener.test.ts`
- `packages/matchmaking/tests/unit/matchmaker.identityPassThrough.test.ts`
- `packages/matchmaking/tests/unit/matchmaker.settingsDetail.test.ts`

**Rationale**: These three files assert internal call counts and delegation
patterns. `lifecycleListener.test.ts` asserts `registerLifecycleListener` was
called exactly N times — refactoring the internal call path breaks this without
behavior change. `identityPassThrough.test.ts` asserts identity forwarding call
counts. `settingsDetail.test.ts` asserts settings forwarding. All three test
implementation wiring, not observable matchmaking outcomes.

**Verification**: `pnpm --filter @europa/matchmaking test` passes.
**Coverage check**: `pnpm --filter @europa/matchmaking coverage` ≥ 80%.

---

### T008 — Matchmaking: remove redundant unit tests [P]
**Package**: matchmaking
**FR**: FR-002
**Files to remove**:
- `packages/matchmaking/tests/unit/default-match-settings-board-size.test.ts`
- `packages/matchmaking/tests/unit/lobby.serverAuthority.test.ts`
- `packages/matchmaking/tests/unit/matchmaker.gc.test.ts`
- `packages/matchmaking/tests/unit/matchmaker.registerDisplayNames.test.ts`

**Rationale**:
- `default-match-settings-board-size.test.ts` (34 lines): single invariant
  (`DEFAULT_MATCH_SETTINGS.boardSize === 32`) already asserted in
  `board-size-defaults.test.ts` line 32.
- `lobby.serverAuthority.test.ts`: create-match authority behavior overlaps
  with `matchmaker.create.test.ts` (which tests the same FR-002/FR-003/FR-004
  requirements).
- `matchmaker.gc.test.ts`: GC behavior overlaps with quickstart
  `Q-M06-empty-match-gc.test.ts` which exercises the same lazy sweep.
- `matchmaker.registerDisplayNames.test.ts`: display name registration overlaps
  with `lobby.integration.test.ts` which tests the full stack.

**Verification**: `pnpm --filter @europa/matchmaking test` passes.
**Coverage check**: `pnpm --filter @europa/matchmaking coverage` ≥ 80%.

---

### T009 — Matchmaking: consolidate lobby tests [P]
**Package**: matchmaking
**FR**: FR-002
**Files to remove**:
- `packages/matchmaking/tests/unit/lobby.test.ts`

**Rationale**: `lobby.test.ts` covers both `projectLobbyEntry` and
`listPublicMatches`. The `listPublicMatches` portion is thoroughly superseded
by `lobby.list.test.ts` (which tests the same filtering logic with more
comprehensive edge cases). The `projectLobbyEntry` portion (5 tests) is the
only unique value. These 5 projection tests should be folded into
`lobby.list.test.ts` (which already imports `projectLobbyEntry`) as a new
`describe('projectLobbyEntry')` block.

**Action**: Move the 5 `projectLobbyEntry` tests from `lobby.test.ts` into
`lobby.list.test.ts`, then delete `lobby.test.ts`.

**Verification**: `pnpm --filter @europa/matchmaking test` passes.
**Coverage check**: `pnpm --filter @europa/matchmaking coverage` ≥ 80%.

---

## Wave 4: Console (largest package)

### T010 — Console: remove implementation-detail unit tests [P]
**Package**: console
**FR**: FR-001
**Files to remove**:
- `packages/console/tests/unit/state/order-bridge.test.ts`
- `packages/console/tests/unit/render/slope-drift.test.ts`

**Rationale**:
- `order-bridge.test.ts`: asserts internal bridge delegation call counts
  (implementation wiring detail).
- `slope-drift.test.ts`: asserts drift against internal constants — the
  behavioral test `component/render/pipe-slope.test.ts` verifies the same
  rendering through real DOM output.

**Verification**: `pnpm --filter @europa/console test:unit` passes.
**Coverage check**: console node-mode coverage ≥ 80%.

---

### T011 — Console: remove redundant unit tests [P]
**Package**: console
**FR**: FR-002
**Files to remove**:
- `packages/console/tests/unit/ui/waiting-overlay.test.ts`
- `packages/console/tests/unit/net/hello-app-version-tolerance.test.ts`
- `packages/console/tests/unit/state/awaiting-start.test.ts`
- `packages/console/tests/unit/render/visibility-filter.test.ts`
- `packages/console/tests/unit/routing/route-contract.test.ts`
- `packages/console/tests/unit/routing/semantic-route-security.test.ts`
- `packages/console/tests/unit/internal/url-security.test.ts`

**Rationale**:
- `ui/waiting-overlay.test.ts`: unit-level mock of overlay visibility, fully
  superseded by `component/ui/waiting-overlay.test.ts` (real browser render).
- `net/hello-app-version-tolerance.test.ts`: app-version tolerance tested by
  networking's `integration/hello-app-version.test.ts` (real wire protocol).
- `state/awaiting-start.test.ts`: derived flag tested by reducer tests and
  component tests.
- `render/visibility-filter.test.ts`: overlaps with component/render/cell-view
  tests that verify visibility through real rendering.
- `routing/route-contract.test.ts`: overlaps with `routing/route.test.ts` and
  `routing/semantic-route-guards.test.ts`.
- `routing/semantic-route-security.test.ts`: overlaps with
  `integration/semantic-route-security.test.ts`.
- `internal/url-security.test.ts`: overlaps with
  `integration/semantic-url-privacy.test.ts`.

**Verification**: `pnpm --filter @europa/console test:unit` passes.
**Coverage check**: console node-mode coverage ≥ 80%.

---

### T012 — Console: remove stale and re-export tests [P]
**Package**: console
**FR**: FR-005, FR-006
**Files to remove**:
- `packages/console/tests/unit/version-route.test.ts` (FR-005: re-export check)
- `packages/console/tests/unit/internal/live-runtime-fallback.test.ts` (FR-006: historical path)
- `packages/console/tests/unit/net/lobby-storage.test.ts` (FR-006: superseded by lobby runtime)

**Rationale**:
- `version-route.test.ts`: checks a route function exists — covered by
  component routing tests.
- `live-runtime-fallback.test.ts`: tests the legacy query-driven entry path
  (`?live&ws=...`) which is "historical/test-only compatibility" per AGENTS.md,
  not a production launch path.
- `lobby-storage.test.ts`: tests lobby storage mechanism superseded by the
  production lobby runtime (`src/internal/lobby-runtime.tsx`).

**Verification**: `pnpm --filter @europa/console test:unit` passes.
**Coverage check**: console node-mode coverage ≥ 80%.

---

### T013 — Console: remove redundant component tests [P]
**Package**: console
**FR**: FR-002
**Files to remove**:
- `packages/console/tests/component/ui/brand-logo-integration.test.ts`
- `packages/console/tests/component/ui/logo-responsive.test.ts`

**Rationale**:
- `brand-logo-integration.test.ts`: tests brand logo rendering that is already
  covered by `a11y/logo-accessibility.test.ts` (which verifies the logo is
  present and accessible).
- `logo-responsive.test.ts`: tests responsive logo behavior that is already
  covered by the a11y suite's semantic checks.

**Verification**: `pnpm --filter @europa/console test:component` passes.
**Coverage check**: console browser coverage ≥ 80%.

---

### T014 — Console: remove redundant e2e tests [P]
**Package**: console
**FR**: FR-002
**Files to remove**:
- `packages/console/tests/e2e/us1-acceptance.spec.ts`
- `packages/console/tests/e2e/us2-acceptance.spec.ts`
- `packages/console/tests/e2e/us3-acceptance.spec.ts`
- `packages/console/tests/e2e/us4-acceptance.spec.ts`
- `packages/console/tests/e2e/us5-acceptance.spec.ts`

**Rationale**: The US1-US5 e2e acceptance specs are Playwright-based re-imports
that verify basic page load and element presence. These scenarios are already
covered by the more comprehensive e2e specs (`full-stack.spec.ts`,
`lobby.spec.ts`, `routing.spec.ts`, `waiting-overlay.spec.ts`). The a11y
acceptance tests (`a11y/us1-acceptance.test.ts` through `us5-acceptance.test.ts`)
are retained — they test WCAG compliance, not basic page load.

**Verification**: `pnpm --filter @europa/console test:e2e` passes.
**Coverage check**: console coverage ≥ 80%.

---

### T015 — Console: remove redundant a11y tests [P]
**Package**: console
**FR**: FR-002
**Files to remove**:
- `packages/console/tests/a11y/us1-acceptance.test.ts`
- `packages/console/tests/a11y/us2-acceptance.test.ts`
- `packages/console/tests/a11y/us3-acceptance.test.ts`
- `packages/console/tests/a11y/us4-acceptance.test.ts`
- `packages/console/tests/a11y/us5-acceptance.test.ts`

**Rationale**: The US1-US5 a11y acceptance tests are axe-core scans of
individual pages/routes. These are already covered by the more focused a11y
tests (`lobby-keyboard.test.ts`, `logo-accessibility.test.ts`,
`profile-view.test.ts`, `semantic-route-a11y.test.ts`,
`shadow-traversal.test.ts`, `waiting-overlay.test.ts`) which test specific
accessibility concerns with more targeted assertions. The broad US-acceptance
scans provide diminishing returns.

**IMPORTANT**: Before removing, verify that the retained a11y tests cover all
WCAG 2.2 AA concerns. If any specific concern is only covered by a removed
US-acceptance test, fold that assertion into the appropriate retained test.

**Verification**: `pnpm --filter @europa/console test:a11y` passes.
**Coverage check**: console coverage ≥ 80%.

---

## Wave 5: CI Restructuring

### T016 — Restructure client-ci.yml into three parallel jobs
**File**: `.github/workflows/client-ci.yml`

**Changes**:

1. **Rename `console-test` → `console-test` (node-only)**:
   - Remove: Playwright install, component, a11y, e2e, perf, conformance steps
   - Keep: build deps, build console, unit tests, determinism, parity, keepalive,
     lobby-integration
   - Set `timeout-minutes: 3`

2. **Add `console-e2e` job**:
   - Build deps + build console
   - Cache Playwright + install Chromium
   - Run: component, a11y, e2e, perf
   - Run: `build:lib` + contract-conformance
   - Set `timeout-minutes: 6`

3. **Modify `console-coverage`**:
   - Set `timeout-minutes: 6` (down from 10)
   - Keep existing structure (build deps → build console → build:lib →
     Playwright install → coverage)

**Verification**: All three jobs pass on the branch.
**AC-005**: `console-test` job completes in < 4 minutes.
**AC-006**: `console-test` timeout = 4 minutes (spec says 4, we target 3 for
headroom — either is acceptable per AC-006).

---

## Wave 6: Final Verification

### T017 — Run full verification suite
**Action**: Run the complete project verification suite locally before push:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- All package tests (engine, terrain, fog, networking, matchmaking, console, design, version)
- Browser-mode tests
- E2E tests
- Coverage for all game-logic packages

**Verification**: All checks pass. Zero failures.

---

### T018 — Document before/after comparison
**Action**: Record before/after metrics for the PR description:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total test files | 319 | (measured) | (calculated) |
| Total test cases | ~2,021 | (measured) | (calculated) |
| Console test files | 107 | (measured) | (calculated) |
| Console coverage | (record) | (record) | — |
| Engine coverage | (record) | (record) | — |
| Terrain coverage | (record) | (record) | — |
| Fog coverage | (record) | (record) | — |
| Networking coverage | (record) | (record) | — |
| Matchmaking coverage | (record) | (record) | — |
| CI console-test time | ~4m17s | (measured) | — |

---

## Task Dependency Graph

```
T001 (engine) ─────┐
T002 (terrain) ────┤
T003 (fog) ────────┤
                   ├──→ T017 (full verification) ──→ T018 (document)
T004 (design-brand)┤
T005 (design-gener)┤
T006 (networking) ─┤
T007 (match-impl) ─┤
T008 (match-redund)┤
T009 (match-lobby) ┤
T010 (console-impl)┤
T011 (console-redund)
T012 (console-stale)
T013 (console-comp)┤
T014 (console-e2e) ┤
T015 (console-a11y)┤
T016 (CI restruct) ┘
```

Tasks T001–T015 are independent and can be executed in any order (or parallel).
T016 depends on T010–T015 (console removals must land before CI restructuring
to avoid broken steps). T017 depends on all prior tasks. T018 depends on T017.

## Parallel Execution Waves

| Wave | Tasks | Parallel-safe? |
|------|-------|---------------|
| 1 | T001, T002, T003 | Yes — different packages |
| 2 | T004, T005, T006 | Yes — different packages |
| 3 | T007, T008, T009 | Yes — same package but different files |
| 4 | T010, T011, T012, T013, T014, T015 | Yes — different test categories |
| 5 | T016 | Sequential — depends on Wave 4 |
| 6 | T017, T018 | Sequential — final verification |
