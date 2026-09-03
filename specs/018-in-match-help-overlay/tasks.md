# Tasks: In-Match Help Overlay (Feature 018)

## Wave 1 — Foundation (Tooltip System + Styles)

These tasks establish the reusable tooltip system and CSS foundations. No dependencies between them; all can be built in parallel.

- [x] **T-001**: Create `packages/console/src/qol/tooltip.css` — tooltip positioning, animation, design token usage, `prefers-reduced-motion` guard, responsive flip classes
- [x] **T-002**: Create `packages/console/src/qol/tooltip.tsx` — `Tooltip` wrapper component with `useTooltip` hook: desktop hover/focus, mobile tap toggle, ARIA (`role="tooltip"`, `aria-describedby`), viewport flip logic
- [x] **T-003**: [P] Write unit tests for tooltip positioning logic (`tests/unit/tooltip.test.ts`) — above/below/flip calculations, reduced-motion behavior
- [x] **T-004**: [P] Write component tests for tooltip behavior (`tests/component/ui/tooltip.test.tsx`) — hover show/hide, focus show/hide, touch toggle, ARIA attributes, animation

## Wave 2 — Help Overlay Component

Depends on Wave 1 (tooltip system exists but is not a hard blocker — overlay doesn't use tooltips). Can start in parallel with Wave 1.

- [x] **T-005**: Create `packages/console/src/ui/help-overlay.css` — styles for legend table, shortcut table, game status section, learn-more link, scrollable container
- [x] **T-006**: Create `packages/console/src/ui/help-overlay.tsx` — `HelpOverlay` React component wrapping `<europa-modal>` with all 5 content sections (symbol legend, keyboard shortcuts, game status, learn more, title); props for `open`, `onClose`, `tick`, `playerName`, `playerColor`, `matchStatus`, `playerCount`
- [x] **T-007**: [P] Write component tests for help overlay (`tests/component/ui/help-overlay.test.tsx`) — renders all sections, correct content, link behavior, game status display, focus management
- [x] **T-008**: [P] Write a11y tests for help overlay (`tests/a11y/help-overlay.test.ts`) — axe-core automated checks (zero violations), `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, focus trap verification

## Wave 3 — Integration into App

Depends on Wave 1 (tooltip component) and Wave 2 (help overlay component).

- [x] **T-009**: Add `?` key listener to `App.tsx` — `useEffect` with document keydown handler, `shouldIgnoreKeyEvent` guard, toggle `helpOpen` state; add help button (`?`) in HUD section after minimap
- [x] **T-010**: Lazy-load `HelpOverlay` in `App.tsx` — dynamic `import()`, `Suspense` boundary, pass `open`/`onClose`/game-state props; verify zero bundle impact on initial load
- [x] **T-011**: Wrap HUD elements with `<Tooltip>` in `App.tsx` — status label, tick counter, minimap, help button; add tooltip props to `OrderBar` for exclusive toggle + clear pipes buttons; add tooltip prop to reserves panel label; add tooltip to surrender button
- [x] **T-012**: Add `.europa-help-button` styles to `packages/console/src/styles/index.css` — button in HUD, using design tokens, matching existing HUD item style

## Wave 4 — Polish & E2E

Depends on Wave 3 (integration complete).

- [x] **T-013**: Write E2E Playwright test (`tests/e2e/help-overlay.spec.ts`) — `?` key open/close, Escape close, close-button close, backdrop close, match ticks continue, tooltips on hover, scrollable on 375px viewport
- [x] **T-014**: Verify bundle size budget — overlay < 5KB gz, tooltips < 1KB gz; run build and check chunk sizes
- [x] **T-015**: Run full verification suite — `pnpm verify` (typecheck, lint, format, all tests, build); fix any issues
- [x] **T-016**: Update spec status to Implemented; commit all changes with conventional commit messages

## Task Dependency Graph

```
T-001 ─┐
T-002 ─┼─→ T-009 ─→ T-013
T-003 ─┤   T-010 ─→ T-014
T-004 ─┘   T-011 ─→ T-015
T-005 ─┐   T-012 ──→│
T-006 ─┼─→ (feeds T-009, T-010)
T-007 ─┤              ↓
T-008 ─┘           T-016
```

## Verification Steps (per task)

- **T-001–T-002**: `pnpm lint`, `pnpm typecheck` in `packages/console`
- **T-003–T-004**: `pnpm vitest run --project unit` and `pnpm vitest run --project component` in `packages/console`
- **T-005–T-006**: `pnpm lint`, `pnpm typecheck`
- **T-007–T-008**: `pnpm vitest run --project component` and `pnpm vitest run --project a11y`
- **T-009–T-012**: `pnpm lint`, `pnpm typecheck`, manual verification (`pnpm dev` → join match → press `?`)
- **T-013**: `pnpm playwright test tests/e2e/help-overlay.spec.ts`
- **T-014**: `pnpm build` → check `dist/assets/` chunk sizes
- **T-015**: `pnpm verify` (full suite)
- **T-016**: Final commit + push
