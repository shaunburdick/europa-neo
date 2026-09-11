# Tasks: Design System Fixes (Issues #148 + #149)

**Input**: Design documents from `/specs/014-shared-ui-components/`
**Plan**: [`plan.md`](./plan.md) — D-1 through D-7 architecture decisions

**Prerequisites**: plan.md (required), spec.md (Clarifications v1.3/v1.4)

**Organization**: Tasks grouped into dependency-ordered waves. Tasks marked `[P]` can run in parallel (different files, no cross-dependencies).

**Branch**: `design-fixes` (never commit to `main`).

---

## Wave 1: Token Foundation (blocking — all other work depends on player-color tokens)

- [x] T-001: Add `playerColor1`–`playerColor4` tokens to `TOKENS.color` in `packages/design/src/tokens.ts` (D-1). Values: `#dc2626`, `#2563eb`, `#059669`, `#d97706`. Alphabetical insertion between `pageBg` and `pipeDownhill`. Add JSDoc for each (player number + Tailwind name).

- [x] T-002: Add token value assertions to `packages/design/tests/tokens.test.ts` — verify `TOKENS.color.playerColor1` through `playerColor4` equal the canonical hex values. Single-file change.

- [x] T-003: Update `DESIGN.md` § 1.1 token table — add `playerColor1`–`playerColor4` rows with CSS variable names (`--europa-color-player-1` through `--europa-color-player-4`), TypeScript names, hex values, and a11y pairings (vs `surface` `#111827`). Single-file change.

---

## Wave 2: Game Primitive Token Migration (parallel after Wave 1)

- [x] T-004 [P]: Rewrite `packages/design/src/components/game/city-marker.tsx` — replace local `PLAYER_COLORS` map with `TOKENS.color.playerColorN` lookup (D-2). Delete the `PLAYER_COLORS` const; use a simple `Record<number, string>` keyed by player number reading from tokens. Update JSDoc.

- [x] T-005 [P]: Rewrite `packages/design/src/components/game/player-badge.tsx` — same pattern as T-004. Replace local `PLAYER_COLORS` with token-based lookup. Update JSDoc table to reference `playerColorN` tokens.

- [x] T-006 [P]: Rewrite `packages/design/src/components/game/troop-chip.tsx` — replace `OWNER_COLORS` map with `TOKENS.color.playerColorN` lookup. Update JSDoc.

---

## Wave 3: FogOverlay Implementation + Modal ARIA Fix (parallel after Wave 1)

- [x] T-007 [P]: Implement `packages/design/src/components/game/fog-overlay.tsx` — replace bare `<div aria-hidden="true" />` with `<div className="europa-fog-overlay" aria-hidden="true" />` (D-3). Update JSDoc to document the class and visual treatment.

- [x] T-008 [P]: Add `.europa-fog-overlay` CSS class to the design stylesheet source. Trace the CSS generation pipeline (`build-css.ts` or the source CSS file) and add:
  ```css
  .europa-fog-overlay {
      position: absolute;
      inset: 0;
      background: var(--europa-color-overlay-soft);
      pointer-events: none;
  }
  ```
  Verify `design.css` build output includes the new rule.

- [x] T-009 [P]: Fix `packages/design/src/components/generic/modal.tsx` backdrop ARIA (D-4) — remove `role="button"`, `tabIndex={-1}`, and `onKeyDown={handleBackdropKeyDown}` from the backdrop `<div>`. Delete the `handleBackdropKeyDown` function. Keep only `className="europa-modal-backdrop"` and `onClick={handleBackdropClick}`.

---

## Wave 4: Test Infrastructure (parallel after Wave 1)

- [x] T-010 [P]: Add `"test:browser": "vitest run --config vitest.config.browser.ts"` script to `packages/design/package.json` (D-5). Single-file change.

- [x] T-011 [P]: Add `design-browser-test` job to `.github/workflows/client-ci.yml` (D-5). Job: checkout → pnpm setup → build design → cache Playwright → install Chromium → run `pnpm --filter @europa/design test:browser`. Place after `console-lint` job. Uses same SHA-pinned actions as existing jobs.

- [x] T-012 [P]: Extend `packages/design/scripts/check-no-literals.ts` (D-6) — add `packages/design/src` to scan targets. Update `shouldSkipFile` to exclude `tokens.ts` and `styles/` subdirectories. Update `runNoLiteralsCheck` targets array.

- [x] T-013 [P]: Update `packages/design/tests/no-literals.test.ts` — add test cases for the new design-src scope: `shouldSkipFile('packages/design/src/components/game/city-marker.tsx')` → `false`; `shouldSkipFile('packages/design/src/tokens.ts')` → `true`; `shouldSkipFile('packages/design/src/styles/catalog-styles.ts')` → `true`.

---

## Wave 5: Test Strengthening (after Wave 2 + Wave 3)

- [x] T-014: Extend `packages/design/tests/components/game/fog-overlay.test.tsx` — add assertions: (a) overlay has `className` containing `europa-fog-overlay`, (b) overlay has `aria-hidden="true"`, (c) overlay has non-degenerate computed background (not `transparent`/`none`).

- [x] T-015: Extend `packages/design/tests/components/modal.integration.test.tsx` — add assertions: (a) backdrop has no `role` attribute, (b) backdrop has no `tabIndex` attribute, (c) `.europa-modal` has `role="dialog"`, (d) `.europa-modal` has `aria-modal="true"`, (e) `aria-labelledby` references the title element.

- [x] T-016: Remove `['nested-interactive']` exclusion from `packages/console/tests/a11y/help-overlay.test.ts` line 48. The modal backdrop ARIA fix (T-009) eliminates this violation.

---

## Wave 6: Guard Strengthening + Manual Update (after Wave 1)

- [x] T-017: Extend `packages/design/scripts/check-component-catalog.ts` (D-7) — add props-documentation verification. For each exported component, check that its props interface (e.g., `EuropaButtonProps`) is documented in the DESIGN.md § 2 React component table. Fail with the undocumented component name.

- [x] T-018 [P]: Update `docs/manual/src/pages/numbers.mdx` — update player-color rows (lines 76–79) to reference `playerColor1`–`playerColor4` from `@europa/design` tokens instead of `DEFAULT_PLAYER_COLORS[N]`. The hex values remain the same; the source reference changes.

- [x] T-019 [P]: Update `DESIGN.md` § 2 component catalog — add `europa-fog-overlay` entry with class name, CSS properties, and a11y notes (`aria-hidden`, purely visual).

---

## Wave 7: Verification

- [x] T-020: Run `pnpm --filter @europa/design build` — verify `dist/design.css` includes `.europa-fog-overlay` rule and `--europa-color-player-*` CSS variables.

- [x] T-021: Run `pnpm --filter @europa/design test` — verify all design package tests pass (token assertions, fog-overlay styled tests, modal a11y tests without exclusions).

- [x] T-022: Run `pnpm --filter @europa/design test:browser` — verify modal focus-trap integration tests pass in real Chromium.

- [x] T-023: Run `pnpm --filter @europa/design check:no-literals` — verify design component sources pass the extended scan.

- [x] T-024: Run `pnpm --filter @europa/design check:component-catalog` — verify G-10 passes with strengthened props check.

- [x] T-025: Run `pnpm --filter @europa/console test:a11y` — verify help-overlay a11y tests pass WITHOUT the `nested-interactive` exclusion.

- [x] T-026: Run `pnpm verify` — full repo verification passes.

- [x] T-027: Update AGENTS.md `Current state` section and spec 014 status line to reflect Implemented status for issues #148 + #149.
