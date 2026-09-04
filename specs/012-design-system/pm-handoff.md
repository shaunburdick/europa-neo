# PM Handoff: Unified Design System Dev Page (Issue #68)

## Status
- **Phase**: 4–5 (Planning & Tasking)
- **Branch**: `issue-68-unified-design-system`
- **Spec**: `specs/012-design-system/spec.md` (amended with FR-028–FR-035, SC-013–SC-017, Clarifications v1.3)

## Summary

Merge the two disconnected design-system dev surfaces into a single storybook-esque hub:
- **Preview** (`packages/design/preview/`): static HTML token documentation (857-line HTML + 640-line vanilla TS, 39 tests)
- **Playground** (`packages/design/playground/`): live React component demos (281-line HTML + 704-line TSX, no tests, Vite HMR)

Both import `TOKENS` from `src/tokens.ts`. The unified page uses React + Vite (existing playground stack) with hash-based sidebar navigation, dark/light theme toggle, responsive layout, and token-only page chrome.

## Key Decisions
- Hash-based routing (no router dependency)
- Dev-page-only light theme toggle (not user-facing)
- Page shell must use only `--europa-*` tokens (FR-032)
- Remove old `preview/` and `playground/` directories after migration
- Existing preview tests (`tests/preview.test.ts`, 39 tests) must migrate
- Single `pnpm dev` command serves the unified page

## Files to Modify/Create
- `packages/design/dev/` — new unified dev page directory
- `packages/design/package.json` — update `dev` script
- `packages/design/tests/preview.test.ts` — migrate to unified page
- Remove: `packages/design/preview/`, `packages/design/playground/`

## Constraints
- No new dependencies
- Vite + React already available
- All 20 components must render with full variant matrix
- Page chrome uses zero hardcoded hex literals
