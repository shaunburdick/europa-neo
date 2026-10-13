# Plan — CI Gate Parity, Conformance Wiring & Contract Single-Sourcing (specs/008-ci-workflows; relocated from the dissolved amendment-manifest directory — see §5.9)

> **Status**: Gate-2-approved (phase 4–5 artifact). Relocated 2026-10-13 per user decision dissolving the amendment-manifest structure (016 was a mistake, not a pattern).
> **Branch**: `ci/verify-conformance-parity`
> **Inputs**: the amended FRs/ACs in `specs/008-ci-workflows/spec.md` (v1.4), `specs/004` (v1.12/v1.13), `specs/002` (v1.10),
> `specs/001` (v1.16), `specs/006` (v1.10) — the contract — plus `.specify/memory/constitution.md`.
> **Output of this phase**: this file + `tasks-gate-parity.md` only. No implementation code in this pass.

## 1. Scope in one paragraph

One PR on `ci/verify-conformance-parity` delivers three folded issues against the amended specs:
**#144** — create/extend `tsconfig.conformance.json` + `typecheck:conformance` for networking, fog
and matchmaking and wire all four conformance programs (console stays green) into their package
workflows and `scripts/verify.sh`, with a red-witness drill (008 FR-029–FR-032, 004 FR-028,
002 FR-013); **#133** — make `verify.sh` run exactly the bounded CI-parity gates FR-024 names,
extract the `.github/actions/build-workspace` composite action for the nine package workflows, and
fix the two workspace-dependency-closure path-filter misses (008 FR-024/FR-026/FR-027/FR-028,
NICE-1); **#145 remainder** — unify matchmaking's contract directory into `src/contracts/` and drop
the `./contracts/*` subpath export (006 FR-027), fix the stale 001 contracts README (001 FR-024),
and add the repo-wide referenced-contract-file guard (008 FR-033/AC-033). Everything already
landed by #145 (orphan deletion, core-mirror deletion, `ENGINE_CONSTANTS` single-sourcing) is
recorded, not re-done.

## 2. Technical context (grounded in this tree, re-verified during planning)

### 2.1 `scripts/verify.sh` today (12 phases)

Phase 1 `pnpm build` (all packages incl. console vite build) → 2 root typecheck/lint/format:check →
3 console `typecheck:conformance` → 4 design guards → 5 console node tests → 6 console
component/a11y → 6b console browser project under coverage config → 7 Playwright e2e → 8 perf →
9 selfhost → 10 per-package `test` (core, engine, terrain, fog, networking, matchmaking, version,
design) → 11 documentation privacy guard → 12 spec-consolidation guard. FR-024's gaps are exactly:
three console integration suites that CI runs only via the coverage config's **node** project, the
runtime `contract-conformance` suite (run by `client-ci.yml` `console-e2e`), `@europa/core`
coverage, `@europa/logging` test.

### 2.2 Workflows (15 files; 9 package workflows)

`client-ci.yml`, `core-ci.yml`, `engine-ci.yml`, `fog-ci.yml`, `logging-ci.yml`,
`matchmaking-ci.yml`, `network-ci.yml`, `terrain-ci.yml`, `manual-ci.yml` are the package
workflows. Every **heavy** job follows the same hand-rolled prologue: `actions/checkout` (SHA-pinned,
no `with:`) → `pnpm/setup@fbda4c85…` (`runtime: node@22`, `cache: true`, `require-lockfile: true`)
→ a per-job ordered list of `pnpm --filter @europa/<pkg> build` steps. Verified per-workflow build
lists (preserved verbatim by the composite action — NFR-003):

| Workflow | Jobs | `packages` input (ordered) |
|---|---|---|
| core-ci | core-lint / core-test / core-coverage | *(empty)* / `core` / `core` |
| engine-ci | engine-lint / engine-test / engine-coverage | `core` / `core engine terrain` / `core engine terrain` |
| fog-ci | all 3 jobs | `core engine` |
| logging-ci | all 3 jobs | *(empty)* — logging has zero workspace deps |
| manual-ci | verify | `design` (the Astro build stays a job step) |
| matchmaking-ci | all 3 jobs | `version core engine terrain fog logging networking` |
| network-ci | all 3 jobs | `version logging core engine fog` |
| terrain-ci | all 3 jobs | `core engine` (engine build is existing behaviour; preserved) |
| client-ci | console-lint / console-test / console-e2e / console-coverage | `version design core engine terrain fog logging networking matchmaking` |
| client-ci | design-browser-test / design-coverage / version-coverage | `design` / `design` / `version` |

The `changes` (dorny/paths-filter) jobs keep their own checkout + filter — change-detection stays
per-workflow (008 Edge Cases). `client-ci`'s own-package builds ("Build console (brand asset
staging)", "Build console application (coverage host fixtures)") stay as job steps — the action
covers only the prologue.

### 2.3 Path-filter facts (FR-027 closure semantics)

Workspace manifest facts re-verified: matchmaking deps = core/engine/logging/networking/terrain
(NOT fog); networking deps = core/engine/fog/logging/version; fog peer = engine; engine deps =
core, devDeps = terrain; terrain deps = core; console deps = all nine libs; manual deps = design.
Closure semantics (own deps/dev/peer, then each reached dependency's **non-dev** entries,
recursively) reproduce exactly the two misses: `matchmaking-ci.yml` omits `packages/fog/**`
(matchmaking→networking→fog) and `engine-ci.yml` omits `packages/terrain/**` (direct devDep of
engine). Fog `{engine, core}` and networking `{core, engine, fog, logging, version}` filters are
already closure-complete; `terrain-ci.yml`'s `packages/engine/**` over-watch is recorded and left
alone.

### 2.4 Conformance-program state

- console: `tsconfig.conformance.json` (`include: src/**/*` + `tests/integration/contract-conformance.test.ts`)
  + script; wired in `client-ci.yml:166`, `verify.sh` Phase 3, `verify-changed.sh` Tier D. The model.
- matchmaking: `tsconfig.conformance.json` exists (`include: src/**/*, contracts/**/*, tests/lobby-conformance.test.ts`)
  + script — invoked by NO workflow (`matchmaking-ci.yml:172-173` even names it in a comment) and
  not by `verify.sh`; include set omits `tests/conformance.test.ts` (the 006 cross-package witness).
- networking: nothing; `tests/contracts-conformance.test.ts` carries the type witnesses (engine
  mirrors, payload exhaustiveness, 010 lobby/roster transcriptions, resume-secret pins) that never
  compile; imports `node:fs`/`node:url` → conformance tsconfig needs `"types": ["node"]`.
- fog: nothing; `tests/conformance.test.ts` (T039) witnesses are local-only imports
  (`../src/contracts/engine-to-fog`, `../src/index`, `../src/types`); runtime half is
  `expect(true).toBe(true)` keep-alives.
- None of the three witness tests self-import their own package by name (checked) → the conformance
  runs do NOT need their own package's `dist`, only upstream dists that the CI lint jobs and
  `verify.sh` Phase 1 already build.

### 2.5 #145 remainder facts

- `packages/matchmaking/contracts/` holds exactly `match-types.ts` (654 LOC) + `matchmaking-api.ts`
  (355 LOC), exposed by `"./contracts/*": "./contracts/*.ts"` and listed in `files`. Every other
  contracts-bearing package uses `src/contracts/`.
- Importers of the old directory: **57 files** — 21 at `src/*.ts` depth (`'../contracts/…'`), 36 at
  `src/internal/*` and `tests/**` depth (`'../../contracts/…'`; zero at depth 3), plus
  `src/contracts/lobby-api.ts:40` (`'../../contracts/match-types'`), plus exactly two cross-package
  references in `packages/console/tests/integration/contract-conformance.test.ts` (:42 import via
  the subpath export; :356 `API_VERSION_SOURCES` path string that the test **reads from disk** and
  regexes, so it must point at the moved file or the test fails).
- `MATCHMAKING_API_VERSION` is a pure local `const` in `match-types.ts:64`. The barrel
  (`src/index.ts`) deliberately re-exports **no contract values** to keep `dist/index.js` free of
  runtime `@europa/engine`/`@europa/terrain` imports; the only value import of `match-types.ts`
  from the bundle is `DEFAULT_MATCH_SETTINGS` (via `matchmaker.ts`), so the module is already
  bundled and exporting the one pure const adds no external runtime import (drill: grep
  `dist/index.js` after build).
- 001's `specs/001-core-game-engine/contracts/README.md` still claims `packages/engine/src/contracts/`
  ships seven files (`flow-rate.ts`, `engine-to-fog.ts`, …) that live elsewhere or were deleted.
- `specs/003/.../contracts/` is README-only → the FR-033 guard passes vacuously; no `.ts` remains
  under `specs/*/contracts/**` anywhere (25 files at that glob depth, all `.md`).

### 2.6 Issue-text vs. tree deltas (PR-description provenance; salvaged from the dissolved amendment manifest)

The review issues' prose was checked against the tree, not trusted; where they differed, the amended FRs follow the tree:

- Issue #133 says `verify.sh` "omits core" — stale by one commit: core's typecheck/lint/test entered `verify.sh` via #154 (2026-09-10, same day as the review). The remaining core gap is the `core-coverage` job, which FR-024 closes.
- Issue #133's "12 workflows duplicate the build prologue" is not reproducible: the verified counts are 13 workflows with `pnpm/setup`, 9 with build steps, 9 package workflows (§2.2).
- The `@europa/logging` test gap (CI runs it, no local gate did) was found in grounding, not named in the issue text; it is in FR-024 because it is exactly the issue's failure class.
- Two grounding observations recorded then and still true: `pnpm --filter @europa/console test:selfhost` runs in `verify.sh` but in no workflow (reverse gap, not amended); matchmaking's `test:conformance`/`test:lobby-conformance`/`test:soak` are covered locally because its `test` script (`vitest run`) includes those files per its vitest config.
- Issue #144's verb "add" ("Add the missing 006/010 contract comparisons") is satisfied as "wire" for BOTH comparisons, per user-confirmed PM ruling: 010's comparisons exist (§2.4) and are made effective by wiring; 006's comparison is the existing cross-package suite (`tests/conformance.test.ts`) brought into the compiled program — nothing new is authored, and no spec-side transcription is created (the 006 contracts README rules TypeScript contracts live in the package). The ruling survives W3's directory move: the witness program pins the package's exported surface, and the include set travels with the files (006 FR-027 interference check).

## 3. Constitution alignment

- **V (simplicity)**: no parity meta-script (user cut); the composite action is one action with one
  string input and one loop; the guard is one grep-style script modeled on the existing
  `check-orphaned-vitest-configs.ts`; drills are throwaway, never committed.
- **IV (specs as documentation)**: every spec touched by the tree edits is amended in the same
  change set — including the one place the spec is *wrong about the platform* (FR-026's checkout
  extraction, §5.1) and the stale READMEs/comments (#145 remainder). AC checkboxes and status lines
  flip only when the work is actually done (T-020).
- **III (tested game logic)**: untouched — no coverage threshold changes; the `@europa/core`
  coverage gate merely moves into local reach (FR-024).
- **I (type safety)**: conformance programs are strict `tsc -p` runs with `noEmit: true`
  (NFR-010); no suppressions may be used to make a witness compile (see triage rule, §7).
- **Determinism discipline**: nothing in this delivery touches tick logic; guard/scripts are
  pure filesystem scans with no wall-clock assertions.

## 4. Deliverable structure (every new/edited file, by wave)

### W1 — #144 conformance programs + wiring
**New**
- `packages/networking/tsconfig.conformance.json` — extends `../../tsconfig.base.json`,
  `noEmit: true`, `types: ["node"]`, `include: ["src/**/*", "tests/contracts-conformance.test.ts"]`.
- `packages/fog/tsconfig.conformance.json` — same shape, `include: ["src/**/*", "tests/conformance.test.ts"]`.
**Edited**
- `packages/networking/package.json`, `packages/fog/package.json` — add
  `"typecheck:conformance": "tsc -p tsconfig.conformance.json"` (matchmaking's script already exists).
- `packages/matchmaking/tsconfig.conformance.json` — add `tests/conformance.test.ts` to the include set.
- `.github/workflows/network-ci.yml`, `fog-ci.yml`, `matchmaking-ci.yml` — one step each in the
  `*-lint` job (which already builds every dist the program compiles against):
  `Typecheck conformance (<pkg>)` → `pnpm --filter @europa/<pkg> typecheck:conformance`.
  No job/check renames (branch protection).
- `scripts/verify.sh` — Phase 3 becomes the four-program conformance phase.

### W2 — #133 verify.sh parity + composite action + path filters
**New**
- `.github/actions/build-workspace/action.yml` — composite action:
  `inputs.packages` (space-separated `@europa/<name>` list, default empty) →
  step 1 `pnpm/setup@fbda4c85fc2e1e08721cd8763afea8f48d60f024 # v3.0.0` (runtime node@22, cache,
  require-lockfile — verbatim from today's prologues, SHA-pinned per FR-006); step 2 `shell: bash`
  loop `for pkg in ${{ inputs.packages }}; do pnpm --filter "@europa/$pkg" build; done`
  (bash runs `-eo pipefail` by default → fail-fast, identical to today's chained steps).
  `actions/checkout` is NOT inside the action — see §5.1.
**Edited**
- `.github/workflows/{core,engine,fog,logging,manual,matchmaking,network,terrain}-ci.yml` and
  `client-ci.yml` — in every heavy job replace the `pnpm/setup` + build-prologue steps with
  `uses: ./.github/actions/build-workspace` + `with: { packages: … }` per the §2.2 table; keep
  `actions/checkout` as the job's first step (platform constraint, §5.1); keep every gate step,
  artifact upload, cache step, `changes` job, concurrency, permissions, job ids and names
  byte-identical otherwise.
- `.github/workflows/engine-ci.yml` — additionally: add `packages/terrain/**` to BOTH the push
  `paths:` list and the dorny filter; replace the two false-commented steps
  ("…terrain peer-depends on engine types" at :115/:139) with corrected comments
  (engine's **devDependency** on `@europa/terrain` feeds its replay CLI/scripts, which need
  terrain's dist) at the action call sites (NICE-1; 008 FR-027).
- `.github/workflows/matchmaking-ci.yml` — additionally: add `packages/fog/**` to BOTH filter lists.
- `scripts/verify.sh` — new Phase 5b (the four console CI-parity suites, invoked directly per
  Gate-1 SHOULD-1) and new Phase 5c (core coverage + logging test); placement rationale §5.3.
- `specs/008-ci-workflows/spec.md` — FR-026/AC-027 wording correction (§5.1) + change-log note.

### W3 — #145 remainder
**Moved (git mv)**
- `packages/matchmaking/contracts/{match-types.ts,matchmaking-api.ts}` → `packages/matchmaking/src/contracts/`
  (root `contracts/` directory disappears).
**Edited**
- ~57 files under `packages/matchmaking/{src,tests}/**` — import specifiers repointed by directory
  class: `src/*.ts` `'../contracts/X'` → `'./contracts/X'`; `src/internal/*.ts` `'../../contracts/X'`
  → `'../contracts/X'`; `tests/**` `'../../contracts/X'` → `'../../src/contracts/X'`;
  tests root-depth files (`tests/conformance.test.ts`, `tests/lobby-conformance.test.ts`)
  `'../contracts/X'` → `'../src/contracts/X'`;
  `src/contracts/lobby-api.ts` `'../../contracts/match-types'` → `'./match-types'`.
- `packages/matchmaking/package.json` — DROP `"./contracts/*"` export (no shim, binding decision 6);
  `files: ["dist"]`.
- `packages/matchmaking/tsconfig.json` — `include: ["src/**/*"]` (contracts now inside src).
- `packages/matchmaking/tsconfig.conformance.json` — `include: ["src/**/*", "tests/conformance.test.ts",
  "tests/lobby-conformance.test.ts"]` (include set travels with the moved files — 006 FR-027
  interference check; this is also 008 FR-031's final shape).
- `packages/matchmaking/src/index.ts` — repointed type-only imports; add the one additive value
  export `MATCHMAKING_API_VERSION` (§5.2); correct the barrel comments that reference
  `../contracts/` and the dropped export path.
- `packages/console/tests/integration/contract-conformance.test.ts` — :42 import becomes
  `import { MATCHMAKING_API_VERSION } from '@europa/matchmaking';`; :356 becomes
  `'packages/matchmaking/src/contracts/match-types.ts'` (disk-read path).
- `packages/matchmaking/tests/unit/board-size-defaults.test.ts` — stale header (:12 `contracts/…`
  wording, :20 deleted spec-side file) + import path.
- `packages/matchmaking/README.md` (~:115-121) — new paths + delete the false "byte-identical
  mirrors of `specs/006-…/contracts/`" claim (the spec-side `.ts` files are gone).
- `specs/006-match-lifecycle-matchmaking/contracts/README.md` — describe the unified
  `src/contracts/` layout (006 FR-027 names this file).
- `specs/006-match-lifecycle-matchmaking/spec.md` — one dated annotation on the v1.8-era
  staleness-correction bullet (:364) that states the old path as current reality. Historical
  planning docs (`specs/006/tasks.md|plan.md|challenge-ledger.md`, `specs/010/issue-74-*/…`) are
  records of past deliveries — left untouched (§5.6).
- `specs/001-core-game-engine/contracts/README.md` — rewrite per 001 FR-024 (shipped layout:
  `packages/engine/src/contracts/` ships `engine-api.ts`/`engine-types.ts`; flow surface in
  `@europa/core/src/flow-rate.ts`; `engine-to-fog.ts` in fog; no instruction to recreate mirrors).
**New**
- `scripts/check-referenced-contract-files.ts` — the FR-033 guard (design §5.4); modeled on
  `check-orphaned-vitest-configs.ts` (node fs walk, no new deps).
- `.github/workflows/contract-guard.yml` — path-gated workflow modeled on `spec-guard.yml`
  (`changes` job + `verify` job running the script; SHA-pinned actions, concurrency,
  workflow_dispatch, contents: read).
**Edited (wiring)**
- `scripts/verify.sh` — new Phase 13 runs the guard.
- Spec status lines + 008 AC checkboxes (final task only).

## 5. Key decisions (with rationale — where the spec leaves room)

### 5.1 Composite action cannot contain `actions/checkout` — spec wording corrected, not faked
FR-026/AC-027 literally ask the action to absorb "checkout + pnpm-setup + workspace-dependency-build"
and for the hand-rolled prologue to be gone. This is **impossible on the GitHub Actions platform**:
a local action (`uses: ./.github/actions/…`) is resolved against `$GITHUB_WORKSPACE`, which is
empty until `actions/checkout` runs in that job — a documented GitHub Actions platform constraint
(a local composite action is resolved from the workspace that `actions/checkout` populates; without
it the runner fails with `Can't find 'action.yml' …`).
Referencing the action remotely (`shaunburdick/europa-neo/.github/actions/…@ref`) would
create a first-PR chicken-and-egg and a mutable-ref hazard, and expressions are not allowed in
`uses:`. **Resolution**: the action carries pnpm-setup + the dependency-build loop; `actions/checkout`
stays as each job's first step; T-011 amends FR-026/AC-027 (in the still-pending v1.4) to say so
explicitly, so the spec stays truthful (constitution IV). Everything
the platform *does* allow to be deduplicated — 27 jobs' setup+build blocks — is deduplicated.

### 5.2 `MATCHMAKING_API_VERSION` enters the matchmaking barrel as its single value export
The decision ledger requires repointing ALL importers and dropping `./contracts/*` with no shim.
The only cross-package *value* importer is console's conformance test (:42). Deep-exporting
`./src/contracts/*` would be the forbidden shim by another name (and no other lib package
deep-exports sources). So the new specifier is the package root `@europa/matchmaking`, and the
barrel gains exactly one value export, `MATCHMAKING_API_VERSION` — a pure local const whose
re-export pulls in **no** new runtime upstream import (the containing module is already in the
bundle via `matchmaker.ts`'s `DEFAULT_MATCH_SETTINGS`). The barrel's "no values" comment is
narrowed accordingly, and a drill greps `dist/index.js` for `@europa/engine`/`@europa/terrain`
runtime imports to keep the zero-runtime-deps claim (research.md §9) honest.
Alternative rejected: rewriting the test to read the literal from disk only — the test's
`OBSERVED` map is the runtime half of the version witness; moving the import to the built public
surface is *more* honest (it pins the shipped barrel value, not just the source text).

### 5.3 FR-024 gates placed early in `verify.sh` (Phases 5b/5c), not appended at the end
All six new gates need only the Phase 1 build. Grouping them contiguously after Phase 5 keeps the
"console node-mode" phases together and makes the mandated red-suite drills (AC-024/AC-025) fail in
minutes instead of after the Playwright/selfhost tiers — the drills are the *reason* the phase
order matters, and no gate has a true ordering constraint. Core coverage + logging test get their
own "5c" phase rather than joining Phase 10 because Phase 10's contract is "other package tests"
without coverage gates, and because a failing 5c gate must stop the run *before* the slow tiers.

### 5.4 Guard reference semantics (FR-033)
"Referenced" = the contract file's repo-relative path appears (with or without the `.ts` suffix,
which covers both an import specifier and an explicit path-string mapping like
`API_VERSION_SOURCES`) in any `.ts`/`.tsx` file under `packages/` or `scripts/`. Scope: `.ts`
files under `specs/**/contracts/**` only (recursive, so deeper nests are covered); `.md` prose and
`README.md` exempt by construction; `node_modules`/`dist`/`coverage` skipped. Zero `.ts` files
match today, so the script ships vacuously green and exists as regression protection — exactly the
FR-033 premise. Simple substring matching over a few-thousand-file corpus runs in ≪10s (NFR-005)
and cannot false-positive on the shipped tree; it may over-report "referenced" for a path that
appears only in prose inside a `.ts` comment — accepted, since the guard's job is catching
*unreferenced* re-introduced mirrors, and the false-negative direction (missing a real orphan) is
the one FR-033 must not take… it cannot: a mirror is useless unless something imports or maps it.

### 5.5 `verify-changed.sh` is deliberately untouched
FR-030 names the package workflows and `scripts/verify.sh`; the pre-push `verify:changed` hook is a
fast smoke by design (its own header says CI carries the rest). Adding four conformance runs and
six parity gates to it would contradict its stated tiering. Smallest-change discipline wins; if the
user wants the new gates in the hook later, that is a separate change.

### 5.6 Historical docs are records, not living specs
006's `tasks.md`/`plan.md`/`challenge-ledger.md` and 010's `issue-74-*/` inventory/quickstart
reference `packages/matchmaking/contracts/…` as it existed at their delivery date. Rewriting them
would falsify historical planning trails; only *current-reality* prose (006 spec.md:364, the two
READMEs, the test header, the package README) is corrected.

### 5.7 Red-witness "fails the corresponding CI job" is demonstrated by identity of command
FR-032 forbids committing the broken state, so the CI-job half of the drill cannot be observed on
a pushed commit without violating it (or force-pushing, which is forbidden outright). The drill
records: local transcripts of the broken witness failing `pnpm --filter <pkg> typecheck:conformance`
AND `pnpm verify` (Phase 3), plus the statement that the CI step runs the identical command. This
is the only reading of FR-032/AC-032 consistent with "never committed".

### 5.8 New check names vs branch protection
The new `contract-guard.yml` workflow and the new conformance *steps* introduce new check names
(steps don't, workflows do). Existing job ids/names are preserved everywhere, so no currently
required check disappears; adding the new workflow check to branch protection is a maintainer
post-merge action, recorded in the PR description — out of our change set.

### 5.9 Review-ref identifications (salvaged from the dissolved amendment manifest)
- **I-14 = issue #145** ("refactor(contracts): single-source the contract mirrors…", thread T-01) —
  confirmed via `gh issue view 145`; review refs are not indexed by `gh issue list --search`, which
  is why it initially appeared unmapped. Its orphan-deletion half already landed (hygiene pass #160
  deleted `specs/006/…/matchmaking-to-networking.ts`; `specs/001-core-game-engine/contracts/` is
  README-only), and ENGINE_CONSTANTS single-sourcing landed with issue #96 — W3 does only the
  remainder (§2.5).
- **I-06 = issue #128** ("ci(core): gate @europa/core and fix its coverage and canonical formula",
  P0, thread T-10) — #145's named dependency. CLOSED, stateReason COMPLETED (2026-09-11): the core
  gating it demanded landed on `main` (`core-ci.yml` lint/test/coverage; `verify.sh` Phase 10 runs
  `@europa/core test`, added by #154). Dependency satisfied; this delivery is unblocked.
- **Fold-in provenance**: #145 rides with #144/#133 on one branch/one PR (user decision
  "alongside") because it is the enabling half of the same T-01 contract-drift thread that #144's
  conformance wiring closes. (The amendment-manifest structure originally used to track the fold-in
  was rejected by the user — 016 was a mistake, not a pattern; decisions live in the amended specs
  plus this plan.)

## 6. Wave structure & dependency reasoning

| Wave | Content | Why this order |
|---|---|---|
| **W1** (#144) | Conformance programs + CI/verify wiring + red-witness drill | Programs must exist before `verify.sh` Phase 3 can list them; W1 and W2 both edit `verify.sh` and the same three `*-ci.yml` files (W2 rewrites their prologues) — strictly-after avoids double edits of the same hunks. |
| **W2** (#133) | Composite action → 9 workflows; path filters (engine/matchmaking); verify.sh FR-024 phases; FR-026 wording amendment; red-suite + transitive-filter drills | Action must exist before adoption; engine/matchmaking adoption and their filter edits share the same two files → one task each; the drills must run after wiring; `verify.sh` is now frozen for W3. |
| **W3** (#145 remainder) | Contract move + repoint; READMEs/comments; guard script + wiring + drills; final full verify + spec status flips | Only overlaps W2 on `verify.sh` (guard = new Phase 13) → sequenced after. Guard can be built in parallel with the move (it is vacuously green either way) but is *wired* after `verify.sh` settles. 001's README fix and the guard script have no wave-internal dependencies → `[P]`. |

## 7. Risks & contingency

- **First compile of the three new programs may surface real drift** (their "fails typecheck"
  claims were aspirational — 004 v1.12/002 v1.10 say so). Triage rule, in the tasks: (a) stale
  *witness/transcription* → correct it against the package's shipped surface and the owning design
  doc (`specs/010-…/contracts/*.md`), recording the fix — a witness that doesn't compile is not a
  witness (008 cross-cutting decision 1); (b) genuine *source-side contract drift* → STOP and
  report to the dispatcher (changing shipped types is spec-004/002 territory, not this delivery);
  (c) never silence with `@ts-ignore`/suppressions (constitution I).
- **tsup tree-shaking of the barrel value export** (§5.2) — covered by the `dist/index.js` grep
  drill; if (unexpectedly) an engine/terrain runtime import appears, fall back to exporting the
  const through a tiny `src/contracts/version.ts` re-export and re-check.
- **Composite-action rollout is untestable locally** — YAML is parse-validated (pyyaml) and
  grep-asserted per workflow, but the first real proof is the PR's own CI runs; every heavy job's
  build list is copied verbatim (§2.2 table) so behavioural drift is detectable by diff review.
- **`timeout-minutes: 2` on lint jobs** — the conformance `tsc` pass adds seconds, not minutes;
  watch the first PR run.

## 8. Verification standard → task mapping (every AC has a verifying task)

| Requirement | Verifying task |
|---|---|
| 008 FR-024 / AC-024 / AC-025 (parity gates red-fail `pnpm verify`) | T-010 (wiring) + T-012 (red-suite drills, 7 runs) |
| 008 FR-026 / AC-027 (composite action; prologue gone) | T-005–T-008 + T-013 grep/YAML audit |
| 008 FR-027 / AC-028 (closure filters; fog→matchmaking, terrain→engine) | T-007 (fix) + T-009 (closure-derivation drill) |
| 008 FR-028 / AC-029 (workflow-count truth) | T-013 (ls + spec audit, tick AC-029) |
| 008 FR-029/FR-030 / AC-030/AC-031 (programs exist + wired; 006 suite in set) | T-001 + T-002 + T-004 checkpoint |
| 008 FR-032 / AC-032 (red-witness drill recorded) | T-003 |
| 008 FR-033 / AC-033 (guard green/red/<10s/wired, terrain untouched) | T-017 + T-018 + T-019 |
| 008 NFR-010 (compiler-only programs) | T-001 (`noEmit`, no new deps) |
| 006 FR-027 (unification + drills) | T-014 + T-015 + T-020 |
| 001 FR-024 (001 contracts README) | T-016 |
| 004 FR-028 / 002 FR-013 (witness programs compiled + wired) | T-001 + T-002 + T-003 |
| Spec-status truth (008 ACs ticked, 001/002/004/006/008 statuses flipped) | T-020 |

## 9. Commit grouping (conventional commits; local only — never push without explicit instruction)

- **W1**: `feat(ci): add networking and fog conformance programs, compile the 006 cross-package suite (008 FR-029/FR-031)` · `feat(ci): wire the four conformance programs into package workflows and verify.sh (008 FR-030)`
- **W2**: `ci: extract build-workspace composite action for the nine package workflows (008 FR-026)` · `fix(ci): add transitive workspace deps to engine and matchmaking path filters (008 FR-027)` · `feat(verify): add the bounded CI-parity gates to verify.sh (008 FR-024)` · `docs(spec): correct 008 FR-026/AC-027 for the composite-action platform constraint`
- **W3**: `refactor(contracts): move matchmaking contracts under src/contracts, drop the subpath export (006 FR-027)` · `docs(contracts): fix stale contract READMEs and comments (001 FR-024, 006 FR-027)` · `feat(ci): add the referenced-contract-file guard (008 FR-033)`
- Drill tasks produce **no commits** (throwaway edits restored with `git restore`; throwaway scripts live in `/tmp`). Commitlint + the bot-trailer hook enforce message hygiene; the pre-push hook runs `verify:changed` automatically if a push is ever authorised.

## 10. Out of scope (re-stated so nothing creeps back)

Terrain/#138 beyond the engine path-filter fix; remaining per-package coverage gates in `verify.sh`;
the parity meta-script (cut); composite action in non-package workflows (`pages-deploy.yml`
explicitly excluded); any spec-side `.ts` mirror; re-doing #145's landed half; test *content*
rewrites; `verify-changed.sh`; branch-protection settings; issue closure on GitHub (dispatcher's
call after merge-readiness).
