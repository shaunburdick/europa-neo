# CI: browser image, job split and three-way e2e shard (#223)

Spec: `specs/008-ci-workflows/spec.md` v1.8 · Plan: `plan.md` · Tasks: `tasks.md`
Scope: the nine package workflows, `.github/actions/build-workspace`, one console vitest
config, `CONTRIBUTING.md`, and the spec/plan/tasks records. No workflow is added — the
inventory stays 15.

## What changed and why

CI was flaky on failures its gates did not own, and paid the same setup 29 times a run.
Playwright was installed at four sites — two with `--with-deps` (apt system libraries on
every run), two without, so browser launch depended on whatever the runner image happened
to carry — and three `~/.cache/ms-playwright` caches keyed on a lockfile hash with no
Playwright version and no `restore-keys`. The browser job was the critical path: 302 s
against the next-largest job's 118 s in run `40399256099`.

This change set runs every browser-launching job inside the upstream
`mcr.microsoft.com/playwright:v1.62.1-noble` image — Chromium, its system libraries and a
Node runtime come from the image, and nothing installs at run time — splits that 302 s job
into an e2e job (sharded three ways) and a component/a11y/perf job, gives the coverage
config the dependency pre-bundle its sibling already had, pins every host label to
`ubuntu-24.04`, and re-derives every job timeout from measured maxima. Same gates, same
thresholds, same 15 workflows.

## Outcome

| Measure | Before | After |
| --- | --- | --- |
| Client CI wall clock, PR runs | 306 s median (allowance 337 s) | **202 s median** of the first three shipped-shape runs (P2b/P3/P4: 187, 202, 215 s); six green runs span **166–236 s** |
| Longest job | `Test suites (console — browser)` **302 s** | `Test suites (console — e2e)` leg **173–187 s** |
| Browser job shape | one job, four browser suites in series | three e2e legs of 20 tests + one component/a11y/perf job |
| Playwright installs / browser caches per run | 4 install sites, 3 caches | **0 / 0** — the image supplies Chromium |
| Browser-job runtime | runner's `node@22` via `pnpm/setup` | image's Node 24.18.1, pnpm 11.22.0, no Node install |
| Dependency-optimizer reloads | observed twice in P1 | **0 in 10 consecutive** green component/a11y/perf attempts |
| Job timeouts | 36 clocks; 9 jobs with none | 28 kept, 2 computed, 9 `changes` clocks added; none below its measured maximum |

The three-way shard bought **19 s** on the longest leg (192 → 173 s), not the ~40–50 s the
two-way arithmetic implied: every leg pays the same ~74 s of image pull, prologue and
console build, and the expensive specs (`selfhost.spec.ts`'s production build, the
`full-stack*` server boots) still cluster in one leg — legs ran 135 / 157 / 173 s, the
third carrying ≈94 s of test time against the first's ≈56 s.

The one thing this PR cannot claim on its own sample is the per-workflow NFR-012 bound:
see § NFR-012 verdict — six of the eight non-client workflows measured above their
allowance, and the attribution is start-up latency under a 13-workflow burst, not job work.

## Baselines

Per workflow: the last three green `pull_request` runs in which at least one non-`changes` job actually ran (`changed == true`), captured from the Actions run/jobs API on 2026-10-27 before any workflow edit. Wall clock is `run_started_at` → `updated_at`; the NFR-012 allowance is `median + max(10 s, 10%)`.

| Workflow | run ids (wall clock, s) | median | NFR-012 allowance |
| --- | --- | --- | --- |
| Client CI | 40396007954 (312), 40353117538 (306), 40340754376 (113) | 306 s | 337 s |
| Manual CI | 40396007836 (61), 40353117563 (56), 40340754507 (74) | 61 s | 71 s |
| Core CI | 40396007851 (74), 40353117420 (51), 40340754461 (74) | 74 s | 84 s |
| Engine CI | 40396007786 (87), 40353117446 (75), 40340754344 (55) | 75 s | 85 s |
| Terrain CI | 40396007915 (116), 40353117572 (75), 40340754525 (97) | 97 s | 107 s |
| Network CI | 40396007781 (98), 40353117442 (92), 40340754584 (89) | 92 s | 102 s |
| Matchmaking CI | 40396007769 (94), 40353117595 (104), 40340754287 (71) | 94 s | 104 s |
| Fog CI | 40396007894 (51), 40353117445 (70), 40340754498 (45) | 51 s | 61 s |
| Logging CI | 40396007807 (39), 40353117575 (39), 40340754481 (45) | 39 s | 49 s |

Every one of the nine workflows had three qualifying runs — **no shortfall**. Runs were skipped where a green run proved nothing (e.g. Client CI `40261703353`, a 9 s dependabot run whose gates were all skipped); the `changed == true` test is what excluded them.

Two differences from `plan.md` §2.7, recorded rather than silently reconciled: (a) Client CI's allowance is **337 s**, not 316 s — NFR-012 takes the larger of 10 s and 10 %, and 10 % of 306 s is 30.6 s; (b) Logging CI has a third qualifying run (`40340754481`, 45 s), so its sample is three, not the two §2.7 lists. The other eight rows reproduce §2.7 exactly.

AC-040's named baseline: **run `40399256099`** (`Client CI`, `push` to `main`, `45ece60`, green, 307 s run / 302 s browser job) — the last green pre-change run of this workflow. It is a `push` run, so it is the job/step baseline only; NFR-012's wall-clock baseline above is the `pull_request` sample. Same event class for the post-change comparison, per AC-045.

## Inventory

Job display names and every step name, from the most recent baseline run of each workflow (`gh api /repos/shaunburdick/europa-neo/actions/runs/<id>/jobs`). These are the names AC-040(b) diffs the post-change runs against; each entry also records the job's duration for orientation, which is context, not the criterion.

### Client CI — run 40396007954 (312 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test suites (console — node)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Build console (brand asset staging)`, `Unit tests (reducer + input math + QoL)`, `Determinism (SC-002 golden fixture)`, `Subcell parity vs original`, `Quiet-client keepalive (idle-sweep guard)`, `Lobby transport integration (real stack)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (version ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (version)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (console ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Cache Playwright browsers`, `Build console application (coverage host fixtures)`, `Install Playwright Chromium`, `Coverage (console)`, `Upload coverage artifact`, `Post Cache Playwright browsers`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Browser-mode tests (design)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Install Playwright Chromium`, `Browser-mode tests (design — focus-trap, a11y)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test suites (console — browser)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Build console (brand asset staging)`, `Cache Playwright browsers`, `Install Playwright Chromium`, `Component tests (browser mode)`, `Accessibility acceptance tests (axe-core)`, `E2E tests (Playwright)`, `Perf budgets (SC-003, real Chromium)`, `Contract conformance`, `Post Cache Playwright browsers`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint + typecheck (console)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (console src)`, `Lint (console)`, `Format check (console)`, `Design vendored-asset identity (G-05)`, `Console no-literals scan (G-04)`, `Design component-catalog guard (G-10)`, `Design bundle-size guard (FR-025)`, `Design drift remediation hint`, `Typecheck conformance program`, `Orphaned vitest config guard`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (design ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (design)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Manual CI — run 40396007836 (61 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Build + link verification**
  - steps: `Set up job`, `Checkout`, `Run ./.github/actions/build-workspace`, `Build Astro site`, `Documentation privacy check`, `Cache Playwright browsers`, `Install Playwright browsers`, `Run Playwright link test`, `Post Cache Playwright browsers`, `Post Run ./.github/actions/build-workspace`, `Post Checkout`, `Complete job`

### Core CI — run 40396007851 (74 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (core)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (core)`, `Lint (core)`, `Format check (core)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (core)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (core)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (core ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (core)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Engine CI — run 40396007786 (87 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (engine ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (engine)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (engine)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (engine)`, `Lint (engine)`, `Format check (engine)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (engine)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (engine)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Terrain CI — run 40396007915 (116 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (terrain)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (terrain)`, `Lint (terrain)`, `Format check (terrain)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (terrain ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (terrain)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (terrain)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (terrain)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Network CI — run 40396007781 (98 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (networking)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (networking)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (networking)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (networking)`, `Typecheck conformance (networking)`, `Lint (networking)`, `Format check (networking)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (networking ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (networking)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Matchmaking CI — run 40396007769 (94 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (matchmaking ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (matchmaking)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (matchmaking)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (matchmaking)`, `Build @europa/matchmaking (conformance program compiles dist/index.d.ts)`, `Typecheck conformance (matchmaking)`, `Lint (matchmaking)`, `Format check (matchmaking)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (matchmaking)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (matchmaking)`, `Conformance (upstream shape drift catch)`, `Build @europa/matchmaking (lobby contract barrel)`, `Lobby conformance (feature 010 contract witnesses)`, `Soak (SC-005: 50 cycles, no leaks)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Fog CI — run 40396007894 (51 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (fog ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (fog)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (fog)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (fog)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (fog)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (fog)`, `Typecheck conformance (fog)`, `Lint (fog)`, `Format check (fog)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

### Logging CI — run 40396007807 (39 s)

- **changes**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Coverage gate (logging ≥ 80%)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Coverage (logging)`, `Upload coverage artifact`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Lint (logging)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Typecheck (logging)`, `Lint (logging)`, `Format check (logging)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`
- **Test (logging)**
  - steps: `Set up job`, `Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Run ./.github/actions/build-workspace`, `Test (logging)`, `Post Run ./.github/actions/build-workspace`, `Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, `Complete job`

## Pre-change browser path

### Where Playwright is installed today

Four install sites and three browser caches, on stock `ubuntu-latest` runners:

| Site | Workflow:line | Install | Cache |
| --- | --- | --- | --- |
| `design-browser-test` | `client-ci.yml:157` | `playwright install chromium` — no `--with-deps` | none |
| `console-e2e` (still the combined browser job) | `client-ci.yml:272` | `playwright install --with-deps chromium` | `~/.cache/ms-playwright`, `client-ci.yml:262` |
| `console-coverage` | `client-ci.yml:331` | `playwright install --with-deps chromium` | `~/.cache/ms-playwright`, `client-ci.yml:313` |
| `verify` | `manual-ci.yml:77` | `playwright install chromium` — no `--with-deps` | `~/.cache/ms-playwright`, `manual-ci.yml:70` |

The two sites that skip apt (`design-browser-test`, `manual-ci.yml` `verify`) are the
two whose launch depends on libraries the runner image happens to carry, which is the
failure mode in the Problem Statement. All three caches key on
`hashFiles('…lockfile')` with no Playwright version and no `restore-keys`.

`grep -rn 'container:' .github/workflows/` is empty before this change: no job runs in
a container today.

### `Test suites (console — browser)` step breakdown

Job `121844273244` in run `40399256099` — the 302 s job this amendment splits. Durations
are the jobs API's per-step `completed_at − started_at`.

| Step | s | Where it goes |
| --- | --- | --- |
| Set up job | 1 | both new jobs (+ the image pull, outside the step list) |
| `actions/checkout` | 2 | both |
| `./.github/actions/build-workspace` (39 s prologue) | 39 | both — the per-job prologue stays (FR-039's tombstone) |
| Build console (brand asset staging) | 9 | both (FR-045) |
| Cache Playwright browsers | 0 | removed (FR-037) |
| Install Playwright Chromium (`--with-deps`) | 23 | removed; the image replaces it |
| Component tests (browser mode) | 18 | component/a11y/perf |
| Accessibility acceptance tests (axe-core) | 7 | component/a11y/perf |
| E2E tests (Playwright) | 148 | e2e job, sharded two ways |
| Perf budgets (SC-003, real Chromium) | 44 | component/a11y/perf, `EUROPA_PERF_BUDGET_FACTOR: '2'` |
| Contract conformance | 2 | e2e job (runs in both legs; ~2 s each) |
| Post: cache, composite action, checkout | 8 | both, minus the cache post |
| **Job total** | **302** | |

### E2E inventory — 16 spec files

`ls packages/console/tests/e2e/*.spec.ts | wc -l` → **16** (AC-047's count). Test counts
are `test(` occurrences per file; they matter because `--shard` divides by test, not by
file.

| Spec | tests | lines |
| --- | --- | --- |
| `board-render.spec.ts` | 3 | 149 |
| `camera-margins.spec.ts` | 1 | 129 |
| `debug-handle-credentials.spec.ts` | 3 | 289 |
| `full-stack-n-players.spec.ts` | 1 | 426 |
| `full-stack.spec.ts` | 1 | 350 |
| `help-overlay.spec.ts` | 9 | 241 |
| `identity-migration.spec.ts` | 7 | 627 |
| `lobby.spec.ts` | 7 | 660 |
| `routing.spec.ts` | 8 | 293 |
| `sc-017-resume-secret.spec.ts` | 3 | 458 |
| `selfhost.spec.ts` | 1 | 38 |
| `shareable-links.spec.ts` | 7 | 541 |
| `spectator-sidebar.spec.ts` | 3 | 261 |
| `surrender-game-over.spec.ts` | 1 | 344 |
| `waiting-overlay.spec.ts` | 1 | 301 |
| `zoom-shortcuts.spec.ts` | 3 | 166 |

59 tests over 16 files. Per-spec durations for the pre-change run are not recoverable
(its logs have expired), so shard balance is a measured-after risk (plan §R-1), not a
forecast.

## Image facts

Probed on 2026-10-27 with `docker run --rm mcr.microsoft.com/playwright:v1.62.1-noble`.

| Probe | Result |
| --- | --- |
| Reference | `mcr.microsoft.com/playwright:v1.62.1-noble` |
| Digest (recorded, not a pin — plan §2.2) | `mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e` |
| Anonymous pull | `docker logout mcr.microsoft.com` → `docker pull …` succeeded, no credential |
| `node --version` | `v24.18.1` — the image's Node, not the repo's 22 (`.node-version`) |
| npm globals | `corepack@0.35.0`, `npm@11.16.0`, `yarn@1.22.22`; **no `playwright` on PATH** |
| `/ms-playwright` | `chromium-1234`, `chromium_headless_shell-1234`, `ffmpeg-1011`, `firefox-1538`, `webkit-2336` |
| `id` | `uid=0(root)` |
| `zstd` | absent (`gzip` 1.12, `tar` 1.35, `git` 2.43.0 present) |
| Arch / image size | `x64` / 949 MB |

**Version agreement (FR-036, NFR-014), measured inside the image after
`pnpm install --frozen-lockfile`:**

| Value | Measured |
| --- | --- |
| Workflow tag | `v1.62.1-noble` |
| Catalog `@playwright/test` | `^1.62.1` → lockfile resolves `1.62.1` |
| `pnpm --filter @europa/console exec node -p "require('@playwright/test/package.json').version"` | `1.62.1` |
| `pnpm --filter @europa/console exec playwright --version` | `Version 1.62.1` |
| `pnpm why playwright-core` | `playwright-core@1.62.1` (via `@axe-core/playwright@4.13.0` and `@vitest/browser-playwright@4.1.11`) |
| Chromium revision | `1234`, the revision the resolved `playwright-core` names |

`pnpm` is **not** in the image; the version check above came from the D-8
measurement's own `npm i -g pnpm@11.22.0`, which is the disposable-copy
procedure and not the job path. In a job, `.github/actions/build-workspace`
supplies pnpm 11.22.0 through `pnpm/setup` with `node-version-file: false` and
no runtime, so no Node is installed (plan §D-4, FR-047).

## Perf in the image

`test:perf` run inside the image before the browser jobs switch to it (FR-042,
plan §D-8): a disposable copy of `HEAD` (`7b13dd3`, pre-change tree) extracted
with `git archive`, bind-mounted at `/tmp/opencode/perf-image`,
`npm i -g pnpm@11.22.0`, `pnpm install --frozen-lockfile` (4.4 s), `pnpm build`,
then `pnpm --filter @europa/console test:perf` — twice at factor 1 (the strict
spec budget, `EUROPA_PERF_BUDGET_FACTOR` unset) and once at factor 2 (what CI
sets). `--ipc=host`, `CI=1`. Nothing in this worktree's `node_modules` was
touched.

| Run | Factor | suite | min-round-median | p50 | p99 | budget | result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 (strict) | `paintFrame(32×32 full board)` | **4.100 ms** | 4.100 ms | 84.300 ms | 8 ms | **pass** |
| 1 | 1 (strict) | `reduce(setPipe)` | 0.1 µs | 0.1 µs | 0.1 µs | 1 ms | pass |
| 1 | 1 (strict) | `localPreflightOrder(paratroop)` | 0.27 µs | 0.27 µs | 1.66 µs | 100 µs | pass |
| 1 | 1 (strict) | `paintFrame(48×48 relief)` | relief-on 6.800 ms − relief-off 1.800 ms = **5.000 ms** | — | — | 6 ms | pass |
| 2 | 1 (strict) | `paintFrame(32×32 full board)` | **4.100 ms** | 4.200 ms | 84.300 ms | 8 ms | **pass** |
| 2 | 1 (strict) | `reduce(setPipe)` | 0.1 µs | 0.1 µs | 0.1 µs | 1 ms | pass |
| 2 | 1 (strict) | `localPreflightOrder(paratroop)` | 0.27 µs | 0.28 µs | 1.69 µs | 100 µs | pass |
| 2 | 1 (strict) | `paintFrame(48×48 relief)` | 6.800 ms − 1.767 ms = **5.033 ms** | — | — | 6 ms | pass |
| 3 | 2 (CI) | `paintFrame(32×32 full board)` | **4.100 ms** | 4.200 ms | 84.800 ms | 16 ms | **pass** |
| 3 | 2 (CI) | `reduce(setPipe)` | 0.1 µs | 0.1 µs | 0.1 µs | 1 ms | pass |
| 3 | 2 (CI) | `localPreflightOrder(paratroop)` | 0.27 µs | 0.27 µs | 1.71 µs | 100 µs | pass |
| 3 | 2 (CI) | `paintFrame(48×48 relief)` | 6.800 ms − 1.800 ms = **5.000 ms** | — | — | 12 ms | pass |

All three runs passed: `Test Files 1 passed (1)`, exit 0 each time.

**Verdict (FR-042): no escalation.** The paint budget's min-of-round-median is
4.100 ms inside the image — 51 % of the strict 8 ms budget at factor 1, 26 % of
the 16 ms factor-2 budget — and the relief addition sits at 5.0 ms against a
6 ms bound that factor 2 doubles to 12 ms. The p99 tail (84.3 ms) is the
observed jitter the min-round-median estimator exists to absorb; it is printed,
not asserted. A container is not the stock runner, and this is the measurement
the spec required before the switch; the 2× factor stays as it is. W1 proceeds.

## Plan findings (implementation)

- **D-5's container user, as measured.** `container: { image: … }` with no
  `options:` runs the job as root (`uid=0`, § Image facts), and the checkout under
  `/__w/…` belongs to the runner user, so git refuses to read it:
  `fatal: detected dubious ownership in repository at '/__w/europa-neo/europa-neo'`.
  The first P1 run (`40540579650`) failed `Coverage gate (console ≥ 80%)` in
  `semantic-url-privacy.test.ts`, the one suite that shells out to
  `git ls-files`. Everything else in that run passed — the image pull, the D-6
  toolchain step, `runtime: none` with pnpm 11.22.0 and no Node install, and the
  still-combined browser job in full (`Test suites (console — browser)`, 327 s).
- **Fix.** One step in each of the four in-image jobs:
  `git config --global --add safe.directory "$GITHUB_WORKSPACE"` — the remedy git
  itself prints, scoped to the ephemeral container. No test edit, no gate removed,
  no `options:`. `--user 1001` stays rejected as D-5 decided; it would trade the
  ownership signal for a new set of HOME and store-permission unknowns.
  AC-040(b)'s step diff names this added step once, for the four browser jobs.

## P1 run (image, in-image toolchain, pinned labels)

Client CI **`40542172649`** (push `6614c08`) is green; it needed one job rerun, and the
first attempt **`40540579650`** (push `4175bc8`) failed on the git-ownership finding
below. Manual CI **`40542172721`** is green with its link test running in the image.

| Workflow (P1 run) | wall clock | baseline median | allowance | verdict |
| --- | --- | --- | --- | --- |
| Client CI (`40542172649`) | 159 s run clock, after a rerun — not comparable | 306 s | 337 s | see note |
| Manual CI (`40542172721`) | 96 s | 61 s | 71 s | above |
| Core CI (`40542172468`) | 49 s | 74 s | 84 s | inside |
| Engine CI (`40542172580`) | 55 s | 75 s | 85 s | inside |
| Terrain CI (`40542172661`) | 66 s | 97 s | 107 s | inside |
| Network CI (`40542172567`) | 123 s | 92 s | 102 s | above |
| Matchmaking CI (`40542172750`) | 101 s | 94 s | 104 s | inside |
| Fog CI (`40542172637`) | 58 s | 51 s | 61 s | inside |
| Logging CI (`40542172460`) | 69 s | 39 s | 49 s | above |

No NFR-012 verdict is claimed here: the spec measures medians of three same-class runs
(T-008), and P1 is one sample taken in a burst where all twelve workflows started in
the same second. Two of the three workflows above their allowance (Logging, Network)
run no image job at all, so the excess is not the image; Terrain ran 97 s at baseline
and 66 s here, which is the size of the run-to-run noise on this sample. What the image
does cost is measured directly below.

### What the image changed, measured

| Effect | Before | P1 |
| --- | --- | --- |
| `Initialize containers` (the pull, counted before the first step) | — | 33 s and 36 s in Client CI's two image jobs, 27 s in Manual CI's |
| Composite prologue (`build-workspace`) | 39 s | 27–30 s |
| Install Playwright Chromium | 23 s | gone |
| Cache Playwright browsers | 0 s | gone |
| Combined browser job | 302 s | 285 s |

Plan §8 budgeted 10–20 s for the pull; the cold figure is 27–36 s. These are cold
pulls on a fresh image and P3/P4 will show whether the fleet caches it, which is why
the table is evidence and not a verdict. On the 61 s Manual CI the pull is most of the
+35 s — the one workflow whose allowance the image plausibly exceeds on its own.

### AC-048 observables, from the log

- The `runtime != 'none'` **pnpm/setup step is skipped** (`outcome=skipped`), and the
  `node-version-file: false` step runs: `Downloading pnpm 11.22.0 from the npm registry`
  — no Node download, install or version file.
- `Toolchain and Playwright version agreement` prints `v24.18.1`; it passes in all four
  in-image jobs.
- Host jobs still install their runtime — `Coverage gate (version ≥ 80%)` logs
  `Installing runtime node@22...` — so the default path is unchanged.

### The reload class, observed twice

Both attempts of `Coverage gate (console ≥ 80%)` logged
`dependency optimized: react-dom/client` → `optimized dependencies changed. reloading`
(16:36:24 and 16:41:37). In the first attempt it cost `waiting-overlay.test.tsx` its 15
tests; in the rerun it cost nothing. That is FR-043's flake, in the coverage config's
browser project — the config T-004 gives the pre-bundle list in P2, which is the
closure mechanism the spec named. It is pre-existing rather than introduced here (the
config never had `optimizeDeps`), and P1 is green on a rerun, not on a change.

## P2 run (split, shard, config parity)

Client CI **`40545266584`** (push `95e855d`) is green on its **first attempt** — no rerun.

| Measure | Value |
| --- | --- |
| Wall clock (`run_started_at` → `updated_at`) | **249 s** (16:53:06 → 16:57:15Z) — baseline median 306 s, allowance 337 s |
| `Test suites (console — e2e) (1)` | **170 s** — "Running 30 tests using 2 workers, shard 1 of 2" |
| `Test suites (console — e2e) (2)` | **192 s** — "Running 30 tests using 2 workers, shard 2 of 2" |
| `Test suites (console — browser: component/a11y/perf)` | **161 s** |
| `Coverage gate (console ≥ 80%)` | 136 s (unchanged shape; reload-free, see below) |
| `Test suites (console — node)` / `Lint + typecheck (console)` / `Browser-mode tests (design)` | 69 s / 75 s / 81 s |

The two legs divide the suite 30 / 30 tests, so `--shard` did what FR-046 says it
does; the 22 s spread between them is the imbalance R-1 predicted, at a size that
does not matter (the slower leg is 192 s against the 302 s the combined job took).

`Initialize containers` — the image pull, counted inside the job:

| Job | Pull |
| --- | --- |
| `Test suites (console — e2e) (1)` | 27 s |
| `Test suites (console — e2e) (2)` | 26 s |
| `Test suites (console — browser: component/a11y/perf)` | 26 s |
| `Coverage gate (console ≥ 80%)` | 25 s |
| `Browser-mode tests (design)` | 27 s |

That is the same 25–27 s P1 measured, so the pull is stable rather than cold-only —
worth T-008's attention, since AC-045 compares workflow wall clocks and this cost
now lands on five jobs per run.

**Reload class (FR-043): zero.** `optimized dependencies changed` and `dependency
optimized` appear in **none** of the run's 6,237 log lines, across all ten jobs —
the component/a11y/perf job, the coverage job's browser project and both e2e legs.
This is evidence item 1 of the N = 10 plan §D-9 pins; T-007 collects the rest.

Run-level overhead, for T-008's attribution rather than a verdict here: the first
job started 38 s after `run_started_at` (nine workflows fired at once, five of them
acquiring a container runner), and the run closed 12 s after the longest job ended
(192 s → 249 s). The job-level critical path fell as §8 predicted; the workflow
figure is now dominated by start-up, not by the browser work.

### Deviations from T-004's verify block

- `grep -cE 'test:(e2e|component|a11y|perf)'` reports **3**, not 4: the e2e job's
  step is `pnpm --filter @europa/console exec playwright test --shard=<n>/2`
  (plan §D-15, AC-047), so the literal `test:e2e` no longer appears. AC-046's
  "runs exactly `test:e2e`" and AC-047's "exactly `playwright test --shard`"
  cannot both hold verbatim; D-15 governs. Same suite, same 16 spec files.
- The component job's `name:` is **single-quoted**, because the display name
  contains `: ` and an unquoted scalar is invalid YAML (the first parse failed at
  that colon). AC-046's literal `grep 'name: Test suites (console — '` therefore
  does not match that line; the display name — the required-check name — is
  unchanged, and T-008 photographs it from the jobs API.
- The two `optimizeDeps` blocks are identical **modulo indentation**, as they must
  be at their nesting depths: T-004's raw `sed` diff shows whitespace only, the
  whitespace-normalized diff is empty. Local control on `tests/component/ui/waiting-overlay.test.tsx`
  under the coverage config: **2** reload lines with the block stashed, **0** with it.
- `grep -c 'container:'` = 4 and `grep -c 'runtime: none'` = 4: four in-image job
  definitions (design, e2e, browser, coverage), one of which is a two-leg matrix,
  so five image jobs run per run. `build-workspace` = 8 consumers,
  `EUROPA_PERF_BUDGET_FACTOR` = 2.

## P2b run (three-way shard)

Client CI **`40548273445`** (push `c02ede9`) — green on its **first attempt**.

| Measure | P2b (3 legs) | P2 (2 legs) | baseline |
| --- | --- | --- | --- |
| Client CI wall clock | **187 s** | 249 s | 306 s median, 337 s allowance |
| `…e2e (1)` | **135 s** — "Running 20 tests using 2 workers, shard 1 of 3" | 170 s | — |
| `…e2e (2)` | **157 s** — shard 2 of 3 | 192 s | — |
| `…e2e (3)` | **173 s** — shard 3 of 3 | — | — |
| `…browser: component/a11y/perf` | **120 s** | 161 s | — |
| `Coverage gate (console ≥ 80%)` | 111 s | 136 s | — |
| `Test suites (console — node)` | 105 s | 69 s | — |
| `Lint + typecheck (console)` / `Browser-mode tests (design)` / `changes` | 65 s / 82 s / 8 s | 75 s / 81 s / 13 s | — |

The three legs divide the suite 20 / 20 / 20 tests. Spread is 135–173 s: **38 s**, a
1.28× ratio against the 1.5× bar, so no leg is pathological and the count stays at 3.

The slowest leg fell 19 s (192 → 173 s), not the ~40–50 s FR-046 anticipated. The
reason is visible in the arithmetic: each leg pays the same fixed cost (~74 s of pull,
prologue and console build), and the expensive specs — `selfhost.spec.ts`'s production
build, the `full-stack*` server boots — still run serially inside one leg, so leg 3
carries ≈94 s of test time against leg 1's ≈56 s. Recorded, not tuned: FR-046 fixes
the count at 3 for this revision. The workflow figure is now 187 s against a 306 s
baseline (**−39 %**), and the browser job is no longer the critical path by itself
(leg 3 at 173 s vs the component job's 120 s).

`Initialize containers` — every image job in this run:

| Job | Pull |
| --- | --- |
| `Test suites (console — e2e) (1)` | 37 s |
| `Test suites (console — e2e) (2)` | 30 s |
| `Test suites (console — e2e) (3)` | 34 s |
| `Test suites (console — browser: component/a11y/perf)` | 31 s |
| `Coverage gate (console ≥ 80%)` | 33 s |
| `Browser-mode tests (design)` | 26 s |

Seven image jobs per Client CI run now pull concurrently, and the per-pull cost rose
from P2's 25–27 s to 26–37 s — contended pulls, still far below the workflow's fixed
test work.

**Reload class: zero.** `optimized dependencies changed` / `dependency optimized` in
none of this run's 6,742 log lines. Tally since the config parity landed (P2): **0 lines
in 3 consecutive green runs** — `40545266584`, `40546399155`, `40548273445`. T-007 needs
ten of the component/a11y/perf job.

## NFR-012 exception: `manual-ci.yml`

The spec's dated exception (NFR-012, 2026-10-27) rests on these numbers: baseline median
61 s, allowance 71 s; post-change `Manual CI` runs **96 s** (`40542172721`), 130 s
(`40544212641`), 102 s (`40545266597`), 107 s (`40546399397`), 94 s (`40548273475`) —
every one above the allowance, median of the first three **102 s**. The single gate job
pays a 26–27 s anonymous image pull that replaced a Playwright install whose cache key
hashed `docs/manual/pnpm-lock.yaml`, a path that does not exist, so that cache never
hit. The workflow stays in the image; the bound continues to apply to the other eight.
## Timeouts (FR-041, plan §D-7)

Rule applied: **keep** a job's current `timeout-minutes` when it is at or above that
job's measured maximum, otherwise **raise to `ceil(max/60)+1`**; a job that had no
clock gets the computed value. Measurements are per-job `started_at → completed_at`
maxima across every green post-change run available at this commit — P1
`40542172649` / `40542172721`, P2 `40545266584` / `40545266597`, the follow-up
`40546399155` / `40546399397`, P2b `40548273445` — except where this PR had not yet
made a workflow's own file change, so its gates never ran: those rows take the maximum
from the three pre-change baseline runs in § Baselines and say so. P3's and P4's runs
exercise all nine and confirm them.

| Workflow | Job | before | measured max | source | decision | chosen (min) |
| --- | --- | --- | --- | --- | --- | --- |
| `client-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `client-ci.yml` | `console-lint` | 2 | 75 s | post | kept (≥ max) | **2** |
| `client-ci.yml` | `design-browser-test` | 5 | 85 s | post | kept (≥ max) | **5** |
| `client-ci.yml` | `design-coverage` | 6 | 48 s | post | kept (≥ max) | **6** |
| `client-ci.yml` | `version-coverage` | 3 | 32 s | post | kept (≥ max) | **3** |
| `client-ci.yml` | `console-test` | 3 | 105 s | post | kept (≥ max) | **3** |
| `client-ci.yml` | `console-e2e` | 6 | 198 s | post | computed `ceil(max/60)+1` | **5** |
| `client-ci.yml` | `console-browser` | 6 | 161 s | post | computed `ceil(max/60)+1` | **4** |
| `client-ci.yml` | `console-coverage` | 6 | 153 s | post | kept (≥ max) | **6** |
| `manual-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `manual-ci.yml` | `verify` | 3 | 91 s | post | kept (≥ max) | **3** |
| `core-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `core-ci.yml` | `core-lint` | 2 | 27 s | baseline | kept (≥ max) | **2** |
| `core-ci.yml` | `core-test` | 2 | 32 s | baseline | kept (≥ max) | **2** |
| `core-ci.yml` | `core-coverage` | 2 | 37 s | baseline | kept (≥ max) | **2** |
| `engine-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `engine-ci.yml` | `engine-lint` | 2 | 35 s | baseline | kept (≥ max) | **2** |
| `engine-ci.yml` | `engine-test` | 2 | 37 s | baseline | kept (≥ max) | **2** |
| `engine-ci.yml` | `engine-coverage` | 2 | 42 s | baseline | kept (≥ max) | **2** |
| `terrain-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `terrain-ci.yml` | `terrain-lint` | 2 | 39 s | baseline | kept (≥ max) | **2** |
| `terrain-ci.yml` | `terrain-test` | 2 | 46 s | baseline | kept (≥ max) | **2** |
| `terrain-ci.yml` | `terrain-coverage` | 2 | 63 s | baseline | kept (≥ max) | **2** |
| `network-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `network-ci.yml` | `network-lint` | 2 | 46 s | baseline | kept (≥ max) | **2** |
| `network-ci.yml` | `network-test` | 3 | 79 s | baseline | kept (≥ max) | **3** |
| `network-ci.yml` | `network-coverage` | 2 | 87 s | baseline | kept (≥ max) | **2** |
| `matchmaking-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `matchmaking-ci.yml` | `matchmaking-lint` | 2 | 58 s | baseline | kept (≥ max) | **2** |
| `matchmaking-ci.yml` | `matchmaking-test` | 2 | 53 s | baseline | kept (≥ max) | **2** |
| `matchmaking-ci.yml` | `matchmaking-coverage` | 2 | 53 s | baseline | kept (≥ max) | **2** |
| `fog-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `fog-ci.yml` | `fog-lint` | 2 | 33 s | baseline | kept (≥ max) | **2** |
| `fog-ci.yml` | `fog-test` | 2 | 37 s | baseline | kept (≥ max) | **2** |
| `fog-ci.yml` | `fog-coverage` | 2 | 41 s | baseline | kept (≥ max) | **2** |
| `logging-ci.yml` | `changes` | — | 13 s | post | added (had no clock) | **2** |
| `logging-ci.yml` | `logging-lint` | 2 | 33 s | baseline | kept (≥ max) | **2** |
| `logging-ci.yml` | `logging-test` | 2 | 27 s | baseline | kept (≥ max) | **2** |
| `logging-ci.yml` | `logging-coverage` | 2 | 31 s | baseline | kept (≥ max) | **2** |

**Result: no value sits below its job's measured maximum** (checked programmatically
against the tree at this commit), no job lost a clock, and the six non-package
workflows are untouched. The two new definitions carry computed values rather than the
6-minute placeholder P2 shipped: `console-e2e` 5 min against a 198 s maximum (the
two-way leg 2 on `40546399155`; the three-way maximum is 187 s on P3, § P3 run) and
`console-browser` 4 min against 161 s. The 28 other values were generous enough that
the rule keeps every one of them — a re-derivation whose finding is "nothing to
raise" is the honest outcome, and the table is the measurement, not a promise.
(39 job definitions in all: 9 `changes` clocks added, 2 computed, 28 kept.)

The nine `changes` jobs had no `timeout-minutes` before and are given 2 min (measured
max 13 s). AC-041 does not require this — it forbids dropping a clock, and these never
had one — but T-005's `Done when` asks that every job in the nine files carry one, and
a hung `changes` job gates every other job in its workflow.

Confirmation samples: P3's and P4's own runs. A value either run exceeds is raised
before close-out (T-009).

## Drills (T-006)

### Tag mismatch (AC-036) — and the defect the drill found

A scratch branch `ci/223-drill` (never pushed) pointed all four `client-ci.yml` container
tags at `v1.61.1-noble` while the catalog resolves `@playwright/test` 1.62.1. The job's
version-agreement step was extracted from that workflow and run in the image with the
shell flags GitHub uses (`bash -e -o pipefail`), against a disposable copy with
dependencies installed:

```
=== step as shipped in P1..P4 (tag v1.61.1-noble) ===
$ bash -eo pipefail step.sh
v24.18.1
EXIT=0
```

Exit 0 with a drifted tag: **the guard was inert.** `test "$tag" = "$expected" && test
"$cli" = "$expected"` is an AND-OR list, and bash's `set -e` ignores a failure in every
command of such a list except the last, so the mismatch neither aborted the step nor
printed anything. With `-x` the trace shows the comparison failing and execution carrying
on:

```
+ tag=1.61.1
+ test 1.61.1 = 1.62.1
+ pnpm --filter @europa/console why playwright-core
...
+ node --version
v24.18.1
```

Fixed in `d28deb6`: each comparison is its own list ending in `exit 1`, with both values
in the message. Same copy, same shell, first the shipped tag then the drill tag:

```
=== control: tag v1.62.1 (as shipped) ===
$ bash -eo pipefail step-drill.sh
v24.18.1
EXIT=0

=== drill: tag v1.61.1-noble, catalog 1.62.1 ===
$ bash -eo pipefail step-drill.sh
::error::image tag 1.61.1 != resolved @playwright/test 1.62.1
EXIT=1
```

The broken tag never reached the branch: `git log origin/main..HEAD` contains no
`v1.61.1` and no drill commit, and the scratch branch was deleted.

### Shard coverage (AC-046/AC-047)

CI's dot reporter prints counts, not titles, so the partition is proven with Playwright's
own `--list` (nothing runs, no server boots) against the shipped tree:

```bash
for n in 1 2 3; do
  pnpm --filter @europa/console exec playwright test --list --shard=$n/3 | sort > /tmp/leg-$n.txt
done
pnpm --filter @europa/console exec playwright test --list | sort > /tmp/leg-all.txt
```

| Check | Result |
| --- | --- |
| What each leg reports | CI logs: "Running 20 tests using 2 workers, shard n of 3" then "20 passed" |
| Union of the three legs | **60 tests** |
| Suite total (`--list`, no shard) | **60 tests** |
| Pairwise overlap (1∩2, 1∩3, 2∩3) | **0, 0, 0** |
| Gap (suite − union) | **0** |
| Spec files per leg | 7 / 3 / 8 — **16 distinct** across the legs (a file can span legs; `--shard` divides by test, not file) |

## Flake closure (FR-043, T-007)

Ten consecutive green attempts of `Test suites (console — browser: component/a11y/perf)`,
each log grepped for both `optimized dependencies changed` and `dependency optimized`:

| # | Job id | Run | Duration | Reload lines |
| --- | --- | --- | --- | --- |
| 1 | `122334175673` | P2 `40545266584` | 161 s | 0 |
| 2 | `122338203357` | P2 follow-up `40546399155` | 161 s | 0 |
| 3 | `122344808068` | P2b `40548273445` | 120 s | 0 |
| 4 | `122349538944` | P3 `40549605350` | 164 s | 0 |
| 5 | `122352920878` | P4 `40550565526` | 123 s | 0 |
| 6 | `122356899913` | tally fix `40551676699` | 175 s | 0 |
| 7 | `122365918574` | guard fix `40554154072` | 165 s | 0 |
| 8 | `122368377913` | rerun of job 7 | 131 s | 0 |
| 9 | `122369816857` | rerun of job 7 | 134 s | 0 |
| 10 | `122371242652` | rerun of job 7 | 162 s | 0 |

**Zero reload lines in all ten**, and the cause is on record: `packages/console/vitest.config.coverage.ts`'s
browser project now pre-bundles the same four React entries as `vitest.config.browser.ts`
(FR-043), while P1's pre-fix run `40540579650` reloaded twice on `react-dom/client` and
cost `waiting-overlay.test.tsx` its 15 tests. Local control on that file: 2 reload lines
with the block stashed, 0 with it.

## NFR-012 verdict

Medians of the three shipped-shape PR runs (P2b `c02ede9`, P3 `608fcac`, P4 `53446ee`),
wall clock as `run_started_at` → `updated_at`; the longest job's median is the attribution
column:

| Workflow | median clock | median longest job | start-up/idle | baseline | allowance | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Client CI | **202 s** | 186 s | 16 s | 306 s | 337 s | **inside** |
| Manual CI | 134 s | 86 s | 48 s | 61 s | 71 s | above — the dated exception |
| Core CI | 90 s | 32 s | 58 s | 74 s | 84 s | above |
| Engine CI | 123 s | 44 s | 79 s | 75 s | 85 s | above |
| Terrain CI | 86 s | 52 s | 34 s | 97 s | 107 s | **inside** |
| Network CI | 157 s | 78 s | 79 s | 92 s | 102 s | above |
| Matchmaking CI | 114 s | 55 s | 59 s | 94 s | 104 s | above |
| Fog CI | 80 s | 38 s | 42 s | 51 s | 61 s | above |
| Logging CI | 48 s | 33 s | 15 s | 39 s | 49 s | **inside** |

**Attribution, and why the bound is not met on six rows.** The job work is unchanged:
Network's `Test (networking)` medians 78 s against 79 s in the baseline sample, Engine's
`Test (engine)` 36 s against 37 s, Fog's coverage 41 s against 41 s, Matchmaking's lint
55 s against 58 s. Every excess sits in start-up: first-job start plus runner queueing.
The clearest single sample is Engine CI's P2b run `40548273436`, where `Coverage gate
(engine ≥ 80%)` sat **302 s waiting for a runner** (started at +314 s, ran 52 s) while its
siblings started at +52–62 s, giving 367 s of clock for 98 s of work.

The cause is this change set's own shape: every push touches all nine workflow files plus
the shared action, so all 13 workflows fire at once — ~50 jobs, seven of them pulling a
2–3 GB image — on every push. The baseline runs were ordinary PRs where one or two
workflows had `changed == true`. Part of the start-up cost may also be the pinned
`ubuntu-24.04` label's runner pool rather than the burst; that share is not separable from
this PR's data.

**Escalation, per AC-045/T-009:** the six rows are recorded above with their run ids and
attribution rather than averaged away. The separable next measurement is one post-merge PR
that touches a single workflow, which exercises that workflow's gates alone; if its median
is still above allowance then the pin, not the burst, is the cost and FR-038's label
decision needs revisiting. Nothing in this PR promises the bound was met.

## Close-out (T-009)

- **`bash scripts/verify.sh` — exit 0, all 14 phases green.** Phase 7's Playwright
  E2E run: **60 passed** (the suite the three CI legs split 20/20/20); Phase 8's perf
  budgets pass at the strict factor 1 locally (paint min-round-median **4.100 ms** against
  the 8 ms budget, relief addition 5.067 ms against 6 ms); Phase 10's package suites:
  362 tests across 34 files. Phases 11–14 (privacy, spec consolidation, referenced
  contracts, knip) green. Run on the branch head before the close-out commit, so the
  commit that carries this line is docs-only and re-runs the pre-push gate.

Truthfulness sweep:

| Check | Result |
| --- | --- |
| Workflow files | **15** (`ls .github/workflows/*.yml \| wc -l`) |
| FR-028's normative enumeration vs the tree | **set-equal**, 15 names each (the line's extra names — `contract-guard.yml`, `dead-exports.yml` — appear only in its dated v1.5/v1.6 amendment notes) |
| `README.md` / `AGENTS.md` in the diff | untouched — their "15 CI workflows" text still reads 15 |
| `CONTRIBUTING.md` | points at FR-028; the stale per-workflow list is gone; § Pull requests left alone |
| Stale `two-way` / `both legs` / `--shard/2` under `.github/` | none |
| `packages: write` | 2 lines, both in `docker.yml`'s existing publish jobs |
| Self-hosted runner labels | none |
| `docs/manual/**` and `packages/*/tests/**` in the diff | none |
| Spec, plan, tasks, pm-handoff | committed with the change set; working tree clean |

## Branch protection (maintainer action)

The split and the three-way shard move the required-check list. GitHub appends the matrix
**value** to the job name, so the legs are `(1)`, `(2)`, `(3)` — the `n/3` form appears only
inside the `--shard` argument:

| Before | After |
| --- | --- |
| `Test suites (console — browser)` | *(removed)* |
| — | `Test suites (console — e2e) (1)` |
| — | `Test suites (console — e2e) (2)` |
| — | `Test suites (console — e2e) (3)` |
| — | `Test suites (console — browser: component/a11y/perf)` |

**Add the four new names before merge** (they have been reporting and green since P2b), and
**remove `Test suites (console — browser)` after merge** — from that merge onward it can
never report, and a required check that cannot report blocks every PR. No other job in any
of the nine package workflows changed name, was added or removed; `manual-ci.yml` keeps
`Build + link verification`; the six non-package workflows are untouched.
