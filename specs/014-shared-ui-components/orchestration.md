# Orchestration Log: Shared UI Web Components (Feature 014)

## Status
- **Current Wave**: Wave 1 (Generic components) — In Progress
- **Branch**: `issue-41-shared-UI-components`
- **Last Updated**: 2026-08-31

## Plan Summary
Extract 20 framework-agnostic web components (`customElements.define`) into `@europa/design` under a new `@europa/design/components` subpath. Light DOM (apply existing `europa-*` classes, no Shadow DOM). `EuropaElement` abstract base class + `REGISTRY` array + idempotent `register()`. 13 generic + 7 game-specific primitives. Console migrates 6 in-scope files (React 19 native custom-element interop, no wrapper). New G-10 guard (every registered tag documented in DESIGN.md §2) + bundle-size guard (dist/components.js gzip ≤ 15 KB). Waiting-family catalog move (console index.css → shared catalog.css). All 20 components in one delivery.

## Task Wave Progress

### Wave 0 — Foundation — ✅ Complete (commit `7dbff06`)
- [x] T-001: happy-dom + @vitest/browser + @vitest/browser-playwright devDeps
- [x] T-002: `./components` export in package.json#exports
- [x] T-003: check:component-catalog + check:bundle-size scripts
- [x] T-004: tsup second entry (src/components/index.ts)
- [x] T-005: vitest.config.ts (node + happy-dom)
- [x] T-006: vitest.config.browser.ts (Playwright)
- [x] T-007: src/components/base.ts (EuropaElement)
- [x] T-008: src/components/registry.ts (REGISTRY, 20 entries)
- [x] T-009: src/components/register.ts (idempotent register())
- [x] T-010: src/components/index.ts (barrel)
- [x] T-011: tests/components/register.test.ts
- [x] T-012: scripts/check-component-catalog.ts (G-10)
- [x] T-013: scripts/check-bundle-size.ts (FR-025)

### Wave 1 — Generic components (13) — ⏳ Pending
### Wave 2 — Game primitives (7) — ⏳ Pending
### Wave 3 — Modal integration + conformance — ⏳ Pending
### Wave 4 — Waiting-family catalog move — ⏳ Pending
### Wave 5 — Console migration — ⏳ Pending
### Wave 6 — DESIGN.md §2 + G-10 wiring — ⏳ Pending
### Wave 7 — Final gates — ⏳ Pending

## Decisions & Rationale
- 2026-08-31: PO decisions — Light DOM (no Shadow DOM/::part()/adoptedStyleSheets); React 19 (native custom element support, no wrapper); all 20 components in one delivery.
- 2026-08-31 (plan D-6): Waiting-family `.europa-waiting*` classes move from console index.css into shared catalog.css + DESIGN.md §2 (needed for `<europa-waiting>` in manual, SC-004). Computed styles identical.
- 2026-08-31 (plan D-7): Game primitives use component-local player-color map reusing existing `TOKENS.color.*` values — no new token variables, no new hex literals (preserves FR-010 + no-literals guard).

## Blockers & Escalations
- None yet.

## New Tasks Discovered
- None yet.

## Review Findings
- None yet.
