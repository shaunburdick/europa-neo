# PM Handoff: CI Base Image, Job Split and Three-Way Shard (spec 008 v1.8, issue #223)

- Spec: `specs/008-ci-workflows/spec.md` — v1.8, amended 2026-10-27 for a three-way e2e
  shard (FR-046/AC-047) and a dated `manual-ci.yml` exception to NFR-012.
- Plan / Tasks: `plan.md`, `tasks.md`. **Stale on one point**: §D-9, §D-15 and T-004 still
  describe the two-way shard; the spec's three-way amendment governs.
- Branch: `ci/223-ci-base-image` off `origin/main` (`45ece60`), PR **#224** (draft).
- Constitution: `.specify/memory/constitution.md` · Repo rules: `AGENTS.md`.
- Tracking issue: https://github.com/shaunburdick/europa-neo/issues/223

## Phase

Phase 6, one change set carried in four pushes. P1 (image, in-image toolchain, pinned
labels), P2 (split, two-way shard, config parity), P2b (three-way shard), P3 (timeouts)
and P4 (docs, pin rationale) are pushed and green. Remaining: T-006 drills, T-007 (ten
green component/a11y/perf runs), T-008 (sample + attribution + check names), T-009
(close-out).

## Shipped shape

- **Image**: browser work runs in `mcr.microsoft.com/playwright:v1.62.1-noble` — four
  definitions (`client-ci.yml` design-browser-test, console-e2e, console-browser,
  console-coverage) plus `manual-ci.yml` `verify`: **seven image jobs per Client CI run**
  (the e2e definition is a three-leg matrix).
- **In-image toolchain**: `.github/actions/build-workspace` takes `runtime: none`, which
  passes `pnpm/setup` no runtime and `node-version-file: false` — pnpm 11.22.0 is fetched
  as a native binary and the image's Node 24.18.1 is used. No Node install, no apt, no
  Playwright install anywhere under `.github/workflows/`.
- **Split**: `Test suites (console — e2e)` (three-way matrix, `--shard=<n>/3`,
  `fail-fast: false`, `workers` still 2, contract conformance in every leg) and
  `Test suites (console — browser: component/a11y/perf)` (`test:component`, `test:a11y`,
  `test:perf` at `EUROPA_PERF_BUDGET_FACTOR=2`). The combined job is gone; step names
  carried over unchanged.
- **Reload class**: both browser configs pre-bundle the same four React entries in
  `optimizeDeps.include` (FR-043). Zero `optimized dependencies changed` lines in every
  run since.
- **Labels**: every `runs-on` in the nine package workflows is `ubuntu-24.04`, with the
  pin's reason in one comment per file. The six non-package workflows are untouched.
- **Timeouts**: re-derived from measured maxima (plan §D-7). The two new definitions carry
  computed values (`console-e2e` 5 min against 198 s, `console-browser` 4 min against
  161 s); the other 36 values were above their maxima and are kept; the nine `changes`
  jobs gained 2 min where they had none.
- **`manual-ci.yml`** stays in the image under NFR-012's dated exception: 61 s → 96 s
  against a 71 s allowance, because a ~26 s anonymous pull replaced a Playwright install
  whose cache key hashed a path that does not exist.

## Measurements so far (Client CI, `pull_request`)

| Run | Shape | Wall clock | Slowest job |
| --- | --- | --- | --- |
| `40540579650` | P1 | failed — git ownership in the container (fixed in `6614c08`) | — |
| `40542172649` | P1 | 159 s (after one job rerun) | browser 285 s |
| `40545266584` | P2 two-way | 249 s | e2e (2) 192 s |
| `40546399155` | P2 follow-up | 250 s | e2e (2) 198 s |
| `40548273445` | P2b three-way | **187 s** | e2e (3) 173 s |

Baseline: 306 s median, 337 s allowance. Reload lines: **0 in every run since the config
parity** — three so far (`40545266584`, `40546399155`, `40548273445`); T-007 needs ten.

## Open for the next slice

- **T-006 drills** (scratch branch, never on the PR branch): negative tag drill
  (`v1.61.1-noble` against the 1.62.1 catalog) and the shard-coverage check.
- **T-007**: ten consecutive green `component/a11y/perf` runs, each log grepped for the
  reload line.
- **T-008**: three-run sample + attribution per workflow, AC-040(b) step-name diff,
  check-name photograph from the jobs API.
- **T-009**: full `pnpm verify`, truthfulness audit, NFR-012 verdicts (manual exempt),
  branch-protection order, dated comment on #223.
- **Branch protection**: add `Test suites (console — e2e) (1)`, `(2)`, `(3)` and
  `Test suites (console — browser: component/a11y/perf)` before merge; remove
  `Test suites (console — browser)` after.
- **Doc sync**: plan §D-9/§D-15 and tasks T-004 say two-way; spec Edge Case "Matrix check
  names" still says "two required checks"; FR-045/AC-046 still say the e2e job runs
  `test:e2e` where it runs `exec playwright test --shard`.
