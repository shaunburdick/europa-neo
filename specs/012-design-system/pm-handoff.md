# PM Handoff: 012-design-system (issue #25)

**Branch**: `issue-25-design-system` (spec-kit feature dir `012-design-system`)
**Spec**: `specs/012-design-system/spec.md` (Draft, 0 NEEDS CLARIFICATION, 22 FRs, 8 SCs)
**Plan**: `specs/012-design-system/plan.md` + `research.md` + `data-model.md` + `contracts/design-system.contract.md` + `quickstart.md` + `tasks.md` (29 tasks T-001..T-029)
**Constitution**: `.specify/memory/constitution.md` v1.0.0 | **AGENTS.md** at repo root
**Working directory**: `/home/agents/.local/share/opencode/worktree/4e5b474f33d7f7d027c07a4e84c286dc49aae8f4/issue-25-design-system`

## Feature Summary
Shareable design system `@europa/design` (private, zero deps) — single TS token table `src/tokens.ts` is source of truth, deterministic emitter writes `dist/design.css` (`:root{--europa-*} + europa-* classes`), console `palette.ts` + `styles/index.css` migrate to tokens/vars, docs manual vendors byte-identical `docs/manual/assets/design.css` via checked-in copy inside `docs/manual` (preserves `pages-deploy.yml` artifact scope `source: ./docs/manual`), minimal `_layouts/default.html` loads shared stylesheet, root `DESIGN.md` is living versioned contract (header `> **Version**: 0.1.0` greppable, token tables + catalog + a11y pairings + rules), drift guards G-01..09 (TS↔CSS identity, DESIGN.md coverage, no-literals, vendor identity, version lockstep, catalog-vs-stylesheet, a11y ratios), biome/CI path filters updated, build ordering design before console, bundle budget <150KB gz.

## Product-Owner Clarification
"More full design system with reusable components that can be shared in UI and documentation" — catalog includes plates/cards, buttons (primary/secondary/ghost), banners, HUD, lobby chrome, badge/chip, modal, grid, typography, layout containers — shareable via `europa-*` classes between React console and Jekyll.

## Key Decisions (from plan.md §Architecture)
- Package `packages/design` globbed via `packages/*`, tsup emits `dist/index.{js,d.ts}` + `dist/design.css`, typed `as const`, no runtime deps
- TS-first token generation (Style Dictionary rejected per research R1)
- Checked-in vendor copy docs/manual/assets/design.css inside docs/manual (FR-013) — not CI-only copy, not symlink, no npm/CDN
- Palette.ts thin re-export from TOKENS, terrainColor stays in console but derives from TOKENS constants
- Console single import of design stylesheet, Vite dedupes, no-literals guard allows one line-scoped `design-exception: canvas fallback`
- DESIGN.md at repo root, packages/design/README.md links, version lockstep via packages/version/scripts/check-version-drift
- A11y: focus ring white 2px+2px offset (~17.74:1 measured, per DESIGN.md § 3), motion gated by prefers-reduced-motion, contrast ratios computed-style asserted
- Build: pnpm workspace:* edge guarantees order; vendor hook after design build

## Task Wave Map (from tasks.md §Dependencies)
T-001 scaffold → T-002/T-003/T-004 parallel → T-005 tokens → T-006 emitter → T-007 catalog + T-012 palette parallel → T-008 a11y gates → T-009/T-010 DESIGN.md tables parallel + T-016 vendor/layout parallel → T-011 drift + T-013 console CSS + T-017 vendor identity → T-014/T-015 guards + T-018/T-019 manual smokes + T-022/T-023 cross-component smokes → T-020/T-024 + T-021/T-025/T-026/T-027/T-028 polish → T-029 E2E replay

## Current State (2026-08-30)
- Phase 6 approved by product owner ("yes, finish all of phase 6 and let me know when there is a PR")
- orchestration.md to be created at `specs/012-design-system/orchestration.md` (PM drives Phase 6 via orchestration skill)
- No tasks completed yet (T-001 pending)
- Git: branch `issue-25-design-system`, spec/plan/tasks committed? specs/012-design-system dir is untracked — will be committed with implementation
- Next: Dispatch Wave 1 (T-001) via modern-architect-engineer

## Paths for Agents
- Spec: `specs/012-design-system/spec.md`
- Plan: `specs/012-design-system/plan.md`
- Tasks: `specs/012-design-system/tasks.md`
- Research: `specs/012-design-system/research.md`
- Data-model: `specs/012-design-system/data-model.md`
- Contract: `specs/012-design-system/contracts/design-system.contract.md`
- Quickstart: `specs/012-design-system/quickstart.md`
- Constitution: `.specify/memory/constitution.md`
- AGENTS.md: `./AGENTS.md`
- Biome: `./biome.jsonc`
- Workflows: `.github/workflows/client-ci.yml`, `.github/workflows/pages-deploy.yml`, `.github/workflows/version-drift.yml`

## Resumability
If session switches to standalone orchestrator agent, read this file + `orchestration.md` + `tasks.md` checkboxes. Last updated: 2026-08-30. Branch: issue-25-design-system.
