# PM Handoff: Europa Neo MVP — Phase 6 Implementation

## TL;DR

Phase 4-5 complete and pushed to origin. **Phase 6 (implementation) is ready but not started.** 381 tasks across 6 features (engine, terrain, fog, networking, matchmaking, console). Plan: ~12 waves of parallel/sequential `modern-architect-engineer` subagent dispatches, with `code-quality-reviewer` + `security-auditor` at wave checkpoints.

**User chose**: self-orchestrate from this session via the orchestration skill. Check in only on issues. Do not open PR or merge directly — defer to user.

## Repo State (verify before resuming)

- Working dir: `/home/agents/github/shaunburdick/europa-neo`
- Branch: `001-europa-core` (NEVER commit to `main`/`master`/`develop`)
- Remote: `git@github.com:shaunburdick/europa-neo.git` (pushed, up to date)
- Last commit: `b918a44 docs(006): phase 5 tasks — 70 tasks, MVP at US1`
- Working tree: clean

## Governing Documents (read in order)

1. `AGENTS.md` — working charter for AI agents
2. `.specify/memory/constitution.md` — engineering principles (TypeScript strict, server-auth deterministic, ≥80% coverage, etc.)
3. `.specify/phase-6-orchestration.md` — durable phase 6 state (THIS file's sibling); has full wave plan + decisions + mediations
4. `specs/001-006/spec.md` — feature specs (source of truth for behavior)
5. `specs/001-006/plan.md` — per-feature architecture
6. `specs/001-006/tasks.md` — per-feature task lists (381 tasks total)
7. `specs/001-006/contracts/*.ts` — TypeScript cross-package boundaries

## Per-Feature Snapshot

| # | Feature | Plan commit | Tasks commit | Tasks | MVP story |
|---|---------|-------------|--------------|------:|-----------|
| 001 | Core Game Engine | d3063b0 | dd07635 | 58 | US1 Tick Simulation |
| 003 | Procedural Terrain | be95e9a | b81e1a4 | 56 | US2 City Placement |
| 002 | Fog of War | fa15d68 | 5a1d4d6 | 45 | US1 Visibility Horizon |
| 004 | Multiplayer Networking | cc5f22d | 8c94be1 | 55 | US1 Authoritative Channel |
| 005 | Client Console | 9708c6b | a509d40 | 97 | US1 Satellite Grid |
| 006 | Match Lifecycle/Matchmaking | c07fca1 | b918a44 | 70 | US1 Quick Match+Auto-Start |

## Locked Tech Stack (no re-research)

- pnpm 11 monorepo workspaces + `catalog:` dependency pins
- tsup 8 (libs) + Vite 8 (console SPA only)
- Vitest 4.1 + v8 coverage ≥80% gate
- Biome 2 (monorepo `extends: ["//"]`)
- sfc32 128-bit PRNG, integer-only math, single PRNG instance per match
- ws@^8.21.3 transport, JSON wire frames
- React 19 + Canvas 2D + Zustand 5 + ARIA grid overlay

## Open Contract Amendments (none)

All phase 4 plan amendments have been merged. Phase 6 implements against the committed contracts verbatim. The only "drift risk" is if a phase-6 implementer wants to add a new field — they should **stop and report** rather than silently extend.

## Subagent Reliability Notes

- **First feature 004 tasks dispatch** silently failed (no file on disk). Recovery: tighter prompt succeeded.
- **First feature 006 tasks dispatch** was cancelled by environment. Recovery: tighter prompt succeeded.
- **Mitigation per AGENTS.md**: small single-artifact micro-tasks; verify each landing on disk before proceeding.

## Wave Plan (see orchestration.md for detail)

1. Monorepo bootstrap + engine Phase 1+2+3 (MVP)
2. Engine US2-US5 + Polish
3. Terrain Phase 1+2+3+4 (MVP)
4. Terrain US3 + Polish
5. Fog all phases
6. Networking Phase 1+2+3 (MVP)
7. Networking US2+US3 + Polish
8. Matchmaking Phase 1+2+3 (MVP)
9. Matchmaking US2+US3+US4+US5+Polish
10. Console Phase 1+2+3 (MVP)
11. Console US2+US3+US4+US5+Polish
12. Integration + final verification + PR

## Skills to Load

At session start: `git-safety`, `spec-kit`, `spec-driven-development`, `code-quality`, `style`, `accessibility`, `orchestration`.

## What To Do Next

Read `.specify/phase-6-orchestration.md` for the current wave + decisions. If no progress recorded, start Wave 1. Update `phase-6-orchestration.md` after every wave.