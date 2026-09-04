# Orchestration Log: React Component Conversion of `@europa/design` (Issue #65)

## Status
- **Current Wave**: 0 (Foundation)
- **Branch**: `issue-65-react-components`
- **Last Updated**: 2026-09-04

## Plan Summary
Convert all 20 `@europa/design` components (13 generic + 7 game) from framework-agnostic web components to React function components (full replacement, Q1). Props map 1:1 from attributes (Q2); React is a peer dep `>=18` (Q3); full Astro manual migration in scope (Q4); new 20 KB bundle budget on `dist/components/index.js` (Q5). Preserve `./components` subpath export, `europa-*` catalog classes, `dist/design.css` contract, and all a11y obligations. Console migrates 6 in-scope `ui/` files; 8 out-of-scope untouched. Spec at `specs/014-shared-ui-components/spec.md` (Clarifications v1.2, amended 2026-09-03).

## Task Wave Progress

### Wave 0 — Foundation — 🔄 In Progress
- [ ] T-001: peerDependencies react/react-dom >=18 to design package.json
- [ ] T-002: RTL devDeps to design package.json
- [ ] T-003: design tsconfig React JSX support
- [ ] T-004: design tsup.config.ts bundle React (externalize react/react-dom)
- [ ] T-005: design vitest.config.ts RTL setup, remove setup-element-internals ref
- [ ] T-006: design vitest.config.browser.ts vitest-browser-react
- [ ] T-007: delete web-component infra (base.ts, register.ts, registry.ts, setup-element-internals.ts)
- [ ] T-008: remove build-css.ts --emit-module path + catalog-styles.ts generation

### Wave 1 — Generic components (13) — ⏳ Pending
### Wave 2 — Game components (7) — ⏳ Pending
### Wave 3 — Barrel + conformance + modal integration — ⏳ Pending
### Wave 4 — Guards + DESIGN.md §2 + contracts — ⏳ Pending
### Wave 5 — Console migration (6 files) — ⏳ Pending
### Wave 6 — Astro manual migration — ⏳ Pending
### Wave 7 — Final gate verification — ⏳ Pending
### Wave 8 — Spec + docs sync — ⏳ Pending

## Decisions & Rationale
- 2026-09-04: Committing planning artifacts (spec amendment + plan/research/data-model/tasks/contract) as a baseline before Wave 0 implementation begins.

## Blockers & Escalations
- (none yet)

## New Tasks Discovered
- (none yet)

## Review Findings
- (none yet)
