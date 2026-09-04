# Feature Specification: Shared UI React Components in @europa/design

**Feature Branch**: `issue-41-shared-UI-components` (original); `issue-65-react-components` (amendment)

**Created**: 2026-08-31

**Status**: Implemented (2026-09-01; Amended 2026-09-03 — React component conversion, issue #65)

**GitHub Issue**: #41 (original); #65 (this amendment)

**Dependencies**: Feature 012 (`012-design-system`) — the token layer and class catalog that these React components render.

## Constitution Deviation Notice

**The project constitution (Principle IV, "Specs as Documentation") states that specs describe *capabilities*, never *specific rendering libraries*.** This amendment is a deliberate, documented exception. The original spec (v1.0/v1.1) delivered framework-agnostic `customElements.define` web components — library-agnostic by design. This amendment converts those web components to React components. The deviation is justified because:

1. **No external consumers exist.** `@europa/design` is `private: true` and never published to a registry (binding decision 6). Every consumer — the console (React 19) and the Astro manual (`@astrojs/react`) — is React-capable.
2. **The web-component interop tax is substantial.** The two-tier Shadow DOM/Light DOM model, `happy-dom` polyfills for `attachInternals()`, `assignedNodes()` shadow-root stubs, `host.shadowRoot.activeElement` hacks for Playwright, `document.activeElement` shadow-boundary retargeting, axe-core shadow-traversal canary tests, and the React 19 `removeChild` crash workarounds all add complexity that a React-native approach eliminates.
3. **The capability contract is preserved.** Every component's behavior — accessible structure, class composition, keyboard interaction, a11y attributes — remains identical. Only the delivery mechanism changes from `customElements.define` to exported React functions.

This deviation is recorded here so that future contributors understand why a "no rendering library" principle was overridden, and so the governance process (constitution amendments require written justification) is satisfied.

## Problem Statement

The `@europa/design` package (feature 012) ships a shared token layer and CSS class catalog. Feature 014 originally delivered 20 framework-agnostic web components (`customElements.define`) to wrap these classes with structural and accessibility contracts. While the web components worked, they introduced a substantial interop tax:

- **Shadow DOM complexity**: the two-tier DOM model (Shadow DOM for 13 generic components, Light DOM for 7 game primitives) required a constructed `CSSStyleSheet` pipeline, `adoptedStyleSheets`, `<slot>` projection, and the `EuropaElement.ensureShadowRoot()` base class — all to solve the React 19 `removeChild` crash that Light DOM reparenting caused.
- **Test-environment polyfills**: `happy-dom` needs polyfills for `attachInternals()`, returns empty for `assignedNodes()`, has no `ResizeObserver`/`IntersectionObserver`, and only supports structural Shadow DOM assertions (no event retargeting).
- **Playwright/shadow-boundary hacks**: `document.activeElement` reports the host when focus is inside a shadow tree; `getByText` does not resolve shadow-internal text; a canary test (`shadow-traversal.test.ts`) exists solely to verify axe-core still traverses open shadow roots.
- **`custom-elements.d.ts` JSX intrinsics**: every `<europa-*>` custom element tag requires a JSX intrinsic declaration so TypeScript accepts it in React — currently scattered across `custom-elements.d.ts` and `global.d.ts` in the console, plus inline `declare module 'react'` blocks in individual files.
- **`register()` ceremony**: consumers must call `register()` at app entry (console: `main.tsx` line 48; manual: `ManualLayout.astro` `<script>` block) before any custom-element tag works in JSX.

None of this complexity exists if the components are React components. The console (React 19) would import them directly as JSX. The Astro manual (`@astrojs/react`) would import them as React components in MDX. No Shadow DOM, no `customElements.define`, no `register()`, no polyfills, no shadow-boundary test hacks.

This amendment converts all 20 web components to React component functions, removes the entire web-component infrastructure (Shadow DOM, Light DOM base class, `register()`, `custom-elements.d.ts`), and migrates both the console and the Astro manual to consume React components directly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Console Uses React Components Directly (Priority: P1)

As a console developer, I want to import `<EuropaButton variant="primary">Save</EuropaButton>` from `@europa/design/components` and use it as a normal React component — no `register()` call, no Shadow DOM, no custom-element JSX intrinsics — so that the design system components integrate seamlessly with React 19 and the interop tax disappears.

**Why this priority**: The console is the primary consumer. Eliminating the web-component layer simplifies every console file that uses `europa-*` components and removes the `custom-elements.d.ts`/`global.d.ts` JSX intrinsic declarations.

**Independent Test**: Import a component, render it in a React tree, assert correct class composition on the rendered DOM, verify accessibility attributes, and confirm no `register()` call is needed.

**Acceptance Scenarios**:

1. **Given** the console imports `EuropaButton` from `@europa/design/components`, **When** `<EuropaButton variant="primary">Deploy</EuropaButton>` renders, **Then** the output `<button>` has classes `europa-button europa-button--primary`, is keyboard-operable, shows the focus ring on Tab, and matches the computed styles of the catalog's `.europa-button--primary`.
2. **Given** the console imports `EuropaModal` from `@europa/design/components`, **When** `<EuropaModal open title="Confirm">…</EuropaModal>` renders, **Then** the modal displays with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title, focus is trapped inside, and Escape closes the modal — all via React DOM, not a custom element.
3. **Given** the console's `main.tsx`, **When** the app boots, **Then** there is no `register()` call and no `custom-elements.d.ts` / `global.d.ts` JSX intrinsic declarations for `europa-*` tags.

---

### User Story 2 — Astro Manual Uses React Components in MDX (Priority: P1)

As a player manual author, I want to import `{ EuropaChip, EuropaElevationSwatch }` from `@europa/design/components` and use them directly in MDX files (e.g., `<EuropaChip count="30" />`), so that the same components work in both the console and the manual with no web-component ceremony.

**Why this priority**: The manual's current `<europa-*>` custom-element usage in MDX requires `register()` in `ManualLayout.astro` and only works because Astro renders HTML that the browser's custom-element registry picks up. With React components, the manual gains proper component composition, TypeScript prop checking, and no reliance on the browser's custom-element lifecycle.

**Independent Test**: Scaffold `@astrojs/react` in the Astro manual, import React components in MDX, build the manual, and verify correct rendering and accessibility.

**Acceptance Scenarios**:

1. **Given** the Astro manual has `@astrojs/react` integrated, **When** an MDX file imports `EuropaChip` and renders `<EuropaChip count="30" />`, **Then** the built page shows the chip with correct classes, count text, and styling.
2. **Given** the Astro manual's `astro.config.mjs` has `@astrojs/react` in `integrations`, **When** `astro build` runs, **Then** it succeeds without errors and all 15 MDX pages build correctly.
3. **Given** the manual's `ManualLayout.astro`, **When** it no longer contains `register()` in a `<script>` block, **Then** the built manual still renders all components correctly via React imports in MDX.

---

### User Story 3 — Game-Specific Primitives Available as React Components (Priority: P2)

As a manual author writing about game mechanics, I want to compose inline diagrams using `<EuropaTroopChip count={5} owner={1} />` and `<EuropaCityMarker owner={2} />` so that I can illustrate troop deployments, city ownership, and pipe slopes in documentation without creating custom images.

**Why this priority**: Enables richer, data-driven illustrations in the manual. P2 because it builds on the generic component foundation from US1.

**Independent Test**: Render game-specific React components in a test page, assert correct visual output (troop chip shows count with correct color coding, city marker shows correct player color, pipe slope indicator shows correct direction color), and verify accessibility (each chip/marker has appropriate aria-label).

**Acceptance Scenarios**:

1. **Given** `<EuropaTroopChip count={12} owner={1} />`, **When** it renders, **Then** the chip shows "12" with the correct player-1 fill color, has `role="img"` and `aria-label="12 troops, player 1"`, and matches the `.europa-chip` computed styles.
2. **Given** `<EuropaPipeSlope direction="downhill" />`, **When** it renders, **Then** the indicator shows the green downhill triangle with `aria-label="Downhill flow"` and the correct token color `var(--europa-color-pipe-downhill)`.
3. **Given** `<EuropaElevationSwatch elevation={42} />`, **When** it renders, **Then** the swatch shows a color from the land elevation band (computed from `landMinLightnessPct` to `landMaxLightnessPct`) with `aria-label="Elevation 42"`.

---

### User Story 4 — Maintainer Documents React Components in DESIGN.md (Priority: P2)

As a maintainer, I want every React component documented in `DESIGN.md` section 2 with its component name, props, children, event handlers, accessibility obligations, and usage examples, so that the living contract stays complete as the component inventory grows.

**Why this priority**: The "specs stay truthful" rule (constitution Principle IV) extends to the design contract. P2 because it is governance that enables long-term correctness.

**Independent Test**: Assert that every exported React component from `@europa/design/components` has a corresponding entry in `DESIGN.md` section 2, with documented props table, children pattern, events, a11y obligations, and a usage example.

**Acceptance Scenarios**:

1. **Given** a React component `EuropaModal` exported from `@europa/design/components`, **When** `DESIGN.md` section 2 is inspected, **Then** it contains an entry for `EuropaModal` documenting: props (`open`, `title`, `onClose`), children (body content, actions slot via named children or props), a11y obligations (`role="dialog"`, `aria-modal`, focus trap, Escape), and a usage example.
2. **Given** any change that adds, renames, or removes a React component, **When** the change is submitted, **Then** `DESIGN.md` is updated in the same commit (FR-018 sync rule).

---

### Edge Cases

- **No children provided**: components that render content from children (e.g., `EuropaCard`, `EuropaStack`) must handle `undefined`/`null` children gracefully — render the structural wrapper with no content, no errors.
- **Dynamic children**: components must work when children change between renders (React handles this naturally via reconciliation — no manual DOM updates needed, unlike the old `connectedCallback`/`attributeChangedCallback` pattern).
- **React 18 consumers**: while React 19 is the primary target (it handles custom elements natively), these are now plain React components — they work identically in React 18. The peer dependency range should be `react >= 18`.
- **Attribute vs prop for complex values**: `owner` (number), `count` (number), `elevation` (number) are passed as typed React props, not string attributes. No string-to-number coercion needed inside the component — the props interface enforces types.
- **Server-side rendering**: React components SSR naturally — they render to HTML during `astro build` or `next build`. No `connectedCallback` lifecycle concerns. The Astro manual's `output: 'static'` mode generates HTML at build time.
- **Styling delivery**: `design.css` remains the single stylesheet file, loaded by the consumer. React components compose the same `europa-*` CSS classes. No `adoptedStyleSheets`, no Shadow DOM, no constructed stylesheets.

## Requirements *(mandatory)*

### Functional Requirements

#### Component inventory and naming

- **FR-001**: `@europa/design/components` MUST export React component functions for the following generic UI components. Each component renders a plain React element with the corresponding `europa-*` CSS classes:
  - `EuropaButton` — renders a `<button>` with `.europa-button` classes. Props: `variant` (`'primary' | 'secondary' | 'ghost' | 'success' | 'warning' | 'error' | 'info'`, optional), `size` (`'sm' | 'lg'`, optional), `disabled` (`boolean`, optional), `type` (`'button' | 'submit' | 'reset'`, default `'button'`), `ariaLabel` (`string`, optional), `onClick` (click handler, optional), `children` (label content). Applies `.europa-button--{variant}` and `.europa-button--{size}` modifier classes conditionally.
  - `EuropaCard` — renders a `<div>` with `.europa-card`. Props: `children` (arbitrary content), `className` (optional additional classes).
  - `EuropaPlate` — renders a `<div>` with `.europa-plate`. Props: `children`, `className`.
  - `EuropaModal` — renders the full modal structure: `.europa-modal-backdrop` > `.europa-modal` > title + body + actions. Props: `open` (`boolean`), `title` (`string`), `onClose` (callback for Escape/backdrop click), `children` (body content), `actions` (React node for the button bar, rendered in `.europa-modal__actions`). Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title, focus trap (Tab/Shift+Tab cycle within modal), Escape closes, backdrop click closes, focus restores to trigger element on close. When `open` is false, renders nothing (or a hidden wrapper — decision at implementation time, but must be removable from Tab order).
  - `EuropaChip` — renders a `<span>` with `.europa-chip`. Props: `count` (`number`, displayed as text content). Used for troop-count pills.
  - `EuropaBadge` — renders a `<span>` with `.europa-badge`. Props: `children` (label text), `variant` (optional modifier: `'success' | 'warning' | 'error' | 'info' | 'accent'`).
  - `EuropaBanner` — renders a `<div>` with `.europa-banner`. Props: `variant` (`'status' | 'alert'`, default `'status'`), `children` (message text). Accessibility: `role="status"` for `status` variant, `role="alert"` + `aria-live="assertive"` for `alert` variant.
  - `EuropaTypography` — renders the appropriate element with `.europa-typography--*` treatment. Props: `variant` (`'heading' | 'subheading' | 'body' | 'label' | 'caption'`), `children` (text content), `as` (optional override element tag — default: heading→`<h2>`, subheading→`<h3>`, others→`<span>`).
  - `EuropaWaiting` — renders `.europa-waiting` + `.europa-waiting__plate` + `.europa-waiting__pulse` + `.europa-waiting__text`. Props: `message` (`string`), `reducedMotion` (`boolean`, optional). Accessibility: spinner `aria-hidden`, message announced via live region, respects `prefers-reduced-motion`.
  - `EuropaGrid` — renders a `<div>` with `.europa-grid`. Props: `variant` (`'default' | 'sidebar' | 'wrap'`, optional), `children` (grid items).
  - `EuropaStack` — renders a `<div>` with `.europa-stack`. Props: `children` (stacked items), `className`.
  - `EuropaContainer` — renders a `<div>` with `.europa-container`. Props: `children`, `className`.
  - `EuropaPage` — renders a `<div>` with `.europa-page`. Props: `children`, `className`.

- **FR-002**: `@europa/design/components` MUST export React component functions for the following game-specific visual primitives. These are composable, data-driven components for use in the manual (inline diagrams) and potentially the console:
  - `EuropaTroopChip` — renders a `.europa-chip` styled for troop counts. Props: `count` (`number`), `owner` (`1 | 2 | 3 | 4`). Accessibility: `role="img"`, `aria-label` computed from count and owner.
  - `EuropaCityMarker` — renders a city ownership indicator. Props: `owner` (`1 | 2 | 3 | 4`). Accessibility: `role="img"`, `aria-label` from owner.
  - `EuropaPipeSlope` — renders a pipe flow direction indicator. Props: `direction` (`'downhill' | 'flat' | 'uphill' | 'stalled'`). Uses token colors. Accessibility: `role="img"`, `aria-label` from direction.
  - `EuropaElevationSwatch` — renders a terrain elevation color swatch. Props: `elevation` (`number`, 0–100). Color computed from the land elevation band tokens. Accessibility: `role="img"`, `aria-label` with elevation value.
  - `EuropaPlayerBadge` — renders a player identity badge. Props: `player` (`1 | 2 | 3 | 4`), `name` (`string`, optional). Accessibility: `role="img"`, `aria-label` from player and name.
  - `EuropaFogOverlay` — renders a fog-of-war visual indicator (semi-transparent overlay). Props: `visible` (`boolean`, default `true`). Accessibility: `aria-hidden="true"` (purely visual).
  - `EuropaReserveIndicator` — renders a reserve-percentage display. Props: `percent` (`number`, 0–90 step 10). Accessibility: `role="img"`, `aria-label` with percentage.

#### Export surface

- **FR-003**: The React components MUST be exported via the existing subpath export `@europa/design/components`. The existing `@europa/design` (root) and `@europa/design/tokens` exports MUST remain unchanged and MUST NOT be affected by this feature. The `package.json#exports` map retains:
  ```json
  "./components": {
    "types": "./dist/components/index.d.ts",
    "import": "./dist/components/index.js"
  }
  ```
- **FR-004**: The barrel file `src/components/index.ts` MUST re-export all React component functions and all component props interfaces (for consumers who need the types). The tsup config MUST have an entry point for `src/components/index.ts` → `dist/components/index.{js,d.ts}`.
- **FR-005**: The stylesheet (`dist/design.css`) MUST continue to be imported separately by the consumer (existing single-stylesheet contract, FR-011 of spec 012). The React components do NOT auto-import the stylesheet. The `@europa/design/components` export contains JavaScript only — no CSS file in the export map. Consumers MUST load `design.css` because the `:root` token definitions it carries are what feed the CSS custom properties used by the `europa-*` classes.
- **FR-006**: `@europa/design` gains `react` (and `react-dom`) as **peer dependencies** in `package.json`. The peer dependency range MUST be `">=18"` to support React 18+ consumers. The existing `private: true` and zero-`dependencies` properties are preserved — `react` goes in `peerDependencies` only. The `devDependencies` MUST include `react` and `react-dom` for building and testing. This changes the package's current "zero external dependencies" property — see Assumptions for rationale.

#### React component API patterns

- **FR-007**: All React components MUST be typed with explicit props interfaces (e.g., `EuropaButtonProps`, `EuropaModalProps`). Props interfaces MUST be exported from `@europa/design/components` so consumers can reference them. Every props interface MUST use `Readonly<>` wrapping or `readonly` properties for immutability.
- **FR-008**: Components that need to forward refs (e.g., `EuropaButton` for focus management, `EuropaModal` for programmatic open/close) MUST use `React.forwardRef`. Components that are purely structural wrappers (e.g., `EuropaCard`, `EuropaStack`) MAY omit `forwardRef` unless a consumer use case demands it.
- **FR-009**: Event handlers MUST use React's synthetic event system. `EuropaButton` uses `onClick` (React `MouseEvent`). `EuropaModal` uses `onClose` (callback, not a DOM event — the component dispatches the close behavior internally via Escape key and backdrop click). No `dispatchEvent` / `CustomEvent` / `new Event()` patterns.
- **FR-010**: Components MUST compose the exact same `europa-*` classes and `var(--europa-*)` tokens defined in `DESIGN.md` section 2. The React component layer adds NO new CSS classes, NO new CSS rules, and NO new token variables. It is a structural/accessibility wrapper around the existing catalog, identical in purpose to the old web-component layer but delivered as React functions.

#### Accessibility contracts enforced by components

- **FR-011**: The `EuropaModal` component MUST enforce: (a) `role="dialog"` on the dialog element, (b) `aria-modal="true"`, (c) `aria-labelledby` pointing to the title element (generated from the `title` prop), (d) focus trap — Tab and Shift+Tab cycle within the modal's focusable descendants (managed via `useEffect` + `keydown` listener, collecting focusables from the React-rendered DOM), (e) Escape key calls `onClose`, (f) on close, focus returns to the element that was focused before the modal opened (tracked via `useRef`), (g) when `open` is false, the modal renders nothing and is removed from the DOM (not just hidden).
- **FR-012**: The `EuropaBanner` component MUST set `role="status"` for the `status` variant and `role="alert"` with `aria-live="assertive"` for the `alert` variant.
- **FR-013**: The `EuropaButton` component MUST render a native `<button>` element to inherit native keyboard behavior, form participation, and disabled semantics. The `disabled` prop MUST be mapped to the native `disabled` attribute. The `type` prop defaults to `'button'` to prevent accidental form submission.
- **FR-014**: Every game-specific primitive (FR-002) MUST set `role="img"` and a computed `aria-label` attribute so the element is announced correctly by screen readers. The visual content (chip count, swatch color) is the decorative representation; the aria-label carries the semantic meaning.
- **FR-015**: All interactive React components (button, modal controls) MUST participate in the shared focus-visible treatment via the `*:focus-visible` rule in `design.css`. No component may suppress or override the focus ring.

#### Console migration scope

- **FR-016**: The following console UI files are **in scope** for migration from custom-element JSX to React component imports. The migration is simpler than the original web-component migration: it swaps `<europa-button>` JSX tags for `<EuropaButton>` with imported props, removes `register()` from `main.tsx`, and deletes `custom-elements.d.ts` and `global.d.ts` JSX intrinsic declarations:
  - `branded-footer.tsx` — uses inline `<footer>` with `var(--europa-*)` style props. Migrate to use `EuropaPage` or keep as-is if no component match (footer is a one-off composition, not a catalog component — remains React with design tokens).
  - `waiting-overlay.tsx` — currently uses `<europa-waiting>` web component with a JSX intrinsic declaration and `register()`. Migrate to `import { EuropaWaiting } from '@europa/design/components'` and render `<EuropaWaiting message={headline} reducedMotion={reducedMotion} />`. Remove the `declare module 'react'` JSX intrinsic block.
  - `lobby-landing.tsx` — uses `<europa-banner>`, `<europa-page>`. Migrate banner instances to `EuropaBanner`, keep lobby layout as React composition.
  - `lobby-create-form.tsx`, `lobby-identity-card.tsx`, `lobby-match-list.tsx` — use `<europa-card>`, `<europa-button>`, `<europa-banner>`. Migrate to React component imports.
  - `main.tsx` — remove the `import { register } from '@europa/design/components'` and the `register()` call. No other changes needed (the file does not use custom-element tags directly).

- **FR-017**: The following console UI files are **explicitly NOT in scope** for component migration (they remain React components with design tokens):
  - `order-bar.tsx` — game-specific interactive toolbar with roving tabindex.
  - `reserves-panel.tsx` — game-specific slider + digit buttons.
  - `targeting-overlay.tsx` — game-specific canvas overlay.
  - `seat-labels.ts` — pure data derivation, not a UI component.
  - `participants.tsx` — game-specific seat-label strip.
  - `route-notice.tsx` — route-specific recovery surface.
  - `lobby-labels.ts` — pure label helpers, not a UI component.
  - `lobby-handle.ts` — handle-management logic, not a UI component.

- **FR-018**: The console migration MUST NOT change any visual output. Every computed style (colors, spacing, radii, borders, shadows, focus rings, typography) before and after migration MUST be identical. The migration is purely structural: replacing `<europa-banner>…</europa-banner>` with `<EuropaBanner>…</EuropaBanner>`.
- **FR-019**: The console continues to use React 19 for application-level composition. The React components from `@europa/design/components` are used as leaf-level components within the React tree. No wrapper layer or ref forwarding is needed beyond what `forwardRef` provides.

#### Astro manual migration scope

- **FR-020**: The Astro manual (`docs/manual/`) MUST be migrated from custom-element consumption to React component consumption. This requires:
  1. Adding `@astrojs/react` as a dependency and integration in `astro.config.mjs` (currently absent).
  2. Adding `react` and `react-dom` as dependencies in `docs/manual/package.json`.
  3. Updating `ManualLayout.astro` to remove the `<script>` block that calls `register()`.
  4. Converting all ~200 `<europa-*>` custom-element usages across 15 MDX files to imported React component usage.
  5. Each MDX file that uses components MUST add an import statement (e.g., `import { EuropaChip, EuropaElevationSwatch } from '@europa/design/components'`).
  6. Tag syntax changes: `<europa-chip count="30"></europa-chip>` → `<EuropaChip count={30} />` (note: number prop, not string; self-closing JSX syntax).
  7. Tag syntax changes: `<europa-elevation-swatch elevation="42"></europa-elevation-swatch>` → `<EuropaElevationSwatch elevation={42} />`.
  8. Tag syntax changes: `<europa-banner variant="status">Message</europa-banner>` → `<EuropaBanner variant="status">Message</EuropaBanner>`.

- **FR-021**: The Astro manual migration MUST preserve all visual output. Every computed style, every component rendering, every accessibility attribute before and after migration MUST be identical. The migration is purely a change in how components are declared (custom elements → React imports), not what they render.

- **FR-022**: The Astro manual build (`astro build`) MUST succeed after migration. The 15 MDX pages MUST all build without errors. The vendored `design.css` in `docs/manual/assets/` remains unchanged.

#### Drift guards and DESIGN.md updates

- **FR-023**: The existing drift guard **G-10** (`check-component-catalog.ts`) MUST be rewritten to assert that every exported React component from `@europa/design/components` has a corresponding entry in `DESIGN.md` section 2, with documented component name, props table, children pattern, events, a11y obligations, and usage example. The guard runs locally and in CI, failing with the unregistered component name on violation.
- **FR-024**: Every React component MUST be accompanied by a JSDoc comment documenting: component name, props (name, type, default, description), children pattern, events (name, description), and a11y obligations. The JSDoc is the implementation-level contract; `DESIGN.md` section 2 is the user-facing contract.
- **FR-025**: `DESIGN.md` section 2 MUST be rewritten to document React components instead of web components. Each entry MUST include: component name, props table (name, type, default, description), children pattern, events, a11y obligations, and a minimal usage example. The existing web-component entries (tag name, attributes, slots, events) MUST be replaced with the React equivalents.
- **FR-026**: Existing drift guards G-01 through G-09 MUST remain green. The React component layer introduces no new token variables, no new CSS classes, and no new stylesheet rules, so the existing guards are unaffected.

#### Bundle size and dependencies

- **FR-027**: The `@europa/design/components` export has React as a peer dependency (FR-006). The actual React runtime is provided by the consumer. The component code itself is thin — it composes `europa-*` CSS classes and delegates all visual treatment to the existing stylesheet. The total gzipped size of `dist/components/index.js` MUST NOT exceed 20 KB (increased from the old 15 KB web-component budget to accommodate React component definitions, props interfaces, and the modal focus-trap hook — but still a thin wrapper layer).
- **FR-028**: The console's browser-payload gzip budget (NFR-005 of spec 005, currently < 153,600 B) MUST NOT regress. The React components add to the bundle; the migration removes the web-component classes + `register()` + Shadow DOM base class, so the delta should be near-zero or negative. The architect MUST verify the budget remains green after migration.
- **FR-029**: The per-component bundle budget of 15 KB gzipped for `dist/components.js` (old FR-025) is **removed** per product-owner decision Q5. Only the console's overall browser-payload gzip budget is enforced.

#### Testing

- **FR-030**: Every React component MUST have unit tests using **React Testing Library** (`@testing-library/react`) covering: (a) correct class composition on rendered elements, (b) prop → DOM mapping (each prop produces the expected class/attribute on the rendered element), (c) children rendering (children appear in the correct position), (d) event handlers fire correctly (button onClick, modal onClose on Escape), (e) accessibility attributes (`role`, `aria-*` are set correctly).
- **FR-031**: The `EuropaModal` component MUST have integration tests covering: (a) focus trap cycles Tab/Shift+Tab within the modal, (b) Escape calls `onClose` and restores focus, (c) backdrop click calls `onClose`, (d) `open` prop toggling shows/hides the modal, (e) focus cannot escape to elements behind the modal, (f) focus returns to the trigger element on close.
- **FR-032**: The game-specific primitives MUST have unit tests covering: (a) correct color computation from token values (elevation swatch color matches the land band formula), (b) correct `aria-label` generation, (c) typed prop enforcement (number props, not string).
- **FR-033**: A conformance test MUST assert that every React component's rendered DOM, when rendered with default props and no children, contains exactly the same `europa-*` class names as a manually-constructed equivalent using the catalog classes from `DESIGN.md`. This proves the components are faithful wrappers, not divergent implementations.
- **FR-034**: Happy-dom shadow-DOM tests (the old shadow-traversal canary, `attachInternals` polyfill, `assignedNodes` stub, `element.shadowRoot.querySelector(...)` queries) are **removed** — they are no longer needed. All tests run against plain React DOM.
- **FR-035**: The `custom-elements.d.ts` file in the console (`packages/console/src/custom-elements.d.ts`) and the `declare module 'react'` JSX intrinsic blocks in individual files (e.g., `waiting-overlay.tsx`) are **deleted** — React components are imported normally, no JSX intrinsic augmentation needed.

### Non-Functional Requirements

- **NFR-001 (Accessibility)**: Constitution Principle VI (WCAG 2.2 AA) applies to every React component. The components enforce structural accessibility (roles, labels, focus management) that the raw class catalog leaves to the consumer. A component that enforces `role="dialog"` is more accessible than a bare `<div className="europa-modal">` without it.
- **NFR-002 (Self-hostable)**: Constitution Principle VII — no external CDN, font, or service is required. The components are React components that render to the DOM. React is a peer dependency provided by the consumer.
- **NFR-003 (Type safety)**: TypeScript `strict: true` for all component source code. Every component has explicit prop types. No `any`, no lint suppressions. Props interfaces are exported for consumer use.
- **NFR-004 (Simplicity)**: Constitution Principle V — components are thin wrappers (prop → class mapping + a11y wiring). No virtual DOM library beyond React's own, no internal state management, no complex logic. The complexity budget is spent on the modal focus-trap (the most complex component) and the `EuropaWaiting` spinner animation.
- **NFR-005 (Performance)**: Components MUST NOT cause unnecessary re-renders. Props-driven class composition is synchronous. The modal focus-trap uses `useEffect` with `keydown` event listeners, not `MutationObserver` polling. No layout thrashing.
- **NFR-006 (License hygiene)**: React is the only new peer dependency. All component code is original to the project. No copied snippets from third-party React component libraries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 — Components import and render**: All 20 React components import from `@europa/design/components` and render correctly with the expected `europa-*` class composition. No `register()` call needed. No custom-element registration.
- **SC-002 — Modal accessibility contract enforced**: A modal rendered via `<EuropaModal open title="Confirm">…</EuropaModal>` has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapped inside, Escape calls `onClose`, focus restores. Verified by automated a11y test (axe + manual keyboard test).
- **SC-003 — Console migration is visually invisible**: Pre/post migration computed styles for all migrated surfaces (banner, waiting overlay, lobby buttons) are identical. All existing console test suites (unit, component, a11y, e2e) remain green. The `custom-elements.d.ts` and `global.d.ts` intrinsic declarations are deleted. The `register()` call is removed from `main.tsx`.
- **SC-004 — Astro manual builds with React components**: `astro build` succeeds with `@astrojs/react` integrated. All 15 MDX pages build. Components render correctly in the built output. The `register()` script is removed from `ManualLayout.astro`.
- **SC-005 — DESIGN.md complete**: Every exported React component has a corresponding entry in `DESIGN.md` section 2 with component name, props, children, events, a11y obligations, and usage example. G-10 guard passes (rewritten for React components).
- **SC-006 — Bundle budget preserved**: `dist/components/index.js` gzipped ≤ 20 KB. Console browser-payload gzip budget (< 153,600 B) remains green after migration.
- **SC-007 — All drift guards green**: G-01 through G-09 remain green. G-10 (new component ↔ DESIGN.md coverage) passes with React component entries. No new token variables, CSS classes, or stylesheet rules introduced.
- **SC-008 — Web-component infrastructure removed**: `base.ts` (EuropaElement class), `register.ts`, `registry.ts`, `catalog-styles.ts`, Shadow DOM adoption code, `customElements.define` calls, `custom-elements.d.ts` (console), `declare module 'react'` JSX intrinsic blocks (console files) — all deleted. The `src/components/` directory contains only React component files and their prop types.

## Assumptions

- React ≥ 18 is the target runtime. The console uses React 19. The Astro manual will use whatever version `@astrojs/react` pulls. The peer dependency range `>=18` covers both.
- The existing `europa-*` CSS class catalog (feature 012, `DESIGN.md` section 2) is the visual implementation. React components are structural wrappers only — they add no new visual rules.
- `design.css` remains the consumer-loaded stylesheet of record. React components compose `europa-*` classes; CSS custom properties (`--europa-*`) are defined in the `:root` block of `design.css`.
- No external consumers exist for `@europa/design` (it is `private: true`). The only consumers are the console (React 19) and the Astro manual (migrating to `@astrojs/react`). This makes the React peer dependency acceptable — there is no vanilla-HTML or Vue/Svelte consumer to break.
- The modal focus-trap is the most complex piece of logic in the component set. It uses `useEffect` + `useRef` + `keydown` listener to manage focus within the React-rendered DOM.
- The Astro manual's MDX files currently use `<europa-*>` custom-element tags (~200 usages across 15 files). Converting to React imports is a mechanical find-and-replace with syntax adjustments (kebab-case → PascalCase, string attributes → typed props, `<tag></tag>` → `<Tag />`).
- The `@astrojs/react` integration is well-established and stable. It enables React components in MDX files with zero additional configuration beyond adding it to `astro.config.mjs` integrations.

## Out of Scope

- **Full game board renderer**: Canvas-based board rendering remains in the console's React/Canvas layer. No component wraps the board.
- **Lobby-specific compositions**: lobby grid, lobby cards, lobby rows, lobby badges — these are page-level compositions, not single components. They remain as React components using design tokens.
- **Route notice**: route-specific recovery surface, remains React.
- **Order bar, reserves panel, targeting overlay, seat labels**: game-specific interactive components, explicitly excluded by the issue.
- **Framework wrappers for non-React frameworks (Vue, Svelte, etc.)**: the components are React functions. No framework-specific wrapper packages ship. (This was previously "no framework wrappers" because web components were framework-agnostic; now the components are React-specific.)
- **Auto-importing the stylesheet**: components do not import `design.css` — consumers are responsible for the stylesheet import per the existing single-stylesheet contract.
- **New token variables or CSS classes**: the React component layer introduces no new visual language. All styling reuses the existing catalog.
- **Light-theme variant**: remains out of scope per spec 012.
- **Publishing to npm**: `@europa/design` remains `private: true` per binding decision 6.
- **Dual web-component + React coexistence**: the web components are fully replaced by React components. No dual mode, no fallback, no custom-element registration alongside React exports.

## Clarifications

### v1.0 (2026-08-31) — Planner-resolved decisions (original web-component spec)

Resolved in the original spec. Retained for historical context — the decisions below no longer apply to the React component conversion but document the original web-component design rationale.

- **Q1 — Component naming scheme**: All custom element tag names used the `europa-` prefix. React components use PascalCase (`EuropaButton`, `EuropaCard`, etc.) — a breaking change from the web-component API.
- **Q2 — Registration side-effects**: The original `register()` function pattern. Removed in this amendment — React components are imported directly.
- **Q3 — Console migration scope**: 8 of 15 files in scope, 7 out of scope. The same files remain in scope for the React migration (FR-016/FR-017), but the migration is simpler (JSX tag swap, not web-component adoption).
- **Q4 — Export surface**: `@europa/design/components` subpath. Retained — the subpath now exports React functions instead of web-component classes.
- **Q5 — Drift guards**: G-10 for component ↔ DESIGN.md coverage. Retained but rewritten for React component entries.

### v1.1 (2026-09-02) — Shadow DOM conversion (issue #49 / PR #55)

Superseded by this amendment. The Shadow DOM/Light DOM two-tier model, `adoptedStyleSheets`, `EuropaElement.ensureShadowRoot()`, `catalog-styles.ts`, and all shadow-boundary workarounds are removed entirely. This section is retained for historical context only.

### v1.2 (2026-09-03) — React component conversion (issue #65)

Product-owner decisions confirmed — do not relitigate:

- **Q1 — Full replacement**: Delete the custom elements / `register()` / Shadow DOM / Light DOM infrastructure entirely. No dual web-component + React coexistence. The issue says "convert" and no external consumers exist. All 20 components become React functions.
- **Q2 — React component API**: `EuropaButton`, `EuropaCard`, etc. with props mapping 1:1 from the current attributes (`variant`, `size`, `disabled`, etc.), rendering plain React elements with `europa-*` classes. The API surface is standard React: props for configuration, `children` for content, callbacks for events.
- **Q3 — Peer dependency**: `@europa/design` gains `react` as a peer dependency (`">=18"`). Consumer supplies React. This changes the package's current "zero external dependencies" property — documented in the Constitution Deviation Notice above and in FR-006.
- **Q4 — Full manual migration scope**: The entire Astro manual migration is in scope. This means scaffolding `@astrojs/react` in the Astro project (`docs/manual/`), converting all ~200 `<europa-*>` MDX usages to imported React components, and testing the build. See FR-020–FR-022.
- **Q5 — Remove per-component bundle budget**: Remove the 15 KB `dist/components.js` gzipped budget. Keep the console's overall browser-payload gzip budget check. The new components budget is 20 KB gzipped (FR-027).

## Constitution Alignment

- **Principle I (Type Safety)**: All component source is TypeScript strict mode. Props interfaces are explicitly typed. No `any`, no lint suppressions.
- **Principle III (Tested, ≥80%)**: React component unit tests (FR-030), integration tests (FR-031), and conformance tests (FR-033) meet the coverage gate. Happy-dom shadow-DOM tests are removed (FR-034); all tests run against plain React DOM.
- **Principle IV (Specs as Documentation)**: `DESIGN.md` section 2 is rewritten in the same change set (FR-025). Component JSDoc (FR-024) provides implementation-level documentation. The constitution deviation is documented in the Constitution Deviation Notice section.
- **Principle V (Simplicity)**: Thin wrappers (~30–80 LOC each). No internal state management; the modal focus-trap is the most complex piece (~50 LOC of `useEffect` + `useRef` + `keydown`). No Shadow DOM, no `adoptedStyleSheets`, no constructed stylesheets.
- **Principle VI (Accessibility)**: Components enforce structural a11y (roles, labels, focus management) that the raw class catalog leaves to the consumer. WCAG 2.2 AA compliance is improved, not regressed.
- **Principle VII (Self-hostable)**: React is the only peer dependency, provided by the consumer. No CDN, no external services.
- **Additional Constraints**: React as a peer dependency. Private package. No registry publishing.

## Implementation Notes

These notes record implementation-level decisions made during or after the original web-component implementation. They are retained for context; items marked [REMOVED] no longer apply after the React conversion.

1. [REMOVED] `EuropaElement.ensureShadowRoot()` — base class for lazy shadow-root attachment + stylesheet adoption. Replaced by plain React component functions.
2. [REMOVED] `CATALOG_STYLESHEET` module-level singleton — one shared `CSSStyleSheet` adopted by all shadow roots. Replaced by consumer-loaded `design.css` applying to all DOM.
3. [REMOVED] `formAssociated` + `attachInternals()` on `EuropaButton` — native form participation for custom elements. Replaced by rendering a native `<button>` element, which has form participation built in.
4. [REMOVED] Modal focus-trap via shadow-tree flattening — `slot.assignedElements()` + nested open-shadow traversal. Replaced by standard React `useEffect` focus-trap collecting focusables from `containerRef.current.querySelectorAll(...)`.
5. [REMOVED] `catalog-styles.ts` — generated module from `build-css.ts` containing catalog class rules without `:root`. No longer needed — all styling via the consumer-loaded `design.css`.
6. The `@europa/design/components` subpath export is retained but now exports React functions instead of web-component classes. The `package.json#exports` map is unchanged in structure.
7. The `register()` function and `src/components/register.ts` / `src/components/registry.ts` are deleted.
8. The `src/components/base.ts` (EuropaElement abstract class) is deleted.
9. The `src/components/generic/` and `src/components/game/` directories are rewritten: each file exports a React function component + props interface instead of a `customElements.define` class.
10. Console `custom-elements.d.ts` and `global.d.ts` JSX intrinsic declarations are deleted.
11. Console `main.tsx` loses the `register()` import and call.
12. Astro `ManualLayout.astro` loses the `<script>` block with `register()`.
13. All 15 Astro MDX files gain React import statements and use PascalCase component syntax.
14. `check-bundle-size.ts` is updated to check `dist/components/index.js` (React bundle) instead of `dist/components.js` (web-component bundle). The per-component 15 KB budget is removed (Q5); the overall console budget remains.
15. `check-component-catalog.ts` (G-10) is rewritten to enumerate exported React component names instead of registered custom element tag names.
16. The `shadow-traversal.test.ts` canary test is deleted — no shadow DOM to traverse.
