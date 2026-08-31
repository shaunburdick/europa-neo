# Research: Shared UI Web Components in `@europa/design`

**Feature**: `014-shared-ui-components` (issue #41) | **Date**: 2026-08-31 | **Spec**: [`spec.md`](./spec.md)

This document records the technology choices and design decisions behind the plan. It is the "why" behind the "what" — every decision here is traceable to a spec FR, a constitution principle, or a product-owner ruling.

---

## R1. React 19 custom element interop — attribute vs property, boolean attributes, events

**Decision**: Rely on React 19's native custom element support. No wrapper layer, no `ref` forwarding for basic attribute/children passthrough (spec FR-019, product-owner decision 2).

**Facts (verified against React 19.2.0 behavior):**

- React 19 treats custom elements (tag names containing a hyphen) specially. When a JSX element's tag name is a custom element, React:
  - Passes **children** as the element's DOM children (light DOM) — no `dangerouslySetInnerHTML` needed.
  - Sets **properties** when the prop name exists on the element instance (e.g. `el.foo = value`), and falls back to **attributes** otherwise. This is the key interop improvement over React 18.
  - For **boolean attributes** on custom elements, React 19 sets the attribute to `""` when `true` and removes it when `false` (matching how it treats boolean attributes on intrinsic elements). This is the behavior the spec's Edge Case "React 18 (or earlier) consumers" warns about — React 18 did not do this correctly for custom elements.
  - **Event handlers** (`onClick`, `onKeyDown`, …) are attached as native DOM event listeners on the custom element. Because the components use **light DOM**, events that bubble from internal native elements (e.g. a `<button>` inside `<europa-button>`) bubble up through the custom element and are caught by React's delegated listeners. This is a critical consequence of the light-DOM decision: **React event delegation works because there is no shadow boundary to stop event retargeting.**

**Implication for our components:**

- Because we use **light DOM** (product-owner decision 1), React's synthetic event system works transparently. A `<europa-button onClick={...}>` receives clicks from the internal `<button>` because the click bubbles through the light-DOM subtree. This is NOT true for shadow-DOM components (events retarget to the host), which is a strong additional argument for light DOM beyond the single-stylesheet rule.
- Boolean attributes (`disabled`, `open`, `visible`, `reduced-motion`) are passed as `""`/absent. Our components must treat **presence** of the attribute as truthy and **absence** as falsy — the standard custom-element boolean pattern (`hasAttribute('disabled')`).
- Numeric attributes (`count`, `owner`, `elevation`, `percent`) arrive as strings and are parsed internally (`Number.parseInt` / `Number`). The components must coerce defensively and fall back to a documented default on `NaN`.
- React 19 does **not** need a wrapper for the migration. The console's in-scope files replace inline `<div className="europa-banner">` with `<europa-banner>` directly in JSX.

**Alternative considered and rejected**: A React wrapper layer (e.g. `@europa/design/react`) that wraps each web component in a React component. Rejected because (a) product-owner decision 2 explicitly forbids it, (b) React 19 native support makes it redundant, (c) it would double the maintenance surface and the bundle.

---

## R2. `customElements.define` registration pattern — explicit `register()`, idempotency

**Decision**: Explicit `register()` function (FR-003/FR-004), no auto-register on import. Individual classes exported for selective registration (FR-005).

**Facts:**

- `customElements.define(tagName, class)` throws `DOMException` ("already defined") if the tag is already registered. The `register()` function must guard with `customElements.get(tagName)` before defining, and skip silently on duplicates.
- `customElements.get(tagName)` returns the registered constructor or `undefined`. This is the canonical idempotency check.
- The pattern of an explicit `register()` is well-established: Shoelace/Slime's `register()`, Ionic's `defineCustomElements()`, and the `@shoelace-style/shoelace` `register()` all follow it. It avoids global side effects on import (critical for SSR/test environments where `customElements` may not exist).
- **SSR safety**: `customElements` is a browser global. In Node (Jekyll build, Vitest node-mode), `customElements` is undefined. The `register()` function and the component classes must not reference `customElements` at module-evaluation time — only inside `register()` and lifecycle callbacks (`connectedCallback`), which run only in the browser. This keeps the module import side-effect-free and SSR-safe (spec Edge Case "Server-side rendering").

**Implication:**

- `src/components/index.ts` exports the classes and `register()` but performs no `customElements.define` at import time. `register()` iterates a registry array of `{ tag, ctor }` pairs and defines each only if `customElements.get(tag)` is undefined.
- The registry array is the **single source of truth** for the component inventory — it is also what the G-10 guard enumerates (see data-model.md § 3).

---

## R3. Focus-trap implementation in vanilla JS without Shadow DOM

**Decision**: Implement the modal focus trap with `keydown` event listeners on the host element (FR-011, NFR-005). No dependency, no `MutationObserver` polling.

**Facts / pattern:**

- The standard focus-trap algorithm (as in the `focus-trap` library, ~50 lines of vanilla JS):
  1. On open, collect the focusable descendants of the dialog: elements matching `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]`.
  2. On `keydown` Tab, if the active element is the last focusable, prevent default and focus the first; on Shift+Tab, if the active element is the first, focus the last.
  3. On open, move focus to the first focusable (or the dialog itself if none).
  4. On close, restore focus to the previously-focused element (captured at open time).
- Because we use **light DOM**, the focusable descendants are found via `dialog.querySelectorAll(FOCUSABLE_SELECTOR)` — no shadow-root traversal needed. This is simpler than a shadow-DOM trap.
- **NFR-005**: use `keydown` listeners, not `MutationObserver` polling. The trap is installed when `open` becomes true and removed when it becomes false. No continuous observation.
- **Escape**: a `keydown` listener on the host (or document) for `Escape` dispatches `europa-close` and closes.
- **Backdrop click**: a `click` listener on the backdrop element closes when the click target is the backdrop itself (not a child).
- **Focus restore**: capture `document.activeElement` at open; restore on close. If the trigger was removed, fall back to the first focusable in the document or no-op.

**Alternative considered and rejected**: The `focus-trap` npm package. Rejected because (a) spec NFR-006 requires zero runtime dependencies, (b) the pattern is ~50 lines and well-understood, (c) a dependency would add to the 15 KB bundle budget (FR-025).

---

## R4. Attribute observation — `observedAttributes` + `attributeChangedCallback`

**Decision**: Use the standard `observedAttributes` static getter + `attributeChangedCallback` lifecycle for reactive attribute handling. No `MutationObserver` (NFR-005).

**Facts:**

- `static get observedAttributes()` returns the attribute names the element observes. When any of these change, `attributeChangedCallback(name, oldValue, newValue)` fires.
- `attributeChangedCallback` fires **before** `connectedCallback` for attributes present at parse time (the initial attribute values are delivered as `oldValue = null`). This means `connectedCallback` can assume the DOM is already in its attribute-derived state — but it must still re-render defensively in case the element is created via `document.createElement` (no attributes) and attributes are set later.
- The pattern: each component stores its rendered internal DOM in `connectedCallback` (create the `<button>`/`<div>`/etc., append children), and `attributeChangedCallback` updates classes/attributes on that internal element. A re-render helper (`render()`) is idempotent — safe to call from both `connectedCallback` and `attributeChangedCallback`.
- **Boolean attributes**: `observedAttributes` includes the boolean attribute name; `attributeChangedCallback` receives `null` when removed, `""` when present. The component checks `this.hasAttribute(name)`.
- **NFR-005 (no layout thrashing)**: attribute changes batch class updates synchronously in `attributeChangedCallback`. Because `attributeChangedCallback` is already batched by the browser per attribute change, and our updates are simple class-list/attribute mutations, there is no layout thrash.

**Implication for the base class**: The shared `EuropaElement` base (see plan.md) provides:
- `static get observedAttributes()` — each subclass declares its observed attributes.
- A `render()` hook that subclasses implement; the base calls it from `connectedCallback` and `attributeChangedCallback`.
- A `connectedCallback` that calls `render()` once and, for components that need it, wires the initial DOM structure.
- Class-composition helpers: `setClasses(...)` (replaces the element's `class` attribute from a list) and `setAttributeIf` / `removeAttributeIf` for boolean mapping.

---

## R5. How the existing design package's build/vendor/guard scripts work

**Decision**: Integrate the new components into the existing `@europa/design` build, vendor, and guard pipeline without disturbing G-01..G-09.

**Facts (verified from source):**

- **Build** (`packages/design/package.json#scripts.build`): `tsup && tsx scripts/build-css.ts && tsx scripts/vendor-to-docs.ts`.
  - `tsup` (config `tsup.config.ts`) currently has a single entry `src/index.ts` → `dist/index.{js,d.ts}`, ESM, `dts: true`, `clean: true`, `splitting: false`, `sourcemap: true`, `target: es2022`.
  - `build-css.ts` walks `TOKENS` in sorted order, emits `:root { --europa-*: … }`, concatenates `src/styles/catalog.css`, writes `dist/design.css`.
  - `vendor-to-docs.ts` copies `dist/design.css` → `docs/manual/assets/design.css` (byte-identical).
- **Guards**:
  - `check-no-literals.ts` (G-04): scans `packages/console/src/**` and `docs/manual/**` (excluding the vendored CSS and markdown) for hex/rgba literals outside `@europa/design` imports.
  - `check-vendor-identity.ts` (G-05): asserts `sha256(dist/design.css) === sha256(docs/manual/assets/design.css)`.
  - G-06 (version lockstep) is enforced by the root `pnpm version:check` (spec 009).
- **Tests**: `vitest run` (node-mode, no config file → defaults). Only `tests/tokens.test.ts` exists. The package has **no browser test setup** and **no `@vitest/browser` / `happy-dom` devDependency**.

**Implication for this feature:**

- **tsup second entry**: `tsup.config.ts` gains `entry: ['src/index.ts', 'src/components/index.ts']`. This produces `dist/index.{js,d.ts}` (unchanged) and `dist/components.{js,d.ts}` (new). Because `splitting: false`, each entry is a standalone bundle — `dist/components.js` is self-contained (no shared chunk). This is what makes the 15 KB gzip budget (FR-025) measurable on a single file.
- **`package.json#exports`**: add `"./components": { "types": "./dist/components.d.ts", "import": "./dist/components.js" }`. Existing `"."` and `"./tokens"` unchanged (FR-006).
- **Stylesheet**: the components do NOT import `design.css` (FR-007). The stylesheet remains a separate consumer import. The components import only `TOKENS` from `../tokens.js` (for game primitives that compute colors) — this is a same-package import, not an external dependency (FR-024).
- **Test setup**: the design package needs a browser test environment for web-component tests. Options:
  - **happy-dom** (catalog `^20.11.6`): a lightweight DOM implementation that supports `customElements`, `HTMLElement`, `attributeChangedCallback`, `connectedCallback`, and `getComputedStyle`. It does NOT support real layout, but it supports the DOM APIs the components need. It is the lightest option and keeps the design package's test footprint small.
  - **@vitest/browser + @vitest/browser-playwright** (catalog): real Chromium, heavier, matches the console's browser suite. Needed for the modal integration tests that assert real focus behavior and computed styles.
  - **Decision**: Use **happy-dom** for the per-component unit tests (FR-027/FR-029) and the conformance test (FR-030) — these assert DOM structure, class composition, attribute mapping, and aria attributes, all of which happy-dom supports. Use **@vitest/browser + Playwright** for the modal integration tests (FR-028) that assert real focus trapping, Escape, and focus restore — these need a real browser because happy-dom's focus model is incomplete. This mirrors the console's split (node/browser configs).
  - The design package gains `vitest.config.ts` (node + happy-dom environment) and `vitest.config.browser.ts` (Playwright) — or a single config with a `projects` array. The plan will specify the exact shape.
- **G-10 guard**: a new script `packages/design/scripts/check-component-catalog.ts` (or a vitest test) that:
  1. Imports the component registry (the `{ tag, ctor }` array from `src/components/registry.ts`).
  2. Reads `DESIGN.md` section 2 and extracts the documented `europa-*` custom-element tag names (regex over the table rows).
  3. Asserts set-equality: every registered tag has a DESIGN.md entry and vice versa. Fails naming the missing/extra tag.
  - This is added to the package's `check:*` scripts and wired into CI (see plan.md § G-10).

---

## R6. Bundle-size verification for FR-025 / FR-026

**Decision**: Measure `dist/components.js` gzip size directly with a script; verify the console budget via the existing G-08 guard.

**Facts:**

- FR-025: `dist/components.js` gzipped ≤ 15 KB. The design package's `dist/components.js` is a standalone ESM bundle (tsup `splitting: false`). Gzip size is measured with `node:zlib` `gzipSync` on the built file.
- FR-026: the console's browser-payload gzip budget (< 153,600 B) must not regress. The console's `build-assets.ts` (G-08) already measures the browser payload. The web-component JS adds to the bundle; the migration removes no existing code (the React components remain for non-migrated files), so the delta is the `dist/components.js` payload plus the console's import of it.
- **Approach**: a new script `packages/design/scripts/check-bundle-size.ts` (or a vitest test) that:
  1. Builds the package (or reads `dist/components.js`).
  2. Computes `gzipSync(readFile('dist/components.js')).length`.
  3. Asserts ≤ 15 KB (15,360 bytes).
  - The console budget is verified by the existing G-08 guard after migration. The plan adds a note that the console's `build-assets.ts` must still pass after the migration (FR-026).

**Alternative considered**: Using `brotli` instead of gzip. Rejected — the spec and the existing G-08 guard both use gzip, so gzip keeps the budget comparable.

---

## R7. The `.europa-waiting` gap — classes not yet in the shared catalog

**Finding (important — surfaced to PM/PO):**

The `europa-waiting` web component (FR-001) wraps the `.europa-waiting`, `.europa-waiting__plate`, `.europa-waiting__pulse`, and `.europa-waiting__text` classes. **These classes are currently defined in `packages/console/src/styles/index.css` (lines 563–620), NOT in the shared catalog `packages/design/src/styles/catalog.css`.** `DESIGN.md` section 2 lists only `.europa-waiting--reduced` (the motion-suppression modifier), not the full waiting family.

This is a genuine gap against FR-010 ("Each web component MUST compose the exact same `europa-*` classes … defined in `DESIGN.md` section 2") and against SC-004 (manual-compatible — the manual only has the shared stylesheet, so `<europa-waiting>` in a manual page would be unstyled).

**Options:**

1. **Move the waiting classes into the shared catalog** (recommended). Add `.europa-waiting`, `.europa-waiting__plate`, `.europa-waiting__pulse`, `.europa-waiting__text` (and the `@keyframes europa-spin`) to `packages/design/src/styles/catalog.css`, add the corresponding rows to `DESIGN.md` section 2, and remove the duplicate rules from `packages/console/src/styles/index.css`. This is **additive** (new catalog entries) and non-breaking. It makes `<europa-waiting>` work in the manual (SC-004) and keeps the single-stylesheet rule (FR-011 of spec 012). The console's visual output is unchanged (the classes move, the computed styles are identical).
2. **Keep the waiting classes in the console** and have `<europa-waiting>` rely on them being present. Rejected — breaks SC-004 (manual has no console stylesheet) and FR-010 (classes not in DESIGN.md section 2).

**Decision**: **Option 1** — move the waiting family into the shared catalog in the same change set as the component implementation. This is a spec-012-adjacent additive change (new catalog rows + catalog.css rules) that must update `DESIGN.md` in the same commit (FR-018 sync rule). It does NOT change any token value or existing class, so G-01..G-09 remain green. **This is a PM/PO-notable decision** because it touches the shared catalog beyond the web-component layer.

---

## R8. Game-specific primitive color computation

**Decision**: Game primitives compute colors from `TOKENS` at render time (FR-024 allows importing the token exports).

**Facts:**

- `<europa-elevation-swatch>` needs a color from the land elevation band. The band is `hsl(landHue, landSaturationPct%, lightness%)` where lightness interpolates `landMinLightnessPct` (26) → `landMaxLightnessPct` (62) by elevation (0–100). The component computes `hsl(${landHue} ${landSaturationPct}% ${lightness}%)` from `TOKENS.color.landHue`, `landSaturationPct`, `landMinLightnessPct`, `landMaxLightnessPct` — matching the console's `terrainColor` derivation (spec 012 contract § 3).
- `<europa-pipe-slope>` uses `TOKENS.color.pipeDownhill/pipeFlat/pipeUphill/pipeStalled` directly as the fill color (inline style `background-color` or `color`), matching the console's pipe-slope rendering (spec 005 FR-013).
- `<europa-troop-chip>`, `<europa-city-marker>`, `<europa-player-badge>` need player colors. The design system has no per-player color token table in `TOKENS` (player colors are derived in the console's `palette.ts` / render layer, not in the shared tokens). **This is a gap**: the game primitives need a player-color mapping. Options:
  - (a) Add a small player-color map in the component module (e.g. `PLAYER_COLORS: Record<1|2|3|4, string>` derived from existing tokens — accent, city, green, blue). This is a component-local constant, not a new token, so it does not violate FR-010 (no new token variables) — but it does introduce color literals into `packages/design/src`, which the G-04 no-literals guard currently does NOT scan (G-04 scans `packages/console/src` and `docs/manual`, not `packages/design/src`). Still, to keep the "no new hex literals" spirit, the map should reuse existing `TOKENS.color.*` values (accent, city, green, blue) rather than new hex.
  - (b) Add per-player color tokens to `TOKENS`. Rejected — this would be a new token group, violating FR-010 ("no new token variables") and requiring a DESIGN.md § 1 token-table update plus G-01/G-02 re-verification. Out of scope.
  - **Decision**: **(a)** — a component-local `PLAYER_COLORS` map reusing existing `TOKENS.color.*` values (accent `#f59e0b` for P1, city `#fbbf24` for P2, green `#059669` for P3, blue `#2563eb` for P4). This is a **PM/PO-notable decision** because the player-color mapping is not currently a shared contract — it lives in the console's render layer. The web-component map is a new (component-local) source of truth for player colors that the manual can use. It reuses existing tokens so no new hex literals and no new token variables.

---

## R9. Test environment for web components

**Decision**: Split tests across happy-dom (unit/conformance) and Playwright browser (modal integration), mirroring the console's node/browser split.

**Facts:**

- The design package currently has no browser test setup. Web components need a DOM.
- happy-dom (catalog `^20.11.6`) supports `customElements`, `HTMLElement`, `attributeChangedCallback`, `connectedCallback`, `getComputedStyle`, and `document.createElement`. It does NOT implement a complete focus model (no real `document.activeElement` traversal in all cases, no real layout), so focus-trap integration tests need a real browser.
- The console already uses `@vitest/browser` + `@vitest/browser-playwright` (catalog) for its component/a11y/perf suites. Reusing the same catalog versions keeps the toolchain consistent.
- **Decision**: 
  - `vitest.config.ts` (node, `environment: 'happy-dom'`) runs the per-component unit tests (FR-027), game-primitive tests (FR-029), and the conformance test (FR-030).
  - `vitest.config.browser.ts` (Playwright Chromium) runs the modal integration tests (FR-028) that assert real focus trapping, Escape, and focus restore.
  - The design package gains `happy-dom`, `@vitest/browser`, `@vitest/browser-playwright` as devDependencies (all catalog versions, permissive licenses).

---

## R10. Component file layout — one file per component vs grouped

**Decision**: One source file per component, grouped into a `src/components/` directory, with a shared base class and a registry.

**Rationale:**

- **One file per component** keeps each component small (~30–80 LOC) and independently testable, matching the repo's subagent-reliability guidance (single-artifact micro-tasks). Each file is a single task in `tasks.md`.
- A shared `base.ts` holds `EuropaElement` (the base class) and the class-composition helpers.
- A `registry.ts` holds the `{ tag, ctor }` array that `register()` iterates and that the G-10 guard enumerates.
- `index.ts` re-exports all classes + `register()` (the barrel, FR-008).

**Layout:**

```text
packages/design/src/components/
├── base.ts                 # EuropaElement base class + helpers
├── registry.ts             # { tag, ctor }[] — single source of truth for the inventory
├── index.ts                # barrel: re-export all classes + register()
├── register.ts             # register() function (idempotent)
├── generic/
│   ├── button.ts           # EuropaButton
│   ├── card.ts             # EuropaCard
│   ├── plate.ts            # EuropaPlate
│   ├── modal.ts            # EuropaModal (focus trap)
│   ├── chip.ts             # EuropaChip
│   ├── badge.ts            # EuropaBadge
│   ├── banner.ts           # EuropaBanner
│   ├── typography.ts       # EuropaTypography
│   ├── waiting.ts          # EuropaWaiting
│   ├── grid.ts             # EuropaGrid
│   ├── stack.ts            # EuropaStack
│   ├── container.ts        # EuropaContainer
│   └── page.ts             # EuropaPage
└── game/
    ├── troop-chip.ts       # EuropaTroopChip
    ├── city-marker.ts      # EuropaCityMarker
    ├── pipe-slope.ts       # EuropaPipeSlope
    ├── elevation-swatch.ts # EuropaElevationSwatch
    ├── player-badge.ts     # EuropaPlayerBadge
    ├── fog-overlay.ts      # EuropaFogOverlay
    └── reserve-indicator.ts# EuropaReserveIndicator
```

The `generic/` and `game/` subdirectories are organizational only — the barrel re-exports everything flat. Tests live in `packages/design/tests/components/` mirroring this structure.

---

## R11. The `register()` function and the registry

**Decision**: `register()` iterates a `REGISTRY` array of `{ tag, ctor }` pairs, defining each only if `customElements.get(tag)` is undefined (idempotent, FR-003). Individual classes are exported for selective registration (FR-005).

```ts
// registry.ts
export interface ComponentDefinition {
    readonly tag: string;
    readonly ctor: CustomElementConstructor;
}
export const REGISTRY: readonly ComponentDefinition[] = [
    { tag: 'europa-button', ctor: EuropaButton },
    // … all 20 …
];
```

```ts
// register.ts
export function register(): void {
    for (const { tag, ctor } of REGISTRY) {
        if (customElements.get(tag) === undefined) {
            customElements.define(tag, ctor);
        }
    }
}
```

The `REGISTRY` is the single source of truth for the G-10 guard (data-model.md § 3): the guard imports `REGISTRY`, extracts the tags, and compares against `DESIGN.md` section 2.

---

## R12. Existing design package integration — no disruption to G-01..G-09

**Decision**: The web-component layer adds no new token variables, no new CSS classes (except the waiting-family move in R7, which is additive), and no new stylesheet rules beyond the waiting move. G-01..G-09 remain green (FR-023).

**Facts:**

- The components import `TOKENS` from `../tokens.js` (same package) — no new external dependency (FR-024).
- The components apply existing `europa-*` classes — no new CSS rules (FR-010).
- The only catalog change is the waiting-family move (R7), which is additive (new catalog rows + rules) and does not alter any existing token value or class.
- The `check-no-literals.ts` guard (G-04) scans `packages/console/src` and `docs/manual`, not `packages/design/src`. The component source may therefore reference color values — but to honor the "no new hex literals" spirit, the game primitives reuse `TOKENS.color.*` (R8) rather than introducing new hex.

---

## R13. Console migration mapping — which React files change

**Decision**: Per FR-016, 8 of 15 `packages/console/src/ui/` files are in scope. The migration replaces inline `europa-*` class-name patterns with web components where a direct component match exists, keeping React for composition/state/events (FR-019).

**Verified mapping (from reading each file):**

| File | Current pattern | Web component replacement | Notes |
|------|-----------------|---------------------------|-------|
| `branded-footer.tsx` | `<footer style={{...var(--europa-*)}}>` | **No component match** — footer is a one-off composition (spec FR-016 explicitly says "remains React with design tokens"). **No change** beyond possibly wrapping in `<europa-container>` if desired (optional, not required). | FR-016 says "keep as-is if no component match". |
| `waiting-overlay.tsx` | `<div className="europa-waiting …">` + `__plate` + `__pulse` + `__text` | `<europa-waiting message={headline} reduced-motion={reducedMotion}>` | The React component keeps its `resolveWaitingMessage` logic and the announcer effect; the DOM becomes the web component. |
| `lobby-landing.tsx` | `<div role="alert" className="europa-banner">` (×2), `<main className="europa-lobby">`, `<h1 className="europa-lobby__title">`, `<div className="europa-lobby__superseded">` | Replace the two banner `<div>`s with `<europa-banner variant="alert">`. Keep the lobby layout as React composition (FR-016: "keep lobby layout as React composition"). The superseded notice stays React (it's a lobby-specific composition, not a catalog component). | The banner needs `role="alert"` → `<europa-banner variant="alert">` provides it. |
| `lobby-create-form.tsx` | `<button className="europa-lobby__button europa-focus-ring">` (submit) | Replace the submit `<button>` with `<europa-button type="submit" disabled={busy}>`. The form/fieldset/select/radio logic stays React. | Note: `<europa-button>` renders a native `<button>` (FR-013). The `type="submit"` must be passed through. |
| `lobby-identity-card.tsx` | `<button className="europa-lobby__button europa-focus-ring">` (submit) | Replace with `<europa-button type="submit" disabled={saving}>`. | Same as above. |
| `lobby-match-list.tsx` | `<button className="europa-lobby__button europa-focus-ring">` (Join/Spectate) | Replace with `<europa-button type="button" disabled={busy} aria-label={…}>`. | The `aria-label` must be passed to the web component (which forwards it to the internal `<button>`). |

**Key React 19 interop notes for the migration:**
- `<europa-button>` children (the label text) are passed as light-DOM children → rendered inside the internal `<button>`.
- `disabled={busy}` → React 19 sets the boolean attribute `disabled` on the custom element → the component maps it to the internal `<button>`'s `disabled`.
- `onClick` on `<europa-button>` → React attaches a listener on the custom element; the internal `<button>`'s click bubbles through light DOM → caught. Works because of light DOM (R1).
- `aria-label` on `<europa-button>` → React sets the attribute on the custom element → the component forwards it to the internal `<button>`.
- `type="submit"` / `type="button"` → React sets the attribute → the component forwards it to the internal `<button>`.

**Out-of-scope files (FR-017)**: `order-bar.tsx`, `reserves-panel.tsx`, `targeting-overlay.tsx`, `seat-labels.ts`, `participants.tsx`, `route-notice.tsx`, `lobby-labels.ts`, `lobby-handle.ts` — no change.

---

## R14. DESIGN.md section 2 update approach (FR-022) and G-10 guard (FR-020)

**Decision**: Add a new subsection to `DESIGN.md` section 2 titled "Web components" that documents each `europa-*` custom element with tag name, attributes table, slots table, events table, a11y obligations, and a minimal usage example. The G-10 guard asserts every registered tag has a DESIGN.md entry.

**G-10 guard design:**

- New script `packages/design/scripts/check-component-catalog.ts` (or a vitest test in `tests/`).
- Data source: imports `REGISTRY` from `src/components/registry.ts` → the set of registered tags.
- Reads `DESIGN.md` section 2, extracts the documented custom-element tag names via a regex over the table rows (e.g. rows containing `<europa-…>`).
- Asserts set-equality: every registered tag has a DESIGN.md entry and every documented tag is registered. Fails naming the missing/extra tag.
- Wired as `pnpm --filter @europa/design check:component-catalog` and into CI (client-ci.yml path filter already covers `packages/design/**`).

**DESIGN.md section 2 structure** (per FR-022, each entry includes tag name, attributes, slots, events, a11y obligations, usage example):

```markdown
### Web components (spec 014)

| Tag | Attributes | Slots | Events | A11y obligations | Usage example |
|-----|------------|-------|--------|------------------|---------------|
| `<europa-button>` | `variant` (string: primary/secondary/ghost/success/warning/error/info), `size` (sm/lg), `disabled` (boolean) | default (label text) | — | Renders a native `<button>`; forwards `disabled`, `aria-label`, `type`; participates in `*:focus-visible` | `<europa-button variant="primary" disabled>Deploy</europa-button>` |
| … | | | | | |
```

The G-10 guard's regex extracts the `<europa-…>` tag from the first column of each row.

---

## R15. Bundle budget verification approach (FR-025/FR-026)

**Decision**: A `check-bundle-size.ts` script asserts `dist/components.js` gzip ≤ 15 KB. The console budget is verified by the existing G-08 guard after migration.

- `packages/design/scripts/check-bundle-size.ts`: `gzipSync(readFile('dist/components.js')).length ≤ 15360`.
- Wired as `pnpm --filter @europa/design check:bundle-size` and into the build/CI.
- The console's `build-assets.ts` (G-08) already asserts the browser payload < 153,600 B; after the migration it must still pass (FR-026). The plan adds a verification task that runs the console build after migration.

---

## R16. Zero-dependency constraint (FR-024 / NFR-006)

**Decision**: The `@europa/design/components` export has zero runtime dependencies. It depends only on DOM APIs and the same-package `TOKENS` import.

- No `focus-trap`, no `lit`, no `@webcomponents/*`, no framework. All code is original (NFR-006).
- The only imports in `src/components/**` are `../tokens.js` (same package) and DOM globals.
- This keeps the 15 KB budget achievable and satisfies the constitution's zero-dependency / self-hostable principles.

---

## Research summary — decisions table

| # | Decision | Rationale | Spec FR / PO ruling |
|---|----------|-----------|---------------------|
| R1 | React 19 native custom element interop, no wrapper | React 19 native support; light DOM makes event delegation work | FR-019, PO-2 |
| R2 | Explicit `register()`, no auto-register | Avoids global side effects; SSR-safe; tree-shakeable | FR-003/004/005 |
| R3 | Vanilla focus trap (~50 LOC) | Zero deps (NFR-006); fits 15 KB budget | FR-011, NFR-005/006 |
| R4 | `observedAttributes` + `attributeChangedCallback` | Standard, no MutationObserver polling | NFR-005 |
| R5 | tsup second entry + `./components` subpath | Tree-shakeable; existing exports unchanged | FR-006/008 |
| R6 | gzip budget script for `dist/components.js` | Direct, comparable to G-08 | FR-025/026 |
| R7 | **Move waiting family into shared catalog** | `<europa-waiting>` must work in manual (SC-004); FR-010 requires classes in DESIGN.md §2 | FR-010, SC-004 — **PM/PO-notable** |
| R8 | **Component-local player-color map reusing TOKENS** | No new token variables (FR-010); no new hex literals | FR-010, FR-024 — **PM/PO-notable** |
| R9 | happy-dom (unit) + Playwright (modal integration) | Web components need DOM; focus trap needs real browser | FR-027/028/029/030 |
| R10 | One file per component + base + registry | Small testable units; subagent-friendly | — |
| R11 | `REGISTRY` array as single source of truth | `register()` + G-10 both consume it | FR-003, FR-020 |
| R12 | No disruption to G-01..G-09 | Additive only | FR-023 |
| R13 | Console migration mapping (8 files) | Direct component matches only; React keeps composition | FR-016/017/019 |
| R14 | DESIGN.md §2 web-component subsection + G-10 | Living contract stays truthful | FR-020/021/022 |
| R15 | Bundle budget scripts | FR-025/026 measurable | FR-025/026 |
| R16 | Zero runtime deps | Constitution VII, NFR-002/006 | FR-024, NFR-006 |
