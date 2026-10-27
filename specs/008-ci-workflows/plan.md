# Plan — Browser Image, Job Split and Two-Way E2E Shard (spec 008 v1.8, issue #223)

**Spec**: `specs/008-ci-workflows/spec.md` v1.8 (FR-035…FR-038, FR-040…FR-047, NFR-011…NFR-014, AC-036, AC-040…AC-048)
**Issue**: [#223](https://github.com/shaunburdick/europa-neo/issues/223) · **Date**: 2026-10-27 (revised after the owner withdrew FR-039) · **Branch**: `ci/223-ci-base-image` (off `origin/main`, carrying the v1.8 spec amendment as its first commit)
**Predecessor records**: the v1.2/v1.3 plan this file replaces is kept as `plan-coverage-gate-integrity.md`, with its task list as `tasks-coverage-gate-integrity.md` (repo convention: delivery records stay beside the spec). Nothing was deleted; the previous revision of this plan was never approved and is superseded in place.

## 1. Scope in one paragraph

The console's browser work moves into the upstream `mcr.microsoft.com/playwright:v1.62.1-noble` image, so nothing installs Chromium at run time; every other job in the nine package workflows moves to `ubuntu-24.04` with its existing toolchain. `Test suites (console — browser)` — 302 s, the critical path of `Client CI` — splits into an e2e job (sharded three ways) and a component/a11y/perf job, both in the image and both keeping the console build step. The coverage config gains the pre-bundle list its sibling already had. No prepare job, no artifact, no workflow added: same gates, same thresholds, 15 files.

## 2. Technical context (re-verified against this tree, the Actions API and the image, 2026-10-27)

### 2.1 Tree facts

| Fact | Value | Where |
| --- | --- | --- |
| Workflow files | 15 (9 package, 6 other) | `ls .github/workflows/*.yml` |
| Jobs in the nine package workflows | 38 today; **39 after FR-045's split** (one job definition becomes two) | PyYAML walk |
| `.github/actions/build-workspace` invocations | 29 today; **30 after FR-045's split** — FR-039's tombstone keeps the per-job prologue, so the new job brings its own invocation | PyYAML walk |
| `playwright install` sites | 4 (`design-browser-test` 157, `console-e2e` 272 `--with-deps`, `console-coverage` 331 `--with-deps`, `manual-ci` 77) | `grep -rn 'playwright install' .github/workflows/` |
| `ms-playwright` cache steps | 3 (`client-ci.yml` 265, 316; `manual-ci.yml` 73) | `grep -rn ms-playwright` |
| `packages: write` | `docker.yml` 144 and 271 only | `grep -rn 'packages: write'` |
| `runs-on: ubuntu-latest` in the nine package workflows | 38 | same walk |
| `container:` anywhere | none today | `grep -rn container:` |
| e2e spec files | 16 | `ls packages/console/tests/e2e/*.spec.ts \| wc -l` (AC-047) |

### 2.2 The image, measured (`docker run --rm mcr.microsoft.com/playwright:v1.62.1-noble`)

| Probe | Result | Consequence |
| --- | --- | --- |
| `node --version` | `v24.18.1` | FR-035 now records this divergence from the repo's 22; FR-047's observable is this value, not 22 |
| `command -v playwright` | absent; npm globals are `corepack@0.35.0`, `npm@11.16.0`, `yarn@1.22.22` | the CLI exists in-job only after the job's own `pnpm install` (FR-036 as amended) |
| `ls /ms-playwright` | `chromium-1234`, `chromium_headless_shell-1234`, `ffmpeg-1011`, `firefox-1538`, `webkit-2336` | the in-job check asserts a chromium build is present (D-6) |
| `id` | `uid=0(root)` | container jobs run as root, Playwright's own default for trusted E2E |
| `command -v zstd` | absent; `gzip`, `tar` 1.35, `git` present | nothing to decompress any more; recorded so a future payload idea re-checks it |
| image digest | `sha256:dcc5531e97840b…` | record in the PR; optional hardening, not a pin |

### 2.3 Resolved package facts

`@playwright/test` 1.62.1, `playwright-core` 1.62.1, and `packages/console`'s `playwright --version` prints `Version 1.62.1` (measured locally); `playwright-core/browsers.json` names chromium revision **1234**, the revision in the image. `pnpm-workspace.yaml` catalog pins `@playwright/test: ^1.62.1`; root `packageManager` is `pnpm@11.22.0`; `.node-version` contains `22`.

### 2.4 `pnpm/setup` v3.0.0 inputs (from the action's own `action.yml`, not guessed)

`version`, `dest`, `runtime`, `node-version-file`, `cache`, `cache-dependency-path`, `working-directory`, `package-json-file` (deprecated), `require-lockfile`, `install`, `token` (deprecated). There is **no** "no runtime" flag: omitting `runtime` installs every `devEngines.runtime` entry (this repo has none) **and** Node when a version file supplies it. `.node-version` exists, so a bare omission would install Node 22 into an image job — `node-version-file: false` is what prevents it (D-4).

### 2.5 The job this amendment exists to split — measured step breakdown

`Test suites (console — browser)`, run 40399256099 (job 121844273244), 302 s:

| Step | s | After this change |
| --- | --- | --- |
| Set up job + checkout | 3 | both jobs (+ image pull, counted before the first step) |
| `./.github/actions/build-workspace` (prologue) | 39 | **both jobs** (per-job prologue stays; FR-039 tombstone) |
| Build console (brand asset staging) | 9 | **both jobs** (FR-045) |
| Cache Playwright browsers | 0 | removed (FR-037) |
| Install Playwright Chromium | 23 | removed; the image pull replaces it |
| Component tests (browser mode) | 18 | component/a11y/perf job |
| Accessibility acceptance tests (axe-core) | 7 | component/a11y/perf job |
| E2E tests (Playwright) | **148** | e2e job, split across three shard legs |
| Perf budgets (SC-003) | 44 | component/a11y/perf job (2× factor) |
| Contract conformance | 2 | e2e job |
| Post steps (cache, action, checkout) | ~10 | both jobs, minus the cache post |

### 2.6 E2E spec inventory (16 files — FR-046's basis)

Count-heavy (many tests, short each): `help-overlay.spec.ts` (9 tests), `routing.spec.ts` (8), `identity-migration.spec.ts` (7, 627 lines), `lobby.spec.ts` (7, 660), `shareable-links.spec.ts` (7, 541).
Likely duration-heavy (one test, expensive work): `selfhost.spec.ts` — its single test runs a **production console build** and boots the one-port host; `full-stack-n-players.spec.ts` (426 lines) and `full-stack.spec.ts` (350) each boot a real matchmaker + match server in-process; `sc-017-resume-secret.spec.ts` (3 tests, 458 lines) and `debug-handle-credentials.spec.ts` (3, 289) exercise restart/credential paths.
Per-spec durations are **not** recoverable for the pre-change run (its logs have expired), so §8 treats shard balance as a measured-after risk, not a forecast.

### 2.7 Wall-clock baselines (pre-check; the implementer re-captures at T-001)

Last three green `pull_request` runs per workflow, `run_started_at` → `updated_at`:

| Workflow | run ids (s) | median | NFR-012 allowance |
| --- | --- | --- | --- |
| Client CI | 40396007954 (312), 40353117538 (306), 40340754376 (113) | 306 s | 337 s |
| Manual CI | 40396007836 (61), 40353117563 (56), 40340754507 (74) | 61 s | 71 s |
| Core CI | 40396007851 (74), 40353117420 (51), 40340754461 (74) | 74 s | 84 s |
| Engine CI | 40396007786 (87), 40353117446 (75), 40340754344 (55) | 75 s | 85 s |
| Terrain CI | 40396007915 (116), 40353117572 (75), 40340754525 (97) | 97 s | 107 s |
| Network CI | 40396007781 (98), 40353117442 (92), 40340754584 (89) | 92 s | 102 s |
| Matchmaking CI | 40396007769 (94), 40353117595 (104), 40340754287 (71) | 94 s | 104 s |
| Fog CI | 40396007894 (51), 40353117445 (70), 40340754498 (45) | 51 s | 61 s |
| Logging CI | 40396007807 (39), 40353117575 (39) | 39 s | 49 s |

Client CI's four samples span 113–312 s: single runs mislead, which is why the spec measures medians. Only `Client CI` should move materially; the other eight gain an image pull on their one browser job (`manual-ci`) or nothing at all, and must stay inside their allowance.

### 2.8 Local gate facts

`scripts/verify.sh` and `scripts/verify-changed.sh` name workflow *jobs* only in comments (`console-lint`, `console-coverage`, `console-e2e`, `core-coverage`, `logging-ci`), contain no `playwright install`/`ms-playwright`/`build-workspace` reference, and run `test:e2e`, `test:component`, `test:a11y`, `test:perf` directly rather than through a job. The split renames a check, not a script. **No local gate changes** (D-13).

## 3. Constitution alignment

| Principle | Alignment |
| --- | --- |
| I. Type Safety First | The only TypeScript touched is `vitest.config.coverage.ts`, adding a literal string array; no `any`, no suppression |
| III. Tested Game Logic (≥80%) | No threshold moves, no test content moves, no gate lost; the e2e suite runs the same 16 spec files, in three legs instead of one |
| IV. Specs as Documentation | `CONTRIBUTING.md` stops re-enumerating workflows and points at FR-028; the inventory stays 15 because no workflow is added |
| V. Simplicity Over Cleverness | One image tag, one matrix, one split; no prepare job, no artifact, no Dockerfile, no workflow-count change |
| VII. Self-Hostable by Default | Anonymous public image pull; forks pull the same tag; nothing in CI becomes a private-registry dependency |

## 4. Deliverable structure (by wave and push)

| Wave | Push | Files | Task |
| --- | --- | --- | --- |
| W0 evidence | — | `specs/008-ci-workflows/pr-body.md` (new) | T-001, T-002 |
| W1 | **P1** | `.github/actions/build-workspace/action.yml`, `.github/workflows/{client,core,engine,fog,logging,matchmaking,network,terrain,manual}-ci.yml` | T-003 |
| W1 | **P2** | `.github/workflows/client-ci.yml`, `packages/console/vitest.config.coverage.ts` | T-004 |
| W1 | **P2b** | `.github/workflows/client-ci.yml` (shard three ways) | T-004 |
| W2 | **P3** | the nine workflow files (timeout values) | T-005 |
| W2 | **P4** | the nine workflow files (pinned-label rationale comment), `CONTRIBUTING.md` | T-005 |
| W2 | scratch branch | drill commits, never on the PR branch | T-006 |
| W3–W4 | — | `pr-body.md` | T-007, T-008, T-009 |

## 5. Key decisions

### D-4 In-image pnpm: the composite action with the runtime explicitly suppressed

Every in-image job still runs the prologue — FR-039's tombstone keeps the per-job invocation, so there is no artifact and no consumer shape. That means **all five in-image job definitions** — `console-coverage`, `design-browser-test`, `console-e2e` (three matrix legs), `console-browser`, `manual-ci` `verify` — invoke `.github/actions/build-workspace`, which is seven in-image jobs per full run, and FR-047 applies to all of them. The action gains one input:

```yaml
  runtime:
    description: 'Runtime for pnpm/setup; `none` uses the runner/image runtime and installs no Node'
    required: false
    default: 'node@22'
  …
    - if: inputs.runtime != 'none'
      uses: pnpm/setup@fbda4c85fc2e1e08721cd8763afea8f48d60f024 # v3.0.0
      with: { runtime: '${{ inputs.runtime }}', cache: true, require-lockfile: true }
    - if: inputs.runtime == 'none'
      uses: pnpm/setup@fbda4c85fc2e1e08721cd8763afea8f48d60f024 # v3.0.0
      with: { node-version-file: false, cache: true, require-lockfile: true }
```

The five in-image definitions — seven jobs once `console-e2e` expands — pass `runtime: none`; the other 34 definitions keep the default and are unchanged. `pnpm/setup` with `runtime` omitted and `node-version-file: false` downloads pnpm's self-contained binary (no Node), reads the version from `packageManager` (11.22.0 — one source, no duplicate literal), then runs `pnpm install` with the store cache. Rejected: a standalone `pnpm/setup` step beside a skipped action (two shapes for one job), corepack (downloads pnpm through Node and adds a second toolchain path; FR-047 permits it, this plan picks one), and `runtime: node@22` in-image (reinstalls Node over the image's, violating FR-047's observable).

### D-5 Container user

`container: { image: mcr.microsoft.com/playwright:v1.62.1-noble }` with no `options:`. The image runs as root and Playwright launches Chromium with `chromiumSandbox: false` by default, which is Playwright's documented configuration for trusted E2E in this image; `--user 1001` would change checkout and artifact ownership for no gate. `changes` jobs stay on the host (FR-038: they gate every job and run on every PR, docs-only included). `docker.yml` stays off the image — no daemon. Nothing in the six image jobs needs Docker: `console-e2e`'s selfhost spec shells out to `packages/console/scripts/test-selfhost.sh`, which builds the SPA and boots the node host, and the manual's link test only talks to the Astro dev server.

### D-6 Version agreement in-job

The image ships no `playwright` CLI (G-2), but the job installs its own dependencies, so the CLI and the driver version are both observable after the prologue. One step per in-image job:

```bash
expected=$(pnpm --filter <pkg> exec node -p "require('@playwright/test/package.json').version")
cli=$(pnpm --filter <pkg> exec playwright --version | awk '{print $2}')
tag=$(sed -n 's/.*mcr\.microsoft\.com\/playwright:v\([0-9.]*\)-noble.*/\1/p' .github/workflows/<file>.yml | sort -u)
test "$tag" = "$expected" && test "$cli" = "$expected"
pnpm --filter <pkg> why playwright-core | grep -q "playwright-core@$expected"
ls -d /ms-playwright/chromium-* >/dev/null
node --version
test "$(pnpm --version)" = "$(node -p "require('./package.json').packageManager.split('@').pop()")"
```

That covers FR-036's four values (tag, `@playwright/test`, `playwright --version`, `playwright-core` via `pnpm why` — measured working) and FR-047's three observables (`node --version` = the image's 24.18.1, `pnpm --version` = 11.22.0, no Node install). The chromium-directory assertion fails an image with no browser; a driver/image mismatch still fails loudly at first launch. The AC-036 negative drill (tag → `v1.61.1-noble`) fails on the tag comparison. One step name, shared by all six jobs.

### D-7 Timeouts: keep unless the measured maximum exceeds the current value

**Change from the previous plan** (which re-derived every value and drew a Gate-2 objection): rule is *keep the current `timeout-minutes` if it is at or above that job's measured maximum; otherwise raise it to `ceil(measured_max_seconds / 60) + 1`.* The three new check targets (two split jobs, two shard legs — one job definition each) have no current value and get `ceil(max/60) + 1` from their own measurements. Every row is recorded as `measured max → kept <value>` or `measured max → raised <value>` in `pr-body.md` § Timeouts.

Measurement source: per-job `completed_at − started_at` maxima over the three green post-change `pull_request` runs (P2b, P3 and P4 — T-008's sample); the rows for workflows whose own file had not changed in those runs take their maximum from T-001's baseline runs and say so in the table, which is why the tally below distinguishes sources. `ceil + 1` is the floor for a raised or new value, so a job always has a minute of headroom over anything it was seen to take. FR-041's "no value is kept by default" is read as "no value escapes the measurement" — a kept value is a recorded decision, not an omission (reported as an interpretation in §12).

**Measured result (P3, `608fcac0`): 28 kept, 2 computed, 9 `changes` jobs given 2 min, nothing raised.** The two computed rows are `console-e2e` at **5 min** from a 198 s maximum (the two-way leg; the three-way maximum is 187 s) and `console-browser` at **4 min** from 161 s. Every `changes` job had no clock on the baseline tree and got **2 min** against a 13 s maximum — an addition FR-041 does not require and the change permits, recorded rather than smuggled in. No job lost a clock and no value sits below its measured maximum.

### D-8 `test:perf` inside the image, before the switch

Measured on a disposable copy so the dev worktree's `node_modules` is untouched:

```bash
rm -rf /tmp/perf-image && mkdir -p /tmp/perf-image && git archive HEAD | tar -x -C /tmp/perf-image
docker run --rm --ipc=host -v /tmp/perf-image:/work -w /work \
  -e CI=1 mcr.microsoft.com/playwright:v1.62.1-noble bash -lc '
    npm i -g pnpm@11.22.0
    pnpm install --frozen-lockfile && pnpm build
    node --version
    pnpm --filter @europa/console test:perf                      # factor 1: strict budget
    EUROPA_PERF_BUDGET_FACTOR=2 pnpm --filter @europa/console test:perf'
```

Both runs are recorded in `pr-body.md` § Perf in the image: tag + digest, `node --version`, the paint min-round-median and p99 each run reports against the 8 ms budget, and pass/fail at factor 1 and factor 2. Factor 1 proves the headroom; factor 2 is what CI uses. **If the budget fails inside the image, the switch does not proceed**: the numbers go to the owner as an FR-042 finding — no third factor, no retry, no budget change, no `test:perf` edit.

### D-9 Reload-class closure (FR-043): same pre-bundle list in both browser configs, N = 10

`packages/console/vitest.config.coverage.ts`'s `browser` project gains the `optimizeDeps` block that `vitest.config.browser.ts` already has, at the **project** level (a Vitest project is its own Vite config; a root-level block would not apply to it):

```ts
optimizeDeps: {
    include: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
},
```

N = **10** consecutive green runs of `Test suites (console — browser: component/a11y/perf)` (FR-043's named job as amended), collected after P2 by re-running that job (`gh run rerun <run_id> --job <job_id>`) on runs whose `changed` output was true; each attempt's job id is recorded and each log is grepped for `optimized dependencies changed. reloading` (zero hits). Ten is pinned because one green run is not evidence and the observed abort rate makes ten a meaningful bar without a day-long loop. There is no acceptance branch: a surviving reload leaves FR-043 unclosed and the change does not land (R-3).

### D-10 Baselines before touching the tree (NFR-012, AC-040, AC-045)

T-001 records, per workflow, in `pr-body.md` § Baselines: the last three green **`pull_request`** runs in which at least one non-`changes` job actually ran (`changed == true`), their wall clocks (`run_started_at` → `updated_at`), the median and the NFR-012 allowance, plus — for the most recent of the three — the full job list with step names (`gh api …/runs/<id>/jobs --jq '.jobs[] | {name, steps: [.steps[].name]}'`). For Client CI, run **40399256099** is added as AC-040's named baseline, and its browser job's step breakdown (§2.5) is recorded as the attribution baseline. Captured before any workflow edit; a baseline taken afterwards is not a baseline.

### D-11 `CONTRIBUTING.md`: replace the enumeration with a pointer

`## CI` opens with a list that has drifted (issue #214). Replace exactly that bullet:

- **Before**: `- Per-package CI workflows (core, engine, terrain, fog, networking, matchmaking, console, logging, manual) plus shared workflows for Docker, GitHub Pages, releases, and version drift.`
- **After**: `- The workflow inventory is normative in [spec 008 FR-028](specs/008-ci-workflows/spec.md) — nine package workflows plus six shared ones. It is not re-listed here: the copy that used to live in this file drifted from the tree (issue #214), so the spec is the single source.`

`CONTRIBUTING.md:157` (§ Pull requests) also names workflow groups; it states categories, not a count or an enumeration, and the spec scopes the edit to the CI section, so it is left alone and recorded here rather than changed silently.

### D-13 No local gate changes

`verify.sh` builds the whole workspace and runs `test:e2e`, `test:component`, `test:a11y`, `test:perf` directly; `verify-changed.sh`'s Tier D does the same. Neither references a workflow job except in comments, and every comment's job name survives except `console-e2e`'s display name — which the comment does not quote (it says "the console coverage job's browser project", still true). Answer: **no**, with the evidence in §2.8.

### D-14 The split: what moves, what stays, what both keep

| Old job `Test suites (console — browser)` | `Test suites (console — e2e)` | `Test suites (console — browser: component/a11y/perf)` |
| --- | --- | --- |
| checkout | ✔ | ✔ |
| `Trust the workspace checkout` (`git config --global --add safe.directory "$GITHUB_WORKSPACE"`) | ✔ | ✔ |
| `build-workspace` (prologue, `version design core engine terrain fog logging networking matchmaking`) | ✔ | ✔ |
| `Build console (brand asset staging)` — 9 s | ✔ (FR-045) | ✔ (FR-045) |
| toolchain/version step (D-6) | ✔ | ✔ |
| `Component tests (browser mode)` (18 s) | — | ✔ |
| `Accessibility acceptance tests (axe-core)` (7 s) | — | ✔ |
| `E2E tests (Playwright)` (148 s) | ✔, sharded (D-15) | — |
| `Perf budgets (SC-003)` (44 s, `EUROPA_PERF_BUDGET_FACTOR: '2'`) | — | ✔ |
| `Contract conformance` (2 s) | ✔ | — |
| Cache + Install Playwright | removed | removed |

Job ids `console-e2e` and `console-browser`; display names exactly as FR-045/AC-046 require; every moved step keeps its old name so AC-040(b)'s diff maps by name. Two job definitions, not three (the shards are matrix legs of `console-e2e`). The `Trust the workspace checkout` step is the container fix: a container job runs as root over a checkout the runner owns, and `selfhost.spec.ts` shells out to `git`, so git refuses the repository without it.

The contract-conformance step runs in **every** leg: the step is unconditional, so each leg is self-sufficient and no leg can hide a gate. Cost is ~2 s per leg (measured), well inside the tolerance. Making it leg-specific (`if: matrix.shard == 1`) would save ~4 s and buy a leg-asymmetric job shape; rejected as a complexity-for-nothing trade (reported in §12).

### D-15 Shard mechanics

```yaml
  console-e2e:
    name: Test suites (console — e2e)
    needs: [changes]
    if: needs.changes.outputs.changed == 'true'
    runs-on: ubuntu-24.04
    timeout-minutes: <D-7>
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      …
      - name: E2E tests (Playwright, shard ${{ matrix.shard }}/3)
        run: pnpm --filter @europa/console exec playwright test --shard=${{ matrix.shard }}/3
```

- `--shard=<n>/3` is the whole mechanism; `workers` stays 2 per leg (config untouched), `retries` stays `CI ? 2 : 0`, `fullyParallel` stays true, `forbidOnly` still applies.
- `fail-fast: false` so one leg's failure does not cancel the others and all three checks report.
- **No port isolation needed.** Each matrix leg is a separate job on its own runner; the workspace ships no running server between jobs, so `EUROPA_E2E_PORT` (default 5173) cannot collide. `webServer.reuseExistingServer` is `!process.env.CI`, i.e. **false** in CI, so each leg starts and tears down its own `pnpm dev` on 127.0.0.1:5173 and never adopts a stranger's server. The same reasoning covers every other in-image job. Nothing sets the env var, and the plan adds no per-shard port.
- Playwright's `--shard` partitions by test (with `fullyParallel`), not by duration — that is where R-1 comes from. Measured on the shipped tree: the three legs divide the suite 20 / 20 / 20 tests and land at 135 / 157 / 173 s (spread 38 s, 1.28×; §8).

### D-16 Check names and the branch-protection swap

| Before | After |
| --- | --- |
| `Test suites (console — browser)` | *(removed)* |
| — | `Test suites (console — e2e) (1)` |
| — | `Test suites (console — e2e) (2)` |
| — | `Test suites (console — e2e) (3)` |
| — | `Test suites (console — browser: component/a11y/perf)` |

GitHub appends the matrix **value** to the job name, so the legs are `(1)`, `(2)` and `(3)` — the `n/3` form appears only inside the `--shard` argument (see §12). The name check must be **anchored**: `grep -nE 'name: Test suites \(console — browser\)$'` must return nothing, because a plain substring search also matches the new `Test suites (console — browser: component/a11y/perf)` and would "find" the removed check forever.

Maintainer action, in this order (a branch-protection list that names a check which can never report blocks every PR, so the order is not cosmetic):

1. **Before merge**, while the old check still reports: add `Test suites (console — e2e) (1)`, `Test suites (console — e2e) (2)`, `Test suites (console — e2e) (3)` and `Test suites (console — browser: component/a11y/perf)` to the required list — they have been reporting since P2b, so they are green and selectable.
2. **Merge** the PR.
3. **After merge**, remove `Test suites (console — browser)`: from that merge onward it can never report again, and leaving it required would block the next PR.

Nothing else in any workflow's check list changes.

### D-17 Sequencing: five substantive pushes, so every workflow has three post-change runs

The previous plan's measurement was unusable: evidence commits touch `specs/008-ci-workflows/**`, which is in **no** workflow's change filter, so those pushes produced runs with `changed == false` — every gate skipped, nothing to measure (and a "green" run that proves nothing). The push sequence below was built from that reasoning. The shipped runs then showed a mechanism worth recording: `dorny/paths-filter` on a `pull_request` event evaluates the **PR's cumulative diff**, not the push's, so once P1 landed every later push — including the docs-only pushes — ran every gate. The extra push plan was therefore unnecessary, and the run history is used as it shipped.

| Push | Content | Runs it produced |
| --- | --- | --- |
| **P1** `4175bc84` | image + toolchain rule + `ubuntu-24.04` labels (nine workflows, the action's `runtime` input, `manual-ci`) | first run red (container/git ownership), fixed by `6614c088` (the `git safe.directory` trust step) |
| **P2** `95e855d5` | the split + **two-way** shard + FR-043 config parity (`client-ci.yml`, `packages/console/vitest.config.coverage.ts`) | 40545266584 (green, two-way) |
| **P2b** `c02ede9a` | shard **three ways** (`client-ci.yml`) | 40548273445 (green, three-way, best 187 s) |
| **P3** `608fcac0` | timeout values across the nine workflows (D-7's keep-or-raise table) | 40549605350 (green) |
| **P4** `53446ee2` | `CONTRIBUTING.md` + one rationale comment on the pinned `runs-on` in each of the nine workflow files | 40550565526 (green) |

Two docs-only pushes (the P2 record at `6e2d5a40`, the tally correction at `cb7c1ae0`) ride between these and also ran every gate, which is the evidence for the cumulative-diff behaviour above.

**What counts as a sample.** A run whose gates were all skipped is **not** a sample — `changed == false` means `changes` short-circuits every job, so the run proves nothing and its wall clock is meaningless. That is the filter T-001 applies to the baselines (at least one non-`changes` job ran) and it applies to the post-change set too. On the shipped history no green post-change run failed it.

**The three runs the PR uses.** P2b, P3 and P4 — the first three green runs of the **shipped** (three-way) shape: 187 s, 202 s, 215 s, median **202 s** against the 306 s baseline and 337 s allowance. P2 (249/250 s) is recorded beside them as the two-way comparison, and the later tally-fix run (218 s) as confirmation; neither enters the median, because a median that mixed the two-way and three-way shapes would describe neither. Every other workflow's median uses the runs of the same three pushes.

The per-job maxima of P2b, P3 and P4 feed D-7. Drills run on a scratch branch (`ci/223-drill`) and never appear in the PR history (AC-036: "the broken state is never committed").

## 6. Job and check inventory for `client-ci.yml`: before → after (AC-040)

| | Before | After |
| --- | --- | --- |
| `changes` | ✔ | ✔ (unnamed, unchanged) |
| `console-lint` | Lint + typecheck (console) | unchanged |
| `design-browser-test` | Browser-mode tests (design) | unchanged name; now in the image |
| `design-coverage` | Coverage gate (design ≥ 80%) | unchanged |
| `version-coverage` | Coverage gate (version ≥ 80%) | unchanged |
| `console-test` | Test suites (console — node) | unchanged |
| `console-e2e` | Test suites (console — browser) | Test suites (console — e2e), matrix ×3 → three checks |
| `console-browser` | — | Test suites (console — browser: component/a11y/perf) |
| `console-coverage` | Coverage gate (console ≥ 80%) | unchanged name; now in the image |
| **checks** | **8** | **11** (one removed, four added) |

The other eight package workflows: **no** job added, removed or renamed; `manual-ci.yml`'s `Build + link verification` keeps its name and gains the image plus `runtime: none`. Their `ubuntu-latest` labels become `ubuntu-24.04` (38 occurrences across the nine files).

Step-level diff (AC-040b): the removed steps are the cache/install pair and the two now-split test steps of the old browser job; every gate step appears in exactly one new job, by the same name; the composite action's two steps stay in every job. The absence check for the old job name must be anchored (`name: Test suites \(console — browser\)$`), since the new component job's name contains it as a prefix (D-16).

## 7. Wave structure and green-at-every-merge-point

One change set (FR-044), one merge point, five substantive pushes (D-17); the two docs-only pushes that record measurements ride between them and change no workflow. Each substantive push is a state a reviewer could merge on its own: P1 changes only where the browser comes from, P2 only job shape, P2b only the shard count, P3 only timeout numbers, P4 only a comment line and the docs pointer. No push depends on a later push to be green.

- **W0** evidence: no tree change (T-001, T-002). The branch is still `origin/main` plus the spec.
- **W1** P1 then P2 then P2b. Each must be green before the next: P2's new jobs inherit P1's image and toolchain, and P2b only changes the shard arithmetic P2 introduced.
- **W2** P3 and P4 in that order (P4's rationale comment lands once the timeout table is settled), plus the drills on a scratch branch in parallel.
- **W3** flake closure (T-007) and the sample + attribution (T-008).
- **W4** close-out (T-009).

## 8. Expected critical path: the forecast, and what shipped

Pre-change `Client CI` = 306 s median (337 s allowance); its browser job = 302 s (steps in §2.5).

### 8.1 The forecast, as it stood at Gate 2 (kept as the record)

**After P1** (combined job, image instead of install): 302 − 23 (install) − 2 (cache post) + 10–20 (pull) ≈ **287–297 s**; workflow ≈ **291–301 s** — inside the allowance, with nothing yet gained.

**After P2** (split + two-way shard), per job:

| Job | Arithmetic | Forecast |
| --- | --- | --- |
| `console-e2e` leg | 3 (setup) + pull 15 + 39 (prologue) + 9 (build) + 74 (148/2, balanced) + 2 (conformance) + 5 (post) | **≈ 147 s** |
| `console-browser` | 3 + 15 + 39 + 9 + 18 + 7 + 44 + 5 | **≈ 140 s** |
| `console-coverage` (unchanged) | — | 118 s |
| `console-test` (unchanged) | — | 98 s |

**Workflow figure.** The run-level overhead above the longest job is small and measurable, not a queue term to add on top of it: baseline 306 s median against a 302 s longest job — about 4–5 s. So the forecast was `max(147, 140, 118, 98)` + ~5 s ≈ **152–155 s** (≈ −50 %), with the pathological two-way case ≈ **230 s**.

### 8.2 What shipped (measured, three-way shard)

| Run | Shape | Client CI wall | e2e legs | browser job |
| --- | --- | --- | --- | --- |
| 40545266584 (P2) | two-way | 249 s | 170 / 192 s | 161 s |
| 40546399155 (docs after P2) | two-way | 250 s | 151 / 198 s | 161 s |
| **40548273445 (P2b)** | **three-way** | **187 s** | **135 / 157 / 173 s** | **120 s** |
| 40549605350 (P3) | three-way | 202 s | 124 / 151 / 187 s | 164 s |
| 40550565526 (P4) | three-way | 215 s | 147 / 146 / 186 s | 123 s |
| 40551676699 (tally docs) | three-way | 218 s | 131 / 111 / 187 s | 175 s |

- **Best 187 s, range 187–218 s across the four three-way runs** — against a 306 s baseline and a 337 s allowance. The shipped figure is ~12 % above the 155 s forecast and ~39 % below the baseline.
- The three legs divide the suite **20 / 20 / 20 tests** and land at **135 / 157 / 173 s** (spread 38 s, 1.28×). No leg is pathological, so the count stays at three.
- **The third shard bought 19 s, not the ~40–50 s the two-way arithmetic implied**: the slowest leg fell 192 → 173 s. The reason is structural and now measured — each leg pays the same **~74 s fixed cost** (26–37 s contended image pull + prologue + console build), while the expensive specs (`selfhost.spec.ts`'s production build, the `full-stack*` server boots) still cluster inside one leg: leg 3 carries ≈94 s of test time against leg 1's ≈56 s.
- The browser job is no longer the critical path by itself: leg 3 (173 s) leads the component job (120 s), the coverage job (111 s) and the node job (105 s) in the best run.
- **Timeouts (P3, measured):** the tally is **28 kept, 2 computed, 9 `changes` jobs given 2 min, nothing raised**. `console-e2e` got 5 min from a 198 s maximum (the two-way leg; the three-way maximum is 187 s) and `console-browser` 4 min from 161 s. `changes` had no clock on the baseline tree; each got 2 min against a 13 s maximum. No value sits below its job's measured maximum and no job lost one.
- **`manual-ci` is an NFR-012 exception, recorded with its numbers:** baseline median 61 s, allowance 71 s; post-change runs 96, 102, 107, 94, 130 s — every one above the allowance, median of the first three **102 s**. The single gate job pays a 26–27 s anonymous image pull that replaced an install whose cache key hashed `docs/manual/pnpm-lock.yaml`, a path that does not exist, so that cache never hit. There is nothing to split (one job, one gate) and the bound still applies to the other eight.

No number here is promised for future runs: T-008 records the medians and, per NFR-012's attribution clause, the post-change breakdown by effect — setup/prologue, each e2e shard leg, component/a11y/perf — so a regression is attributed rather than observed.

## 9. Risks and contingency

**R-1 — shard imbalance (highest risk, and it materialised).** `--shard` splits by test count, not duration. Measured on the shipped three-way run: 20/20/20 tests but 135/157/173 s, because each leg pays the same ~74 s fixed cost and `selfhost.spec.ts`'s production build plus the `full-stack*` server boots cluster in one leg. Mitigation: FR-046 fixes the count at three, so the plan records the split (T-008's per-leg durations) instead of tuning it; the three-way workflow still landed 187–218 s, far below the 302 s browser job it replaced and inside the 337 s allowance. Changing the shard count is explicitly out of scope.

**R-2 — flake exposure triples.** Three legs mean three Playwright processes against the real ticking stack, each with `retries: 2`; a flake that used to fail one job now fails one of three required checks. Mitigation: `workers` stays 2 per shard (FR-046 forbids raising it), `fail-fast: false` so every leg reports, and the E2E config's 15 s `expect` timeout is untouched. Per-leg flake rate is visible in the PR's retry counts; a rising rate is an FR-046 escalation, not a workers change.

**R-3 — the reload flake may not be the include list.** Run 40035460998 reloaded with `react-dom/client` already listed, so the config parity may not close the class. FR-043 has no acceptance branch. Mitigation: T-004 makes both configs declare the same set, T-007 demands ten consecutive green component/a11y/perf runs with zero reload lines; a surviving reload blocks the change rather than becoming an unvalidated tweak.

**R-4 — the image pull, now seven image jobs per full run instead of four.** Six of them are in `Client CI` (three e2e legs, component/a11y/perf, console-coverage, design-browser-test); each pulls ~2–3 GB. Measured: 26–37 s per pull, seven concurrent, up from P2's 25–27 s — contended but bounded. Mitigation: the pull is inside the job's setup and counted in its duration, P1's estimate already allowed 10–20 s, and a pull that costs far more is an FR-035 escalation (image choice), not a reason to reintroduce installs.

**R-5 — matrix check names in branch protection.** If the maintainer action names `(1/3)`/`(3/3)` (the shard argument) instead of `(1)`/`(2)`/`(3)` (the matrix value), the required checks never report and `main` blocks every PR. Mitigation: D-16 states the exact strings, T-008 photographs them from the jobs API, and T-009's PR body carries the copy-paste list.

**R-6 — issue #223's body still describes the withdrawn GHCR image and the withdrawn prepare job.** Mitigation: a dated comment on #223 at close-out (T-009); the issue text is a record and is not rewritten.

## 10. Acceptance criteria → verifying task

| AC | Task |
| --- | --- |
| AC-036 (image, version agreement, no run-time install, anonymous pull, negative drill) | T-002, T-003, T-006 |
| AC-040 (no gate lost, names audited) | T-001, T-008, T-004 |
| AC-041 (timeouts, `ubuntu-24.04`, no self-hosted) | T-005, T-009 |
| AC-042 (perf factor explicit; measured in-image) | T-002, T-008, T-009 |
| AC-043 (same optimizeDeps; N green runs of the new job) | T-004, T-007 |
| AC-044 (one change set; counts unmoved; CONTRIBUTING; no `docs/manual`/tests) | T-005, T-009 |
| AC-045 (3 + 3 same-class medians, attribution breakdown) | T-001, T-008, T-009 |
| AC-046 (split, commands, both builds, no duplicate job, branch-protection note) | T-004, T-006, T-009 |
| AC-047 (matrix `[1, 2, 3]`, exact `--shard=<n>/3` step, workers 2, 16 specs, three legs required) | T-004, T-006, T-008 |
| AC-048 (in-image: no Node install, node 24.18.1, pnpm 11.22.0) | T-003, T-008 |
| NFR-011 (read scopes only) | T-009's `packages: write` grep |
| NFR-013 (hosted runners, thresholds, no test edits) | T-005, T-009 |
| NFR-014 (Playwright single-sourced) | T-002's `pnpm why` record, D-6's in-job check |

## 11. Out of scope (deliberate)

- Any repository-built image, Dockerfile, GHCR package or publish workflow (withdrawn 2026-10-27).
- A shared prepare job, its artifact, and the 28-consumer rewrite (FR-039's tombstone; see §Rejected).
- Shard counts other than 3 (FR-046), `workers` above 2, and any shard-balancing mechanism.
- The six non-package workflows: not edited, labels and timeouts untouched.
- Adding new check names to branch protection (maintainer post-merge action, not this diff).
- Test content, thresholds, or which suites run (NFR-013); `docs/manual/**`.
- `README.md:90` and `AGENTS.md`'s "15 CI workflows" (correct, must not move); `AGENTS.md` gains no v1.8 status line (FR-044).
- `CONTRIBUTING.md:157`'s category sentence (D-11).
- `verify.sh` / `verify-changed.sh` (D-13), local use of the image, Docker-in-Docker, re-introducing a Playwright cache.

## Rejected (tombstones, with the reason)

Decision numbers D-1, D-2, D-3 and D-12 are retained as **gaps**: they were the withdrawn prepare job's payload, failure semantics, change-detection wiring and consumer shape. D-5, D-7 and D-9 survive with the prepare references removed and, for D-7, a different rule.

- **Shared prepare job + artifact hand-off (FR-039, AC-039).** Measured: one tar.gz of `node_modules` + the union's `dist` is 114 MB (417 MB raw), 20–50 s of serial critical path once tar, upload, download and extract are counted, against ~15 s of per-job prologue it removes. On the measured baselines that breaches NFR-012's +10 s allowance on seven of eight workflows (Logging CI 39 s vs a 49 s allowance). Withdrawn by the owner 2026-10-27. The per-job prologue stays and the longest job — not the repetition — is what this amendment attacks.
- **A `consume-workspace` composite action** (only existed to serve the prepare hand-off).
- **A cache-based hand-off** (1-day retention requirement, per-run key quota).
- **zstd compression for any future payload** (absent from the image, and three of its consumers would have to decompress inside it where installing a tool is forbidden).
- **`--user 1001` for the container** (root is the image's documented default for trusted E2E).
- **corepack for in-image pnpm** (works, but downloads pnpm through Node; `pnpm/setup`'s native binary needs no Node).
- **Re-deriving every timeout** (the previous plan's rule; replaced by D-7's keep-unless-below).

## 12. Findings on the spec (report; `spec.md` is not edited here)

| # | Clause | Status / finding |
| --- | --- | --- |
| G-1 | FR-039/AC-039's "Node 22" | **Resolved** — FR-035 and FR-047 now record 24.18.1 and the 22-vs-24 divergence, and AC-048 asserts the recorded value. The plan asserts `node --version` = the image's 24.18.1. |
| G-2 | FR-036's "`playwright --version` the image reports" | **Resolved for the image, one leftover** — FR-036/NFR-014 now say the CLI is available in-job only after dependencies are present, which is what D-6 does. AC-036 still says "where the **prepared** `node_modules` are extracted", prepare-era wording for "the job's own install"; read that way. |
| G-3 | AC-045 "run `started_at` → `completed_at` via the run API" | **Open (cosmetic)** — run objects expose `run_started_at` and `updated_at`; `completed_at` exists on jobs only. The plan uses the run fields for the workflow figure and job-level `started_at`/`completed_at` for attribution. |
| G-4 | NFR-012 vs FR-039 | **Resolved** — the tombstone removes the serial stage; NFR-012 now measures the split's own cost ("one more job"), which §8 shows inside the allowance. |
| G-5 | FR-046/AC-047 matrix naming | `matrix: [1, 2, 3]` makes GitHub name the checks `… (1)`, `… (2)` and `… (3)`, not `(1/3)`/`(3/3)` — the `n/3` form lives only in the `--shard` argument. The plan and the maintainer action use the three value-form names. |
| G-6 | FR-045/AC-046 "the e2e job runs exactly `test:e2e` plus the contract-conformance command" | Under a matrix every leg runs both steps, so the suite runs three times (2 s each). The plan accepts that (leg-symmetric job shape) and records it; a leg-conditional step would satisfy the same wording and was rejected as complexity for ~4 s. |
| G-7 | FR-041 "No value is kept by default" | Read as "no value escapes measurement", reconciling it with AC-041's operative test ("no value sits below its job's measured maximum") and with the Gate-2 objection to rewriting 30 values. D-7 records every row as kept-with-max or raised. |
