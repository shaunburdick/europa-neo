# PM Handoff: CI Base Image and Shared Prepare (spec 008 v1.8, issue #223)

- Spec: `specs/008-ci-workflows/spec.md` (v1.8, working-tree change, **uncommitted**)
- Plan / Tasks: none yet — architect writes them after Gate 1 approval
- Constitution: `.specify/memory/constitution.md`
- Repo rules: `AGENTS.md`
- Tracking issue: https://github.com/shaunburdick/europa-neo/issues/223

## Branch

`gh-action-cleanup` at `45ece60` (== `origin/main`) + uncommitted `specs/008-ci-workflows/spec.md`
and this handoff. Recommended implementation branch: `ci/223-ci-base-image` off `origin/main`,
carrying the spec amendment as its first commit.

## Phase

Gate 1 complete (three challenge rounds). **Strategy changed by the owner 2026-10-27** after the
first approval question: the repo-owned GHCR image was withdrawn as overkill; the amendment now
specifies the upstream Microsoft Playwright image. Spec re-presented for approval.
Completed: issue #223; evidence from tree + Actions API; amendment; two challenge revisions; strategy
revision; in-image pnpm gap closed.
Blocked: none.

## Decisions

1. **Image (revised 2026-10-27)**: browser jobs run in
   `mcr.microsoft.com/playwright:v<exact resolved @playwright/test>-noble` (1.62.1 today). No
   repository-built image, no GHCR package, no publish workflow, no digest ordering. Workflow count
   stays 15.
2. **Topology**: keep the 9 package workflow files; one shared prepare job per workflow.
3. No self-hosted runners; no lowered coverage thresholds; no removed required checks.
4. Tracking issue: #223.

## What the spec now requires (v1.8)

- FR-035–FR-038: four browser jobs (`console-e2e`, `console-coverage`, `design-browser-test`,
  `manual-ci verify`) in the upstream image; all four `playwright install` sites and three
  `ms-playwright` caches deleted; every other job on `ubuntu-24.04` with normal `pnpm/setup`.
- FR-036: tag == resolved `@playwright/test` == in-image `playwright --version`, checked in-job
  (negative drill included). Rollback is the tag line.
- FR-039: one prepare per workflow on the host, sole invoker of `build-workspace`, union build list,
  consumers fail on missing outputs, 1-day retention; `manual-ci.yml` exempt (single gate job). Every
  in-image job that runs pnpm: no Node install, pnpm must equal `packageManager` (11.22.0).
- FR-040: no gate lost — per-workflow baseline, job + step-name diff via the jobs API.
- FR-041: timeouts re-derived from measured maxima (prepare included).
- FR-042: 2× perf factor stays; `test:perf` measured inside the image before the switch.
- FR-043: dependency-optimizer reload closed with evidence (N pinned in plan); no acceptance branch.
- FR-044: one change set; inventory stays 15; CONTRIBUTING list becomes a pointer to FR-028; README
  and AGENTS counts must not move; `docs/manual/**` untouched.
- NFR-011: read scopes only, anonymous public pull. NFR-012: workflow wall clock, median of 3
  same-class runs, +10 s / +10%. NFR-013: no self-hosted, thresholds unchanged, no test edits.
  NFR-014: Playwright version single-sourced, moved in one PR.

## Open for the plan (not spec gaps)

- Prepare payload (pnpm store vs `dist/**` vs `node_modules`), measured sizes, artifact name.
- N for FR-043 flake-closure evidence + run ids.
- How pnpm is supplied in the four in-image jobs (corepack vs pnpm-only setup mode).
- Per-workflow baseline run ids and medians (recorded in the PR).
- `test:perf` inside the image against the 2× factor.

## Next

1. User approves v1.8.
2. `modern-architect-engineer` → `plan.md` + `tasks.md` in one handoff.
3. Gate 2 over plan + tasks, then user approval.
4. Phase 6: likely >15 tasks across 10 files → orchestration with this handoff first.
5. Gate 3a conformance; before/after workflow medians in the PR body.
