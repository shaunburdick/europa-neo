# Contract: Europa Neo React Components (`@europa/design/components`)

**Feature**: `014-shared-ui-components` (issue #65) | **Date**: 2026-09-03 | **Spec**: [`specs/014-shared-ui-components/spec.md`](../spec.md)

This contract pins the public surface of `@europa/design/components` — the React component export surface, each component's prop interface, the `package.json#exports` shape, and the G-10 guard contract. It is the normative reference for the conformance test (FR-030) and the G-10 drift guard (FR-020).

> **Versioning**: this file lives inside `specs/014-shared-ui-components/contracts/` so Biome excludes it via `!specs/*/contracts/**` — the exact values here are formatted for stability and are the drift-test mirrors.

---

## 1. Package surface

### 1.1 Workspace identity

| Field | Requirement | Drift check |
|-------|-------------|-------------|
| `name` | `@europa/design` | `packages/design/package.json#name` |
| `private` | `true` | `package.json` `private === true` |
| `version` | `0.1.0` lockstep (unchanged by this feature) | `version:check` |
| `dependencies` | zero own `dependencies` (unchanged) | `Object.keys(pkg.dependencies||{}).length === 0` |
| `peerDependencies` | `react: ">=18"`, `react-dom: ">=18"` (Q3) | `package.json#peerDependencies` |
| `exports` | `"./components"` preserved; existing `"."` and `"./tokens"` unchanged | `package.json#exports` shape |

### 1.2 `package.json#exports` — the `./components` subpath (FR-006/FR-008)

```json
{
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        },
        "./tokens": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        },
        "./components": {
            "types": "./dist/components/index.d.ts",
            "import": "./dist/components/index.js"
        },
        "./brand": {
            "types": "./dist/brand/index.d.ts",
            "import": "./dist/brand/index.js"
        },
        "./dist/design.css": "./dist/design.css"
    }
}
```

- The `"./components"` subpath is **JavaScript only** — no CSS (FR-007). The stylesheet continues to be imported separately via `@europa/design/dist/design.css`.
- Importing `@europa/design/components` has **no side effects** — no `customElements.define`, no registration (Q1). It exports React components only.

---

## 2. React component export surface (Q1/Q2)

The barrel `src/components/index.ts` exports exactly these 20 named React components plus the `PipeSlopeDirection` type. No web-component registration API (`register`, `REGISTRY`, `EuropaElement`) is exported.

### 2.1 Generic components (13)

| Component | Props | Children | Events | A11y obligations |
| --- | --- | --- | --- | --- |
| `EuropaButton` | `variant` (`primary`/`secondary`/`ghost`/`success`/`warning`/`error`/`info`), `size` (`sm`/`lg`), `disabled` (bool), `type` (`button`/`submit`/`reset`), `aria-label` | label | none | native `<button>` (FR-013), keyboard-operable, focus-visible ring |
| `EuropaCard` | none | content | none | host supplies heading structure |
| `EuropaPlate` | none | content | none | host supplies heading structure |
| `EuropaModal` | `open` (bool), `title` (string) | body, `actions` (button bar) | `onClose` (Escape/backdrop) | `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape close, focus restore (FR-011) |
| `EuropaChip` | `count` (number) | optional suffix | none | text content is the value |
| `EuropaBadge` | none | label | none | text label |
| `EuropaBanner` | `variant` (`status`/`alert`) | message | none | `role="status"` (status) or `role="alert"` + `aria-live="assertive"` (alert) (FR-012) |
| `EuropaTypography` | `variant` (`heading`/`subheading`/`body`/`label`/`caption`) | text | none | heading renders `<h2>`, subheading renders `<h3>` |
| `EuropaWaiting` | `message` (string), `reducedMotion` (bool) | none | none | spinner `aria-hidden`, message announced via live region, respects `prefers-reduced-motion` |
| `EuropaGrid` | `variant` (`sidebar`/`wrap`) | items | none | layout only, DOM order = reading order |
| `EuropaStack` | none | items | none | layout only |
| `EuropaContainer` | none | content | none | layout only |
| `EuropaPage` | none | content | none | layout only, DOM order = reading order |

### 2.2 Game components (7)

| Component | Props | Children | Events | A11y obligations |
| --- | --- | --- | --- | --- |
| `EuropaTroopChip` | `count` (number), `owner` (1–4) | none | none | `role="img"`, `aria-label` from count+owner (FR-014) |
| `EuropaCityMarker` | `owner` (1–4) | none | none | `role="img"`, `aria-label` from owner (FR-014) |
| `EuropaPipeSlope` | `direction` (`downhill`/`flat`/`uphill`/`stalled`) | none | none | `role="img"`, `aria-label` from direction (FR-014) |
| `EuropaElevationSwatch` | `elevation` (0–100) | none | none | `role="img"`, `aria-label` with elevation value (FR-014) |
| `EuropaPlayerBadge` | `player` (1–4), `name` (optional) | none | none | `role="img"`, `aria-label` from player+name (FR-014) |
| `EuropaFogOverlay` | `visible` (bool, default true) | none | none | `aria-hidden="true"` (FR-014) |
| `EuropaReserveIndicator` | `percent` (0–90 step 10) | none | none | `role="img"`, `aria-label` with percentage (FR-014) |

### 2.3 Type export

`PipeSlopeDirection` (`'downhill' | 'flat' | 'uphill' | 'stalled'`) is exported from `pipe-slope.tsx` and re-exported from the barrel. It is consumed by the console's `pipe-slope.ts` mirror + drift test.

---

## 3. G-10 guard contract (FR-020)

The `check-component-catalog.ts` script (G-10) asserts that every React component exported from `src/components/index.ts` has a `DESIGN.md` § 2 entry, and vice versa. The source of truth is the React barrel (replacing the deleted `registry.ts`).

- Every component name in the barrel appears in `DESIGN.md` § 2.
- Every component in `DESIGN.md` § 2 is exported from the barrel.
- The `DESIGN.md` § 2 table documents props, children, events, and a11y obligations for each component.

---

## 4. Bundle budget (Q5)

`check-bundle-size.ts` enforces `BUNDLE_BUDGET_BYTES = 20_480` (≤20 KB gzip) on `dist/components/index.js`. React is a peer dependency and is **not** bundled. The console's `< 153,600 B` bundle budget is preserved.

---

## 5. Deleted web-component surface (Q1)

The following are **removed** — no dual coexistence:

- `register()` / `REGISTRY` / `EuropaElement` (web-component registration API)
- `src/components/base.ts`, `register.ts`, `registry.ts`
- `tests/setup-element-internals.ts` (happy-dom `attachInternals` polyfill)
- `src/styles/catalog-styles.ts` (generated shadow-root stylesheet) + `build-css.ts --emit-module` path
- Console `custom-elements.d.ts`, `global.d.ts` (JSX intrinsics)
- Console `main.tsx` line 1 `import { register }`
- `docs/manual/src/layouts/ManualLayout.astro` `register()` `<script>`
