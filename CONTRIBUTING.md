# Contributing to Europa Neo

Thanks for your interest in Europa Neo! This guide covers the developer workflow: prerequisites, repository layout, code quality standards, and how to get changes merged.

## Prerequisites

- **Node ≥ 22** — the adopted Biome configuration requires Node 22
- **pnpm 11** — the workspace is pnpm-managed (`packageManager: pnpm@11.x` in the root `package.json`)
- **Docker** — optional, for container testing and the Compose-based self-host path

## Getting started

```bash
git clone https://github.com/shaunburdick/europa-neo.git
cd europa-neo
pnpm install --frozen-lockfile
pnpm build        # all packages in dependency order
pnpm test         # every package's suite
```

Run a single package's tests or coverage:

```bash
pnpm --filter @europa/engine test
pnpm --filter @europa/console coverage
```

Workspace-wide `lint`, `typecheck`, and `coverage` scripts exist too. The Playwright E2E suites need Chromium once: from `packages/console`, run `pnpm exec playwright install chromium`.

## Repository layout

```
europa-source/          Trimmed documentation subset of the original game site (reference material)
  └── games.dangerous-minds.net/Europa/html/Europa/
      ├── rules.html    Original mechanics (authoritative gameplay reference)
      ├── controls.html Original control scheme
      └── …             Strategy, rating system, background docs + images
.specify/               Spec-kit tooling: constitution, feature specs, templates, scripts
specs/                  Feature specifications (the source of truth for behavior)
docs/manual/            Player manual (plain Markdown, published to GitHub Pages)
packages/               pnpm workspace — all first-party code
  ├── core/             @europa/core       Shared foundation: core game types, deterministic PRNG, version constant
  ├── engine/           @europa/engine     Deterministic tick simulation: cities, pipes, combat, decay, paratroopers, guns, victory
  ├── terrain/          @europa/terrain    Seed-reproducible, point-symmetric procedural map generation
  ├── fog/              @europa/fog        Per-player sensor horizons with strict no-memory redaction
  ├── networking/       @europa/networking Authoritative WebSocket protocol, tick scheduling, reconnection, spectating
  ├── matchmaking/      @europa/matchmaking Sessions, public/private matches, lobby, rematch, forfeit policy
  ├── console/          @europa/console    React satellite-view client console (renderer + original control scheme + QoL)
  ├── design/           @europa/design     Shared design system: tokens + React component primitives
  ├── logging/          @europa/logging    Structured logging (JSON + pretty, zero dependencies)
  └── version/          @europa/version    Single-source APP_VERSION constant + drift checks
```

## Development workflow

This project is **spec-driven**: no code without an approved spec, no implementation without a plan and tasks. The governing principles live in [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — read it before starting work. Feature specifications live in `specs/` and are the source of truth for behavior; changing behavior means updating the spec in the same change set.

- **Branches**: work on feature branches off `main` only — never commit to `main` directly. Name branches after the issue or feature (e.g. `issue-42-my-feature`).
- **Commits**: use conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, …). Never rewrite history.
- **Pre-push verification**: run `pnpm verify` (or `bash scripts/verify.sh`) before pushing — it is the single source of truth for CI-equivalent local verification (typecheck, lint, format, all package tests, browser-mode tests, E2E, selfhost checks, design system guards, and conformance programs). For faster iteration on a single package, `pnpm verify:changed` auto-detects changed packages vs `origin/main` (override with `VERIFY_BASE`). A `.husky/pre-push` hook enforces this automatically; `git push --no-verify` is the escape hatch, used sparingly — CI still gates the PR.

## Code quality

- **Linting and formatting**: Biome with the published `biome-config-shaunburdick` configuration, four-space indentation, 120-column lines. Run `pnpm lint` and `pnpm format:check`. Never disable linting rules — fix the code to comply.
- **TypeScript strict mode**: all packages compile under strict settings. No `any` types unless absolutely necessary with clear justification.
- **Test coverage**: ≥80% coverage on every metric (statements, branches, functions, lines) in every package — enforced as a merge gate on game logic.
- **Determinism discipline**: engine code must be pure — no wall-clock, no unseeded randomness, integer/fixed-point math. All tunable numbers live in one constants location.
- **Licensing hygiene**: never copy code from `europa-source/` (SOS license, © Alex Nicolaou). It is reference material only — reimplement from documented behavior. Never modify files under `europa-source/`.

## CI

- Six per-package CI workflows (engine, terrain, fog, networking, matchmaking, console) plus shared workflows for Docker, GitHub Pages, releases, and version drift.
- `main` is branch-protected: no direct pushes, no PRs with failing checks.
- There are never "preexisting" test failures — if CI was green before your branch and is red after, your changes caused it. Fix failures in your branch before requesting review.

## Player manual

The player manual is plain Markdown in `docs/manual/` — readable on the published site or straight from a checkout. To contribute:

- Edit the Markdown pages under `docs/manual/` (index, quick-start, objective, the-board, cities-and-troops, pipes, combat, special-weapons, reserves, fog-of-war, controls, reading-the-screen, numbers).
- Any change set that alters gameplay behavior documented by the manual **must** update the manual in the same change set — stale manual numbers are bugs. The `numbers.md` appendix exists to be auditable against `ENGINE_CONSTANTS`.
- The manual is published to GitHub Pages via `.github/workflows/pages-deploy.yml` on push to `main` when `docs/manual/**` changes. Fork owners must enable it once via Settings → Pages → Source = "GitHub Actions".