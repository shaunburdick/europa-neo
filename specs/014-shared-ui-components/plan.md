# Implementation Plan: React Component Conversion of `@europa/design` (Issue #65)

**Branch**: `issue-65-react-components` (spec-kit feature `014-shared-ui-components`) | **Date**: 2026-09-03 | **Spec**: [`specs/014-shared-ui-components/spec.md`](./spec.md)

**Input**: Amended feature specification (Clarifications v1.2, issue #65) — full replacement of the 20 `@europa/design` web components with React components; React as a peer dependency; full Astro manual migration; new 20 KB bundle budget on `dist/components/index.js`.

---

## Summary

Convert all 20 `@europa/design` components (13 generic + 7 game) from framework-agnostic web components (`customElements.define`, Shadow/Light DOM) to **React components** (function components + hooks). This is a **full replacement** (Q1) — no dual coexistence, no web-component registration remains. The React component API maps props **1:1** from the existing attributes (Q2), React is a **peer dependency** `>=18` (Q3), the **full Astro manual migration** is in scope (Q4), and the per-component 15 KB budget is replaced by a single **20 KB budget** on `dist/components/index.js` (Q5).

The conversion preserves the exact DOM output, catalog classes, and accessibility obligations of the current components so the console and manual render identically (SC-003). The `@europa/design/components` subpath export surface is preserved and adapted to export React components. The console's 6 in-scope `ui/` files swap inline class-name patterns for the new React components; the 8 out-of-scope files are untouched. The Astro manual's ~71 MDX `<europa-*>` usages migrate to imported React components via `@astrojs/react`.

**Constitution deviation (documented in spec)**: Principle IV ("Specs as Documentation") is overridden for this feature — the spec's "no specific rendering libraries" rule is waived because `@europa/design` is `private: true` with no external consumers and both consumers (console + manual) are React-capable. All other principles (I strict TS, III ≥80% coverage, V simplicity, VI accessibility) remain binding.

---

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) / Node 22 / pnpm 11.22 workspaces — same as every sibling package. React 19.2.0 (catalog) is the runtime; React is a **peer dependency** `>=18` (Q3).

**Primary Dependencies**:
- **Runtime `peerDependencies`** (new): `react: ">=18"`, `react-dom: ">=18"` (Q3). Zero runtime `dependencies` preserved (FR-024, NFR-006) — the components depend only on React + the same-package `TOKENS` import.
- **Tooling (devDependencies, all catalog versions)**:
  - `@testing-library/react` `^16.3.2` + `@testing-library/dom` `^10.0.0` (RTL 16 requires it separately) — React component tests.
  - `@testing-library/jest-dom` `^7.0.1` — DOM matchers.
  - `@testing-library/user-event` `^14.6.7` — user-centric interaction.
  - `vitest-browser-react` `^2.2.0` (already catalog) — browser-mode React render for the modal focus-trap integration tests.
  - Existing `happy-dom` `^20.11.6`, `@vitest/browser` `^4.1.0`, `@vitest/browser-playwright` `^4.1.0`, `tsup`, `tsx`, `typescript`, `vitest`, `biome` catalog versions.
- **Manual (docs/manual)**: add `@astrojs/react` `^6.0.5` (compatible with Astro `^7.2.10`; supports React 19 peer deps) + `react`/`react-dom`/`@types/react`/`@types/react-dom` catalog versions.

**Storage**: N/A — no persistence. The component source is tracked TypeScript; `dist/components/index.{js,d.ts}` are build artifacts.

**Testing**: Vitest 4.1 + `@vitest/coverage-v8` (≥80% on every metric for new testable logic, constitution Principle III). Split:
- `vitest.config.ts` (node + `environment: 'happy-dom'`) — per-component React unit tests (FR-027), game-primitive tests (FR-029), conformance test (FR-030, rewritten for React props).
- `vitest.config.browser.ts` (Playwright Chromium + `vitest-browser-react`) — modal integration tests (FR-028: focus trap, Escape, focus restore).
- Existing console suites (unit, component, a11y, e2e) verify the migration is visually invisible (FR-018, SC-003).
- Manual build (`pnpm build` in `docs/manual`) verifies the Astro migration compiles + renders (Q4).

---

## Architecture

### 1. `@europa/design` package — React component layer

The `src/components/` tree is rewritten from web components to React function components. The directory structure is preserved so the `./components` subpath export (`./dist/components/index.d.ts` → `./dist/components/index.js`) keeps working:

```
packages/design/src/components/
├── index.ts              # barrel: exports all 20 React components + shared types
├── generic/              # 13 generic React components
│   ├── badge.tsx
│   ├── banner.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── chip.tsx
│   ├── container.tsx
│   ├── grid.tsx
│   ├── modal.tsx
│   ├── page.tsx
│   ├── plate.tsx
│   ├── stack.tsx
│   ├── typography.tsx
│   └── waiting.tsx
└── game/                 # 7 game React components
    ├── city-marker.tsx
    ├── elevation-swatch.tsx
    ├── fog-overlay.tsx
    ├── pipe-slope.tsx
    ├── player-badge.tsx
    ├── reserve-indicator.tsx
    └── troop-chip.tsx
```

**Deleted** (web-component infrastructure, no longer needed):
- `src/components/base.ts` (`EuropaElement`, `ensureShadowRoot`, adopted stylesheet)
- `src/components/register.ts` (idempotent `register()`)
- `src/components/registry.ts` (`REGISTRY` array)
- `tests/setup-element-internals.ts` (happy-dom `attachInternals` polyfill)

**Component shape** (all function components, no class components):
- Each component is a named function component (e.g. `EuropaButton`) that renders the same DOM as its web-component predecessor, applying the same `europa-*` catalog classes.
- **Props map 1:1 from attributes** (Q2). Boolean attributes (`disabled`, `open`, `visible`, `reduced-motion`) become boolean props; numeric attributes (`count`, `owner`, `elevation`, `percent`) become number props; string attributes (`variant`, `size`, `title`, `message`, `direction`, `name`, `type`, `aria-label`) become string props.
- **Children**: generic components project children via React `children` (replacing `<slot>`). Game primitives render leaf elements with no children.
- **Events**: `modal`'s `europa-close` event becomes an `onClose` callback prop (Q2 — events map to React callback props).
- **A11y obligations preserved** (FR-011/FR-012/FR-013/FR-014): `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape close, focus restore (modal); `role="status"`/`role="alert"` + `aria-live` (banner); native `<button>` (button); `role="img"` + `aria-label` (game primitives); `aria-hidden` (fog-overlay); live-region + `prefers-reduced-motion` (waiting).
- **`PipeSlopeDirection` type** (`'downhill' | 'flat' | 'uphill' | 'stalled'`) exported from `pipe-slope.tsx` is preserved and re-exported from the barrel (it is consumed by the console's `pipe-slope.ts` mirror + drift test).

### 2. Styling

The React components apply the same `europa-*` catalog classes as their web-component predecessors. Because React renders **light DOM** (no shadow boundary), the global `dist/design.css` stylesheet applies directly — no `adoptedStyleSheets`, no constructed `CSSStyleSheet`, no `catalog-styles.ts` generated module needed for the components. The `:root` token block and class rules in `dist/design.css` remain the single styling source (contract unchanged, still loaded by console + manual).

**Note**: `src/styles/catalog-styles.ts` (gitignored generated module) and the `build-css.ts --emit-module` step become **unnecessary** for components. However, `dist/design.css` is still required for the console + manual global stylesheet. The `build-css.ts` script's module-emission path can be removed or left inert — **decision: remove the `--emit-module` path and `catalog-styles.ts` generation** since no shadow roots remain to adopt it (simplicity, Principle V). The full CSS pass (`dist/design.css`) is retained.

### 3. Console migration (6 in-scope files)

The console's 6 in-scope `ui/` files swap inline `className="europa-*"` patterns for the new React components:

| File | Components used |
| --- | --- |
| `branded-footer.tsx` | `EuropaTypography`, `EuropaContainer` |
| `waiting-overlay.tsx` | `EuropaWaiting` (replaces inline spinner + live region) |
| `lobby-landing.tsx` | `EuropaPage`, `EuropaStack`, `EuropaCard`, `EuropaButton`, `EuropaTypography` |
| `lobby-create-form.tsx` | `EuropaCard`, `EuropaButton`, `EuropaTypography`, `EuropaBanner` |
| `lobby-identity-card.tsx` | `EuropaCard`, `EuropaButton`, `EuropaTypography`, `EuropaBadge` |
| `lobby-match-list.tsx` | `EuropaCard`, `EuropaButton`, `EuropaTypography`, `EuropaBadge`, `EuropaChip` |

**Console infra removed**:
- `src/custom-elements.d.ts` (JSX intrinsics for `europa-page`/`card`/`stack`/`typography`)
- `src/global.d.ts` (JSX intrinsics for `europa-button`/`banner`/`waiting`)
- `import { register } from '@europa/design/components'` in `src/main.tsx` line 1

The 8 out-of-scope files (order-bar, reserves-panel, targeting-overlay, seat-labels, participants, route-notice, lobby-labels, lobby-handle) are untouched.

### 4. Astro manual migration (Q4 — full migration)

`docs/manual/` migrates all ~71 MDX `<europa-*>` usages to imported React components:

- **`docs/manual/package.json`**: add `@astrojs/react` `^6.0.5` + `react`/`react-dom`/`@types/react`/`@types/react-dom` (catalog versions).
- **`docs/manual/astro.config.mjs`**: add `react()` to the `integrations` array (alongside existing `mdx()`).
- **`docs/manual/src/layouts/ManualLayout.astro`**: remove the `<script>` that calls `register()` from `@europa/design/components`.
- **MDX pages** (14 files): each `<europa-*>` usage becomes an imported React component. The MDX frontmatter imports the component from `@europa/design/components` and uses it as `<EuropaChip count={30} />` etc. The vendored `public/design.css` + `assets/design.css` (8 `<europa-*>` matches) are **not** component usages — they are CSS class references and stay as-is.

**Astro + React rendering note**: `@astrojs/react` renders React components server-side (SSR) by default and hydrates on the client. The React components must be **SSR-safe** (no `window`/`document` access at render time). The current web components are not SSR-safe (they touch `customElements`/`document`); the React conversion naturally fixes this — a key benefit. The `modal`'s focus trap and `waiting`'s live region must guard DOM access to effects (client-only), not render.

### 5. Guards and contracts

- **`scripts/check-component-catalog.ts` (G-10)**: currently reads `registry.ts` as text via regex and asserts `DESIGN.md` § 2 entries match. Since `registry.ts` is deleted, **rewrite** G-10 to read the React barrel (`src/components/index.ts`) or a new source-of-truth export list, and assert `DESIGN.md` § 2 entries match.
- **`scripts/check-bundle-size.ts`**: currently targets `dist/components.js` at 15 KB. **Rewrite** to target `dist/components/index.js` at **20 KB** (Q5, `BUNDLE_BUDGET_BYTES = 20_480`).
- **`DESIGN.md` § 2**: the "Web components (spec 014)" section is rewritten to document the React component catalog (props, children, events, a11y obligations) instead of web-component tags/attributes/slots. The § 2 table is the normative binding contract (G-10 target).
- **`contracts/web-components.contract.md`**: rewritten as `contracts/react-components.contract.md` documenting the React export surface (component names, prop interfaces, children, events) + `DESIGN.md` § 2 contract shape.

### 6. Order of operations

1. **Foundation**: package.json peer deps + test tooling, tsconfig JSX lib, tsup config, vitest configs, delete web-component infra (`base.ts`, `register.ts`, `registry.ts`, `setup-element-internals.ts`).
2. **Generic components** (13): convert each to React + unit test.
3. **Game components** (7): convert each to React + unit test.
4. **Conformance + modal integration tests**: rewrite for React props.
5. **Guards + DESIGN.md § 2 + contracts**: rewrite G-10, bundle budget, DESIGN.md, contract doc.
6. **Console migration** (6 files): swap to React components, remove intrinsics + `register()` import.
7. **Astro manual migration** (Q4): add `@astrojs/react`, remove `register()` script, convert MDX usages.
8. **Verification**: `pnpm verify` (typecheck, lint, format, all package tests, browser tests, E2E, selfhost, design guards, conformance), manual build, coverage ≥80%.

---

## Key Decisions (from Clarifications v1.2 — do NOT relitigate)

| # | Decision |
| --- | --- |
| Q1 | **Full replacement** — no dual coexistence of web components and React components. |
| Q2 | **React component API**, props 1:1 from attributes; events map to callback props. |
| Q3 | **React as peer dependency** `>=18`. |
| Q4 | **Full Astro manual migration** in scope. |
| Q5 | Remove 15 KB per-component budget; new **20 KB budget** on `dist/components/index.js`. |

---

## Risks and Mitigations

- **SSR safety (manual)**: React components must not touch `window`/`document` at render. Mitigation: DOM access confined to `useEffect`/event handlers; verified by the manual's `astro build` (SSR render) + console browser tests.
- **Modal focus trap**: the current web-component trap is rewritten for React. Mitigation: `vitest-browser-react` integration tests (FR-028) cover focus trap, Escape, focus restore in real Chromium.
- **happy-dom gaps**: `attachInternals` polyfill removed (no longer needed); `assignedNodes`/slot behavior irrelevant (no slots). RTL + happy-dom covers structural assertions; browser-mode covers interactive behavior.
- **Bundle budget**: React components share React runtime (peer dep, not bundled), so 20 KB on `dist/components/index.js` is achievable. Verified by rewritten `check-bundle-size.ts`.
- **`lobby-identity-card.tsx` location**: listed as in-scope but not found via glob — verify its actual path during implementation; if absent, note and confirm scope.

---

## Verification (acceptance criteria)

- `pnpm verify` green (typecheck, lint, format, all package tests, browser tests, E2E, selfhost, design guards, conformance).
- `@europa/design` coverage ≥80% on every metric (Principle III).
- `check:component-catalog` (G-10) green against rewritten `DESIGN.md` § 2.
- `check:bundle-size` green at 20 KB on `dist/components/index.js` (Q5).
- Console suites green (unit, component, a11y, e2e) — migration visually invisible (FR-018, SC-003).
- `docs/manual` `pnpm build` succeeds (Q4) — Astro SSR renders React components; no `register()` script.
- No web-component registration code remains anywhere in `@europa/design` (Q1).
