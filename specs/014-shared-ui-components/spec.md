# Feature Specification: Shared UI Web Components in @europa/design

**Feature Branch**: `issue-41-shared-UI-components`

**Created**: 2026-08-31

**Status**: Draft

**GitHub Issue**: #41

**Dependencies**: Feature 012 (`012-design-system`) — the token layer and class catalog that these web components wrap.

## Problem Statement

The `@europa/design` package (feature 012) ships a shared token layer and CSS class catalog, but consumption today requires applying raw `europa-*` class names in HTML or JSX — a manual, error-prone pattern. The player manual (`docs/manual`) renders via Jekyll and can only consume the stylesheet via `<link>` + class names; it has no access to React component wrappers. The console uses ad-hoc inline HTML with `europa-*` classes rather than reusable components. This means every new UI surface — whether a React view in the console, a Markdown page in the manual, or a plain-HTML demo — must re-discover the correct class-name compositions, structural requirements, and accessibility obligations from `DESIGN.md` prose. There is no enforced structural contract: a missing `role="dialog"` on a modal, a missing `aria-label` on a banner, or a missing focus-trap in a dialog all silently degrade accessibility. This feature extracts the generic and game-specific UI patterns from the catalog into **framework-agnostic web components** (`customElements.define`) that enforce correct structure, attribute defaults, and accessibility contracts at the element level, making the design system consumable from React (console), Jekyll (manual), and plain HTML without any framework dependency.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Manual Author Uses Web Components in Markdown/HTML (Priority: P1)

As a player manual author, I want to write `<europa-modal title="Combat">…</europa-modal>` in a Jekyll page and get the correct dark-slate modal with `role="dialog"`, `aria-modal`, focus trap, and Escape-to-close — without reading `DESIGN.md` or remembering class-name composition — so that manual callouts and interactive examples are accessible by default.

**Why this priority**: The primary driver for issue #41 is enabling issue #32 (manual rewrite on web-component-capable tooling). Without web components, the manual cannot have interactive, accessible UI primitives. This is the prerequisite unblock.

**Independent Test**: Can be fully tested without the console: register the components in a plain HTML test page, compose a modal + button + banner, and assert (a) correct DOM structure is produced (role attributes, aria labels, focus-trap wiring), (b) keyboard interaction works (Tab cycles inside modal, Escape closes, focus restores), (c) the visual output matches the catalog classes' computed styles.

**Acceptance Scenarios**:

1. **Given** a plain HTML page that imports `@europa/design/components` and registers the elements, **When** `<europa-modal title="Confirm" open>` is rendered with child content, **Then** the modal displays with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title, focus is trapped inside, and Escape closes the modal.
2. **Given** a Jekyll manual page using `<europa-button variant="primary">Deploy</europa-button>`, **When** the page renders, **Then** the button has the `europa-button europa-button--primary` classes applied, is keyboard-operable, shows the focus ring on Tab, and matches the computed styles of the catalog's `.europa-button--primary`.
3. **Given** a `<europa-banner variant="status">Reconnecting…</europa-banner>`, **When** it renders, **Then** it has `role="status"` and the correct banner styling from the catalog.

---

### User Story 2 — Console Migrates from Inline HTML to Web Components (Priority: P1)

As a console developer, I want to replace inline `<div className="europa-banner">…</div>` patterns with `<europa-banner>…</europa-banner>` web components, so that the structural and accessibility contracts are enforced by the element rather than by convention, and so the same components work in both React and non-React contexts.

**Why this priority**: The console is the largest consumer of the design catalog. Migrating it proves the web components work inside React 19 (which has native custom element support) and reduces the surface area for accessibility regressions.

**Independent Test**: Can be tested by importing the web components into the console's React tree, replacing the existing inline patterns, and asserting (a) visual output is identical (computed styles unchanged), (b) existing axe/a11y suites remain green, (c) the bundle size does not regress beyond the allowed budget.

**Acceptance Scenarios**:

1. **Given** the console migrated to use web component elements, **When** the lobby and in-match views render, **Then** every visual surface is identical to the pre-migration state — same colors, spacing, radii, focus treatment — verified by computed-style assertions.
2. **Given** a React 19 console importing `<europa-button>`, **When** the component mounts and is interacted with via pointer and keyboard, **Then** React correctly passes children, attributes, and event handlers to the custom element without a wrapper layer.
3. **Given** the existing console axe/a11y suites, **When** they run against the migrated views, **Then** all suites remain green with no new violations.

---

### User Story 3 — Game-Specific Primitives Available for Manual Diagrams (Priority: P2)

As a manual author writing about game mechanics, I want to compose inline diagrams using `<europa-troop-chip count="5" owner="1">` and `<europa-city-marker owner="2">` so that I can illustrate troop deployments, city ownership, and pipe slopes in documentation without creating custom images.

**Why this priority**: Enables richer, data-driven illustrations in the manual. P2 because it builds on the generic component foundation from US1.

**Independent Test**: Can be tested by rendering a set of game-specific primitives in a plain HTML page, asserting correct visual output (troop chip shows count with correct color coding, city marker shows correct player color, pipe slope indicator shows correct direction color), and verifying accessibility (each chip/marker has appropriate aria-label).

**Acceptance Scenarios**:

1. **Given** `<europa-troop-chip count="12" owner="1">`, **When** it renders, **Then** the chip shows "12" with the correct player-1 fill color, has `role="img"` and `aria-label="12 troops, player 1"`, and matches the `.europa-chip` computed styles.
2. **Given** `<europa-pipe-slope direction="downhill">`, **When** it renders, **Then** the indicator shows the green downhill triangle with `aria-label="Downhill flow"` and the correct token color `var(--europa-color-pipe-downhill)`.
3. **Given** `<europa-elevation-swatch elevation="42">`, **When** it renders, **Then** the swatch shows a color from the land elevation band (computed from `landMinLightnessPct` to `landMaxLightnessPct`) with `aria-label="Elevation 42"`.

---

### User Story 4 — Maintainer Documents New Components in DESIGN.md (Priority: P2)

As a maintainer, I want every web component documented in `DESIGN.md` section 2 with its tag name, attributes, slots, accessibility obligations, and usage examples, so that the living contract stays complete as the component inventory grows.

**Why this priority**: The "specs stay truthful" rule (constitution Principle IV) extends to the design contract. P2 because it is governance that enables long-term correctness.

**Independent Test**: Can be tested by asserting that every registered `europa-*` custom element has a corresponding entry in `DESIGN.md` section 2, with documented tag name, attributes, slots, events, and a11y obligations.

**Acceptance Scenarios**:

1. **Given** a new web component registered as `europa-modal`, **When** `DESIGN.md` section 2 is inspected, **Then** it contains an entry for `<europa-modal>` documenting: tag name, attributes (`open`, `title`), slots (default body), events (`europa-close`), a11y obligations (`role="dialog"`, `aria-modal`, focus trap, Escape), and a usage example.
2. **Given** any change that adds, renames, or removes a web component, **When** the change is submitted, **Then** `DESIGN.md` is updated in the same commit (FR-018 sync rule).

---

### Edge Cases

- **Double registration**: calling `customElements.define('europa-button', …)` twice throws `DOMException`. The `register()` function MUST detect prior registration and skip silently (no-op) rather than throwing, so multiple import paths or hot-reload scenarios are safe.
- **Missing stylesheet**: if a consumer registers components without importing `design.css`, the components render with browser defaults (unstyled). The spec DOES NOT require auto-importing the stylesheet — consumers are responsible for the stylesheet import per the existing single-stylesheet contract. A console log warning MAY be emitted in development mode.
- **React 18 (or earlier) consumers**: React <19 does not pass boolean attributes or custom element properties correctly. The web components MUST work with attribute-only APIs (string attributes) so React 18 consumers can use them with `dangerouslySetInnerHTML` or workarounds, though official support targets React 19. No wrapper layer ships.
- **Attribute vs property for complex values**: `owner` (number), `count` (number), `elevation` (number) are passed as string attributes and parsed internally. The components MUST accept string attributes and coerce to the correct internal type.
- **Shadow DOM vs Light DOM**: per product-owner decision, all components use **Light DOM** — they apply existing `europa-*` class catalog classes directly to their rendered elements, with no Shadow DOM boundary. This preserves the single-stylesheet rule (FR-011) and all existing styling. No `::part()` or `adoptedStyleSheets`.
- **Focus-trap in modal without Shadow DOM**: focus trapping is implemented via event listeners on the host element, not via Shadow DOM boundaries. The trap MUST cycle Tab/Shift+Tab within the modal's focusable children and restore focus to the trigger element on close.
- **Server-side rendering (SSR)**: Jekyll generates static HTML. Custom elements degrade gracefully — they render as unknown elements with their children visible. The components' `connectedCallback` lifecycle runs only in the browser, so SSR-produced HTML is valid and progressively enhanced.

## Requirements *(mandatory)*

### Functional Requirements

#### Component inventory and naming

- **FR-001**: `@europa/design` MUST export web component custom elements for the following generic UI components. Each component's custom element tag name matches the existing CSS class catalog convention (`europa-*`):
  - `<europa-button>` — wraps `.europa-button` + variants (`primary`, `secondary`, `ghost`, `success`, `warning`, `error`, `info`) and size modifiers (`sm`, `lg`). Attributes: `variant` (string, default: none/base), `size` (string, default: none/base), `disabled` (boolean). Renders a `<button>` element internally with correct classes. Slot: text label content.
  - `<europa-card>` — wraps `.europa-card`. Renders a `<div>` with the card class. Slot: arbitrary content.
  - `<europa-plate>` — wraps `.europa-plate`. Renders a `<div>` with the plate class. Slot: arbitrary content.
  - `<europa-modal>` — wraps `.europa-modal-backdrop` + `.europa-modal` + `.europa-modal__title` + `.europa-modal__body` + `.europa-modal__actions`. Attributes: `open` (boolean), `title` (string). Slots: default (body content), `actions` (button bar). Events: `europa-close` (dispatched on Escape or backdrop click). Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title element, focus trap, Escape-to-close, focus restore on close.
  - `<europa-chip>` — wraps `.europa-chip`. Attributes: `count` (string, displayed as text content). Renders a `<span>` with chip classes. Used for troop-count pills.
  - `<europa-badge>` — wraps `.europa-badge`. Slot: label text. Renders a `<span>` with badge classes.
  - `<europa-banner>` — wraps `.europa-banner`. Attributes: `variant` (string: `status` | `alert`, default: `status`). Slot: message text. Accessibility: `role="status"` for `status` variant, `role="alert"` for `alert` variant.
  - `<europa-typography>` — wraps `.europa-typography--*` treatments. Attributes: `variant` (string: `heading` | `muted` | `meta` | `mono`). Slot: text content. Renders a `<span>` (or the appropriate semantic element based on variant) with the typography class.
  - `<europa-waiting>` — wraps `.europa-waiting` + `.europa-waiting__plate` + `.europa-waiting__pulse` + `.europa-waiting__text`. Attributes: `message` (string), `reduced-motion` (boolean). Accessibility: spinner `aria-hidden`, message announced via live region, respects `prefers-reduced-motion`.
  - `<europa-grid>` — wraps `.europa-grid` + modifiers (`sidebar`, `wrap`). Attributes: `variant` (string: default | `sidebar` | `wrap`). Slot: grid items.
  - `<europa-stack>` — wraps `.europa-stack`. Slot: stacked items.
  - `<europa-container>` — wraps `.europa-container`. Slot: contained content.
  - `<europa-page>` — wraps `.europa-page`. Slot: page content. Sets the outermost page column layout.

- **FR-002**: `@europa/design` MUST export web component custom elements for the following game-specific visual primitives. These are composable, data-driven elements for use in the manual (inline diagrams) and potentially the console:
  - `<europa-troop-chip>` — renders a `.europa-chip` styled for troop counts. Attributes: `count` (string, the troop number), `owner` (string, player number 1–4). Accessibility: `role="img"`, `aria-label` computed from count and owner.
  - `<europa-city-marker>` — renders a city ownership indicator. Attributes: `owner` (string, player number 1–4). Accessibility: `role="img"`, `aria-label` from owner.
  - `<europa-pipe-slope>` — renders a pipe flow direction indicator. Attributes: `direction` (string: `downhill` | `flat` | `uphill` | `stalled`). Uses token colors (`pipeDownhill`, `pipeFlat`, `pipeUphill`, `pipeStalled`). Accessibility: `role="img"`, `aria-label` from direction.
  - `<europa-elevation-swatch>` — renders a terrain elevation color swatch. Attributes: `elevation` (string, numeric 0–100). Color computed from the land elevation band tokens. Accessibility: `role="img"`, `aria-label` with elevation value.
  - `<europa-player-badge>` — renders a player identity badge. Attributes: `player` (string, player number 1–4), `name` (string, optional display name). Accessibility: `role="img"`, `aria-label` from player and name.
  - `<europa-fog-overlay>` — renders a fog-of-war visual indicator (semi-transparent overlay). Attributes: `visible` (boolean, default: true). Accessibility: `aria-hidden="true"` (purely visual).
  - `<europa-reserve-indicator>` — renders a reserve-percentage display. Attributes: `percent` (string, 0–90 in steps of 10). Accessibility: `role="img"`, `aria-label` with percentage.

#### Registration pattern

- **FR-003**: The package MUST export an explicit `register()` function that calls `customElements.define()` for every web component. The `register()` function MUST be idempotent — calling it multiple times or registering the same tag name twice MUST NOT throw; it MUST silently no-op on duplicate registration. The function signature: `export function register(): void`.
- **FR-004**: The package MUST NOT auto-register components on import. Importing `@europa/design/components` MUST NOT have side effects. Registration is the consumer's explicit choice, enabling tree-shaking and avoiding global side effects in SSR/test environments.
- **FR-005**: Individual component classes MUST be exported as named exports (e.g., `export class EuropaButton extends HTMLElement { … }`) so consumers who want selective registration can call `customElements.define('europa-button', EuropaButton)` directly. The `register()` function is a convenience that registers all components.

#### Export surface

- **FR-006**: The web components MUST be exported via a new subpath export `@europa/design/components`. The existing `@europa/design` (root) and `@europa/design/tokens` exports MUST remain unchanged and MUST NOT be affected by this feature. The `package.json#exports` map gains:
  ```json
  "./components": {
    "types": "./dist/components.d.ts",
    "import": "./dist/components.js"
  }
  ```
  This keeps the components tree-shakeable: consumers who only need tokens do not pay for component code.
- **FR-007**: The stylesheet (`dist/design.css`) MUST continue to be imported separately by the consumer (existing single-stylesheet contract, FR-011 of spec 012). The web components do NOT auto-import the stylesheet. The `@europa/design/components` export contains JavaScript only — no CSS.
- **FR-008**: A barrel file `src/components/index.ts` MUST re-export all component classes and the `register()` function. The tsup config MUST gain a second entry point for `src/components/index.ts` → `dist/components.{js,d.ts}`.

#### Light DOM and class catalog composition

- **FR-009**: All web components MUST use **Light DOM** — no Shadow DOM. They render into their regular DOM subtree and apply existing `europa-*` class catalog classes directly to their child elements. This preserves the single-stylesheet rule (FR-011 of spec 012) and ensures the components are styled by the same `design.css` that the console and manual already import.
- **FR-010**: Each web component MUST compose the exact same `europa-*` classes and `var(--europa-*)` tokens defined in `DESIGN.md` section 2. The web component layer adds NO new CSS classes, NO new CSS rules, and NO new token variables. It is a structural/accessibility wrapper around the existing catalog.

#### Accessibility contracts enforced by components

- **FR-011**: The `<europa-modal>` component MUST enforce: (a) `role="dialog"` on the dialog element, (b) `aria-modal="true"`, (c) `aria-labelledby` pointing to the title element (generated from the `title` attribute), (d) focus trap — Tab and Shift+Tab cycle within the modal's focusable descendants, (e) Escape key dispatches `europa-close` and closes the modal, (f) on close, focus returns to the element that was focused before the modal opened, (g) when `open` is false or absent, the modal is hidden (`hidden` attribute or `display: none`) and removed from the Tab order.
- **FR-012**: The `<europa-banner>` component MUST set `role="status"` for the `status` variant and `role="alert"` for the `alert` variant. The `alert` variant MUST use `aria-live="assertive"` so the message is announced immediately.
- **FR-013**: The `<europa-button>` component MUST render a native `<button>` element (not a `<div>` with `role="button"`) to inherit native keyboard behavior, form participation, and disabled semantics. The `disabled` attribute MUST be mapped to the native `disabled` attribute.
- **FR-014**: Every game-specific primitive (FR-002) MUST set `role="img"` and a computed `aria-label` attribute so the element is announced correctly by screen readers. The visual content (chip count, swatch color) is the decorative representation; the aria-label carries the semantic meaning.
- **FR-015**: All interactive web components (button, modal controls) MUST participate in the shared focus-visible treatment via the `*:focus-visible` rule in `design.css`. No component may suppress or override the focus ring.

#### Console migration scope

- **FR-016**: The following console UI files are **in scope** for migration from inline HTML/class-name patterns to web components. These files contain generic patterns that map directly to the component inventory:
  - `branded-footer.tsx` — currently uses inline `<footer>` with `var(--europa-*)` style props. Migrate to use `<europa-page>` or keep as-is if no component match (footer is a one-off composition, not a catalog component — remains React with design tokens).
  - `waiting-overlay.tsx` — uses `.europa-waiting` / `.europa-waiting__plate` / `.europa-waiting__pulse` / `.europa-waiting__text` classes. Migrate to `<europa-waiting message="…" reduced-motion={bool}>`.
  - `lobby-landing.tsx` — uses `.europa-banner`, `.europa-lobby`, `.europa-lobby__grid`, `.europa-lobby__superseded`, `.europa-focus-ring`, and headings. Migrate banner instances to `<europa-banner>`, keep lobby layout as React composition (lobby is a page-level composition, not a single component).
  - `lobby-create-form.tsx`, `lobby-identity-card.tsx`, `lobby-match-list.tsx` — use `.europa-card`, `.europa-button`, `.europa-banner` inline. Migrate button and banner instances to web components; keep form/list logic as React.

- **FR-017**: The following console UI files are **explicitly NOT in scope** for web-component migration (they remain React components with design tokens):
  - `order-bar.tsx` — game-specific interactive toolbar with roving tabindex; the issue explicitly excludes "Order bar".
  - `reserves-panel.tsx` — game-specific slider + digit buttons; the issue explicitly excludes "Reserves panel".
  - `targeting-overlay.tsx` — game-specific canvas overlay; the issue explicitly excludes "Targeting overlay".
  - `seat-labels.ts` — pure data derivation, not a UI component.
  - `participants.tsx` — game-specific seat-label strip; the issue explicitly excludes "Seat labels".
  - `route-notice.tsx` — route-specific recovery surface; the issue explicitly excludes "Route notice".
  - `lobby-labels.ts` — pure label helpers, not a UI component.
  - `lobby-handle.ts` — handle-management logic, not a UI component.

- **FR-018**: The console migration MUST NOT change any visual output. Every computed style (colors, spacing, radii, borders, shadows, focus rings, typography) before and after migration MUST be identical. The migration is purely structural: replacing `<div className="europa-banner">` with `<europa-banner>`.
- **FR-019**: The console continues to use React 19 for application-level composition (routing, state, event handling). Web components are used as leaf-level structural elements within the React tree. React 19's native custom element support means no wrapper layer or `ref` forwarding is needed for basic attribute and children passthrough.

#### drift guards and DESIGN.md updates

- **FR-020**: A new drift guard **G-10** MUST assert that every registered `europa-*` custom element tag name has a corresponding entry in `DESIGN.md` section 2, with documented tag name, attributes, slots, events, and a11y obligations. The guard runs locally and in CI, failing with the unregistered tag name on violation.
- **FR-021**: Every web component class MUST be accompanied by a JSDoc comment documenting: tag name, attributes (name, type, default, description), slots (name, description), events (name, detail, description), and a11y obligations. The JSDoc is the implementation-level contract; `DESIGN.md` section 2 is the user-facing contract.
- **FR-022**: `DESIGN.md` section 2 MUST be updated in the same change set as the component implementation (FR-018 of spec 012). Each new web component entry MUST include: tag name, attributes table, slots table, events table, a11y obligations, and a minimal usage example.
- **FR-023**: Existing drift guards G-01 through G-09 MUST remain green. The web component layer introduces no new token variables, no new CSS classes, and no new stylesheet rules, so the existing guards are unaffected.

#### Bundle size and dependencies

- **FR-024**: The `@europa/design/components` export MUST have zero external dependencies. It depends only on the DOM APIs (`customElements`, `HTMLElement`, `MutationObserver` if needed for attribute observation) and the existing `@europa/design` token exports (for game-specific primitives that need token values for color computation).
- **FR-025**: The total gzipped size of `dist/components.js` MUST NOT exceed 15 KB. The components are thin wrappers — they delegate all visual treatment to the existing stylesheet. This budget accommodates the component class definitions, the `register()` function, the focus-trap logic for modal, and the attribute parsing/coercion code.
- **FR-026**: The console's browser-payload gzip budget (NFR-005 of spec 005, currently < 153,600 B) MUST NOT regress. The web component JS adds to the bundle; the migration removes no existing code (the React components remain for non-migrated files), so the delta is the `dist/components.js` payload. The architect MUST verify the budget remains green after migration.

#### Testing

- **FR-027**: Every web component MUST have unit tests covering: (a) correct class composition on rendered elements, (b) attribute → DOM mapping (each attribute produces the expected class/attribute on the internal element), (c) slot rendering (children appear in the correct position), (d) event dispatch (modal close event fires on Escape), (e) accessibility attributes (`role`, `aria-*` are set correctly).
- **FR-028**: The modal component MUST have integration tests covering: (a) focus trap cycles Tab/Shift+Tab within the modal, (b) Escape closes the modal and restores focus, (c) backdrop click closes the modal, (d) `open` attribute toggling shows/hides the modal, (e) focus cannot escape to elements behind the modal.
- **FR-029**: The game-specific primitives MUST have unit tests covering: (a) correct color computation from token values (elevation swatch color matches the land band formula), (b) correct `aria-label` generation, (c) attribute coercion (string "5" → number 5 for count/elevation).
- **FR-030**: A conformance test MUST assert that every web component's rendered DOM, when the component is instantiated with default attributes and no children, contains exactly the same `europa-*` class names as a manually-constructed equivalent using the catalog classes from `DESIGN.md`. This proves the components are faithful wrappers, not divergent implementations.

### Non-Functional Requirements

- **NFR-001 (Accessibility)**: Constitution Principle VI (WCAG 2.2 AA) applies to every web component. The components enforce structural accessibility (roles, labels, focus management) that the raw class catalog leaves to the consumer. A component that enforces `role="dialog"` is more accessible than a `<div class="europa-modal">` without it.
- **NFR-002 (Self-hostable)**: Constitution Principle VII — no external CDN, font, or service is required. The components are pure DOM JavaScript.
- **NFR-003 (Type safety)**: TypeScript `strict: true` for all component source code. Every component class extends `HTMLElement` with typed attribute accessors. No `any`, no lint suppressions.
- **NFR-004 (Simplicity)**: Constitution Principle V — components are thin wrappers (attribute parsing + class application + a11y wiring). No virtual DOM, no reactive framework, no state management. The complexity budget is spent on focus-trap (modal only) and attribute observation.
- **NFR-005 (Performance)**: Components MUST NOT cause layout thrashing. Attribute changes MUST batch class updates synchronously. The modal focus-trap MUST use `keydown` event listeners, not `MutationObserver` polling.
- **NFR-006 (License hygiene)**: Zero runtime dependencies. All code is original to the project. No copied snippets from third-party web component libraries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 — Components register and render**: `register()` called once registers all components; calling it twice does not throw. A test page with all component tags renders visible, styled output matching the catalog's computed styles.
- **SC-002 — Modal accessibility contract enforced**: A modal opened via `<europa-modal open>` has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapped inside, Escape closes, focus restores. Verified by automated a11y test (axe + manual keyboard test).
- **SC-003 — Console migration is visually invisible**: Pre/post migration computed styles for all migrated surfaces (banner, waiting overlay, lobby buttons) are identical. All existing console test suites (unit, component, a11y, e2e) remain green.
- **SC-004 — Manual-compatible**: A plain HTML page importing `@europa/design/components` and the stylesheet can render `<europa-modal>`, `<europa-button>`, `<europa-banner>`, and `<europa-troop-chip>` with correct styling and accessibility — no React required.
- **SC-005 — DESIGN.md complete**: Every registered `europa-*` custom element has a corresponding entry in `DESIGN.md` section 2 with tag name, attributes, slots, events, a11y obligations, and usage example. G-10 guard passes.
- **SC-006 — Bundle budget preserved**: `dist/components.js` gzipped ≤ 15 KB. Console browser-payload gzip budget (< 153,600 B) remains green after migration.
- **SC-007 — All drift guards green**: G-01 through G-09 remain green. G-10 (new component ↔ DESIGN.md coverage) passes. No new token variables, CSS classes, or stylesheet rules introduced.

## Assumptions

- React 19 is the console's target (per product-owner decision 2). React 19 has native custom element support and correctly passes attributes, properties, and children to custom elements without a wrapper layer.
- The existing `europa-*` CSS class catalog (feature 012, `DESIGN.md` section 2) is the visual implementation. Web components are structural wrappers only — they add no new visual rules.
- Light DOM (product-owner decision 1) means no Shadow DOM, no `::part()`, no `adoptedStyleSheets`. All styling comes from the shared `design.css` stylesheet imported by the consumer.
- `customElements.define` is a global registry. Tag names are globally unique. The `europa-*` prefix is already the de facto namespace in this project (FR-007 of spec 012), so collisions with third-party elements are unlikely.
- The modal focus-trap is the most complex piece of logic in the component set. It follows the well-established pattern from libraries like `focus-trap` but implemented in ~50 lines of vanilla JS to avoid dependencies.
- The `register()` function pattern is consistent with major web component libraries (e.g., Shoelace/Slime's `register()`, Ionic's `defineCustomElements()`). It is a proven pattern for avoiding side effects on import.

## Out of Scope

- **Full game board renderer**: Canvas-based board rendering remains in the console's React/Canvas layer. No web component wraps the board.
- **Lobby-specific compositions**: lobby grid, lobby cards, lobby rows, lobby badges — these are page-level compositions, not single components. They remain as React components using design tokens.
- **Route notice**: route-specific recovery surface, remains React.
- **Order bar, reserves panel, targeting overlay, seat labels**: game-specific interactive components, explicitly excluded by the issue.
- **Shadow DOM or CSS encapsulation**: per product-owner decision 1, all components use light DOM.
- **Auto-importing the stylesheet**: components do not import `design.css` — consumers are responsible for the stylesheet import per the existing single-stylesheet contract.
- **Framework wrappers (React, Vue, etc.)**: the web components are consumed natively by React 19 and other modern frameworks. No framework-specific wrapper packages ship.
- **New token variables or CSS classes**: the web component layer introduces no new visual language. All styling reuses the existing catalog.
- **Light-theme variant**: remains out of scope per spec 012.
- **Publishing to npm**: `@europa/design` remains `private: true` per binding decision 6.

## Clarifications

### v1.0 (2026-08-31) — Planner-resolved decisions (no unresolved questions remain)

- **Q1 — Component naming scheme**: All custom element tag names use the `europa-` prefix matching the existing CSS class catalog. Generic components: `europa-button`, `europa-card`, `europa-plate`, `europa-modal`, `europa-chip`, `europa-badge`, `europa-banner`, `europa-typography`, `europa-waiting`, `europa-grid`, `europa-stack`, `europa-container`, `europa-page`. Game-specific primitives: `europa-troop-chip`, `europa-city-marker`, `europa-pipe-slope`, `europa-elevation-swatch`, `europa-player-badge`, `europa-fog-overlay`, `europa-reserve-indicator`. The hyphenated names satisfy the `customElements.define` requirement. The prefix ensures global uniqueness within the project's namespace.
- **Q2 — Registration side-effects**: Explicit `register()` function (FR-003/FR-004). Importing `@europa/design/components` is side-effect-free. The consumer calls `register()` once at application entry. The function is idempotent (no-ops on duplicate tags). Individual component classes are also exported for selective registration. This pattern is tree-shakeable — a consumer who imports only `EuropaButton` and calls `customElements.define` manually pays no cost for the modal focus-trap code.
- **Q3 — Console migration scope**: 8 of 15 `packages/console/src/ui/` files are in scope (FR-016). 7 files are explicitly out of scope (FR-017). The in-scope files are the ones containing generic catalog patterns (banner, waiting overlay, buttons, cards) that map directly to the component inventory. The out-of-scope files are game-specific interactive components explicitly excluded by the issue text. Some in-scope files (e.g., `branded-footer.tsx`, `lobby-landing.tsx`) may remain mostly React after migration — they are compositions that use a few web components as leaves, not wholesale replacements.
- **Q4 — Export surface**: New subpath `@europa/design/components` (FR-006). The existing `@europa/design` and `@europa/design/tokens` exports are unchanged. The subpath is tree-shakeable and keeps the token-only consumers unburdened. The stylesheet continues to be imported separately via `@europa/design/dist/design.css` (FR-007).
- **Q5 — Drift guards**: Existing G-01 through G-09 are unaffected (no new tokens, no new CSS classes). New guard G-10 (FR-020) asserts every registered custom element tag name has a corresponding `DESIGN.md` entry. The component JSDoc (FR-021) serves as the implementation-level contract. No existing guards need modification.

## Constitution Alignment

- **Principle I (Type Safety)**: All component source is TypeScript strict mode. Attribute accessors are typed. No `any`, no lint suppressions.
- **Principle III (Tested, ≥80%)**: Component unit tests, integration tests (modal focus-trap), and conformance tests (FR-030) meet the coverage gate.
- **Principle IV (Specs as Documentation)**: `DESIGN.md` section 2 is updated in the same change set (FR-022). Component JSDoc (FR-021) provides implementation-level documentation.
- **Principle V (Simplicity)**: Thin wrappers (~50–100 LOC each). No framework, no state management, no Shadow DOM. The most complex component (modal) has ~80 LOC for focus-trap + Escape + focus-restore.
- **Principle VI (Accessibility)**: Components enforce structural a11y (roles, labels, focus management) that the raw class catalog leaves to the consumer. WCAG 2.2 AA compliance is improved, not regressed.
- **Principle VII (Self-hostable)**: Zero dependencies, no CDN, no external services. Pure DOM JavaScript.
- **Additional Constraints**: Zero runtime deps. Private package. No registry publishing.
