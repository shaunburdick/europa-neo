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
  - **003 terrain: Implemented** (commits `30f3e11` → `3597bae`) — full US1-US3 + Polish: 225 tests passing, ≥80% coverage on every metric (93.17% statements / 83.28% branches / 94.11% functions / 95.31% lines), byte-identical 1k-seed determinism (SC-001), p99 < 1s for default map (SC-003), 200-map balance suite (SC-002/SC-004), all 9 FRs + all 4 SCs green. PM-approved additive change: `effectiveSettings` field added to `MapStats` and `TerrainGenerationResult` for FR-008 caller visibility. CI workflow + README + contract-drift detector in place. Spec status flipped to Implemented.
  - **002 fog: Implemented** (Wave 5A `546747a` + Wave 5B) — full US1-US3 + Polish: 107 tests passing, ≥80% coverage on every metric (100% statements / 94.25% branches / 100% functions / 100% lines), Chebyshev horizon + structural redaction + spectator mode, byte-identical 100-trial view hashes (SC-001 micro), zero-leakage 500-tick scripted-match audit vs independent oracle (SC-001 protocol), p99 < 1ms on 32×32 best-of-3 rounds (SC-004), engine-conformance + contract-drift detectors, CI workflow + README in place. PM-notable additive change: optional `events` field added to `ComputePlayerViewOptions` (spec + local copy updated in same change set) because the engine's `World` carries no events — they arrive via `tick()`'s `TickResult`. Spec status flipped to Implemented.
  - **004 networking: Implemented** (US1-US3 through Wave 6B; Polish Wave 6C-2 `1595faf` → `be9291e`) — full FR-001..FR-011 + SC-001..SC-005: 177 tests passing across 26 files, ≥80% coverage on every metric (91.92% statements / 82.72% branches / 90.83% functions / 91.98% lines), byte-identical scripted-match determinism (SC-001), sustained-cadence soak at production 250 ms (SC-005 per Clarifications v1.1: 38 contiguous ticks, median < 15 ms budget, generous p99 guard), wire-level version-policy + rate-limit + conformance tests (byte-identity of contract mirrors, union exhaustiveness), README + network-ci.yml in place. PM-notable changes: pre-1.0 minor = breaking boundary for FR-004 (Wave 6B-1 ruling); SC-005 re-scoped from timed concurrency soak to cadence-stability protocol (spec Clarifications v1.1). Spec status flipped to Implemented; quickstart.md gained a validation-results appendix mapping Q-N01..Q-N10 to real suites.
- **Next**:
  - Phase 6 implementation of features 006 (matchmaking) and 005 (console)
  - Suggested dispatch order (bottom-up by dependency): 006 matchmaking → 005 console
- Spec status lines: 001 = `**Status**: Implemented`; 003 = `**Status**: Implemented`; 002 = `**Status**: Implemented`; 004 = `**Status**: Implemented`; specs 005, 006 still `**Status**: Draft` (flip to `Planned` once their `plan.md` lands, `Implemented` after phase 6 merge)

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
