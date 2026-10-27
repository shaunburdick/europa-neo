# PM Handoff: CI Base Image, Job Split and Three-Way Shard (spec 008 v1.8, issue #223)

- Spec: `specs/008-ci-workflows/spec.md` — v1.8, amended 2026-10-27 for a three-way e2e
  shard (FR-046/AC-047) and a dated `manual-ci.yml` exception to NFR-012.
- Plan / Tasks: `plan.md`, `tasks.md` — reconciled with the shipped shape.
- Branch: `ci/223-ci-base-image` off `origin/main` (`45ece60`), PR **#224**, ready for
  review, **not merged**. Evidence lives in `pr-body.md`.
- Constitution: `.specify/memory/constitution.md` · Repo rules: `AGENTS.md`.
- Tracking issue: https://github.com/shaunburdick/europa-neo/issues/223

## Phase

**Phase 6 complete** — T-001…T-009 delivered on one branch in five substantive pushes
(P1 image, P2 split, P2b three-way shard, P3 timeouts, P4 docs) plus evidence and fix
commits; every push green, the branch head green. Two things remain and neither is code:
the maintainer's branch-protection swap, and one post-merge measurement (below).

## Shipped shape

- **Image**: `mcr.microsoft.com/playwright:v1.62.1-noble` for every browser-launching job —
  four definitions in `client-ci.yml` (design-browser-test, console-e2e, console-browser,
  console-coverage) plus `manual-ci.yml` `verify`: **seven image jobs per Client CI run**.
- **In-image toolchain**: `.github/actions/build-workspace` takes `runtime: none` →
  `pnpm/setup` with no runtime and `node-version-file: false`; pnpm 11.22.0 is fetched as a
  native binary and the image's Node 24.18.1 is used. No Node, apt or Playwright install
  anywhere under `.github/workflows/`.
- **Split**: `Test suites (console — e2e)` (matrix `[1, 2, 3]`, `--shard=<n>/3`,
  `fail-fast: false`, `workers` 2, contract conformance in every leg) and
  `Test suites (console — browser: component/a11y/perf)` (`test:component`, `test:a11y`,
  `test:perf` at `EUROPA_PERF_BUDGET_FACTOR=2`). Combined job gone; step names carried over.
- **Reload class**: both browser configs pre-bundle the same four React entries (FR-043).
- **Container fix**: every in-image job trusts the checkout
  (`git config --global --add safe.directory "$GITHUB_WORKSPACE"`) — root in a container
  over a runner-owned checkout is refused by git, and suites shell out to it.
- **Version guard**: the tag/CLI comparison now exits non-zero on a mismatch. It did not
  before the drill found `test A && test B` to be exempt from `set -e`.
- **Labels**: every `runs-on` in the nine package workflows is `ubuntu-24.04`, with the
  pin's reason in one comment per file.
- **Timeouts**: 28 kept, 2 computed (`console-e2e` 5 min from 198 s, `console-browser`
  4 min from 161 s), 9 `changes` clocks added at 2 min; none below its measured maximum.
- **`manual-ci.yml`** stays in the image under NFR-012's dated exception: 61 → 96 s
  against a 71 s allowance, measured 94–140 s across five runs.

## Measurements

| Push | Run | Client CI | Legs | Slowest job |
| --- | --- | --- | --- | --- |
| P1 | `40542172649` | 159 s (one job rerun) | — | browser 285 s |
| P2 two-way | `40545266584` | 249 s | 170 / 192 | e2e (2) 192 s |
| P2b three-way | `40548273445` | **187 s** | 135 / 157 / 173 | e2e (3) 173 s |
| P3 | `40549605350` | 202 s | 124 / 151 / 187 | e2e (3) 187 s |
| P4 | `40550565526` | 215 s | 147 / 146 / 186 | e2e (3) 186 s |

Baseline 306 s median, allowance 337 s. Client CI's three-sample median is **202 s**, best
187 s. The third leg bought 19 s, not the ~40–50 s forecast, because each leg pays ~74 s of
pull + prologue + console build and the expensive specs cluster in one leg.

Reload lines: **0 in 10 consecutive green component/a11y/perf attempts** (job ids in
`pr-body.md` § Flake closure).

**NFR-012 does not hold on six non-client workflows in this sample** (Core 90, Engine 123,
Fog 80, Matchmaking 114, Network 157, Manual 134 s). The attribution is start-up latency,
not job work: job durations match the baseline (Network test 78 vs 79 s, Engine test 36 vs
37 s, Fog coverage 41 vs 41 s), while one Engine run waited 302 s for a runner. Every push
touched all nine workflow files, so all 13 workflows fired together — not a normal PR. The
separable re-measurement is one post-merge PR touching a single workflow; if it is still
above allowance, the `ubuntu-24.04` pin is a cost and FR-038 needs revisiting.

## Post-merge (maintainer)

1. **Branch protection, in this order**: add `Test suites (console — e2e) (1)`, `(2)`,
   `(3)` and `Test suites (console — browser: component/a11y/perf)` before merge; after
   merge remove `Test suites (console — browser)`. No other check name moves.
2. **The NFR-012 re-measurement** described above, on a PR that touches one workflow.
3. Nothing else: no publish step, no image to rebuild, no follow-up code. A Playwright
   bump is a tag change plus the catalog entry inside its own Dependabot-style PR.
