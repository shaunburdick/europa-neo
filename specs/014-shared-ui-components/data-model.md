# Data Model: Shared UI Web Components in `@europa/design`

**Feature**: `014-shared-ui-components` (issue #41) | **Date**: 2026-08-31 | **Spec**: [`spec.md`](./spec.md)

> This is a **conceptual** data model. The web-component layer has no database; every entity below is a naming/value contract realized as a TypeScript class, a registry array, a `package.json#exports` entry, or a `DESIGN.md` row. Tables enumerate the fields, types, constraints, and relations that tests enforce.

---

## 1. Component Definition

A single web-component registration: the mapping from a `europa-*` custom-element tag name to its class, its catalog classes, its attributes, slots, events, and a11y obligations.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `tag` | `string` | NOT NULL, unique, matches `/^europa-[a-z0-9-]+$/`, contains a hyphen | Custom-element tag name, e.g. `europa-button`. Must satisfy `customElements.define`'s hyphen requirement. |
| `ctor` | `CustomElementConstructor` | NOT NULL, extends `HTMLElement` | The component class, e.g. `EuropaButton`. |
| `catalogClasses` | `string[]` | every entry is an existing `europa-*` class from `DESIGN.md` § 2 | The classes the component applies to its rendered internal element(s). Proves the component is a faithful wrapper (FR-010, FR-030). |
| `attributes` | `ComponentAttribute[]` | possibly empty | Observed attributes: name, type (`string`/`boolean`/`number`), default, description. |
| `slots` | `ComponentSlot[]` | possibly empty | Named or default slots: name, description. |
| `events` | `ComponentEvent[]` | possibly empty | Dispatched events: name, detail type, description. |
| `a11yObligations` | `string` | NOT NULL | Roles, aria attributes, focus management, keyboard behavior the component enforces (FR-011..FR-015). |

```ts
// Illustrative shape — authoritative in contracts/web-components.contract.md
interface ComponentAttribute {
    name: string;            // e.g. 'variant'
    type: 'string' | 'boolean' | 'number';
    default: string | boolean | number | null;
    description: string;
}
interface ComponentSlot {
    name: string;            // '' for the default slot
    description: string;
}
interface ComponentEvent {
    name: string;            // e.g. 'europa-close'
    detail: string;          // type of event.detail, or 'void'
    description: string;
}
```

### Validation Rules

- **V-W1** Each `tag` is unique across the registry (no duplicate registration).
- **V-W2** Each `tag` matches `/^europa-[a-z0-9-]+$/` and contains a hyphen (customElements.define requirement).
- **V-W3** Each `catalogClasses` entry exists in `DESIGN.md` § 2 (FR-010) — enforced by the conformance test (FR-030) and the G-10 guard.
- **V-W4** Each `attributes` entry is observed via `static get observedAttributes()` (FR-027, NFR-005).
- **V-W5** Each `a11yObligations` is enforced by a unit test (FR-027) — roles/aria attributes asserted on the rendered element.

---

## 2. Component Registry

The ordered array of all `ComponentDefinition`s — the single source of truth for both `register()` and the G-10 guard.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `REGISTRY` | `readonly ComponentDefinition[]` | NOT NULL, exactly 20 entries (13 generic + 7 game) | The inventory. `register()` iterates it; G-10 enumerates its tags. |
| `tag` | `string` | unique | See § 1. |
| `ctor` | `CustomElementConstructor` | NOT NULL | See § 1. |

### The 20 entries (FR-001 + FR-002)

**Generic (13):**

| Tag | Class | Catalog classes | Attributes | Slots | Events | A11y obligations |
|-----|-------|-----------------|------------|-------|--------|------------------|
| `europa-button` | `EuropaButton` | `europa-button` + variant/size modifiers | `variant` (string), `size` (string), `disabled` (boolean) | default (label) | — | Native `<button>`; forwards `disabled`, `aria-label`, `type`; `*:focus-visible` |
| `europa-card` | `EuropaCard` | `europa-card` | — | default (content) | — | Host supplies heading structure |
| `europa-plate` | `EuropaPlate` | `europa-plate` | — | default (content) | — | Host supplies heading structure |
| `europa-modal` | `EuropaModal` | `europa-modal-backdrop`, `europa-modal`, `europa-modal__title`, `europa-modal__body`, `europa-modal__actions` | `open` (boolean), `title` (string) | default (body), `actions` | `europa-close` | `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape, focus restore |
| `europa-chip` | `EuropaChip` | `europa-chip` | `count` (string) | — | — | Text content is the value |
| `europa-badge` | `EuropaBadge` | `europa-badge` | — | default (label) | — | Text label |
| `europa-banner` | `EuropaBanner` | `europa-banner` | `variant` (string: status/alert) | default (message) | — | `role="status"` / `role="alert"` + `aria-live` |
| `europa-typography` | `EuropaTypography` | `europa-typography--heading/muted/meta/mono` | `variant` (string) | default (text) | — | Semantic element per variant |
| `europa-waiting` | `EuropaWaiting` | `europa-waiting`, `europa-waiting__plate`, `europa-waiting__pulse`, `europa-waiting__text` | `message` (string), `reduced-motion` (boolean) | — | — | Spinner `aria-hidden`; message in live region; reduced-motion |
| `europa-grid` | `EuropaGrid` | `europa-grid` + `--sidebar`/`--wrap` | `variant` (string) | default (items) | — | Layout only |
| `europa-stack` | `EuropaStack` | `europa-stack` | — | default (items) | — | Layout only |
| `europa-container` | `EuropaContainer` | `europa-container` | — | default (content) | — | Layout only |
| `europa-page` | `EuropaPage` | `europa-page` | — | default (content) | — | Layout only; DOM order = reading order |

**Game-specific (7):**

| Tag | Class | Catalog classes | Attributes | Slots | Events | A11y obligations |
|-----|-------|-----------------|------------|-------|--------|------------------|
| `europa-troop-chip` | `EuropaTroopChip` | `europa-chip` | `count` (string), `owner` (string) | — | — | `role="img"`, `aria-label` from count+owner |
| `europa-city-marker` | `EuropaCityMarker` | (inline) | `owner` (string) | — | — | `role="img"`, `aria-label` from owner |
| `europa-pipe-slope` | `EuropaPipeSlope` | (inline) | `direction` (string: downhill/flat/uphill/stalled) | — | — | `role="img"`, `aria-label` from direction |
| `europa-elevation-swatch` | `EuropaElevationSwatch` | (inline) | `elevation` (string, 0–100) | — | — | `role="img"`, `aria-label` with elevation |
| `europa-player-badge` | `EuropaPlayerBadge` | `europa-badge` | `player` (string), `name` (string) | — | — | `role="img"`, `aria-label` from player+name |
| `europa-fog-overlay` | `EuropaFogOverlay` | (inline) | `visible` (boolean) | — | — | `aria-hidden="true"` (purely visual) |
| `europa-reserve-indicator` | `EuropaReserveIndicator` | `europa-chip` | `percent` (string, 0–90 step 10) | — | — | `role="img"`, `aria-label` with percentage |

> **Note on game-primitive catalog classes**: the game primitives that render inline shapes (city-marker, pipe-slope, elevation-swatch, fog-overlay) do not map to a single existing catalog class — they compose token colors into inline-styled elements (R8). Their `catalogClasses` are the token-derived colors they use (e.g. `pipeDownhill`), not a class name. The conformance test (FR-030) for these asserts the token-derived color matches the token value, not a class-name match.

### Validation Rules

- **V-R1** `REGISTRY.length === 20` (13 generic + 7 game) — pinned by a test.
- **V-R2** Every `tag` in `REGISTRY` has a `DESIGN.md` § 2 entry (G-10, FR-020).
- **V-R3** `register()` defines every tag exactly once; calling it twice does not throw (FR-003, SC-001).

---

## 3. G-10 Guard — data source

The G-10 drift guard (FR-020) asserts every registered `europa-*` custom element has a corresponding `DESIGN.md` § 2 entry.

### Data source

- **Registered tags**: imported from `src/components/registry.ts` (`REGISTRY.map(d => d.tag)`).
- **Documented tags**: extracted from `DESIGN.md` § 2 by regex over the web-component table rows. Each row's first column contains `<europa-…>`; the regex `/europa-[a-z0-9-]+/` extracts the tag.

### Validation Rules

- **V-G1** `set(registeredTags) === set(documentedTags)` — no orphan in either direction. Failure names the missing/extra tag.
- **V-G2** The guard runs locally (`pnpm --filter @europa/design check:component-catalog`) and in CI (client-ci.yml already path-filters `packages/design/**`).

---

## 4. Export surface — `@europa/design/components`

The public subpath export added by this feature (FR-006/FR-008).

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `package.json#exports["./components"]` | `{ types, import }` | `types: "./dist/components.d.ts"`, `import: "./dist/components.js"` | New subpath. Existing `"."` and `"./tokens"` unchanged. |
| `dist/components.js` | ESM bundle | `splitting: false` (standalone), gzip ≤ 15 KB (FR-025) | Produced by the tsup second entry. |
| `dist/components.d.ts` | type declarations | strict, no `any` | Produced by tsup `dts: true`. |
| `src/components/index.ts` | barrel | re-exports all classes + `register()` | The tsup entry. |

### Validation Rules

- **V-E1** Importing `@europa/design/components` has no side effects (no `customElements.define` at import) (FR-004).
- **V-E2** `@europa/design` and `@europa/design/tokens` exports are unchanged (FR-006).
- **V-E3** `dist/components.js` gzip ≤ 15 KB (FR-025) — pinned by `check-bundle-size.ts`.
- **V-E4** The components export contains no CSS import (FR-007) — the stylesheet is imported separately.

---

## 5. Console migration mapping

The set of console files changed and the web components that replace their inline patterns (FR-016).

| Console file | Web component(s) introduced | What stays React |
|--------------|-----------------------------|------------------|
| `waiting-overlay.tsx` | `<europa-waiting>` | `resolveWaitingMessage`, announcer effect, props derivation |
| `lobby-landing.tsx` | `<europa-banner variant="alert">` (×2) | lobby layout, superseded notice, headings, announcements |
| `lobby-create-form.tsx` | `<europa-button type="submit">` | form/fieldset/select/radio logic, error rendering |
| `lobby-identity-card.tsx` | `<europa-button type="submit">` | form/input/validation logic, status lines |
| `lobby-match-list.tsx` | `<europa-button type="button">` (Join/Spectate) | row composition, list logic, empty/loading states |
| `branded-footer.tsx` | none (no component match) | unchanged (FR-016: "keep as-is if no component match") |

**Out of scope (FR-017)**: `order-bar.tsx`, `reserves-panel.tsx`, `targeting-overlay.tsx`, `seat-labels.ts`, `participants.tsx`, `route-notice.tsx`, `lobby-labels.ts`, `lobby-handle.ts`.

### Validation Rules

- **V-M1** Every migrated surface's computed styles are identical pre/post migration (FR-018, SC-003) — verified by the existing console component/a11y suites plus a computed-style assertion task.
- **V-M2** The console's axe/a11y suites remain green (FR-018, SC-003).
- **V-M3** The console browser-payload gzip budget (< 153,600 B) remains green (FR-026, G-08).

---

## 6. DESIGN.md web-component subsection

The new content added to `DESIGN.md` § 2 (FR-022).

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `section` | `Markdown subsection` | titled "Web components (spec 014)" | Added to § 2. |
| `rows` | `Markdown table` | one row per component | Columns: tag, attributes, slots, events, a11y obligations, usage example. |
| `tag` | `string` | matches `/^europa-[a-z0-9-]+$/` | First column; the G-10 regex target. |

### Validation Rules

- **V-D1** Every registered tag appears as a row (G-10, FR-020).
- **V-D2** Updated in the same change set as the component implementation (FR-022, FR-018 of spec 012).

---

## Relationships Diagram (conceptual)

```
ComponentDefinition ──1..*──► ComponentRegistry (REGISTRY)
       │                              │
       │ catalogClasses               │ tags
       ▼                              ▼
  DESIGN.md §2 (catalog)        register() ──► customElements.define
       ▲                              │
       │ G-10 (set equality)          ▼
       └──────────────────► G-10 Guard ◄── dist/components.js (bundle)
```

- **ComponentDefinition → ComponentRegistry**: each definition is one registry entry.
- **ComponentRegistry → register()**: `register()` iterates the registry, defining each tag.
- **ComponentRegistry → G-10 Guard**: the guard enumerates the registry's tags.
- **DESIGN.md §2 → G-10 Guard**: the guard compares documented tags against registered tags.
- **ComponentDefinition → DESIGN.md §2**: each component's `catalogClasses` must exist in the catalog (FR-010).

---

## Invariants (repo-wide, test-pinned)

| ID | Invariant | Enforced Because |
|----|-----------|------------------|
| INV-W1 | `REGISTRY.length === 20` (13 generic + 7 game). | The inventory is complete (FR-001/FR-002). |
| INV-W2 | Every registered tag has a `DESIGN.md` § 2 entry and vice versa. | G-10 (FR-020) — no undocumented component. |
| INV-W3 | `register()` is idempotent — calling it twice does not throw. | FR-003, SC-001. |
| INV-W4 | Importing `@europa/design/components` has no side effects. | FR-004 — SSR-safe, tree-shakeable. |
| INV-W5 | Every component's rendered DOM uses only existing `europa-*` classes and `TOKENS` values — no new CSS classes, no new token variables. | FR-010, FR-023 — G-01..G-09 unaffected. |
| INV-W6 | `dist/components.js` gzip ≤ 15 KB. | FR-025. |
| INV-W7 | The console browser-payload gzip budget (< 153,600 B) remains green after migration. | FR-026, G-08. |
| INV-W8 | Every component's `catalogClasses` (for class-based components) matches a manually-constructed equivalent using the catalog classes. | FR-030 conformance test. |
| INV-W9 | The waiting family (`.europa-waiting*`) lives in the shared catalog, not the console. | R7 — SC-004 manual compatibility. |
