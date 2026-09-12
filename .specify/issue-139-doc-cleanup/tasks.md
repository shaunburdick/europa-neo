# Tasks: Issue #139 — One-Time Spec and README Hygiene Pass

## Wave 0 — Commit Planner Amendments

- [x] T-001: **Commit the 12 amended parent specs**
  - Files (already modified, uncommitted): `specs/001-.../spec.md` through `specs/013-.../spec.md` (12 files).
  - Commit: `docs(specs): amend 12 parent specs for consolidation (issue #139)`
  - Verify: `git diff --stat` shows exactly 12 files, ~293 insertions.

- [x] T-002: **Create issue-139 coordination artifacts**
  - Create `.specify/issue-139-doc-cleanup/plan.md` and `.specify/issue-139-doc-cleanup/tasks.md`.
  - Commit: `chore(specs): add issue-139 coordination artifacts`
  - Verify: both files exist in `.specify/issue-139-doc-cleanup/`.

## Wave 1 — Structural Consolidation [SEQUENTIAL]

- [x] T-003: **Fold contracts into parents and delete 14 consolidated spec dirs**
  - **Contract moves** (4 `git mv`):
    1. `specs/012-3-4-player-support/contracts/board-size-defaults.ts` → `specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts`
    2. `specs/023-lobby-roster/contracts/roster-wire.md` → `specs/010-public-lobby-match-browser/contracts/roster-wire.md`
    3. `specs/014-shared-ui-components/contracts/react-components.contract.md` → `specs/012-design-system/contracts/`
    4. `specs/015-logo-assets/contracts/brand-manifest.md` → `specs/012-design-system/contracts/`
  - **Update runtime imports** (matchmaking — 4 files):
    - `packages/matchmaking/tests/conformance.test.ts` lines 46, 269, 288 — update board-size-defaults path
    - `packages/matchmaking/tests/unit/board-size-defaults.test.ts` lines 19, 25, 145 — update board-size-defaults path
    - `packages/matchmaking/src/constants.ts` line 42 — update board-size-defaults path
    - `packages/matchmaking/contracts/match-types.ts` line 602 — update board-size-defaults path
  - **Update doc-comment refs to deleted dirs** (8 files):
    - `packages/networking/tests/contracts-conformance.test.ts` lines 41, 579 — roster-wire path
    - `packages/terrain/tests/integration/deterministic-n-players.test.ts` line 4 — 012-3-4 → 003
    - `packages/design/tests/brand/cross-surface.test.ts` line 14 — 015-logo → 012-design-system
    - `packages/design/README.md` line 8 — 015-logo → 012-design-system
    - `packages/console/tests/component/ui/welcome-screen.test.tsx` line 4 — 017 → 013
    - `specs/010-public-lobby-match-browser/quickstart.md` lines 111–112 — 012-3-4 → 006
    - `specs/008-ci-workflows/plan.md` line 3 — update feature line
  - **Delete 14 dirs** (`git rm -r`):
    `012-3-4-player-support`, `014-shared-ui-components`, `015-astro-manual-migration`,
    `015-logo-assets`, `015-profile-route`, `016-test-suite-cleanup`,
    `017-welcome-landing-screen`, `018-in-match-help-overlay`, `019-game-over-modal`,
    `021-tile-visual-redesign`, `023-lobby-roster`, `024-biome-based-terrain-shading`,
    `043-pipe-slope-colors`, `062-design-polish`.
  - Commit: `chore(specs): fold contracts into parents and delete 14 consolidated spec dirs`
  - Verify: `pnpm --filter @europa/matchmaking test` + `pnpm --filter @europa/networking test` + `pnpm typecheck` all green. `ls specs/` shows 15 dirs (001–013, 020, 022).

- [x] T-004: **Renumber 020→014 and 022→015**
  - `git mv specs/020-structured-logging specs/014-structured-logging`
  - `git mv specs/022-developer-debugging specs/015-developer-debugging`
  - Fix self-reference: `specs/015-developer-debugging/tasks.md` line 3 — old path → new path.
  - Grep both dirs for old numbers: `grep -rn "020-structured-logging\|022-developer-debugging" specs/014-structured-logging/ specs/015-developer-debugging/` — must be empty.
  - Commit: `chore(specs): renumber 020→014 and 022→015`
  - Verify: all 15 dirs have spec.md + plan.md + tasks.md. No duplicate prefixes: `ls specs/ | grep -oP '^\d{3}' | sort | uniq -d` must be empty.

## Wave 2 — Cross-refs, READMEs, Purge, Status, AGENTS.md [PARALLEL]

All tasks below are parallel-safe (different files) but depend on Wave 1.

- [x] T-005 [P]: **Fix broken spec path reference in console routing test**
  - File: `packages/console/tests/unit/routing/semantic-route-guards.test.ts` line 22.
  - Change: `specs/013-console-semantic-url-scheme/spec.md` → `specs/013-semantic-url-routing/spec.md`.
  - Commit (combine with T-006/T-007/T-008 or own commit): `docs: fix spec path references in tests and docs`
  - Verify: `pnpm --filter @europa/console test:unit` green.

- [x] T-006 [P]: **Refresh package READMEs and contributing guide**
  - Run test suites to record actual counts:
    - `pnpm --filter @europa/engine test` → record count
    - `pnpm --filter @europa/fog test` → record count
    - `pnpm --filter @europa/networking test` → record count (count test files too)
    - `pnpm --filter @europa/terrain test` → record count
  - Update counts in:
    - `README.md` (~line 86): 7→10 packages, six→13 (or 9+4) workflows, 1,300→3,000+ tests
    - `packages/engine/README.md` (~line 37): ≈280→{actual}
    - `packages/fog/README.md` (~line 53): 107→{actual}
    - `packages/networking/README.md` (~line 54): 325/35→{actual}/{actual}
    - `packages/terrain/README.md` (~line 54): 223→{actual}; fix false PRNG claim (~lines 26-30):
      - "This builds the engine package" → "This builds the core package"
      - "terrain consumes the engine's PRNG instance" → "terrain consumes the caller-supplied PRNG instance (from @europa/core)"
  - Fix `CONTRIBUTING.md`:
    - ~line 44: `.specify/` tree entry — remove "feature specs" (specs live in `specs/`)
    - ~line 72, 95: workflow list — add "core" to per-package list; fix total count
  - Commit: `docs: refresh package READMEs and contributing guide`
  - Verify: `pnpm lint` + `pnpm format:check` green.

- [x] T-007 [P]: **Purge legacy .specify references**
  - `.specify/pm-handoff.md` lines 22-25: update `specs/001-006/spec.md` range → list surviving specs or `specs/NNN-*/spec.md`.
  - `packages/engine/src/contracts/README.md` line 11: "`.specify/` directory" → "the spec contracts directory".
  - `packages/fog/src/contracts/README.md` lines 11, 37: "`.specify/...`" → "specs/002-fog-of-war-visibility/contracts/".
  - `packages/terrain/src/contracts/README.md` lines 11, 30: "`.specify/...`" → "specs/003-procedural-terrain-generation/contracts/".
  - Commit: `chore: purge legacy .specify references`
  - Verify: `grep -rn "\.specify/" packages/engine/src/contracts/README.md packages/fog/src/contracts/README.md packages/terrain/src/contracts/README.md` returns no hits for the old pattern.

- [x] T-008 [P]: **Normalize status lines to bold format**
  - `specs/008-ci-workflows/spec.md` line 5: `> Status:` → `**Status**:`
  - `specs/014-structured-logging/spec.md` line 5: `> Status:` → `**Status**:`
  - Commit: `docs(specs): normalize status lines to bold`
  - Verify: `grep -rn "^> Status" specs/*/spec.md` returns zero hits.

- [x] T-009 [P]: **Rewrite AGENTS.md with lean current state**
  - Drop the wave-by-wave implementation changelog (~100 lines).
  - Keep: project vision, binding decisions, governing-docs table (ALL 15 specs), constitution summary, workflow rules, browser automation, environment notes, restart procedure.
  - Current state: 10 packages, 13 workflows, ~3,000+ tests, 15 specs (001–015 all Implemented).
  - Governing-docs table lists all 15 spec dirs.
  - Spec status lines section updated to reflect final 15.
  - Target: under 150 lines.
  - Commit: `docs: rewrite AGENTS.md with lean current state`
  - Verify: `wc -l AGENTS.md` < 150. Spot-check governing-docs table has 15 entries.

## Wave 3 — CI Guard [SEQUENTIAL]

- [x] T-010: **Write spec-consolidation guard script**
  - Create `scripts/check-spec-consolidation.ts` (model on `scripts/check-orphaned-vitest-configs.ts`).
  - Four checks per FR-013..FR-017:
    - (a) Duplicate numeric prefixes: scan `specs/NNN-*` dirs, extract prefix, fail if any repeats.
    - (b) Implemented without plan/tasks: parse `Status:\s*Implemented` in spec.md, require both `plan.md` and `tasks.md`.
    - (c) Spec dir without spec.md: each numbered dir must have `spec.md`.
    - (d) Legacy `.specify/features/` in tracked files: `git ls-files` + grep; allowlist in header.
  - Header documents: allowlist, FR references, timing contract (<10s).
  - Add root script: `"guard:specs": "tsx scripts/check-spec-consolidation.ts"` in `package.json`.
  - Commit: `ci: add spec-consolidation guard script`
  - Verify: `pnpm exec tsx scripts/check-spec-consolidation.ts` exits 0 on consolidated tree.

- [x] T-011: **Wire guard into verify.sh and verify-changed.sh**
  - `scripts/verify.sh`: add Phase 12 after Phase 11:
    ```
    # Phase 12: Spec consolidation guard (008 FR-013..FR-017)
    echo "--- Phase 12: Spec consolidation guard ---"
    pnpm exec tsx scripts/check-spec-consolidation.ts
    echo ""
    ```
  - `scripts/verify-changed.sh`: add guard to Tier A section (after docs-privacy guard).
  - Commit (combine with T-010 or T-012): `ci: wire spec guard into verify scripts`
  - Verify: `bash scripts/verify.sh` runs Phase 12 without error (among all phases).

- [x] T-012: **Add spec-guard workflow**
  - Create `.github/workflows/spec-guard.yml` modeled on `manual-ci.yml`:
    - `on: pull_request: branches: [main]` + `workflow_dispatch`.
    - `changes` job: dorny/paths-filter for `specs/**`, `scripts/check-spec-consolidation.ts`, `scripts/verify.sh`, `.github/workflows/spec-guard.yml`.
    - `verify` job: gated on `changes.outputs.changed == 'true'`; checkout → pnpm + Node 22 → run guard script. Timeout 5 min.
    - Permissions: `contents: read`.
  - Commit: `ci: add spec-guard workflow`
  - Verify: YAML valid; workflow has correct SHA-pinned actions; path filters match expected patterns.

## Wave 4 — Final Verification + PR

- [x] T-013: **Guard negative verification**
  - Prove guard catches each violation class:
    1. Temporarily create `specs/999-duplicate/spec.md` alongside any `099-*` dir (if exists) or alongside another `999-*` — prove (a) fails. Revert.
    2. Remove `plan.md` from any Implemented spec temporarily — prove (b) fails. Revert.
    3. Remove `spec.md` from any numbered dir temporarily — prove (c) fails. Revert.
    4. Write `.specify/features/test` in a temp tracked file — prove (d) fails. Revert.
  - Run `pnpm exec tsx scripts/check-spec-consolidation.ts` — confirm exits 0, confirm <10s.
  - Verify: all 4 negative tests pass; guard passes on clean tree.

- [x] T-014: **Final verification and PR preparation**
  - Run `pnpm verify` (full suite) — all green.
  - Post-consolidation structural audit:
    - 15 numbered dirs under `specs/`: confirmed.
    - All 15 have `**Status**:` (not `> Status:`): `grep -r "^> Status" specs/*/spec.md` → 0 hits.
    - All 15 have `plan.md` + `tasks.md`: confirmed.
    - No `.specify/features/` refs outside guard allowlist: `git grep "\.specify/features" | grep -v "008-ci-workflows\|check-spec-consolidation\|issue-139"` → 0 hits.
    - Guard script passes: `pnpm exec tsx scripts/check-spec-consolidation.ts` → exit 0.
  - Update AGENTS.md Current state if any numbers changed (test counts from T-006).
  - Open PR: `gh pr create --title "docs: one-time spec and README hygiene pass (issue #139)" --body "..."`.
  - Verify: PR created, all CI checks queued.

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 14 (T-001..T-014) |
| Waves | 4 (0→1→2→3→4) |
| Parallel-safe tasks | 5 (T-005..T-009, Wave 2) |
| Commits | ~11 (T-001 + T-002 + T-003 + T-004 + T-005/T-006 + T-007 + T-008 + T-009 + T-010/T-011 + T-012 + T-014) |
| Dirs deleted | 14 |
| Contract moves | 4 |
| Dirs renumbered | 2 (020→014, 022→015) |
| Cross-refs fixed | ~15 files |
| READMEs updated | 6 (root + engine + fog + networking + terrain + CONTRIBUTING) |
| CI guard | New script + verify.sh Phase 12 + verify-changed.sh Tier A + spec-guard.yml workflow |
