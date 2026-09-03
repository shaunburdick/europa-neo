# Research: Test Suite Cleanup (Feature 016)

> Date: 2026-09-02
> Phase: 4 (Planning)

## Current Test Landscape

### File Counts by Package (baseline)

| Package      | Files | Test Cases | Subdirectories                                      |
| ------------ | ----- | ---------- | --------------------------------------------------- |
| console      | 107   | ~431       | unit(54), component(22), a11y(11), e2e(11), integration(9) |
| matchmaking  | 51    | ~392       | unit(37), quickstart(9), integration(2), root(3)    |
| networking   | 39    | ~229       | unit(27), integration(11), root(1)                  |
| design       | 40    | ~255       | brand(14), components(23), root(3)                  |
| terrain      | 31    | ~266       | unit(19), integration(11), root(1)                  |
| engine       | 26    | ~301       | unit(15), quickstart(9), fixtures(1), root(1)       |
| fog          | 23    | ~110       | unit(7), quickstart(8), acceptance(3), root(5)      |
| version      | 2     | ~37        | unit(1), integration(1)                             |
| **Total**    | **319** | **~2,021** |                                                     |

### Snapshot Tests

No snapshot tests exist anywhere in the repo. The `__screenshots__/` directories
in the console are debug artifacts from Vitest Browser Mode, already gitignored.
FR-003 is a no-op.

## Test Pattern Analysis

### Patterns Identified Across Packages

**1. Barrel surface smoke tests (FR-005 candidates)**
- `networking/tests/unit/index.test.ts`: asserts `typeof encodeFrame === 'function'`
  for 15+ exports, checks constant values. Already covered by TypeScript module
  resolution + conformance typecheck.
- `fog/tests/unit/index.test.ts`: same pattern — re-import + typeof checks.
- `fog/tests/acceptance/us1-acceptance.test.ts` through `us3-acceptance.test.ts`:
  acceptance tests that re-import modules and assert basic contract shape.
- `networking/tests/unit/constants.test.ts`: asserts hardcoded values match
  constants object — partially useful as drift guard but partially redundant
  with the conformance test.

**2. Implementation-detail tests (FR-001 candidates)**
- `matchmaking/tests/unit/matchmaker.lifecycleListener.test.ts`: asserts
  `registerLifecycleListener` was called exactly N times — refactoring the
  internal call path breaks this without behavior change.
- `matchmaking/tests/unit/matchmaker.identityPassThrough.test.ts`: asserts
  internal identity-passthrough call counts.
- `console/tests/unit/state/order-bridge.test.ts`: asserts internal bridge
  delegation call counts.
- `matchmaking/tests/unit/matchmaker.settingsDetail.test.ts`: asserts internal
  settings-detail forwarding.

**3. Redundant overlap (FR-002 candidates)**
- `matchmaking/tests/unit/board-size-defaults.test.ts` (163 lines) and
  `matchmaking/tests/unit/default-match-settings-board-size.test.ts` (34 lines):
  the latter tests a SINGLE value (`DEFAULT_MATCH_SETTINGS.boardSize === 32`)
  that is already asserted in the former. The 34-line file is pure redundancy.
- `matchmaking/tests/unit/lobby.list.test.ts` and
  `matchmaking/tests/unit/lobby.test.ts`: both test `listPublicMatches`
  filtering logic — `lobby.list.test.ts` is a thorough rewrite that supersedes
  `lobby.test.ts` (which also covers `projectLobbyEntry` but with less depth).
  `lobby.test.ts`'s `listPublicMatches` tests are redundant with
  `lobby.list.test.ts`.
- `console/tests/unit/render/slope-drift.test.ts` and
  `console/tests/unit/render/pipe-slope.test.ts`: both test pipe-slope
  rendering constants; `slope-drift.test.ts` is a focused drift guard while
  `pipe-slope.test.ts` is the behavioral test.
- `matchmaking/tests/unit/lobby.serverAuthority.test.ts` and
  `matchmaking/tests/unit/matchmaker.create.test.ts`: overlap on the
  create-match server-authority behavior.

**4. Type-level / compile-time tests (FR-004 candidates)**
- `fog/tests/conformance.test.ts`: partially compile-time mutual-assignability
  assertions (lines 25-28, the `import type` blocks) — these are enforced by
  `pnpm typecheck` already. The byte-identity portion is valuable and stays.
- `design/tests/components/conformance.test.ts`: same pattern — type-level
  component surface conformance.
- `networking/tests/contracts-conformance.test.ts`: contract byte-identity
  tests — valuable, keep.

**5. Quickstart tests that merely verify module exports (FR-005 candidates)**
- No pure re-export-only quickstart tests found. All quickstart tests exercise
  real behavioral scenarios (create+join, combat, fog visibility, etc.). These
  are high-value and should be retained per FR-009.

## CI Structure Analysis

### Current `client-ci.yml` Structure

Three jobs:
1. `console-lint` (2 min timeout): typecheck + lint + format + design guards
2. `console-test` (10 min timeout): ALL console tests sequentially — unit →
   Playwright install → component → a11y → e2e → perf → determinism → parity
   → keepalive → lobby-integration → conformance
3. `console-coverage` (10 min timeout): merged node+browser coverage gate

### FR-020 Target: Three Parallel Console Jobs

The coverage job already re-runs ALL tests (node project + browser project) for
merged coverage. The `console-test` job runs a SUBSET (excludes perf from node,
includes perf from browser separately). Key observation:

- `console-test` runs: unit, component, a11y, e2e, perf, determinism, parity,
  keepalive, lobby-integration, conformance (10 steps after build)
- `console-coverage` runs: ALL of the above merged (node + browser projects)
  with coverage collection

The coverage job effectively duplicates the test job. After test reduction, we
split into three independent jobs as spec'd.

### Playwright Cache Effectiveness

The cache key is `playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`.
This is effective — Playwright browsers only change when the lockfile changes.
The cache restore saves ~30-60s of Chromium download on cache hits. No change
needed (FR-019 is verification only).

## Coverage Preservation Risk Assessment

### High-risk packages (constitution gate applies directly):
- **Engine**: 26 files, ~301 cases. Already lean. Conservative removal only.
  Remove `fixtures/board.test.ts` (overlaps with unit/board patterns in terrain
  and engine unit tests).
- **Terrain**: 31 files, ~266 cases. Remove `unit/index.test.ts` (re-exports),
  `unit/board-fixtures.test.ts` (fixture assertions), `unit/seed-fixtures.test.ts`
  (fixture assertions). Keep all integration tests.
- **Fog**: 23 files, ~110 cases. Remove acceptance tests (US1-US3 are re-exports),
  `conformance.test.ts` type-level portion. Keep all unit + quickstart behavioral
  tests.
- **Networking**: 39 files, ~229 cases. Remove `unit/index.test.ts` (barrel),
  merge fixture tests, remove redundant unit tests that overlap integration.
- **Matchmaking**: 51 files, ~392 cases. Most opportunity for reduction.
  Remove ~15-18 unit files, consolidate lobby tests, remove redundant board-size
  test.

### Medium-risk packages:
- **Console**: 107 files, ~431 cases. Remove ~40+ files. Focus on unit tests
  that duplicate component/E2E coverage, redundant state tests, and stale paths.
- **Design**: 40 files, ~255 cases. Consolidate brand tests (14 → ~7), trim
  generic component tests to essential behavior.

### Low-risk packages:
- **Version**: 2 files, ~37 cases. Already minimal. No removal.

## Removal Candidates — Detailed List

### Console (target: 107 → ~64 files, -40%)

**FR-001 (implementation detail):**
- `unit/state/order-bridge.test.ts` — asserts internal bridge delegation counts
- `unit/render/slope-drift.test.ts` — asserts drift against internal constants
  (superseded by `component/render/pipe-slope.test.ts` behavioral test)

**FR-002 (redundant):**
- `unit/ui/waiting-overlay.test.ts` — duplicates `component/ui/waiting-overlay.test.ts`
  (unit-level mock vs real browser render of same behavior)
- `unit/net/hello-app-version-tolerance.test.ts` — overlaps with networking's
  `integration/hello-app-version.test.ts`
- `unit/state/awaiting-start.test.ts` — small file testing a derived flag that the
  reducer tests and component tests already exercise
- `unit/render/visibility-filter.test.ts` — overlaps with component/render cell-view
  tests that verify visibility through real rendering
- `unit/routing/route-contract.test.ts` — overlaps with `routing/route.test.ts`
  and `routing/semantic-route-guards.test.ts`
- `unit/routing/semantic-route-security.test.ts` — overlaps with
  `integration/semantic-route-security.test.ts`
- `unit/internal/url-security.test.ts` — overlaps with
  `integration/semantic-url-privacy.test.ts`

**FR-004 (type-level):**
- None identified — console tests have runtime assertions.

**FR-005 (re-export):**
- `unit/version-route.test.ts` — checks a route function exists + basic shape,
  already covered by component routing tests

**FR-006 (stale):**
- `unit/internal/live-runtime-fallback.test.ts` — tests the legacy query-driven
  entry path that is historical/test-only compatibility per AGENTS.md
- `unit/net/lobby-storage.test.ts` — tests lobby storage mechanism that was
  superseded by the production lobby runtime

### Matchmaking (target: 51 → ~33 files, -35%)

**FR-001 (implementation detail):**
- `unit/matchmaker.lifecycleListener.test.ts` — asserts `registerLifecycleListener`
  call counts (internal wiring detail)
- `unit/matchmaker.identityPassThrough.test.ts` — asserts internal identity
  passthrough delegation counts
- `unit/matchmaker.settingsDetail.test.ts` — asserts internal settings forwarding

**FR-002 (redundant):**
- `unit/default-match-settings-board-size.test.ts` — single invariant already
  asserted in `board-size-defaults.test.ts`
- `unit/lobby.test.ts` — `listPublicMatches` portion superseded by
  `lobby.list.test.ts`; `projectLobbyEntry` portion is the only unique value
  (keep projection tests in a trimmed form or fold into `lobby.list.test.ts`)
- `unit/lobby.serverAuthority.test.ts` — create-match authority tests overlap
  with `matchmaker.create.test.ts`
- `unit/matchmaker.gc.test.ts` — GC tests overlap with quickstart `Q-M06-empty-match-gc.test.ts`
  (the quickstart exercises the same lazy sweep behavior end-to-end)

**FR-004 (type-level):**
- None identified.

**FR-005 (re-export):**
- None identified — quickstart tests all exercise real behavior.

**FR-006 (stale):**
- None identified.

### Networking (target: 39 → ~25 files, -36%)

**FR-001 (implementation detail):**
- `unit/stats.test.ts` — asserts internal stats tracking call patterns

**FR-002 (redundant):**
- `unit/index.test.ts` — barrel surface smoke (FR-005 + FR-002 overlap)
- `unit/constants.test.ts` — constant value assertions already covered by
  `contracts-conformance.test.ts` byte-identity check
- `unit/fixtures.conn.test.ts` — fixture construction overlaps with
  `unit/connection.test.ts`
- `unit/fixtures.match.test.ts` — fixture construction overlaps with
  `unit/matchChannel.test.ts`
- `unit/version-logging.test.ts` — version logging tests overlap with
  `integration/version-mismatch.test.ts`
- `unit/server-display-names.test.ts` — display names tested in
  `integration/server-close.test.ts` and `server-lobby-validation.test.ts`
- `unit/server-lobby-revisions.test.ts` — revisions tested in
  `server-lobby-reconnect.test.ts`

**FR-004 (type-level):**
- None identified.

**FR-005 (re-export):**
- `unit/index.test.ts` — pure barrel smoke test.

**FR-006 (stale):**
- None identified.

### Fog (target: 23 → ~16 files, -30%)

**FR-001 (implementation detail):**
- None identified — fog tests are behavioral.

**FR-002 (redundant):**
- `acceptance/us1-acceptance.test.ts` through `us3-acceptance.test.ts` —
  acceptance tests that re-import modules and assert basic contract shape;
  all behavioral coverage already in quickstart + unit tests
- `unit/utils.test.ts` — utility function tests overlap with unit/playerView.test.ts

**FR-004 (type-level):**
- `conformance.test.ts` — the type-level mutual-assignability assertions are
  covered by `pnpm typecheck`; the byte-identity portion is valuable. Decision:
  keep this file but note that the type assertions are redundant with typecheck.

**FR-005 (re-export):**
- `unit/index.test.ts` — barrel surface smoke test.

**FR-006 (stale):**
- None identified.

### Terrain (target: 31 → ~22 files, -29%)

**FR-001 (implementation detail):**
- None identified.

**FR-002 (redundant):**
- `unit/board-fixtures.test.ts` — fixture assertion patterns overlap with
  `unit/board.test.ts`
- `unit/seed-fixtures.test.ts` — fixture assertion patterns overlap with
  `unit/generate.test.ts`
- `unit/index.test.ts` — re-export barrel smoke test
- `unit/value-noise.test.ts` — overlaps with `unit/fbm.test.ts` and
  `unit/elevation.test.ts` on the noise-generation path

**FR-004 (type-level):**
- None identified.

**FR-005 (re-export):**
- `unit/index.test.ts`.

**FR-006 (stale):**
- None identified.

### Engine (target: 26 → ~22 files, -15%)

**FR-001 (implementation detail):**
- None identified — engine tests are behavioral.

**FR-002 (redundant):**
- `fixtures/board.test.ts` — fixture construction assertions overlap with
  engine unit tests that use the same fixtures

**FR-004 (type-level):**
- None identified.

**FR-005 (re-export):**
- None identified.

**FR-006 (stale):**
- None identified.

### Design (target: 40 → ~26 files, -35%)

**FR-002 (redundant):**
- `brand/generate.test.ts` and `brand/generated-output.test.ts` — both test
  the brand generation pipeline; consolidate into one
- `brand/ico.test.ts` and `brand/generator-ico.test.ts` — both test ICO
  packaging; consolidate into one
- `brand/paths.test.ts` — path helper tests overlap with brand validation
  in `brand/drift.test.ts`
- `brand/vendor-to-docs.test.ts` — vendor-to-docs check overlaps with
  `brand/drift.test.ts`'s cross-surface assertions
- `components/generic/badge.test.ts` through `components/generic/waiting.test.ts`:
  11 generic component tests follow identical patterns (register, attach shadow,
  assert properties); consolidate into one parametric test file
- `components/modal.integration.test.ts` — overlaps with `components/generic/modal.test.ts`

**FR-005 (re-export):**
- `brand/inventory.test.ts` — asserts manifest inventory shape, already covered
  by other brand tests that import and use the manifest
- `brand/package-surface.test.ts` — asserts package surface exports, covered
  by TypeScript module resolution

**FR-006 (stale):**
- None identified.

## CI Split Analysis (FR-020)

### Current Flow (single console-test job, ~4m17s)

```
build deps → build console → unit tests → Playwright install →
component → a11y → e2e → perf → determinism → parity →
keepalive → lobby-integration → conformance
```

### Target Flow (three parallel jobs)

**console-test (node-only, no Chromium):**
- build deps → build console → unit tests → determinism → parity → keepalive
  → lobby-integration
- No Playwright install needed
- Target: < 3 minutes

**console-e2e (browser/Playwright):**
- build deps → build console → Playwright install → component → a11y → e2e
  → perf → conformance
- Target: < 6 minutes

**console-coverage (merged gate):**
- build deps → build console → build:lib → Playwright install → coverage
- Target: < 6 minutes

Key insight: the conformance test (`contract-conformance.test.ts`) needs
`build:lib` which produces `dist/`. It currently runs in `console-test` but
should move to `console-e2e` (or `console-coverage`) since it needs the
library emit. Actually, looking at the CI step, it runs `build:lib` inline.
We should move it to `console-e2e` since it's a build-artifact gate, not a
node-mode test.

## Estimated Reduction Summary

| Package     | Before | Target After | Reduction | %     |
| ----------- | ------ | ------------ | --------- | ----- |
| console     | 107    | ~64          | ~43       | -40%  |
| matchmaking | 51     | ~33          | ~18       | -35%  |
| networking  | 39     | ~25          | ~14       | -36%  |
| design      | 40     | ~26          | ~14       | -35%  |
| terrain     | 31     | ~22          | ~9        | -29%  |
| engine      | 26     | ~22          | ~4        | -15%  |
| fog         | 23     | ~16          | ~7        | -30%  |
| version     | 2      | 2            | 0         | 0%    |
| **Total**   | **319** | **~210**   | **~109**  | **-34%** |

Estimated case reduction: ~2,021 → ~1,550 (~-23%), meeting AC-002.
