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
- **Completed**:
  - Phases 1–3 — constitution ratified; six feature specs written and committed (`859a4f3`); spec 006 amended for visibility types + shareable links (`1ed3233`); spec 006 stamped v1.1 with inline Clarifications trail (`b55bfaf`); original archive trimmed to documentation subset with history purged (`79701f8`+)
  - Phases 4–5 — all six feature plans + tasks committed
  - **001 engine: Implemented** (commits `d18f31c` → `4f60216`) — full US1-US5 + Polish: 280 tests passing, ≥80% coverage on every metric, byte-identical 10k-tick determinism (SC-001), median tick < 0.1ms on 32×32 board (SC-004), 3/4-player smoke (FR-019), CI workflow + README + contract-drift detector in place. All Wave 1 reviewer items addressed.
  - **003 terrain: Implemented** (commits `30f3e11` → `3597bae`) — full US1-US3 + Polish: 225 tests passing, ≥80% coverage on every metric (93.17% statements / 83.28% branches / 94.11% functions / 95.31% lines), byte-identical 10k-seed determinism (SC-001), p99 < 1s for default map (SC-003), 1000-map balance suite (SC-002/SC-004), all 9 FRs + all 4 SCs green. PM-approved additive change: `effectiveSettings` field added to `MapStats` and `TerrainGenerationResult` for FR-008 caller visibility. CI workflow + README + contract-drift detector in place. Spec status flipped to Implemented.
- **Next**:
  - Phase 6 implementation of features 002 (fog), 004 (networking), 005 (console), 006 (matchmaking)
  - Suggested dispatch order (bottom-up by dependency): 002 fog → 004 networking → 005 console → 006 matchmaking
- Spec status lines: 001 = `**Status**: Implemented`; 003 = `**Status**: Implemented`; specs 002, 004, 005, 006 still `**Status**: Draft` (flip to `Planned` once their `plan.md` lands, `Implemented` after phase 6 merge)

## Workflow rules

1. **Spec-driven development only.** No code without an approved spec; no implementation without plan + tasks. Follow the spec-kit phases; never skip.
2. **Git safety**: work on feature branches only; conventional commits (`feat:`, `fix:`, `docs:`, …); never push without explicit instruction; never rewrite history.
3. **Determinism discipline**: engine code must be pure (no wall-clock, no unseeded randomness, integer/fixed-point math); all tunable numbers live in one constants location.
4. **Specs stay truthful**: changing behavior means updating the spec in the same change set. Stale specs are bugs.
5. **Licensing hygiene**: never copy code from `europa-source/` (SOS license, © Alex Nicolaou). It is reference material only — reimplement from documented behavior. The archive is a trimmed documentation subset (`html/Europa/` only); never modify files under `europa-source/`.

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
