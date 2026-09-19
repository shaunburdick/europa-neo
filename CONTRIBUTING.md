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

To preview the app or the manual while developing:

```bash
pnpm host                        # full stack: matchmaker + server + console UI on :8080
pnpm --filter @europa/manual dev # Astro dev server for the player manual
```

## Repository layout

```
europa-source/          Trimmed documentation subset of the original game site (reference material)
  └── games.dangerous-minds.net/Europa/html/Europa/
      ├── rules.html    Original mechanics (authoritative gameplay reference)
      ├── controls.html Original control scheme
      └── …             Strategy, rating system, background docs + images
.specify/               Spec-kit tooling: constitution, templates, scripts
specs/                  Feature specifications (the source of truth for behavior)
docs/manual/            Player manual (Astro + MDX site, published to GitHub Pages)
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
- **Commits**: use conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, …). **All commits must be signed** — configure GPG or SSH signing in your Git client and enable "Vigilant mode" in your GitHub settings so commits are marked Verified. Unsigned commits show as Unverified and may be rejected by branch protection. See [Signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits). Never rewrite history.
- **Pre-push verification**: run `pnpm verify` (or `bash scripts/verify.sh`) before pushing — it is the single source of truth for CI-equivalent local verification (typecheck, lint, format, all package tests, browser-mode tests, E2E, selfhost checks, design system guards, and conformance programs). For faster iteration on a single package, `pnpm verify:changed` auto-detects changed packages vs `origin/main` (override with `VERIFY_BASE`). A `.husky/pre-push` hook enforces this automatically; `git push --no-verify` is the escape hatch, used sparingly — CI still gates the PR.

## Agent tooling

This project is agent-first: AI agents do the heavy lifting under the rules in [AGENTS.md](AGENTS.md). If you use an AI coding agent, the repo-local skills in `.agents/skills/` are auto-discovered — no global setup required. They encode the git-safety, code-quality, spec-driven-development, and design-system rules above, so agent behavior matches the written standards. The `npx skills`-installed subset is tracked by `skills-lock.json` at the repo root; refresh them with `npx skills update` and commit the updated `.agents/skills/**` + lockfile together.

Two global CLIs are also worth installing if you'll do UI verification or GitHub work with an agent:

- `agent-browser` — browser automation for visual verification and exploratory testing (`npm i -g agent-browser && agent-browser install`)
- `gh` — GitHub CLI for PRs, issues, and CI status (`brew install gh` or per [cli.github.com](https://cli.github.com))

## AI usage policy

This project is **agent-first but human-governed**. AI coding agents are a core part of the workflow, but there are clear boundaries.

### Allowed

- **Writing code**: Use AI to implement features, fix bugs, write tests, and generate boilerplate.
- **Opening PRs**: AI agents can branch, commit, and open pull requests under the standard workflow.
- **Drafting specs and plans**: AI can produce specifications, architecture plans, and task breakdowns.
- **Code review assistance**: AI can review code for quality, security, and adherence to project standards.
- **Documentation**: AI can write and update docs, including specs, READMEs, and inline comments.

### Not allowed

- **Responding to PR comments as a human**: Do not use AI to write replies to review comments that pretend to be from a human contributor. If an AI drafted the code, the human author is responsible for all communication.
- **Making product decisions**: AI implements; humans decide scope, priority, and behavior tradeoffs.
- **Bypassing review gates**: AI-generated code goes through the same review process as human-written code. No self-approvals.
- **Adding AI co-author trailers**: Never add `Co-authored-by: Copilot`, `Co-authored-by: Claude`, or similar bot attribution to commits. This is enforced by commitlint. Use `Generated-By:` instead (see below).

### Attribution

All AI-generated content must include a `Generated-By:` trailer to provide transparency. This follows the Apache Software Foundation's convention and aligns with EU AI Act Article 50 disclosure requirements.

**Format**:

```
Generated-By: <agent-name> (model: <model-name>)
```

**Where to include it**:

| Surface        | How                                                                 |
| -------------- | ------------------------------------------------------------------- |
| Git commits    | Auto-appended by the `prepare-commit-msg` hook in OpenCode sessions |
| PR body        | Include as a footer: `---\nGenerated-By: agent-name (model: ...)`     |
| PR comments    | Include as a footer at the bottom of the comment                    |
| GitHub issues  | Include as a footer in the issue body                               |

**Example PR body**:

```markdown
## Summary

Add minimap zoom controls to the console.

## Test plan

- Verified zoom in/out with mouse wheel
- Checked keyboard shortcuts (+/−)
- Tested at mobile viewport

---

Generated-By: modern-architect-engineer (model: opencode-go/mimo-v2.5)
```

The `Author:` field (git config, GitHub account) always contains the human operator. `Generated-By:` identifies the AI agent only.

### When NOT to attribute

- **Human commits**: Never add `Generated-By:` to commits made by humans
- **Human-authored PRs**: Never add the footer to PRs written entirely by humans
- **Bot actions**: Dependabot, GitHub Actions, and other bots have their own attribution mechanisms

## Pull requests

- Open PRs against `main` from your feature branch. Reference the related issue in the PR title or description (e.g. `feat(console): add minimap zoom` closes #42).
- CI must pass before merge — per-package workflows (core, engine, terrain, fog, networking, matchmaking, console, logging, manual) plus shared Docker, Pages, release, and version-drift checks. If CI was green before your branch and is red after, your changes caused it.
- PRs require a clean review before merge. Address review feedback in new commits; do not amend pushed commits.
- Keep PRs focused — one feature or fix per PR. Large features are delivered in waves via the orchestration process described in the feature spec.

### What reviewers look for

- Adherence to the [constitution](.specify/memory/constitution.md) (type safety, determinism, test coverage, simplicity)
- Specs updated if behavior changed
- Player manual updated if gameplay docs changed (spec 007 FR-012)
- No lint suppressions, no `any` types, no `@ts-ignore`
- Conventional commit messages
- CI is green

## Design system

Europa Neo uses a shared design system (`@europa/design`) for consistent visuals across the console and the player manual. The living contract is [`DESIGN.md`](DESIGN.md) at the repo root — it defines every token, every component class, and their accessibility pairings.

- **Components**: 20 React components (13 generic + 7 game primitives) in `packages/design/src/`. Use these instead of raw HTML elements when building UI in the console or manual.
- **Tokens**: all colors, spacing, radii, typography, and shadows are `europa-*` CSS custom properties defined in `DESIGN.md` § 1. Never use hex literals, raw pixel values, or system-font stacks directly — always reference tokens.
- **Stylesheet**: `packages/design/dist/design.css` is the single source of truth for the catalog. The manual gets byte-identical vendored copies at `docs/manual/assets/design.css` (G-05 guard target) and `docs/manual/public/design.css` (the copy the Astro site serves).
- **Verification**: `pnpm verify` includes design-system guards that fail on token/catalog drift between `DESIGN.md` and the stylesheet.

## Code quality

- **Linting and formatting**: Biome with the published `biome-config-shaunburdick` configuration, four-space indentation, 120-column lines. Run `pnpm lint` and `pnpm format:check`. Never disable linting rules — fix the code to comply.
- **TypeScript strict mode**: all packages compile under strict settings. No `any` types unless absolutely necessary with clear justification.
- **Test coverage**: ≥80% coverage on every metric (statements, branches, functions, lines) in every package — enforced as a merge gate on game logic.
- **Determinism discipline**: engine code must be pure — no wall-clock, no unseeded randomness, integer/fixed-point math. All tunable numbers live in one constants location.
- **Licensing hygiene**: never copy code from `europa-source/` (SOS license, © Alex Nicolaou). It is reference material only — reimplement from documented behavior. Never modify files under `europa-source/`.

## CI

- Per-package CI workflows (core, engine, terrain, fog, networking, matchmaking, console, logging, manual) plus shared workflows for Docker, GitHub Pages, releases, and version drift.
- `main` is branch-protected: no direct pushes, no PRs with failing checks.
- There are never "preexisting" test failures — if CI was green before your branch and is red after, your changes caused it. Fix failures in your branch before requesting review.

## Player manual

The player manual is an Astro + MDX site under `docs/manual/` (the `@europa/manual` package). Pages import React components from `@europa/design/components` to render game primitives (troop chips, pipe slope indicators, badges, cards, etc.) inline alongside prose, and the `ManualLayout.astro` shell applies the shared `design.css` stylesheet. To contribute:

- Edit the `.mdx` pages under `docs/manual/src/pages/` (index, quick-start, objective, the-board, cities-and-troops, pipes, combat, special-weapons, reserves, fog-of-war, controls, reading-the-screen, numbers, lobby).
- When adding or changing page content, use the design system's React components (imported from `@europa/design/components`) rather than raw HTML — this keeps the manual visually consistent with the console.
- Preview locally with `pnpm --filter @europa/manual dev` (Astro dev server).
- Any change set that alters gameplay behavior documented by the manual **must** update the manual in the same change set — stale manual numbers are bugs. The `numbers.md` appendix exists to be auditable against `ENGINE_CONSTANTS`.
- The manual is published to GitHub Pages via `.github/workflows/pages-deploy.yml` on push to `main` when `docs/manual/**` changes. Fork owners must enable it once via Settings → Pages → Source = "GitHub Actions".
