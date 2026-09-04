# Data Model: React Components in `@europa/design` (Issue #65)

**Feature**: `014-shared-ui-components` (issue #65) | **Date**: 2026-09-03 | **Spec**: [`spec.md`](./spec.md)

> This is a **conceptual** data model. The React component layer has no database; every entity below is a naming/value contract realized as a TypeScript React component, a prop interface, a `package.json#exports` entry, or a `DESIGN.md` row. Tables enumerate the props, defaults, children, events, and a11y obligations that tests enforce.

---

## 1. Component Definition

A single React component: the mapping from a component name to its prop interface, its catalog classes, its children, events, and a11y obligations.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `name` | `string` | NOT NULL, unique, matches `/^Europa[A-Z][a-zA-Z0-9]*$/` | React component name, e.g. `EuropaButton`. |
| `props` | `ComponentProp[]` | possibly empty | Props: name, type, default, description. Mapped 1:1 from web-component attributes (Q2). |
| `catalogClasses` | `string[]` | every entry is an existing `europa-*` class from `DESIGN.md` § 2 | The classes the component applies to its rendered element(s). Proves the component is a faithful wrapper (FR-010, FR-030). |
| `children` | `ReactNode` | optional | Projected children (replaces web-component `<slot>`). |
| `events` | `ComponentEvent[]` | possibly empty | Callback props (e.g. `onClose`). |
| `a11yObligations` | `string[]` | NOT NULL | Roles, aria attributes, focus management, keyboard behavior. |

---

## 2. Generic Components (13)

### 2.1 `EuropaButton`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'success' \| 'warning' \| 'error' \| 'info'` | `'primary'` | Maps to `europa-button--{variant}` modifier. |
| `size` | `'sm' \| 'lg'` | — | Maps to `europa-button--{size}` modifier. |
| `disabled` | `boolean` | `false` | Native `<button disabled>`. |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | Native `<button type>`. |
| `aria-label` | `string` | — | Passed to native `<button>`. |
| `children` | `ReactNode` | — | Button label. |

**catalogClasses**: `europa-button` (+ modifiers). **events**: none. **a11y**: native `<button>` (FR-013), keyboard-operable, focus-visible ring.

### 2.2 `EuropaCard`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Card content. |

**catalogClasses**: `europa-card`. **events**: none. **a11y**: host supplies heading structure.

### 2.3 `EuropaPlate`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Plate content. |

**catalogClasses**: `europa-plate`. **events**: none. **a11y**: host supplies heading structure.

### 2.4 `EuropaModal`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `open` | `boolean` | `false` | Renders when `true`. |
| `title` | `string` | — | `aria-labelledby` target. |
| `children` | `ReactNode` | — | Modal body. |
| `actions` | `ReactNode` | — | Button bar (replaces `slot="actions"`). |
| `onClose` | `() => void` | — | Fired on Escape/backdrop (replaces `europa-close` event). |

**catalogClasses**: `europa-modal`, `europa-modal__body`, `europa-modal__button`. **events**: `onClose`. **a11y**: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape close, focus restore (FR-011).

### 2.5 `EuropaChip`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `count` | `number` | — | Count value rendered as text. |
| `children` | `ReactNode` | — | Optional suffix content. |

**catalogClasses**: `europa-chip`. **events**: none. **a11y**: text content is the value.

### 2.6 `EuropaBadge`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Label text. |

**catalogClasses**: `europa-badge`. **events**: none. **a11y**: text label.

### 2.7 `EuropaBanner`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | `'status' \| 'alert'` | `'status'` | `status` → `role="status"`; `alert` → `role="alert"` + `aria-live="assertive"`. |
| `children` | `ReactNode` | — | Message. |

**catalogClasses**: `europa-banner`. **events**: none. **a11y**: `role="status"` (status) or `role="alert"` + `aria-live="assertive"` (alert) (FR-012).

### 2.8 `EuropaTypography`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | `'heading' \| 'subheading' \| 'body' \| 'label' \| 'caption'` | `'body'` | `heading` renders `<h2>`, `subheading` renders `<h3>`. |
| `children` | `ReactNode` | — | Text content. |

**catalogClasses**: `europa-typography` (+ variant modifiers). **events**: none. **a11y**: heading/subheading render semantic heading elements.

### 2.9 `EuropaWaiting`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `message` | `string` | — | Message announced via live region. |
| `reducedMotion` | `boolean` | `false` | Respects `prefers-reduced-motion`. |

**catalogClasses**: `europa-waiting`. **events**: none. **a11y**: spinner `aria-hidden`, message announced via live region, respects `prefers-reduced-motion`.

### 2.10 `EuropaGrid`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | `'sidebar' \| 'wrap'` | — | Maps to `europa-grid--{variant}` modifier. |
| `children` | `ReactNode` | — | Grid items. |

**catalogClasses**: `europa-grid` (+ modifiers). **events**: none. **a11y**: layout only, DOM order = reading order.

### 2.11 `EuropaStack`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Stack items. |

**catalogClasses**: `europa-stack`. **events**: none. **a11y**: layout only.

### 2.12 `EuropaContainer`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Container content. |

**catalogClasses**: `europa-container`. **events**: none. **a11y**: layout only.

### 2.13 `EuropaPage`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `children` | `ReactNode` | — | Page content. |

**catalogClasses**: `europa-page`. **events**: none. **a11y**: layout only, DOM order = reading order.

---

## 3. Game Components (7)

### 3.1 `EuropaTroopChip`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `count` | `number` | — | Troop count. |
| `owner` | `1 \| 2 \| 3 \| 4` | — | Player 1–4; maps to `OWNER_COLORS`. |

**catalogClasses**: `europa-chip` (+ owner color). **events**: none. **a11y**: `role="img"`, `aria-label` from count+owner (FR-014).

### 3.2 `EuropaCityMarker`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `owner` | `1 \| 2 \| 3 \| 4` | — | Player 1–4. |

**catalogClasses**: `europa-city-marker`. **events**: none. **a11y**: `role="img"`, `aria-label` from owner (FR-014).

### 3.3 `EuropaPipeSlope`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `direction` | `PipeSlopeDirection` | — | `'downhill' \| 'flat' \| 'uphill' \| 'stalled'`. |

**catalogClasses**: `europa-pipe-slope`. **events**: none. **a11y**: `role="img"`, `aria-label` from direction (FR-014).

**Type export**: `PipeSlopeDirection` is exported from `pipe-slope.tsx` and re-exported from the barrel (consumed by the console's `pipe-slope.ts` mirror + drift test).

### 3.4 `EuropaElevationSwatch`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `elevation` | `number` | — | 0–100. |

**catalogClasses**: `europa-elevation-swatch`. **events**: none. **a11y**: `role="img"`, `aria-label` with elevation value (FR-014).

### 3.5 `EuropaPlayerBadge`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `player` | `1 \| 2 \| 3 \| 4` | — | Player 1–4. |
| `name` | `string` | — | Optional player name. |

**catalogClasses**: `europa-player-badge`. **events**: none. **a11y**: `role="img"`, `aria-label` from player+name (FR-014).

### 3.6 `EuropaFogOverlay`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `visible` | `boolean` | `true` | When `false`, renders nothing. |

**catalogClasses**: `europa-fog-overlay`. **events**: none. **a11y**: `aria-hidden="true"` (FR-014).

### 3.7 `EuropaReserveIndicator`

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `percent` | `number` | — | 0–90, step 10. |

**catalogClasses**: `europa-reserve-indicator`. **events**: none. **a11y**: `role="img"`, `aria-label` with percentage (FR-014).

---

## 4. Export Surface

### 4.1 `@europa/design/components` subpath

Preserved and adapted (Q1/Q2). `package.json#exports`:

```json
"./components": {
    "types": "./dist/components/index.d.ts",
    "import": "./dist/components/index.js"
}
```

The barrel `src/components/index.ts` exports all 20 React components + `PipeSlopeDirection`.

### 4.2 Deleted web-component infrastructure

| File | Reason |
|------|--------|
| `src/components/base.ts` | `EuropaElement`/`ensureShadowRoot`/adopted stylesheet — no web components remain (Q1). |
| `src/components/register.ts` | `register()` — no registration remains (Q1). |
| `src/components/registry.ts` | `REGISTRY` array — G-10 source moves to the React barrel. |
| `tests/setup-element-internals.ts` | happy-dom `attachInternals` polyfill — no `ElementInternals` remains. |
| `src/styles/catalog-styles.ts` (generated) | Shadow-root adopted stylesheet — no shadow roots remain. |
| Console `custom-elements.d.ts`, `global.d.ts` | JSX intrinsics — no custom elements remain. |
| Console `main.tsx` line 1 `import { register }` | No registration call remains. |

---

## 5. Relations

- **Component → catalogClasses**: every `catalogClasses` entry is a `europa-*` class defined in `DESIGN.md` § 2 (enforced by G-10).
- **Component → a11yObligations**: every obligation is asserted by a unit test (FR-027/FR-029) or integration test (FR-028).
- **Component → prop**: every prop maps 1:1 from the web-component attribute (Q2), preserving defaults and coercion.
- **Barrel → component**: `src/components/index.ts` exports every component; G-10 asserts the barrel and `DESIGN.md` § 2 agree.
