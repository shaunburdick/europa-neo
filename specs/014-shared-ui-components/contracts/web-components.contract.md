# Contract: Europa Neo Web Components (`@europa/design/components`)

**Feature**: `014-shared-ui-components` (issue #41) | **Date**: 2026-08-31 | **Spec**: [`specs/014-shared-ui-components/spec.md`](../spec.md)

This contract pins the public surface of `@europa/design/components` — the `register()` signature, each component class's public surface, the `package.json#exports` shape, and the G-10 guard contract. It is the normative reference for the conformance test (FR-030) and the G-10 drift guard (FR-020).

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
| `exports` | gains `"./components"`; existing `"."` and `"./tokens"` unchanged | `package.json#exports` shape |

### 1.2 `package.json#exports` — the new `./components` subpath (FR-006/FR-008)

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
            "types": "./dist/components.d.ts",
            "import": "./dist/components.js"
        },
        "./dist/design.css": "./dist/design.css"
    }
}
```

- The `"./components"` subpath is **JavaScript only** — no CSS (FR-007). The stylesheet continues to be imported separately via `@europa/design/dist/design.css`.
- Importing `@europa/design/components` has **no side effects** — no `customElements.define` at import time (FR-004).

---

## 2. `register()` contract (FR-003/FR-004/FR-005)

```ts
/**
 * Register every Europa Neo web component with the browser's custom
 * element registry. Idempotent: calling it multiple times, or after a
 * tag has already been registered (e.g. by a selective
 * `customElements.define`), silently no-ops on duplicates.
 *
 * Safe to call in any environment: if `customElements` is undefined
 * (SSR, Node), it no-ops.
 */
export function register(): void;
```

- **Idempotency**: `register()` checks `customElements.get(tag)` before each `customElements.define`; duplicates are skipped, never thrown (FR-003, SC-001).
- **No auto-register**: importing the module does not call `register()` (FR-004).
- **Selective registration**: each component class is exported as a named export so consumers can call `customElements.define('europa-button', EuropaButton)` directly (FR-005).

---

## 3. Component class public surface

Each component class extends `HTMLElement` (via the shared `EuropaElement` base). The public surface is the class name, its `observedAttributes`, and its rendered DOM structure. All classes are exported from `@europa/design/components`.

### 3.1 Generic components (FR-001)

#### `EuropaButton` — `<europa-button>`

- **Catalog classes**: `europa-button` + variant (`europa-button--primary/secondary/ghost/success/warning/error/info`) + size (`europa-button--sm/lg`).
- **Attributes**: `variant` (string, default none/base), `size` (string, default none/base), `disabled` (boolean).
- **Slots**: default (label text).
- **Events**: none.
- **Rendered DOM**: a native `<button>` element with the composed classes. Forwards `disabled`, `aria-label`, `type`, and other passthrough attributes to the internal `<button>`. Children (label) render inside the `<button>`.
- **A11y**: native `<button>` (keyboard-operable, form participation, disabled semantics — FR-013); participates in `*:focus-visible` (FR-015).

#### `EuropaCard` — `<europa-card>`

- **Catalog classes**: `europa-card`.
- **Attributes**: none.
- **Slots**: default (arbitrary content).
- **Rendered DOM**: a `<div class="europa-card">` wrapping the slotted children.
- **A11y**: host supplies heading structure (the class conveys no semantics).

#### `EuropaPlate` — `<europa-plate>`

- **Catalog classes**: `europa-plate`.
- **Attributes**: none.
- **Slots**: default (arbitrary content).
- **Rendered DOM**: a `<div class="europa-plate">` wrapping the slotted children.
- **A11y**: host supplies heading structure.

#### `EuropaModal` — `<europa-modal>`

- **Catalog classes**: `europa-modal-backdrop`, `europa-modal`, `europa-modal__title`, `europa-modal__body`, `europa-modal__actions`.
- **Attributes**: `open` (boolean), `title` (string).
- **Slots**: default (body content), `actions` (button bar).
- **Events**: `europa-close` (dispatched on Escape or backdrop click; `detail` void).
- **Rendered DOM**:
  ```html
  <div class="europa-modal-backdrop">
      <div class="europa-modal" role="dialog" aria-modal="true" aria-labelledby="<generated-id>">
          <h2 class="europa-modal__title" id="<generated-id>">title</h2>
          <div class="europa-modal__body"><slot></slot></div>
          <div class="europa-modal__actions"><slot name="actions"></slot></div>
      </div>
  </div>
  ```
- **A11y (FR-011)**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title; focus trap (Tab/Shift+Tab cycle within); Escape dispatches `europa-close` and closes; focus restore on close; hidden (`display: none`) + removed from Tab order when `open` is false/absent.

#### `EuropaChip` — `<europa-chip>`

- **Catalog classes**: `europa-chip`.
- **Attributes**: `count` (string, displayed as text content).
- **Slots**: none.
- **Rendered DOM**: a `<span class="europa-chip">` whose text content is the `count` attribute value.
- **A11y**: text content is the value.

#### `EuropaBadge` — `<europa-badge>`

- **Catalog classes**: `europa-badge`.
- **Attributes**: none.
- **Slots**: default (label text).
- **Rendered DOM**: a `<span class="europa-badge">` wrapping the slotted label.
- **A11y**: text label.

#### `EuropaBanner` — `<europa-banner>`

- **Catalog classes**: `europa-banner`.
- **Attributes**: `variant` (string: `status` | `alert`, default `status`).
- **Slots**: default (message text).
- **Rendered DOM**: a `<div class="europa-banner">` wrapping the slotted message.
- **A11y (FR-012)**: `role="status"` for `status`, `role="alert"` + `aria-live="assertive"` for `alert`.

#### `EuropaTypography` — `<europa-typography>`

- **Catalog classes**: `europa-typography--heading/muted/meta/mono`.
- **Attributes**: `variant` (string: `heading` | `muted` | `meta` | `mono`).
- **Slots**: default (text content).
- **Rendered DOM**: a semantic element per variant — `h2` for `heading`, `span`/`p` for the rest — with the typography class.
- **A11y**: the class never substitutes for a heading element; `heading` renders a real heading.

#### `EuropaWaiting` — `<europa-waiting>`

- **Catalog classes**: `europa-waiting`, `europa-waiting__plate`, `europa-waiting__pulse`, `europa-waiting__text` (moved into the shared catalog — see research R7).
- **Attributes**: `message` (string), `reduced-motion` (boolean).
- **Slots**: none.
- **Rendered DOM**:
  ```html
  <div class="europa-waiting">
      <div class="europa-waiting__plate">
          <div aria-hidden="true" class="europa-waiting__pulse"></div>
          <p class="europa-waiting__text">message</p>
      </div>
  </div>
  ```
- **A11y**: spinner `aria-hidden`; message announced via a live region; respects `prefers-reduced-motion` (WCAG 2.3.3).

#### `EuropaGrid` — `<europa-grid>`

- **Catalog classes**: `europa-grid` + `--sidebar`/`--wrap`.
- **Attributes**: `variant` (string: default | `sidebar` | `wrap`).
- **Slots**: default (grid items).
- **Rendered DOM**: a `<div class="europa-grid">` (plus modifier) wrapping the slotted items.
- **A11y**: layout only; DOM order = reading order.

#### `EuropaStack` — `<europa-stack>`

- **Catalog classes**: `europa-stack`.
- **Attributes**: none.
- **Slots**: default (stacked items).
- **Rendered DOM**: a `<div class="europa-stack">` wrapping the slotted items.
- **A11y**: layout only.

#### `EuropaContainer` — `<europa-container>`

- **Catalog classes**: `europa-container`.
- **Attributes**: none.
- **Slots**: default (contained content).
- **Rendered DOM**: a `<div class="europa-container">` wrapping the slotted content.
- **A11y**: layout only.

#### `EuropaPage` — `<europa-page>`

- **Catalog classes**: `europa-page`.
- **Attributes**: none.
- **Slots**: default (page content).
- **Rendered DOM**: a `<div class="europa-page">` wrapping the slotted content.
- **A11y**: layout only; DOM order = reading order.

### 3.2 Game-specific primitives (FR-002)

#### `EuropaTroopChip` — `<europa-troop-chip>`

- **Catalog classes**: `europa-chip` (+ player color via inline style).
- **Attributes**: `count` (string), `owner` (string, player 1–4).
- **Rendered DOM**: a `<span class="europa-chip" role="img" aria-label="…">` with the count text and player-color border/fill.
- **A11y (FR-014)**: `role="img"`, `aria-label` computed from count and owner.

#### `EuropaCityMarker` — `<europa-city-marker>`

- **Catalog classes**: none (inline-styled shape).
- **Attributes**: `owner` (string, player 1–4).
- **Rendered DOM**: a `<span role="img" aria-label="…">` with the player-color marker.
- **A11y (FR-014)**: `role="img"`, `aria-label` from owner.

#### `EuropaPipeSlope` — `<europa-pipe-slope>`

- **Catalog classes**: none (inline-styled shape using `TOKENS.color.pipe*`).
- **Attributes**: `direction` (string: `downhill` | `flat` | `uphill` | `stalled`).
- **Rendered DOM**: a `<span role="img" aria-label="…">` with the direction-colored triangle (downhill green / flat amber / uphill red / stalled muted, per spec 005 FR-013).
- **A11y (FR-014)**: `role="img"`, `aria-label` from direction.

#### `EuropaElevationSwatch` — `<europa-elevation-swatch>`

- **Catalog classes**: none (inline-styled swatch).
- **Attributes**: `elevation` (string, numeric 0–100).
- **Rendered DOM**: a `<span role="img" aria-label="…">` with a color computed from the land elevation band (`hsl(landHue, landSaturationPct%, lightness%)`, lightness interpolated `landMinLightnessPct`→`landMaxLightnessPct`).
- **A11y (FR-014)**: `role="img"`, `aria-label` with elevation value.

#### `EuropaPlayerBadge` — `<europa-player-badge>`

- **Catalog classes**: `europa-badge`.
- **Attributes**: `player` (string, player 1–4), `name` (string, optional).
- **Rendered DOM**: a `<span class="europa-badge" role="img" aria-label="…">` with the player color and name.
- **A11y (FR-014)**: `role="img"`, `aria-label` from player and name.

#### `EuropaFogOverlay` — `<europa-fog-overlay>`

- **Catalog classes**: none (inline-styled overlay).
- **Attributes**: `visible` (boolean, default true).
- **Rendered DOM**: a `<div aria-hidden="true">` overlay (semi-transparent) shown when `visible`.
- **A11y (FR-014)**: `aria-hidden="true"` (purely visual).

#### `EuropaReserveIndicator` — `<europa-reserve-indicator>`

- **Catalog classes**: `europa-chip`.
- **Attributes**: `percent` (string, 0–90 step 10).
- **Rendered DOM**: a `<span class="europa-chip" role="img" aria-label="…">` with the percentage text.
- **A11y (FR-014)**: `role="img"`, `aria-label` with percentage.

---

## 4. `EuropaElement` base class contract

The shared base class all components extend (see plan.md § Component architecture).

```ts
abstract class EuropaElement extends HTMLElement {
    /** Subclasses declare the attributes they observe. */
    static get observedAttributes(): string[];

    /** Called by the base on connectedCallback and attributeChangedCallback. */
    protected abstract render(): void;

    /** Replace this element's class attribute from a list of class names. */
    protected setClasses(...classes: Array<string | false | null | undefined>): void;

    /** Set an attribute on an internal element if the condition holds, else remove it. */
    protected setAttributeIf(el: Element, name: string, condition: boolean): void;
}
```

- `render()` is idempotent — safe to call from both `connectedCallback` and `attributeChangedCallback`.
- `connectedCallback` calls `render()` once (creating the internal DOM if not already present).
- `attributeChangedCallback` calls `render()` to update classes/attributes on the internal DOM.

---

## 5. G-10 guard contract (FR-020)

```ts
/**
 * Assert every registered `europa-*` custom element has a corresponding
 * entry in DESIGN.md section 2, and vice versa. Fails naming the
 * missing/extra tag.
 */
export function checkComponentCatalog(): { ok: boolean; missing: string[]; extra: string[] };
```

- **Data source**: `REGISTRY` (from `src/components/registry.ts`) for registered tags; a regex over `DESIGN.md` § 2 web-component table rows for documented tags.
- **Failure message**: `missing in DESIGN.md: europa-…` / `registered but not in DESIGN.md: europa-…`.
- **Runs**: locally (`pnpm --filter @europa/design check:component-catalog`) and in CI (client-ci.yml path-filters `packages/design/**`).

---

## 6. Bundle budget contract (FR-025/FR-026)

```ts
/**
 * Assert dist/components.js gzip ≤ 15 KB (15,360 bytes).
 */
export function checkBundleSize(): { ok: boolean; gzipBytes: number };
```

- **FR-025**: `dist/components.js` gzipped ≤ 15 KB.
- **FR-026**: the console browser-payload gzip budget (< 153,600 B) remains green after migration — verified by the existing G-08 guard (`build-assets.ts`).

---

## 7. Drift-contract exhaustiveness

| Check ID | Mirrored surface |
|----------|------------------|
| G-10 | `REGISTRY` tags ↔ `DESIGN.md` § 2 web-component rows (FR-020) |
| FR-030 conformance | each component's rendered DOM ↔ manually-constructed catalog equivalent |
| FR-025 | `dist/components.js` gzip ≤ 15 KB |
| FR-026 | console browser-payload gzip < 153,600 B (existing G-08) |
| FR-023 | G-01..G-09 remain green (no new tokens/classes/rules) |

---

## 8. Out-of-scope — what this contract does not promise

- **Shadow DOM / `::part()` / `adoptedStyleSheets`** — all components use light DOM (product-owner decision 1).
- **Framework wrappers** — no React/Vue/Svelte wrapper packages ship (product-owner decision 2).
- **Auto-importing the stylesheet** — components do not import `design.css` (FR-007).
- **New token variables or CSS classes** — the web-component layer adds none (FR-010); the only catalog change is the additive waiting-family move (research R7).
- **Publishing to npm** — `@europa/design` remains `private: true` (binding decision 6).
