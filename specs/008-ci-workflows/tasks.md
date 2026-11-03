# Tasks — Browser Image, Job Split and Three-Way E2E Shard (spec 008 v1.8, issue #223)

**Plan**: `plan.md` (this amendment) · **Branch**: `ci/223-ci-base-image` off `origin/main` · **Spec**: 008 v1.8
**Predecessor task list**: `tasks-coverage-gate-integrity.md` (v1.2/v1.3, kept as a record).
One change set (FR-044), one merge point. The tree is green after **each of the five substantive pushes** (P1, P2, P2b, P3, P4 — plan §D-17); two docs-only pushes ride between them. On a PR run the change filter evaluates the PR's cumulative diff, so every push after P1 ran every gate — the sample is P2b, P3, P4 (the shipped three-way shape), with P2 recorded as the two-way comparison. No prepare job, no artifact.

## Waves

| Wave | Tasks | Gate |
| --- | --- | --- |
| W0 — evidence, no tree change | T-001, T-002 `[P]` | Baselines and the in-image perf result recorded before the tree moves; a failing perf budget stops the work here |
| W1 — P1, P2, P2b | T-003 → T-004 | P1 (image + toolchain + labels) green, then P2 (split + two-way shard + config) green, then P2b (three-way shard) green |
| W2 — P3, P4 and drills | T-005, T-006 `[P]` | P3 (timeout values) then P4 (pin rationale + `CONTRIBUTING.md`) green; drills recorded from a scratch branch, never on the PR branch |
| W3 — evidence runs | T-007, T-008 `[P]` | 10/10 green component runs, zero reload lines; sample + attribution captured |
| W4 — close-out | T-009 | Full local gate + truthfulness audit + NFR-012 verdict, including the `manual-ci` exception |

9 tasks. Parallel markers are per wave only; a task's `Depends` line is authoritative.

---

## W0 — Evidence (before touching the tree)

### T-001 — Capture per-workflow baselines, the gate inventory and the browser job's step breakdown (NFR-012, AC-040, AC-045, AC-047)

- **Depends**: none · **Files**: `specs/008-ci-workflows/pr-body.md` (new) § Baselines, § Inventory, § Pre-change browser path
- Per workflow, the last three green `pull_request` runs in which at least one non-`changes` job ran (`changed == true`): run ids, wall clock (`run_started_at` → `updated_at`), median, NFR-012 allowance (`median + max(10 s, 10%)`). Add run **40399256099** for Client CI as AC-040's named baseline.
- From the most recent sample of each workflow, the job display names and each job's step names (`gh api /repos/shaunburdick/europa-neo/actions/runs/<id>/jobs --jq '.jobs[] | {name, steps: [.steps[].name]}'`), plus the per-step durations of `Test suites (console — browser)` in run 40399256099 (plan §2.5) as the attribution baseline.
- Count the e2e specs: `ls packages/console/tests/e2e/*.spec.ts | wc -l` and per-file `test(` counts (plan §2.6).
- **Done when**: nine rows with three run ids each (or a recorded shortfall), a median and an allowance per row; the inventory dump; the browser job's step table; the 16-file spec inventory. The evidence commit precedes every workflow edit.
- **Verify**:
  ```bash
  sed -n '/^## Baselines/,/^## /p' specs/008-ci-workflows/pr-body.md
  sed -n '/^## Pre-change browser path/,/^## /p' specs/008-ci-workflows/pr-body.md
  ls packages/console/tests/e2e/*.spec.ts | wc -l          # 16
  git log --format='%h %s' origin/main..HEAD               # evidence commit precedes the first "ci:" commit
  ```

### T-002 — Record the image facts and measure `test:perf` inside the image (FR-036, FR-042, AC-036, AC-042, NFR-014)

- **Depends**: none · **Files**: `pr-body.md` § Image facts, § Perf in the image
- Probe `mcr.microsoft.com/playwright:v1.62.1-noble`: `node --version` (expect v24.18.1), `npm ls -g --depth=0`, `ls /ms-playwright`, `id`, image digest, and an anonymous pull (`docker logout mcr.microsoft.com && docker pull …`). Record `pnpm why playwright-core` and `pnpm --filter @europa/console exec playwright --version` (expect `Version 1.62.1`).
- Run `test:perf` in the image per plan §D-8 (disposable copy, `pnpm install && pnpm build` inside, factor unset then `EUROPA_PERF_BUDGET_FACTOR=2`), recording paint min-round-median and p99 against the 8 ms budget.
- **Done when**: the image facts and the perf table (both runs, pass/fail, numbers) are recorded. If the factor-2 budget fails, **stop** and escalate the numbers to the owner as an FR-042 finding — W1 does not start.
- **Verify**:
  ```bash
  docker run --rm mcr.microsoft.com/playwright:v1.62.1-noble sh -c 'node --version; ls -d /ms-playwright/chromium-*'
  sed -n '/^## Perf in the image/,/^## /p' specs/008-ci-workflows/pr-body.md
  ```

---

## W1 — P1 (image, toolchain, labels) then P2 (split + shard)

### T-003 — P1: every browser job in the image, no run-time installs, host labels pinned (FR-035…FR-038, FR-047, AC-036, AC-048)

- **Depends**: T-002 · **Files**: `.github/actions/build-workspace/action.yml`, `.github/workflows/{client,core,engine,fog,logging,matchmaking,network,terrain,manual}-ci.yml`
- Action: add the `runtime` input (default `node@22`) and the two mutually exclusive `pnpm/setup` steps from plan §D-4.
- `client-ci.yml`: add `container: { image: mcr.microsoft.com/playwright:v1.62.1-noble }` to `design-browser-test`, `console-e2e` (still the combined job at this push) and `console-coverage`; pass `runtime: none` to their action calls; add the D-6 toolchain/version step to each; delete both `Cache Playwright browsers` steps and both `Install Playwright Chromium` steps.
- `manual-ci.yml` `verify`: same container, same `runtime: none`, same D-6 step; delete its cache and install steps; keep the job name and the `@europa/design` build list.
- Add `Trust the workspace checkout` (`git config --global --add safe.directory "$GITHUB_WORKSPACE"`) as the first step after checkout in every in-image job: the container runs as root over a runner-owned checkout and `selfhost.spec.ts` shells out to `git`, which refuses such a repository. (Shipped in the P1 fix; without it the first image run fails.)
- Every `runs-on` in the nine files becomes `ubuntu-24.04`. Timeouts unchanged at this push (T-005 measures first).
- **Done when**: no `playwright install`/`--with-deps`/`ms-playwright`/`Cache Playwright` anywhere under `.github/workflows/`; three job definitions in `client-ci.yml` (`design-browser-test`, the still-combined `console-e2e`, `console-coverage`) and `manual-ci.yml`'s `verify` carry `container:` with the exact tag and `runtime: none`; every in-image job trusts the checkout; no `ubuntu-latest` remains in the nine; job display names unchanged.
- **Verify**:
  ```bash
  grep -rnE 'playwright install|--with-deps|ms-playwright|Cache Playwright' .github/workflows/   # no output
  grep -c 'container:' .github/workflows/client-ci.yml            # 3 at this push
  grep -c 'runtime: none' .github/workflows/client-ci.yml         # 3
  grep -n 'runtime: none' .github/workflows/manual-ci.yml         # 1
  grep -c 'safe.directory' .github/workflows/client-ci.yml        # 3 (one per in-image job at this push)
  grep -c 'ubuntu-latest' .github/workflows/{client,core,engine,fog,logging,matchmaking,network,terrain,manual}-ci.yml  # 0 each
  python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')];yaml.safe_load(open('.github/actions/build-workspace/action.yml'))"
  ```

### T-004 — P2 then P2b: split the browser job, shard e2e two ways, then three ways; give the coverage config the pre-bundle list (FR-043, FR-045, FR-046, AC-043, AC-046, AC-047)

Two pushes, one task: **P2** carries the split and a two-way shard, **P2b** raises it to three ways. They are separate so the shard's effect is measured against the split's, which is exactly the comparison §8.2 records.

- **Depends**: T-003 · **Files**: P2 — `.github/workflows/client-ci.yml`, `packages/console/vitest.config.coverage.ts`; P2b — `.github/workflows/client-ci.yml`
- **P2**: replace `console-e2e`'s single definition with the two jobs in plan §D-14: `console-e2e` (`Test suites (console — e2e)`, `fail-fast: false`, run step exactly `pnpm --filter @europa/console exec playwright test --shard=${{ matrix.shard }}/<n>`, plus the `contract-conformance` step) and `console-browser` (`Test suites (console — browser: component/a11y/perf)`, `test:component`, `test:a11y`, `test:perf` with `EUROPA_PERF_BUDGET_FACTOR: '2'`). Both: image container, `runtime: none`, the `Trust the workspace checkout` step, the prologue with the old job's package list, `pnpm --filter @europa/console build`, the D-6 step, a `timeout-minutes`. Matrix starts at `[1, 2]`.
- **P2**: add the project-level `optimizeDeps.include` block (four entries, identical to `vitest.config.browser.ts`) to the `browser` project in the coverage config.
- **P2b**: raise the matrix to `shard: [1, 2, 3]` and the run step to `--shard=${{ matrix.shard }}/3`. Nothing else changes.
- Do not touch `packages/console/playwright.config.ts` (`workers`, `retries`, `webServer` all stay).
- **Done when**: exactly two job definitions run browser gates; one runs `test:e2e` across **three** legs, one runs the component/a11y/perf trio, and no other job runs either; both build the console, both declare the image container, trust the checkout and pass `runtime: none`; the matrix is `[1, 2, 3]` and the run step is `--shard=${{ matrix.shard }}/3`; every moved step keeps its old name; the two `optimizeDeps` blocks are textually identical.
- **Verify**:
  ```bash
  grep -nE 'name: Test suites \(console — ' .github/workflows/client-ci.yml     # exactly the two new names
  grep -nE 'name: Test suites \(console — browser\)$' .github/workflows/client-ci.yml   # no match (anchored; a substring grep also hits the new component name)
  grep -c 'container:' .github/workflows/client-ci.yml                         # 4 — design-browser-test, console-e2e (one definition, three matrix legs), console-browser, console-coverage
  grep -c 'runtime: none' .github/workflows/client-ci.yml                      # 4 — one per in-image job definition that uses the action (same four)
  grep -c 'safe.directory' .github/workflows/client-ci.yml                     # 4 (same four)
  grep -c 'build-workspace' .github/workflows/client-ci.yml                    # 8 (7 existing consumers + the new job)
  grep -nE 'shard: \[1, 2, 3\]|--shard=\$\{\{ matrix\.shard \}\}/3' .github/workflows/client-ci.yml   # matrix + run step, two lines
  grep -cE 'test:(e2e|component|a11y|perf)' .github/workflows/client-ci.yml   # 4, one each
  grep -c 'EUROPA_PERF_BUDGET_FACTOR' .github/workflows/client-ci.yml          # 2
  diff <(sed -n '/optimizeDeps/,/},/p' packages/console/vitest.config.browser.ts) \
       <(sed -n '/optimizeDeps/,/},/p' packages/console/vitest.config.coverage.ts)
  python3 -c "import yaml;yaml.safe_load(open('.github/workflows/client-ci.yml'))"
  ```

---

## W2 — P3 and P4 (numbers, then rationale + docs) and the drills

### T-005 — P3 + P4: keep-or-raise timeouts, then the pinned-label rationale and the `CONTRIBUTING.md` pointer (FR-041, FR-044, AC-041, AC-044)

Two pushes, one task. **P3** carries the timeout values; **P4** carries the docs and the one-line rationale comment. P4's workflow-file touch is what keeps every workflow's run history rich enough to sample, and the comment is the pin's missing *why*.

- **Depends**: T-004 · **Files**: P3 — the nine workflow files; P4 — the nine workflow files, `CONTRIBUTING.md`
- **P3**: from the per-job maxima of the runs available at P3 (P1's fix, P2, P2b), apply plan §D-7: **keep** a job's current `timeout-minutes` when it is at or above that job's measured maximum; **raise** it to `ceil(max/60) + 1` when it is below; give a job with no clock the computed value (`ceil(max/60) + 1`). Record every row in `pr-body.md` § Timeouts as `max → kept|raised|added value`, and record the tally: the shipped result is **28 kept, 2 computed (`console-e2e` 5 min from 198 s, `console-browser` 4 min from 161 s), 9 `changes` jobs added at 2 min, nothing raised**.
- **P4**: one comment line above each of the nine `runs-on: ubuntu-24.04` values recording why the label is pinned (008 FR-038) — the pin's rationale currently lives only in the spec, and every file carries it; plus the `## CI` bullet in `CONTRIBUTING.md` replaced with plan §D-11's text (leave § Pull requests, line 157, alone).
- **Done when**: every job that carried a `timeout-minutes` on the baseline tree still carries one (FR-041's wording — not "every job has one", which is a stronger claim the spec does not make), no value sits below its job's measured maximum, the two new job definitions carry their computed values, the nine `changes` jobs carry the 2-minute value added here, and the recorded table matches the YAML row for row including the kept/raised/added decision; each of the nine files carries the pin rationale; the CI section names FR-028 and no longer lists workflow files. The `manual-ci` allowance breach is recorded as the spec's dated NFR-012 exception (plan §8.2), not as a passing row.
- **Verify**:
  ```bash
  # P3
  grep -n 'timeout-minutes' .github/workflows/*.yml
  sed -n '/^## Timeouts/,/^## /p' specs/008-ci-workflows/pr-body.md      # compare each pair by hand; tally says 28 kept / 2 computed / 9 added / 0 raised
  grep -nE 'timeout-minutes: (5|4)' .github/workflows/client-ci.yml      # console-e2e 5, console-browser 4
  grep -c 'timeout-minutes: 2' .github/workflows/*.yml                   # the changes jobs
  # P4
  grep -c '008 FR-038' .github/workflows/{client,core,engine,fog,logging,matchmaking,network,terrain,manual}-ci.yml   # 1 each
  sed -n '/^## CI/,/^## Player manual/p' CONTRIBUTING.md
  grep -c 'core, engine, terrain' CONTRIBUTING.md                        # 1 — only § Pull requests
  python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]"
  ```

### T-006 — Drills on a scratch branch (AC-036, AC-046, AC-047) `[P]`

- **Depends**: T-003 · **Files**: scratch branch `ci/223-drill` (branch off the PR branch; nothing merged back)
- **Negative tag drill (AC-036)**: point one in-image job's tag at `v1.61.1-noble` while the catalog says `1.62.1`; push the scratch branch; confirm the D-6 step exits non-zero and the job fails; record run id + failing step + output; drop the branch.
- **Shard drill (AC-046/AC-047)**: from the P2b run, confirm the three e2e legs report `shard 1/3`, `2/3` and `3/3`, that the executed spec files across the three legs cover all 16 files, and that no leg runs another's steps; record all three job ids and the file lists. (The two-way P2 run stays recorded as the shard comparison, not as the drill.)
- **Done when**: the failing step's output and the three shard logs are pasted into `pr-body.md` § Drills; the PR branch's diff contains no `v1.61.1` and no drill commit.
- **Verify**:
  ```bash
  gh run view <drill_run_id> --json conclusion --jq '.conclusion'          # failure
  gh run view <drill_run_id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
  sed -n '/^## Drills/,/^## /p' specs/008-ci-workflows/pr-body.md
  git log --oneline origin/main..HEAD | grep -ci 'drill\|v1\.61\.1'        # 0
  ```

---

## W3 — Evidence runs

### T-007 — Close the reload class with ten green component/a11y/perf runs (FR-043, AC-043)

- **Depends**: T-004 · **Files**: `pr-body.md` § Flake closure
- Re-run `Test suites (console — browser: component/a11y/perf)` (`gh run rerun <run_id> --job <job_id>`) on runs whose `changed` was true until ten consecutive successful attempts exist. Record each job id; grep every log for `optimized dependencies changed. reloading` (zero hits).
- **Done when**: ten consecutive green attempts listed with job ids and a zero-hit grep for each; or the class is still open, in which case the change does not land (plan §R-3).
- **Verify**:
  ```bash
  for j in <job_id_1> … <job_id_10>; do
    gh api /repos/shaunburdick/europa-neo/actions/jobs/$j --jq '"\(.id) \(.name) \(.conclusion)"'
    gh api /repos/shaunburdick/europa-neo/actions/jobs/$j/logs 2>/dev/null | grep -c 'optimized dependencies changed. reloading'
  done
  ```

### T-008 — Post-change sample, attribution breakdown and the check-name photograph (NFR-012, AC-040, AC-045, AC-048)

- **Depends**: T-005 · **Files**: `pr-body.md` § Post-change sample, § Attribution, § Check names
- **The three runs the sample uses: P2b, P3 and P4** — the first three green runs of the shipped three-way shape (`40548273445` 187 s, `40549605350` 202 s, `40550565526` 215 s; median 202 s against the 306 s baseline and the 337 s allowance). Record P2 (two-way, 249/250 s) beside the sample as the comparison, and the tally-fix run (`40551676699`, 218 s) as confirmation — neither enters the median, because a median mixing the two-way and three-way shapes describes neither. Record the four-run range (187–218 s) as the outcome. Every other workflow's median uses the runs of the same three pushes; a run whose gates were all skipped is not a sample (the rule T-001 applied to the baselines).
- Break Client CI's figures out by effect — prologue/setup, each of the three e2e legs, component/a11y/perf — and record the structural finding: the third leg bought 19 s (slowest leg 192 → 173 s), not the ~40–50 s the two-way arithmetic implied, because each leg pays ~74 s fixed and the expensive specs cluster in one leg.
- Run the AC-040(b) step-name diff against T-001's inventory and name every moved and removed step.
- Photograph the check names from the jobs API (`gh run view <id> --json jobs --jq '.jobs[].name'`) and record the exact strings the maintainer must require.
- **Done when**: 3 + 3 run ids and medians per workflow, with P2 and the tally-fix run labelled "context, not a sample"; the attribution table; the 19 s finding; the step diff; the exact new check names (`… (1)`, `… (2)`, `… (3)`, `… component/a11y/perf`) and the one removed name.
- **Verify**:
  ```bash
  sed -n '/^## Post-change sample/,/^## /p' specs/008-ci-workflows/pr-body.md
  gh run view 40550565526 --json jobs --jq '.jobs[] | select(.name|test("console — ")) | .name'
  gh api /repos/shaunburdick/europa-neo/actions/runs/40548273445/jobs \
    --jq '.jobs[] | "\(.name)\t\(((.completed_at|fromdate)-(.started_at|fromdate)))s"'
  ```

---

## W4 — Close-out

### T-009 — Final audit and NFR-012 verdict (AC-041…AC-048)

- **Depends**: T-005, T-007, T-008
- Run the full local gate and the truthfulness audit; compute the NFR-012 verdict per workflow against T-001's baselines — recording `manual-ci` as the spec's dated exception (61 s baseline, 71 s allowance, 96–130 s post-change, median 102 s) rather than as a passing row; record the branch-protection edit exactly as plan §D-16 states it — **one maintainer edit before merge, adding the four replacement contexts and removing `Test suites (console — browser)` in the same change** (performed 2026-10-27, before PR #224 merged; the old context cannot report once the job it names is deleted, so "remove after merge" is not available here); post a dated comment on issue #223 pointing at the spec's two strategy changes (image, split/shard).
- **Done when**: `bash scripts/verify.sh` and `pnpm guard:specs` are green; 15 workflow files; `README.md`/`AGENTS.md` absent from the diff; no `docs/manual/**` or `packages/*/tests/**` change; every AC in plan §10 has its evidence line in `pr-body.md`; every workflow's post-change median is inside its allowance or the shortfall is escalated with the attribution; the PR body records the single pre-merge ruleset edit (four contexts in, old context out) and the date it was made.
- **Verify**:
  ```bash
  bash scripts/verify.sh
  pnpm guard:specs
  ls .github/workflows/*.yml | wc -l                        # 15
  grep -rn 'packages: write' .github/workflows/ | wc -l     # 2 (docker.yml only)
  grep -rniE 'self-hosted|runs-on:.*self' .github/workflows/   # no output (AC-041 / NFR-013)
  grep -nE 'name: Test suites \(console — browser\)$' .github/workflows/client-ci.yml   # no match
  git diff --stat origin/main...HEAD -- README.md AGENTS.md docs/manual packages/*/tests   # empty
  git diff --stat origin/main...HEAD
  ```
