# Research: React Component Conversion of `@europa/design` (Issue #65)

**Feature**: `014-shared-ui-components` (issue #65) | **Date**: 2026-09-03 | **Spec**: [`spec.md`](./spec.md)

This document records the technology choices and design decisions behind the plan. It is the "why" behind the "what" — every decision here is traceable to a spec FR, a constitution principle, or a product-owner ruling (Clarifications v1.2).

---

## R1. React as peer dependency — version floor and rationale (Q3)

**Decision**: React is a **peer dependency** `>=18` on `@europa/design` (Q3). Zero runtime `dependencies` preserved (FR-024, NFR-006).

**Facts (verified against catalog + registry):**

- The workspace catalog pins `react: ^19.2.0`, `react-dom: ^19.2.0`, `@types/react: ^19.2.0`, `@types/react-dom: ^19.2.0`. Both consumers (console, manual) use React 19.
- The spec's Q3 ruling sets the peer floor at `>=18`. React 18 is the minimum because the components use standard function-component + hooks patterns that are fully supported in 18; nothing requires 19-specific APIs. `@testing-library/react` 16 supports React 18 and 19.
- Peer dependency (not a hard `dependencies` entry) keeps the package lightweight and lets the host own the React version — the standard pattern for a React component library. It also avoids bundling a second React copy (which would break hooks and double the bundle).

**Implication**: `@europa/design/package.json` gains:
```json
"peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
}
```
The `@types/react`/`@types/react-dom` are devDependencies (catalog) for authoring; consumers bring their own.

---

## R2. React Testing Library stack — versions and environment (FR-027/FR-029/FR-030)

**Decision**: Use `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` for React component tests, running in **happy-dom** (node mode) for structural tests and **real Chromium** (`vitest-browser-react`) for interactive tests (modal focus trap).

**Facts (verified against npm registry, 2026-09-03):**

- `@testing-library/react` latest is **16.3.2** (requires React 18/19; **RTL 16 requires `@testing-library/dom` `^10.0.0` as a separate install**).
- `@testing-library/jest-dom` latest is **7.0.1** (custom DOM matchers).
- `@testing-library/user-event` latest is **14.6.7** (user-centric interaction; recommended over `fireEvent`).
- `vitest-browser-react` `^2.2.0` is already in the catalog — the browser-mode React renderer for `@vitest/browser` + Playwright Chromium.
- `happy-dom` `^20.11.6` is already in the catalog.

**Implication**: Add to `packages/design/package.json#devDependencies` (catalog versions where available; pin `@testing-library/*` explicitly):
- `@testing-library/react` `^16.3.2`
- `@testing-library/dom` `^10.0.0`
- `@testing-library/jest-dom` `^7.0.1`
- `@testing-library/user-event` `^14.6.7`

**Environment split** (mirrors the existing design test config):
- `vitest.config.ts` (node + `environment: 'happy-dom'`) — per-component structural tests, game-primitive tests, conformance test. happy-dom is sufficient for rendering React components and asserting DOM structure/classes/roles.
- `vitest.config.browser.ts` (Playwright Chromium + `vitest-browser-react`) — modal integration tests (FR-028: focus trap, Escape, focus restore). Real Chromium is required because happy-dom does not implement real focus behavior.

**happy-dom gaps (verified, issue #49)**: `attachInternals()` not implemented (polyfill no longer needed — the web-component `ElementInternals` form-association is gone), `assignedNodes()` returns empty for slots (irrelevant — no slots in React), `focus()` no-op on non-focusable elements. Assert DOM structure in happy-dom; assert interactive behavior in browser mode.

---

## R3. `@astrojs/react` version — Astro 7 compatibility (Q4)

**Decision**: Add `@astrojs/react` `^6.0.5` to `docs/manual` for the full manual migration (Q4).

**Facts (verified against npm registry + Astro docs, 2026-09-03):**

- `docs/manual` uses `astro: ^7.2.10`, `@astrojs/mdx: ^8.0.0`, `@astrojs/markdown-remark: ^7.2.0`.
- `@astrojs/react` latest is **6.0.5** (Astro 7.x line; v6.0.0 upgraded to Vite 7, matching Astro 6/7). It supports React 17/18/19 peer deps (`react: ^17.0.2 || ^18.0.0 || ^19.0.0`).
- The Astro docs recommend installing `react` + `react-dom` + their type definitions alongside the integration.

**Implication**: `docs/manual/package.json` adds:
- `@astrojs/react` `^6.0.5`
- `react` / `react-dom` / `@types/react` / `@types/react-dom` (catalog versions)

`docs/manual/astro.config.mjs` adds `react()` to `integrations`. `ManualLayout.astro` removes the `register()` `<script>`.

**SSR note**: `@astrojs/react` renders React components server-side by default. The React components must be SSR-safe (no `window`/`document` at render time). This is a **net improvement** over the web components, which touched `customElements`/`document` and were not SSR-safe. DOM access (modal focus trap, waiting live region) is confined to `useEffect`/event handlers.

---

## R4. Bundle budget — 20 KB on `dist/components/index.js` (Q5)

**Decision**: Remove the 15 KB per-component budget; enforce a single **20 KB** budget on `dist/components/index.js` (Q5).

**Facts:**

- The current `check-bundle-size.ts` targets `dist/components.js` at `BUNDLE_BUDGET_BYTES = 15_360` (≤15 KB gzip).
- The `./components` subpath export already points at `./dist/components/index.js` (not `dist/components.js`), so the budget target aligns with the real artifact.
- React is a **peer dependency** — it is **not** bundled into `dist/components/index.js`. The bundle contains only the component source (catalog class strings, token imports, prop logic), so 20 KB gzip is comfortably achievable.

**Implication**: Rewrite `check-bundle-size.ts` to target `dist/components/index.js` at `BUNDLE_BUDGET_BYTES = 20_480` (20 KB). The console's `< 153,600 B` bundle budget is preserved.

---

## R5. G-10 guard rewrite — source of truth moves from `registry.ts` to the React barrel

**Decision**: Rewrite `check-component-catalog.ts` (G-10) to read the React barrel instead of the deleted `registry.ts`.

**Facts:**

- The current G-10 reads `registry.ts` as text via regex `/tag:\s*['"]([^'"]+)['"]/g` and asserts `DESIGN.md` § 2 entries match.
- `registry.ts` is deleted (web-component infrastructure). The React barrel `src/components/index.ts` becomes the source of truth for the component catalog.

**Implication**: G-10 reads `src/components/index.ts` (or a dedicated exported component-name list) and asserts every exported React component has a `DESIGN.md` § 2 entry, and vice versa. `DESIGN.md` § 2 is rewritten from web-component tags/attributes/slots to React component props/children/events.

---

## R6. SSR safety as a first-class requirement

**Decision**: All React components must be SSR-safe (render without `window`/`document`), enabling the Astro manual's server-side rendering (Q4).

**Facts:**

- `@astrojs/react` SSR-renders components on the server before hydration.
- The web-component predecessors touched `customElements`/`document`/`attachShadow` at construction — not SSR-safe.
- The React conversion naturally fixes this: pure render functions + `useEffect` for DOM side effects.

**Implication**: The `modal` focus trap and `waiting` live region must guard DOM access in `useEffect` (client-only). Verified by the manual's `astro build` (SSR render) + console browser tests.

---

## R7. Testing philosophy — user-centric, not implementation-coupled

**Decision**: Tests assert rendered DOM (classes, roles, aria, text) and user behavior, not internal implementation. Use `@testing-library` queries + `user-event`; avoid asserting on component internals.

**Facts:**

- RTL's core principle: test the way a user interacts with the app (queries by role/label/text, not by implementation detail).
- The existing web-component tests (`tests/components/generic/button.test.ts`, `tests/components/conformance.test.ts`) assert structural DOM + token-derived colors; these migrate to RTL equivalents asserting the same rendered output.

**Implication**: The conformance test (FR-030) is rewritten to be table-driven over React props (each component's props → expected classes/roles/aria), reading the same token/class contract. Game-primitive tests assert `role="img"` + `aria-label` + token-derived inline colors.

---

## R8. Deletion of web-component infrastructure (Q1)

**Decision**: Delete all web-component registration infrastructure — no dual coexistence (Q1).

**Facts:**

- `src/components/base.ts` (`EuropaElement`, `ensureShadowRoot`, adopted stylesheet), `register.ts`, `registry.ts`, and `tests/setup-element-internals.ts` exist solely for web-component registration.
- The console's `custom-elements.d.ts` + `global.d.ts` (JSX intrinsics) and the `register()` import in `main.tsx` line 1 exist solely for web-component usage.

**Implication**: Delete these files and the console intrinsics/import. The `build-css.ts --emit-module` path (generating `catalog-styles.ts` for shadow roots) is also removed since no shadow roots remain. `dist/design.css` (global stylesheet) is retained.
