# AGENTS.md — Working Charter for AI Agents

This file governs any AI agent (primary or subagent) doing work in this repository. Read it fully before acting. It exists so that any agent — in any fresh session — can resume this project without re-deriving context.

## Project vision

**Europa Neo**: a modern TypeScript/Node reimplementation of *Europa*, a 1990s Java-applet real-time multiplayer war game (nanobot warfare on Jupiter's moon Europa). Goal: open-source and self-hostable. The original's features are the inspiration; the core gameplay loop is preserved faithfully while UX, controls, and visuals are modernized. This is **not** a pixel-faithful port.

## Binding product decisions (do not relitigate)

1. **Fidelity**: keep the core loop (cities / pipes / fog-of-war) faithful; modernize everything else; QoL features welcome.
2. **V1 scope**: gameplay first — matchmaking → battle → victory. Accounts, ratings ladder, and chat are future features.
3. **Frontend**: free rein within TypeScript; specs describe capabilities, never specific rendering libraries.
4. **Matches**: two visibility types — public (lobby-listed) and private (joinable only via generated ID/shareable link; never lobby-listed).
5. Engine supports 2–4 players by contract; v1 ships 2-player end-to-end.
6. **Distribution**: self-hosted only; npm packages stay private (`private: true` everywhere) and are never published to any registry.

## Governing documents (read in this order)

> **Staleness note**: This table is manually maintained. If you add, rename, or remove a spec, update this table in the same change set. Canonical directory listing: `ls specs/`.

| Document | Role |
| --- | --- |
| `AGENTS.md` (this file) | Agent working rules + project state |
| `.specify/memory/constitution.md` | Non-negotiable engineering principles |
| `specs/001-core-game-engine/spec.md` | Core game engine — deterministic tick simulation |
| `specs/002-fog-of-war-visibility/spec.md` | Fog of war & visibility computation |
| `specs/003-procedural-terrain-generation/spec.md` | Procedural terrain generation |
| `specs/004-multiplayer-networking/spec.md` | Real-time multiplayer networking |
| `specs/005-client-console/spec.md` | Client console — satellite view & orders |
| `specs/006-match-lifecycle-matchmaking/spec.md` | Match lifecycle & matchmaking |
| `specs/007-player-manual/spec.md` | Player manual & GitHub Pages publishing |
| `specs/008-ci-workflows/spec.md` | CI workflow hardening |
| `specs/009-shared-app-versioning/spec.md` | Shared app versioning across API, UI, and docs |
| `specs/010-public-lobby-match-browser/spec.md` | Public lobby match browser |
| `specs/011-docker-selfhost-single-port/spec.md` | Docker one-command self-host packaging |
| `specs/012-design-system/spec.md` | Shareable design system `@europa/design` |
| `specs/013-semantic-url-routing/spec.md` | Console semantic URL routing |
| `specs/014-structured-logging/spec.md` | Structured logging |
| `specs/015-developer-debugging/spec.md` | Developer debugging tools |
| `europa-source/.../rules.html` | Original mechanics — authoritative when specs are ambiguous |
| `europa-source/.../controls.html` | Original control scheme (client console must match) |

### Constitution summary (full text in `.specify/memory/constitution.md`)

TypeScript strict mode · server-authoritative deterministic tick simulation · ≥80% test coverage on game logic (merge gate) · specs-as-documentation · simplicity over cleverness · accessibility-minded UI · self-hostable by default.

## Current state

- **Branch**: `main` post-MVP merge — all new work on feature branches off `main`; never commit to `main` directly.
- **Monorepo**: 10 packages, 13 CI workflows. Known tradeoff: repo-wide typechecking gap (each package's tsconfig excludes tests/ by design; CI compensates with dedicated strict programs — do NOT fix casually).
- **Specs**: All 15 specs (001–015) Implemented. See `specs/` for the full list.
- **Open work**: see [GitHub issues](https://github.com/shaunburdick/europa-neo/issues) for the current backlog.
- **Style**: Biome `>=2.5.0 <3`, Node `>=22`. Root config layers `biome-config-shaunburdick@1.0.0`. Per-package exception policies in `.specify/biome-migration.md`.

## Workflow rules

1. **Spec-driven development only.** No code without an approved spec; no implementation without plan + tasks. Follow the spec-kit phases; never skip.
2. **Git safety**: work on feature branches only; conventional commits (`feat:`, `fix:`, `docs:`, …); never push without explicit instruction; never rewrite history.
3. **Determinism discipline**: engine code must be pure (no wall-clock, no unseeded randomness, integer/fixed-point math); all tunable numbers live in one constants location.
4. **Specs stay truthful**: changing behavior means updating the spec in the same change set. Stale specs are bugs. This extends to player-facing docs (spec 007 FR-012): **any change set that alters gameplay behavior documented by the manual MUST update `docs/manual/` in the same change set** — the path-gated Pages workflow republishes it on merge. Stale manual numbers are bugs.
5. **Licensing hygiene**: never copy code from `europa-source/` (SOS license, © Alex Nicolaou). It is reference material only — reimplement from documented behavior. The archive is a trimmed documentation subset; never modify files under `europa-source/`.
6. **Pre-push verification gate**: before pushing to a PR branch, run `pnpm verify` (or `bash scripts/verify.sh`) — the single source of truth for CI-equivalent local verification. For faster iteration on a single package, `pnpm verify:changed` (or `bash scripts/verify-changed.sh`) runs the relevant subset. Git hooks enforce this automatically: `.husky/pre-push` runs `pnpm verify:changed`.
7. **CI must pass before merge**: no PR may be merged with failing CI checks. There are never "preexisting" test failures — if CI was green before your branch and is red after, your changes caused it. Fix failures in your branch before requesting review.

## Browser automation with agent-browser

The project uses `agent-browser` (v0.36+) for visual verification, exploratory testing, and live-smoke checks against the running app. It drives real Chromium via CDP — no Playwright or Puppeteer dependency.

### Starting the app

`pnpm host` boots the full stack on a **single port** (default `8080`): match server + WebSocket + static console UI. The server prints clickable join URLs on startup.

```bash
pnpm host                          # default port 8080
pnpm host --port 9090              # custom port
HOST_PORT=9090 pnpm host           # env-var override
```

Wait for the "Match server listening" output before opening a browser session.

### Agent-browser workflow

```bash
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix task)"
agent-browser open http://localhost:8080/lobby
agent-browser snapshot -i          # see interactive elements with @eN refs
agent-browser click @e3            # interact using refs
agent-browser snapshot -i          # re-snapshot after any page change
agent-browser screenshot lobby-check.png  # visual verification
agent-browser close                # clean up
```

Screenshots for review go in `__screenshots__/` (gitignored, visible via OpenChamber).

### Key rules

- **Always re-snapshot after actions** — `@eN` refs go stale on every navigation/render.
- **Use named sessions** (`AGENT_BROWSER_SESSION`) — the default is shared across all agents.
- **Inspect computed styles**: `agent-browser inspect @e3`
- **Resize viewport**: `agent-browser resize mobile | tablet | desktop | fill`
- **Navigate**: `agent-browser back` / `agent-browser forward`

### App routes for testing

| Route | Purpose |
| --- | --- |
| `/` | Welcome/landing page |
| `/lobby` | Main lobby (identity card, create, match list) |
| `/profile` | Identity management (set/change handle) |
| `/match/<id>` | Active match view (board, HUD, orders) |
| `/match/<id>/join` | Join a match by ID |
| `/match/<id>/spectate` | Read-only spectator view |

The lobby requires a set identity (handle). First visit to `/lobby` redirects unnamed visitors to `/profile`.

### When to use agent-browser vs Playwright E2E

- **agent-browser**: visual verification, exploratory testing, debugging UI issues, quick smoke checks. Interactive and ad-hoc.
- **Playwright E2E** (`pnpm test:e2e`): automated regression tests, CI gates, deterministic assertions. Structured and repeatable.

## Environment notes (hard-won, verified this session)

- **Subagent reliability**: long-running subagent tasks may silently die. Mitigations: chunk work into small single-artifact micro-tasks; verify each landing on disk before proceeding; give exact file paths; pre-create target directories.
- **Shadow DOM child projection**: components that project host children (the 13 generic components in `@europa/design`) use Shadow DOM (`mode: 'open'`) + `<slot>`. NEVER reparent React-managed nodes — light-DOM child projection via `appendChild` loops is FORBIDDEN (React 19 `removeChild` NotFoundError). The 7 game primitives are Light DOM leaf elements.
- **Test environment gotchas**:
  - Vitest Browser Mode `setupFiles` run inside the browser, not Node.js — Node-only imports poison the bundle.
  - happy-dom gaps: `attachInternals()` not implemented (needs polyfill), `assignedNodes()` empty for slots, `focus()` no-op on non-focusable elements, no `ResizeObserver`/`IntersectionObserver`.
  - Playwright + axe: `getByRole` pierces open shadow roots; `getByText` does not; `document.activeElement` reports the HOST for shadow focus. axe-core ≥ 4 traverses open shadow roots by default.

## Restart procedure (fresh session)

1. `git branch --show-current` → expect a feature branch or `main`; read `git log --oneline -10`.
2. Read this file, the constitution, and skim the governing-documents table.
3. Determine phase: MVP complete and merged on `main`. Work queue lives in GitHub issues.
4. Continue from "Current state" above. When state changes, update the Current state section and commit.
