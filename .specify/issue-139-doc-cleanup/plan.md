# Plan: Issue #139 — One-Time Spec and README Hygiene Pass

## Context

The monorepo has accumulated 29 spec directories — many overlapping, duplicate-numbered, or containing no `spec.md`. The product owner approved a consolidation map reducing 29 → 15 surviving spec dirs (14 dirs deleted). The planner already amended 12 parent specs (uncommitted, +293/−26 lines across 12 `spec.md` files). This plan completes the remaining work: structural consolidation, cross-reference fixes, README refresh, status-line normalization, AGENTS.md rewrite, and a CI guard to prevent future drift.

## Acceptance Criteria (Issue #139)

1. No duplicate/incoherent feature numbers; every shipped spec has a `Status` line.
2. Package READMEs match shipped dependencies/versions/counts.
3. No `.specify/features/` legacy path in tracked files.
4. A CI check catches a duplicate prefix or an Implemented spec without `tasks.md`.

## Verified Facts (this session)

| Fact | Detail |
|------|--------|
| Branch | `issue-139-doc-cleanup` (off main, post-PR #159) |
| Current spec dirs | 29 numbered dirs under `specs/` |
| Planner amendments | 12 `spec.md` files modified (uncommitted): 001, 002, 003, 004, 005, 006, 007, 008, 010, 011, 012-design-system, 013 |
| Survivor completeness | All 15 survivors have `spec.md` + `plan.md` + `tasks.md` (confirmed) |
| Blockquote status lines | 008, 020→014 use `> Status:` (others among deleted: 015-astro, 015-logo, 016, 017, 018, 019, 024, 062) |
| `.specify/features/` refs | Only in `specs/008-ci-workflows/spec.md` (FR-016, AC-014 examples) — not in any other tracked file |
| Total test count | ~2,958 `it(`/`test(` calls (grep estimate); ~3,150 with browser/E2E/special suites |
| Packages | 10: core, engine, terrain, fog, networking, matchmaking, console, design, logging, version |
| Workflows | 13: client-ci, core-ci, docker, engine-ci, fog-ci, logging-ci, manual-ci, matchmaking-ci, network-ci, pages-deploy, release, terrain-ci, version-drift |

## Consolidation Map (Approved)

### MERGE (11 dirs → their parents)

| Deleted Dir | Target Parent | Key Content Folded |
|-------------|--------------|-------------------|
| 014-shared-ui-components | 012-design-system | 20 React components, G-10 guard, two-tier DOM model |
| 015-astro-manual-migration | 007-player-manual | Zero unique FRs (already in v1.4) |
| 015-logo-assets | 012-design-system | 015-FR-001..FR-019 (brand assets) |
| 015-profile-route | 010-public-lobby-match-browser | Identity onboarding, returnTo, compact lobby card |
| 016-test-suite-cleanup | 008-ci-workflows | 016-FR-001..FR-026 (test reduction targets) |
| 017-welcome-landing-screen | 013-semantic-url-routing | Welcome page, route `welcome`, FR-009..FR-011 |
| 018-in-match-help-overlay | 005-client-console | 018-FR-001..FR-016 (help overlay + tooltips) |
| 019-game-over-modal | 005-client-console | 019-FR-001..FR-010 (game-over overlay) |
| 021-tile-visual-redesign | 005-client-console | Terrain tile rendering changes |
| 023-lobby-roster | 010-public-lobby-match-browser | 023-FR-001..FR-007 (presence + roster) |
| 062-design-polish | 012-design-system | 062-FR-001..FR-047 (design polish) |

### SPLIT (2 dirs → their domain parents)

| Deleted Dir | Target Parents | Key Content Folded |
|-------------|---------------|-------------------|
| 024-biome-based-terrain-shading | 001 (flow rules), 005 (console palette), 012 (design tokens) | FRs distributed by package |
| 012-3-4-player-support | 001–007, 010, 011 | FRs distributed by package; board-size-defaults contract → 006 |

### DELETE (1 dir)

| Deleted Dir | Reason |
|-------------|--------|
| 043-pipe-slope-colors | No spec.md; substance already in 005/007 |

## Final Numbering Scheme (001–015)

| # | Dir | Notes |
|---|-----|-------|
| 001 | 001-core-game-engine | Absorbs 012-3-4 engine FRs, 024 flow FRs |
| 002 | 002-fog-of-war-visibility | Absorbs 012-3-4 fog FRs |
| 003 | 003-procedural-terrain-generation | Absorbs 012-3-4 terrain FRs |
| 004 | 004-multiplayer-networking | Absorbs 012-3-4 networking FRs |
| 005 | 005-client-console | Absorbs 018, 019, 021, 024 console, 043 |
| 006 | 006-match-lifecycle-matchmaking | Absorbs 012-3-4 matchmaking FRs + board-size-defaults contract |
| 007 | 007-player-manual | Absorbs 015-astro, 012-3-4 manual FRs |
| 008 | 008-ci-workflows | Absorbs 016 test-suite FRs + FR-013..017 guard |
| 009 | 009-shared-app-versioning | Unchanged |
| 010 | 010-public-lobby-match-browser | Absorbs 023 roster FRs, 015-profile FRs |
| 011 | 011-docker-selfhost-single-port | Absorbs 012-3-4 docker/host FRs |
| 012 | 012-design-system | Absorbs 014, 015-logo, 062, 024 design-token FRs |
| 013 | 013-semantic-url-routing | Absorbs 017 welcome, 015-profile route |
| **014** | **020-structured-logging → 014-structured-logging** | **Renamed** |
| **015** | **022-developer-debugging → 015-developer-debugging** | **Renamed** |

## Wave Structure

### Wave 0 — Commit Planner Amendments (T-001..T-002)

Commit the 12 amended spec.md files and the coordination artifacts.

**Ordering**: These are already uncommitted. Commit first as the planning trail.

### Wave 1 — Structural Consolidation (T-003..T-004) [SEQUENTIAL]

**Why sequential**: Deletions MUST precede renumbers to avoid prefix collisions (014/015 exist as deleted dirs pre-deletion but are needed for renamed 020/022 post-renumber). The tree must be green at every commit.

**T-003** is the big commit — contract moves + all 14 dir deletions + ALL references to deleted dirs (runtime imports AND doc comments) in ONE change set. This keeps the tree green: no test references a deleted file.

**T-004** renumbers 020→014, 022→015 (now safe — no prefix collision).

After T-004, the tree has exactly 15 numbered dirs: 001–013, 014, 015. All with spec.md + plan.md + tasks.md.

### Wave 2 — Cross-refs, READMEs, Purge, Status, AGENTS.md (T-005..T-009) [PARALLEL]

All five tasks are parallel-safe (different files) but depend on Wave 1 having landed.

### Wave 3 — CI Guard (T-010..T-012) [SEQUENTIAL]

Script → wiring → workflow. The guard is validated against the consolidated tree.

### Wave 4 — Final Verification + PR (T-013..T-014) [SEQUENTIAL]

Negative tests + full verify + PR.

## Detailed Steps

### T-003: Contract Moves + Dir Deletions + Ref Updates (ONE COMMIT)

**Contract moves** (4 files):

| Source | Destination | Runtime refs to update |
|--------|------------|----------------------|
| `specs/012-3-4-player-support/contracts/board-size-defaults.ts` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts` | matchmaking: `tests/conformance.test.ts:46,269,288`, `tests/unit/board-size-defaults.test.ts:25`, `src/constants.ts:42`, `contracts/match-types.ts:602` |
| `specs/023-lobby-roster/contracts/roster-wire.md` | `specs/010-public-lobby-match-browser/contracts/roster-wire.md` | networking: `tests/contracts-conformance.test.ts:41,579` (comments only) |
| `specs/014-shared-ui-components/contracts/react-components.contract.md` | `specs/012-design-system/contracts/react-components.contract.md` | None (review mirror) |
| `specs/015-logo-assets/contracts/brand-manifest.md` | `specs/012-design-system/contracts/brand-manifest.md` | None (review mirror) |

**Dir deletions** (14 dirs, `git rm -r`):
012-3-4, 014-shared-ui-components, 015-astro, 015-logo, 015-profile, 016, 017, 018, 019, 021, 023, 024, 043, 062.

**Cross-ref updates in the same commit** (refs to DELETED dirs):

| File | Line(s) | Old Ref | New Ref |
|------|---------|---------|---------|
| `packages/matchmaking/tests/conformance.test.ts` | 46 | `specs/012-3-4-player-support/contracts/board-size-defaults` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults` |
| `packages/matchmaking/tests/conformance.test.ts` | 269, 288 | `specs/012-3-4-player-support/contracts/board-size-defaults.ts` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts` |
| `packages/matchmaking/tests/unit/board-size-defaults.test.ts` | 19, 25, 145 | `specs/012-3-4-player-support/contracts/board-size-defaults` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults` |
| `packages/matchmaking/src/constants.ts` | 42 | `specs/012-3-4-player-support/contracts/board-size-defaults.ts` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts` |
| `packages/matchmaking/contracts/match-types.ts` | 602 | `specs/012-3-4-player-support/contracts/board-size-defaults.ts` | `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts` |
| `packages/networking/tests/contracts-conformance.test.ts` | 41 | `specs/023-lobby-roster/contracts/roster-wire.md` | `specs/010-public-lobby-match-browser/contracts/roster-wire.md` |
| `packages/networking/tests/contracts-conformance.test.ts` | 579 | `specs/023-lobby-roster/contracts/roster-wire.md` | `specs/010-public-lobby-match-browser/contracts/roster-wire.md` |
| `packages/terrain/tests/integration/deterministic-n-players.test.ts` | 4 | `specs/012-3-4-player-support/spec.md` | `specs/003-procedural-terrain-generation/spec.md` |
| `packages/design/tests/brand/cross-surface.test.ts` | 14 | `specs/015-logo-assets/spec.md` | `specs/012-design-system/spec.md` |
| `packages/design/README.md` | 8 | `specs/015-logo-assets/spec.md` | `specs/012-design-system/spec.md` |
| `packages/console/tests/component/ui/welcome-screen.test.tsx` | 4 | `specs/017-welcome-landing-screen/spec.md` | `specs/013-semantic-url-routing/spec.md` |
| `specs/010-public-lobby-match-browser/quickstart.md` | 111 | `specs/012-3-4-player-support/spec.md` (line numbers) | `specs/006-match-lifecycle-matchmaking/spec.md` (no line numbers) |
| `specs/010-public-lobby-match-browser/quickstart.md` | 112 | `specs/012-3-4-player-support/data-model.md` (line numbers) | `specs/006-match-lifecycle-matchmaking/spec.md` (no line numbers) |
| `specs/008-ci-workflows/plan.md` | 3 | `008-ci-workflows (v1.1) + 016-test-suite-cleanup (v1.1)` | `008-ci-workflows (v1.2, absorbed 016-test-suite-cleanup)` |

**NOT in T-003** (handled in Wave 2):
- Broken `013-console-semantic-url-scheme` ref (surviving dir — unrelated to deletions).
- `.specify/` legacy purges.
- Status-line normalization.

**Verification**: Run matchmaking + networking tests; typecheck matchmaking + networking packages.

### T-004: Renumber (ONE COMMIT)

**Actions**:
1. `git mv specs/020-structured-logging specs/014-structured-logging`
2. `git mv specs/022-developer-debugging specs/015-developer-debugging`
3. Fix self-reference in `specs/015-developer-debugging/tasks.md:3` (old: `/specs/022-developer-debugging/` → new: `/specs/015-developer-debugging/`).
4. Grep both dirs for any remaining self-refs to old numbers.

**Verification**: Both renamed dirs have spec.md + plan.md + tasks.md; no prefix collision.

### CI Guard Design

**Script**: `scripts/check-spec-consolidation.ts` (new, modeled on `scripts/check-orphaned-vitest-configs.ts`).

**Four checks** (per spec 008 FR-013..FR-017):

| Check | FR | Implementation |
|-------|-----|---------------|
| (a) Duplicate numeric prefixes | FR-013 | List `specs/NNN-*` dirs → extract `NNN` prefix → fail if any prefix appears >1×. |
| (b) Implemented without plan/tasks | FR-014 | For each numbered dir with `spec.md` containing `Status:\s*Implemented` (regex — covers both `**Status**:` and `> Status:` formats) → require `plan.md` AND `tasks.md` exist. |
| (c) Spec dir without spec.md | FR-015 | For each numbered dir → require `spec.md` exists. |
| (d) Legacy `.specify/features/` path | FR-016 | `git ls-files` → grep for literal `.specify/features/` → fail on any hit outside the allowlist. |

**Allowlist** (documented in script header):
- `scripts/check-spec-consolidation.ts` (the script itself contains the search pattern).
- `specs/008-ci-workflows/spec.md` (FR-016 and AC-014 define the pattern).
- `.specify/issue-139-doc-cleanup/` (coordination artifacts referencing the pattern).

**Timing**: <10s (git ls-files + readdir + a handful of reads — milliseconds in practice).

**Wiring**:
- Root `package.json` → `"guard:specs": "tsx scripts/check-spec-consolidation.ts"`.
- `scripts/verify.sh` → new Phase 12: `pnpm exec tsx scripts/check-spec-consolidation.ts`.
- `scripts/verify-changed.sh` → Tier A (alongside the docs-privacy guard: cheap structural scan, always runs).
- New `.github/workflows/spec-guard.yml`:
  - Trigger: `pull_request` (branches: `[main]`) + `workflow_dispatch`.
  - Path filter: `specs/**`, `scripts/check-spec-consolidation.ts`, `scripts/verify.sh`, `.github/workflows/spec-guard.yml`.
  - `changes` job (dorny/paths-filter) → `verify` job gated on `changes.outputs.changed == 'true'` (manual-ci.yml pattern — required check always reports "skipped" when irrelevant).
  - `verify` job: checkout → pnpm + Node 22 setup → `pnpm exec tsx scripts/check-spec-consolidation.ts`. Timeout 5 min (generous for <10s job).
  - Permissions: `contents: read`.

**Why a new workflow (not manual-ci.yml)**: manual-ci.yml is path-gated on `docs/manual/**` — a `specs/` change never triggers it. Adding `specs/**` to its filter would couple manual-build verification with spec-structure integrity and force the full Astro + Playwright manual build on every spec change (slow, wrong concern). A dedicated <10s structural gate is proportionate and follows the single-responsibility precedent.

## Cross-Reference Inventory (Complete)

### Refs to deleted dirs — fixed in T-003 (same change set as deletions)

| File | Line | Deleted Dir | New Ref |
|------|------|------------|---------|
| `packages/matchmaking/tests/conformance.test.ts` | 46, 269, 288 | 012-3-4 | 006 contracts |
| `packages/matchmaking/tests/unit/board-size-defaults.test.ts` | 19, 25, 145 | 012-3-4 | 006 contracts |
| `packages/matchmaking/src/constants.ts` | 42 | 012-3-4 | 006 contracts |
| `packages/matchmaking/contracts/match-types.ts` | 602 | 012-3-4 | 006 contracts |
| `packages/networking/tests/contracts-conformance.test.ts` | 41, 579 | 023-lobby-roster | 010 contracts |
| `packages/terrain/tests/integration/deterministic-n-players.test.ts` | 4 | 012-3-4 | 003 spec |
| `packages/design/tests/brand/cross-surface.test.ts` | 14 | 015-logo | 012-design-system spec |
| `packages/design/README.md` | 8 | 015-logo | 012-design-system spec |
| `packages/console/tests/component/ui/welcome-screen.test.tsx` | 4 | 017-welcome | 013 spec |
| `specs/010-public-lobby-match-browser/quickstart.md` | 111, 112 | 012-3-4 | 006 spec |
| `specs/008-ci-workflows/plan.md` | 3 | 016-test-suite | absorbed into 008 |

### Refs to surviving dirs — fixed in Wave 2

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/console/tests/unit/routing/semantic-route-guards.test.ts` | 22 | Wrong name: `013-console-semantic-url-scheme` | → `013-semantic-url-routing` |

### Historical artifacts — intentionally left untouched

| File | Line | Ref | Rationale |
|------|------|-----|-----------|
| `specs/010-.../issue-74-player-id-migration/orchestration.md` | 417 | 014-shared-ui-components | Point-in-time delivery log |
| `specs/008-ci-workflows/tasks.md` | 280 | 016-test-suite-cleanup | Historical task item (already executed) |
| `specs/009-.../plan.md`, `research.md`, `tasks.md` | various | 012-3-4 host-config/waiting-copy mirrors | Historical planning docs; mirrors deleted with dir |
| `specs/010-.../plan.md`, `tasks.md` | various | 012-3-4 host-config/waiting-copy mirrors | Same |

## README Fixes (T-006)

### Root README.md (~line 86)

| Field | Current | Corrected |
|-------|---------|-----------|
| Package count | "7 packages" | "10 packages" |
| Workflow count | "six per-package CI workflows" | "13 workflows" (9 per-package + 4 shared) |
| Test count | "more than 1,300 automated tests" | "more than 3,000 automated tests" |

### packages/engine/README.md (~line 37)

| Field | Current | Corrected |
|-------|---------|-----------|
| Test count | "≈280 tests" | "≈{actual} tests" (run suite, record) |

### packages/fog/README.md (~line 53)

| Field | Current | Corrected |
|-------|---------|-----------|
| Test count | "107 tests" | "≈{actual} tests" (run suite, record) |

### packages/networking/README.md (~line 54)

| Field | Current | Corrected |
|-------|---------|-----------|
| Test count | "325 tests across 35 files" | "≈{actual} tests across {actual} files" (run suite, record) |

### packages/terrain/README.md

| Location | Current | Corrected |
|----------|---------|-----------|
| ~line 54: test count | "223 tests" | "226 tests" (verified by grep; confirm with suite) |
| ~lines 26-30: false PRNG claim | "This builds the engine package" | "This builds the core package" |
| ~lines 26-30: false PRNG claim | "terrain consumes the engine's PRNG instance" | "terrain consumes the caller-supplied PRNG instance (from @europa/core)" |

### CONTRIBUTING.md

| Location | Current | Corrected |
|----------|---------|-----------|
| ~line 44: .specify tree entry | "Spec-kit tooling: constitution, feature specs, templates, scripts" | "Spec-kit tooling: constitution, templates, scripts" (specs live in `specs/`) |
| ~line 63: constitution ref | `.specify/memory/constitution.md` | **CORRECT — no change** |
| ~line 72: workflow list | "engine, terrain, fog, networking, matchmaking, console, logging, manual" (8 per-package) | Add "core" (9 per-package); "12" → "13 workflows" |
| ~line 95: workflow list | Same fix as line 72 |

## .specify Legacy Purge (T-007)

| File | Line(s) | Current | Corrected |
|------|---------|---------|-----------|
| `.specify/pm-handoff.md` | 22–25 | `specs/001-006/spec.md` (range ref) | Update to list surviving specs or say `specs/NNN-*/spec.md` |
| `packages/engine/src/contracts/README.md` | 11 | "`.specify/` directory" | "the spec contracts directory" |
| `packages/fog/src/contracts/README.md` | 11, 37 | "`.specify/...`" | "specs/002-fog-of-war-visibility/contracts/" |
| `packages/terrain/src/contracts/README.md` | 11, 30 | "`.specify/...`" | "specs/003-procedural-terrain-generation/contracts/" |

## Status-Line Normalization (T-008)

Only two surviving specs use the blockquote format:

| Spec | Current | Corrected |
|------|---------|-----------|
| `specs/008-ci-workflows/spec.md` | `> Status: Implemented (2026-09-11)` | `**Status**: Implemented (2026-09-11)` |
| `specs/014-structured-logging/spec.md` (post-renumber) | `> Status: Implemented (2026-09-06)` | `**Status**: Implemented (2026-09-06)` |

The other 8 blockquote specs (015-astro, 015-logo, 016, 017, 018, 019, 024, 062) are deleted in Wave 1.

## AGENTS.md Rewrite (T-009)

### What to keep

- Project vision and binding decisions (binding)
- Governing documents table (updated: all 15 specs)
- Constitution summary
- Workflow rules
- Browser automation section (agent-browser)
- Environment notes (hard-won)
- Restart procedure
- Spec-kit integration details

### What to drop

- The wave-by-wave implementation changelog (git preserves history; the changelog adds 100+ lines of superseded state)
- Feature-by-feature delivery notes (completed features: "Implemented" suffices)

### Target structure (<150 lines)

1. Header + project vision (~10 lines)
2. Binding decisions (~10 lines)
3. Governing documents table — ALL 15 specs listed (~20 lines)
4. Constitution summary (~5 lines)
5. Current state: shipped (15 specs, all Implemented), in-flight (#2, #3, #4), open issues (~15 lines)
6. Workflow rules (~20 lines)
7. Browser automation section (~30 lines)
8. Environment notes (~15 lines)
9. Restart procedure (~10 lines)

### Key numbers for Current state

- 10 packages, 13 workflows, ~3,000+ tests, 15 specs
- Governing-docs table: 001–015

## Verification Strategy

| Wave | Verification |
|------|-------------|
| Wave 0 | `git diff --stat` confirms 12 files staged; spot-check 2 specs. |
| Wave 1 (T-003) | `pnpm --filter @europa/matchmaking test` + `pnpm --filter @europa/networking test` + `pnpm typecheck`. |
| Wave 1 (T-004) | Verify both renamed dirs have spec.md + plan.md + tasks.md; `grep -r` for old numbers in the renamed dirs. |
| Wave 2 | `pnpm lint` + `pnpm format:check` (cross-ref changes may affect formatting). |
| Wave 3 | `pnpm exec tsx scripts/check-spec-consolidation.ts` — must pass (zero violations). |
| Wave 4 | Full `pnpm verify` (or `pnpm verify:changed --full`). Negative tests on guard. |

## PR Strategy

- **Single PR** from `issue-139-doc-cleanup` → `main`.
- **10–11 conventional commits** (listed in tasks.md, ordered by wave).
- **Title**: `docs: one-time spec and README hygiene pass (issue #139)`
- **Description**: checklist of the 4 acceptance criteria, cross-link to this plan.

## Risks and Decisions

### Flagged Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | Guard uses explicit allowlist for `.specify/features/` | The guard's own spec (008 FR-016) and script contain the literal pattern. Allowlist = [guard script, 008 spec, coordination dir]. |
| D-2 | 012-3-4 contracts README NOT moved (deleted with dir) | The README documents all three mirrors (board-size-defaults, host-config, waiting-copy); host-config/waiting-copy are deleted. Only board-size-defaults.ts moves. The 006 spec's "Contract move note" covers the move. |
| D-3 | Historical plan/research/tasks of other features NOT updated | Point-in-time artifacts (009/010 plan.md, 010 orchestration.md) referencing deleted contract mirrors left untouched. Only living docs (008 plan.md, 010 quickstart.md) updated. |
| D-4 | New `spec-guard.yml` workflow (not manual-ci.yml) | manual-ci.yml is path-gated on `docs/manual/`; coupling with `specs/` would force manual builds on spec changes. A dedicated <10s structural gate is proportionate. |
| D-5 | Guard Status-line check NOT included | FR-013..FR-017 don't include it. One-time normalization (T-008) satisfies acceptance criterion #1. Optional future extension: add "(e) spec dir without any Status line" to the guard. |
| D-6 | Guard also wired into `verify-changed.sh` Tier A | Beyond the brief's "verify.sh + workflow" scope but consistent with the docs-privacy guard precedent. Cheap structural scan, always runs. |

### Risks

| Risk | Mitigation |
|------|-----------|
| Subagent silent failures during implementation | Chunk tasks into small commits; verify each with `git diff --stat` + targeted tests before proceeding. |
| Guard self-reference causing false positive | Allowlist (D-1). Verify in negative tests (T-013). |
| Test counts drift between survey and run time | README task runs actual suites and records real numbers. "at last count" convention accepted. |
| Intermediate tree broken between deletion and renumber | Deletions (T-003) land first; tree verified green (13 dirs). Renumber (T-004) lands next; tree verified green (15 dirs). No overlap in timing. |

## Constitution Alignment

- **Principle III (coverage gate)**: guard FR-014 ensures Implemented specs carry full planning trail (plan.md + tasks.md).
- **Principle V (specs-as-documentation)**: all surviving specs have Status lines, absorbed FRs are truthfully folded.
- **Principle VI (simplicity)**: guard is a single TypeScript file (<150 lines expected), no external dependencies, uses only `node:fs`, `node:child_process`, `node:path`.
- **Binding decision 6 (npm private)**: no registry publish; guard and workflow are internal.
