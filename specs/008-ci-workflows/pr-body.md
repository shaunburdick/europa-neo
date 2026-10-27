# CI: browser image, job split and two-way e2e shard (#223)

Spec: `specs/008-ci-workflows/spec.md` v1.8 · Plan: `plan.md` · Tasks: `tasks.md`
Scope: the nine package workflows, `.github/actions/build-workspace`, one console vitest
config. No workflow is added — the inventory stays 15. This is a draft: P1 (the image)
is the first tree change; P2–P4 and the drills land on the same branch.

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
