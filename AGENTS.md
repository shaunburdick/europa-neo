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

## Governing documents (read in this order)

| Document                                        | Role                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `AGENTS.md` (this file)                          | Agent working rules + project state                         |
| `.specify/memory/constitution.md`                | Non-negotiable engineering principles                       |
| `.specify/features/001…006/spec.md`              | Feature specifications (the source of truth for behavior)   |
| `europa-source/games.dangerous-minds.net/Europa/html/Europa/rules.html` | Original mechanics — authoritative when specs are ambiguous |
| `europa-source/.../controls.html`                | Original control scheme (client console must match its capabilities) |

### Constitution summary (full text in `.specify/memory/constitution.md`)

TypeScript strict mode · server-authoritative deterministic tick simulation · ≥80% test coverage on game logic (merge gate) · specs-as-documentation · simplicity over cleverness · accessibility-minded UI · self-hostable by default.

## Current state (update this section as work progresses!)

- **Branch**: `001-europa-core` (never commit to `main`/`master`/`develop`)
- **Completed**: Phases 1–3 — constitution ratified; six feature specs written and committed (`aedd040`, amendments in log)
- **Next**: Phases 4–5 — architecture plan (`plan.md`, `research.md`, `data-model.md`, `contracts/`) and task breakdown (`tasks.md`) per feature, via spec-kit `/speckit.plan` + `/speckit.tasks`
- **Then**: Phase 6 — implementation
- Spec status lines: all six specs are `**Status**: Draft`; update to `Planned`/`Implemented` as phases advance

## Workflow rules

1. **Spec-driven development only.** No code without an approved spec; no implementation without plan + tasks. Follow the spec-kit phases; never skip.
2. **Git safety**: work on feature branches only; conventional commits (`feat:`, `fix:`, `docs:`, …); never push without explicit instruction; never rewrite history.
3. **Determinism discipline**: engine code must be pure (no wall-clock, no unseeded randomness, integer/fixed-point math); all tunable numbers live in one constants location.
4. **Specs stay truthful**: changing behavior means updating the spec in the same change set. Stale specs are bugs.
5. **Licensing hygiene**: never copy code from `europa-source/` (SOS license, © Alex Nicolaou). It is reference material only — reimplement from documented behavior.

## Environment notes (hard-won, verified this session)

- **Subagent reliability**: long-running subagent tasks in this environment may silently die ("stuck in thought", empty results, zero disk changes). Mitigations that work:
  - Chunk work into small single-artifact micro-tasks (one file per dispatch), verify each landing on disk before proceeding.
  - Give exact file paths (verify they exist first — a wrong path caused silent fast-fails).
  - Pre-create target directories before dispatching writers.
- If subagents keep failing, check `~/.config/opencode/agent/*.md` frontmatter: none pin a `model:`, so all inherit the session model. Pinning worker agents to a tool-call-reliable model fixes it (restart opencode after edits).
- `uvx --from git+https://github.com/github/spec-kit.git specify …` is the spec-kit CLI; current CLI uses `--integration opencode` (not `--ai`).

## Restart procedure (fresh session)

1. `git branch --show-current` → expect `001-europa-core`; read `git log --oneline -10`.
2. Read this file, the constitution, and skim all six specs.
3. Determine phase: constitution ✅ → specs ✅ → **plan/tasks next** → then implement.
4. Continue from "Current state" above. When state changes, update the Current state section and commit.
