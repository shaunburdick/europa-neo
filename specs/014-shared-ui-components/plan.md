# Implementation Plan: Design System Fixes (Issues #148 + #149)

**Branch**: `design-fixes` (spec-kit feature `014-shared-ui-components`) | **Date**: 2026-09-11 | **Spec**: [`specs/014-shared-ui-components/spec.md`](./spec.md)

**Input**: Amended feature specification (Clarifications v1.3, issues #148 + #149) — single-source player colors, FogOverlay implementation, modal backdrop ARIA repair, browser-mode focus-trap test wiring, guard test strengthening, a11y exclusion removal.

---

## Summary

Two coupled design system fixes that address token drift, incomplete component implementations, and test infrastructure gaps:

1. **Issue #148**: The design system is not yet the single source of truth for player ownership colors. `DEFAULT_PLAYER_COLORS` in `console-types.ts` defines P1–P4 hex values while three design primitives (`city-marker`, `player-badge`, `troop-chip`) maintain divergent `PLAYER_COLORS` maps using unrelated token keys (`accent`, `city` instead of dedicated player-color tokens). The `FogOverlay` component is a stub returning a bare `<div>` with no styling. Guard tests need strengthening to scan design sources and verify component props.

2. **Issue #149**: The modal backdrop has invalid `role="button"` + `tabIndex={-1}` creating nested-interactive axe violations. Browser-mode integration tests exist as config (`vitest.config.browser.ts`) but are not wired into CI. The console's a11y suite carries a `nested-interactive` exclusion that should be removable once the backdrop is fixed.

---

## Technical Context

**What's broken**:

- **Player color drift**: Three separate `PLAYER_COLORS` maps in `city-marker.tsx`, `player-badge.tsx`, and `troop-chip.tsx` map P1–P4 to `TOKENS.color.accent`/`city`/`green`/`blue` — tokens named for other purposes. `console-types.ts` line 538 uses `#dc2626`/`#2563eb`/`#059669`/`#d97706` directly. No `playerColor1`–`playerColor4` tokens exist. The manual (`numbers.mdx` lines 76–79) renders `EuropaPlayerBadge` which gets its color from the divergent `player-badge.tsx` map (accent for P1, not red).

- **FogOverlay stub**: `fog-overlay.tsx` returns `<div aria-hidden="true" />` with no CSS classes, no background color, no visual treatment. The spec (FR-002) requires a styled semi-transparent overlay using the `--europa-color-fog` / `overlaySoft` token.

- **Modal backdrop ARIA**: `modal.tsx` lines 122–128 render the backdrop with `role="button"` and `tabIndex={-1}`, creating an invalid ARIA pattern: a `role="button"` element wrapping a `role="dialog"` triggers `nested-interactive` axe violations. The backdrop should be a plain `<div>` with only `onClick`.

- **Browser tests orphaned**: `vitest.config.browser.ts` exists but `package.json` has no `test:browser` script, and no CI workflow step runs it. Focus-trap integration tests cannot execute in CI.

- **a11y exclusion**: `help-overlay.test.ts` line 48 passes `['nested-interactive']` to suppress the axe violation that the modal backdrop fix will eliminate.

**What the fix looks like**:

- Add `playerColor1`–`playerColor4` tokens to `TOKENS.color` (canonical hex values).
- Add CSS variables `--europa-color-player-1` through `--europa-color-player-4`.
- Rewrite game primitives' local maps to use `TOKENS.color.playerColorN` instead of `accent`/`city`.
- Make `DEFAULT_PLAYER_COLORS` in `console-types.ts` derive from the design tokens.
- Implement `FogOverlay` with `europa-fog-overlay` class + `overlaySoft` background.
- Remove `role="button"`, `tabIndex={-1}`, and `onKeyDown` from modal backdrop.
- Add `test:browser` script to design `package.json`.
- Add browser-mode test step to `client-ci.yml`.
- Remove `nested-interactive` exclusion from `help-overlay.test.ts`.
- Extend no-literals guard to scan `packages/design/src/` (excluding `tokens.ts`).
- Strengthen component-catalog guard to check props documentation.

---

## Constitution Alignment

| Principle | Status | Notes |
| --- | --- | --- |
| I. Type Safety | ✅ | All new tokens typed, no `any`, no suppressions |
| III. Tested (≥80%) | ✅ | New tokens get token-value tests; FogOverlay gets styled-output tests; modal gets a11y tests without exclusions |
| IV. Specs as Documentation | ✅ | Specs 005, 007, 012, 014 already amended (Clarifications v1.3/v1.4) |
| V. Simplicity | ✅ | Player colors become 4 additive tokens reusing existing hex values; FogOverlay is one styled div; modal fix removes code |
| VI. Accessibility | ✅ | Modal backdrop ARIA repair eliminates `nested-interactive` violation; FogOverlay gets `aria-hidden="true"` |
| VII. Self-hostable | ✅ | No new dependencies |

---

## Architecture Decisions

### D-1: Player color canonical location — `@europa/design` tokens

**Decision**: Add `playerColor1`–`playerColor4` to `TOKENS.color` in `packages/design/src/tokens.ts`.

**Rationale**: The design system (spec 012) is already the single source of truth for all visual tokens. Player colors are visual tokens. `console-types.ts` `DEFAULT_PLAYER_COLORS` will re-export from design tokens (it lives in a contract-mirror file excluded from no-literals scans, so it may keep hex literals for byte-identity — OR it imports from design; the contract mirror exclusion makes either safe). Game primitives (`city-marker`, `player-badge`, `troop-chip`) will import from `TOKENS.color.playerColorN` instead of their local maps.

**Alternatives considered**:
- *Import from console into design*: Circular-risky; console depends on design, not vice versa. Rejected.
- *Keep `DEFAULT_PLAYER_COLORS` as canonical, import into design*: Would create a design→console dependency, violating the zero-downstream-deps invariant. Rejected.
- *Shared third package*: Over-engineered for 4 color values. Rejected.

### D-2: Game primitive color maps — replace with token imports

**Decision**: Delete the component-local `PLAYER_COLORS` / `OWNER_COLORS` maps from `city-marker.tsx`, `player-badge.tsx`, and `troop-chip.tsx`. Each component reads `TOKENS.color.playerColorN` directly via a simple lookup.

**Rationale**: The local maps exist because dedicated player-color tokens didn't exist. With tokens in place, the maps are redundant indirection that risks drift.

### D-3: FogOverlay styling — CSS class + token background

**Decision**: Add a `europa-fog-overlay` CSS class to `design.css` using `background: var(--europa-color-overlay-soft)`. The component renders `<div className="europa-fog-overlay" aria-hidden="true" />`.

**Rationale**: Follows the existing catalog pattern — components compose `europa-*` CSS classes. The `overlaySoft` token (`rgba(26, 34, 51, 0.6)`) is the existing semi-transparent overlay color already used by the console for fog-like overlays. Adding a dedicated class keeps the component a thin wrapper (Principle V).

### D-4: Modal backdrop — plain div, no interactive role

**Decision**: Remove `role="button"`, `tabIndex={-1}`, and the `handleBackdropKeyDown` handler from the backdrop `<div>`. Keep only `className="europa-modal-backdrop"` and `onClick={handleBackdropClick}`.

**Rationale**: The backdrop is not an interactive element — it is a click-target for dismissing the modal. ARIA `role="button"` implies keyboard operability and focus management that the backdrop does not need (Escape is handled at the document level by the dialog's `handleKeyDown`). Removing the role eliminates the `nested-interactive` violation (a `role="button"` inside which a `role="dialog"` exists creates the nesting issue). The `onKeyDown` handler was a no-op satisfying a lint rule for `role="button"` elements — removing the role removes the lint obligation.

### D-5: Browser test wiring — add to design package + CI

**Decision**: Add `"test:browser": "vitest run --config vitest.config.browser.ts"` to `packages/design/package.json`. Add a `design-browser-test` job to `client-ci.yml` that installs Playwright Chromium and runs `pnpm --filter @europa/design test:browser`.

**Rationale**: The config already exists. Wiring it into CI ensures focus-trap integration tests run on every PR. Placing the job in `client-ci.yml` (which already covers `packages/design/**` in its paths filter) keeps all design-system checks in one workflow.

### D-6: No-literals guard scope — extend to design src

**Decision**: Add `packages/design/src` to the no-literals scan targets in `check-no-literals.ts`, excluding `tokens.ts` (the canonical literal source) and `styles/` (generated CSS modules).

**Rationale**: Currently the guard only scans `packages/console/src` and `docs/manual`. Design component source files should also be free of hardcoded literals — they should import from `TOKENS`. Extending the scan catches drift early. `tokens.ts` is excluded because it IS the literal source by design.

### D-7: Component-catalog guard — add props documentation check

**Decision**: Extend `check-component-catalog.ts` to verify that each exported component has a props interface documented in `DESIGN.md` § 2.

**Rationale**: The current guard only checks tag-name set equality. Strengthening it to verify props coverage ensures the design contract stays complete as components evolve.

---

## File-by-File Change Plan

### `packages/design/src/tokens.ts` — add player color tokens

Add to `TOKENS.color` (alphabetical insertion):
```
playerColor1: '#dc2626',  // P1: red-600
playerColor2: '#2563eb',  // P2: blue-600
playerColor3: '#059669',  // P3: emerald-600
playerColor4: '#d97706',  // P4: amber-600
```

### `packages/design/src/components/game/city-marker.tsx` — use player tokens

Replace local `PLAYER_COLORS` map with direct token lookup:
```typescript
const PLAYER_COLOR_KEYS = {
    1: TOKENS.color.playerColor1,
    2: TOKENS.color.playerColor2,
    3: TOKENS.color.playerColor3,
    4: TOKENS.color.playerColor4,
} as const;
```

### `packages/design/src/components/game/player-badge.tsx` — use player tokens

Same pattern as city-marker: replace local map with `TOKENS.color.playerColorN` lookup.

### `packages/design/src/components/game/troop-chip.tsx` — use player tokens

Same pattern: replace `OWNER_COLORS` map with `TOKENS.color.playerColorN` lookup.

### `packages/design/src/components/game/fog-overlay.tsx` — implement styling

Replace bare `<div aria-hidden="true" />` with:
```tsx
<div className="europa-fog-overlay" aria-hidden="true" />
```

### `packages/design/src/styles/design.css` (generated) — add fog-overlay class

Add rule:
```css
.europa-fog-overlay {
    position: absolute;
    inset: 0;
    background: var(--europa-color-overlay-soft);
    pointer-events: none;
}
```

Note: `design.css` is generated by `build-css.ts`. The class definition needs to be added to the CSS source that the build step reads. Need to trace the CSS generation pipeline to find where catalog classes are defined.

### `packages/design/src/components/generic/modal.tsx` — fix backdrop ARIA

Remove from the backdrop `<div>`:
- `role="button"`
- `tabIndex={-1}`
- `onKeyDown={handleBackdropKeyDown}`

Delete the `handleBackdropKeyDown` function entirely.

### `packages/design/package.json` — add test:browser script

Add to `scripts`:
```json
"test:browser": "vitest run --config vitest.config.browser.ts"
```

### `packages/design/tests/no-literals.test.ts` — add design-src scan tests

Add test cases verifying `shouldSkipFile` returns `false` for `packages/design/src/components/game/city-marker.tsx` and `true` for `packages/design/src/tokens.ts`.

### `packages/design/scripts/check-no-literals.ts` — extend scan scope

Add `packages/design/src` to the `targets` array in `runNoLiteralsCheck`, with exclusions for `tokens.ts` and `styles/` in `shouldSkipFile`.

### `packages/design/tests/components/game/fog-overlay.test.tsx` — extend tests

Add test cases:
- Assert the overlay has class `europa-fog-overlay`.
- Assert the overlay has `aria-hidden="true"`.
- Assert the overlay has a non-empty inline style or computed background (visual treatment proof).

### `packages/design/tests/components/modal.integration.test.tsx` — add a11y tests

Add test cases:
- Assert backdrop has no `role` attribute.
- Assert backdrop has no `tabIndex` attribute.
- Assert `role="dialog"` is on the `.europa-modal` element.
- Assert `aria-modal="true"` is present.
- Assert `aria-labelledby` points to the title.

### `packages/console/tests/a11y/help-overlay.test.ts` — remove exclusion

Remove `['nested-interactive']` from the `expectNoDomA11yViolations` call on line 48.

### `.github/workflows/client-ci.yml` — add design browser test job

Add a `design-browser-test` job after `console-lint`:
```yaml
design-browser-test:
    name: Browser-mode tests (design)
    needs: [changes]
    if: needs.changes.outputs.changed == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@...
      - uses: pnpm/setup@...
      - name: Build @europa/design
        run: pnpm --filter @europa/design build
      - name: Cache Playwright browsers
        uses: actions/cache@...
      - name: Install Playwright Chromium
        run: pnpm --filter @europa/design exec playwright install --with-deps chromium
      - name: Browser-mode tests (design)
        run: pnpm --filter @europa/design test:browser
```

### `packages/design/scripts/check-component-catalog.ts` — strengthen props check

Extend `extractDocumentedTags` or add a new function to verify that each exported component's props interface is documented in the DESIGN.md table.

### `DESIGN.md` — update token table + component catalog

- Add `playerColor1`–`playerColor4` rows to the § 1.1 token table with hex values and a11y pairings.
- Add `europa-fog-overlay` to the § 2 component catalog with class, usage, and a11y notes.

### `docs/manual/src/pages/numbers.mdx` — canonical palette reference

Update the player-color rows (lines 76–79) to reference `TOKENS.color.playerColorN` instead of `DEFAULT_PLAYER_COLORS[N]`, ensuring the manual documents the design token as the source.

---

## Verification (acceptance criteria)

- `pnpm verify` green across all packages.
- `pnpm --filter @europa/design test:browser` green — modal focus-trap tests pass in real Chromium.
- `pnpm --filter @europa/design check:no-literals` green — design component sources have no stray literals.
- `pnpm --filter @europa/design check:component-catalog` green — all exports documented in DESIGN.md § 2.
- Console `test:a11y` green WITHOUT the `nested-interactive` exclusion.
- `TOKENS.color.playerColor1` through `playerColor4` match `DEFAULT_PLAYER_COLORS` values (verified by token test).
- FogOverlay renders with `europa-fog-overlay` class and `aria-hidden="true"`.
- All game primitives (`city-marker`, `player-badge`, `troop-chip`) use `TOKENS.color.playerColorN` — no local color maps remain.
- DESIGN.md § 1.1 and § 2 updated in the same change set.
