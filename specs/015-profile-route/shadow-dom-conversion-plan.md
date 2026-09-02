# Shadow DOM Conversion Plan

> **Scope**: Convert 13 generic web components in `@europa/design` from Light DOM
> (manual `appendChild` reparenting) to Shadow DOM + `<slot>` projection, fixing
> the React 19 `removeChild` crash. Clean up accumulated cruft from Feature 015.
>
> **Branch**: `issue-49-calm-falcon` (current)
>
> **Status**: Plan — awaiting approval before implementation.

---

## 1. Cruft & Design Debt Inventory

### 1.1 React 19 Light DOM crash (root cause)

**File**: `packages/design/src/components/base.ts` + all 13 generic components.

The `EuropaElement` base class and every generic component manually reparent
host children via `appendChild` into internal wrapper divs on every `render()`.
When React 19 unmounts a component tree it calls `removeChild` on the host
element's original children — but those children have already been moved into
the internal wrapper. Result: `NotFoundError: The node to be removed is no
longer a child of this node`.

**React team recommendation**: use Shadow DOM + `<slot>` so children stay as
light-DOM children of the host and are projected into internal elements by the
browser, not by JavaScript.

### 1.2 ProfileView band-aid (commit `b8572f0`)

**File**: `packages/console/src/ui/profile-view.tsx` (lines 120–152).

The restoring state branch replaces web components (`<europa-page>`,
`<europa-stack>`, `<europa-card>`) with plain `<div className="europa-page">`
etc. to avoid the crash. This is a temporary workaround — the restoring state
should use web components like the named/unnamed states.

**Action**: revert to web component usage after Shadow DOM conversion.

### 1.3 `patchHistoryForPathChanges()` monkey-patch

**File**: `packages/console/src/internal/lobby-runtime.tsx` (lines 84–95).

Patches `history.pushState`/`replaceState` to dispatch a custom
`europa:pathchange` event so `usePathname()` re-renders on programmatic
navigation. This is a reasonable approach for a SPA without a router — it is
NOT cruft. The patch runs once and is idempotent. **No cleanup needed.**

### 1.4 Duplicated `setHandleViaProfile` E2E helper

**Files**:
- `packages/console/tests/e2e/lobby.spec.ts` (line 288)
- `packages/console/tests/e2e/routing.spec.ts` (line 119)

Both files contain an identical helper that navigates to `/profile`, fills the
handle form, submits, and waits for redirect.

**Action**: extract to a shared test utility (e.g.
`tests/e2e/helpers/profile.ts`) and import from both specs.

### 1.5 Spec 014 "no Shadow DOM" decision

**Files**:
- `specs/014-shared-ui-components/spec.md` (FR-009, line 143)
- `specs/014-shared-ui-components/contracts/web-components.contract.md` (line 324)
- `specs/014-shared-ui-components/plan.md` (line 39)
- `specs/014-shared-ui-components/research.md` (lines 16, 19, 23)

The original spec 014 explicitly says "all components use Light DOM" as a
product-owner decision. This decision must be amended to permit Shadow DOM for
the 13 generic components that project children. Game primitives stay Light DOM.

**Action**: amend spec 014 + contract in the same change set.

### 1.6 DESIGN.md Light DOM contract

**File**: `DESIGN.md` (line 224 area — "Shadow DOM / `::part()` / `adoptedStyleSheets` — all
components use light DOM").

**Action**: update to reflect the new Shadow DOM architecture for generic
components, Light DOM for game primitives.

### 1.7 AGENTS.md Light DOM note

**File**: `AGENTS.md` (line 115 — "Light DOM child projection" environment note).

**Action**: update to describe the new Shadow DOM pattern and remove the
Light DOM reparenting guidance.

---

## 2. Styling Strategy: Constructed CSSStyleSheet via `adoptedStyleSheets`

### 2.1 Problem

When a component uses Shadow DOM, the page's global stylesheets (`design.css`)
do NOT cascade into the shadow root. The catalog classes (`.europa-page`,
`.europa-button`, etc.) would be invisible to shadow-DOM elements.

### 2.2 Solution: Shared constructed stylesheet

Create a single `CSSStyleSheet` instance from the catalog CSS text at module
load time. Every shadow-DOM component adopts this shared sheet. This approach:

- **Zero duplication**: one `CSSStyleSheet` object shared across all 13
  components (the browser deduplicates it internally).
- **No `<style>` tags**: `adoptedStyleSheets` is the W3C-recommended approach
  for shadow DOM styling.
- **Performance**: the sheet is parsed once; adoption is O(1) per component.
- **Token inheritance**: CSS custom properties defined on `:root` in the
  global `design.css` are inherited into shadow roots by default (CSS
  custom properties inherit through the shadow boundary). So the `:root`
  token block does NOT need to be in the adopted sheet — only the catalog
  class rules.

### 2.3 Implementation

#### 2.3.1 Build-time CSS module

**File**: `packages/design/src/styles/catalog-styles.ts` (new)

```ts
/**
 * The catalog stylesheet as a constructed CSSStyleSheet.
 *
 * Built at module load time from the raw catalog CSS text. The `:root`
 * token block is intentionally excluded — CSS custom properties inherit
 * through shadow boundaries from the document's global `:root` block.
 * Only the `.europa-*` class rules are needed inside shadow roots.
 */
const CATALOG_CSS = `/* ... inlined catalog.css content ... */`;

export const CATALOG_STYLESHEET: CSSStyleSheet = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CATALOG_CSS);
    return sheet;
})();
```

**Build step**: the `build-css.ts` script is extended to also emit
`src/styles/catalog-styles.ts` — a TypeScript module containing the catalog
CSS as a string literal. This keeps the catalog as single-source (authored in
`catalog.css`, emitted into both `dist/design.css` and
`src/styles/catalog-styles.ts`). The `:root` token block is excluded from the
emitted module because CSS custom properties inherit into shadow roots from the
document-level `:root`.

Alternatively, if the catalog.css is < 15KB (it's ~701 lines, well under), we
can use a Vite/raw import: `import CATALOG_CSS from '../styles/catalog.css?raw'`
and construct the stylesheet at runtime. This avoids a build step but couples
to Vite's raw import convention.

**Recommended**: extend `build-css.ts` to emit the TS module (deterministic,
no Vite coupling, consistent with the existing build pipeline).

#### 2.3.2 Base class changes

**File**: `packages/design/src/components/base.ts`

```ts
export abstract class EuropaElement extends HTMLElement {
    /** The shared catalog stylesheet adopted by every shadow root. */
    protected static catalogSheet: CSSStyleSheet = CATALOG_STYLESHEET;

    /** Whether the shadow root has been created for this element. */
    private _shadowReady = false;

    /** Lazily create the shadow root on first render. */
    protected ensureShadowRoot(): ShadowRoot {
        if (!this._shadowReady) {
            const shadow = this.attachShadow({ mode: 'open' });
            shadow.adoptedStyleSheets = [EuropaElement.catalogSheet];
            this._shadowReady = true;
        }
        return this.shadowRoot!;
    }

    // ... existing connectedCallback, attributeChangedCallback, render, 
    // setClasses, setAttributeIf unchanged
}
```

Key decisions:
- `mode: 'open'` — allows external inspection (testing, DevTools) and is
  consistent with the project's transparency principle.
- `adoptedStyleSheets` set once per shadow root creation — no re-parsing.
- `ensureShadowRoot()` is lazy (called from `render()`) so elements that
  haven't been connected yet don't create unnecessary shadow roots.
- The `setClasses` helper continues to work — it sets `class` on the host
  element, which is fine for external styling (consumers who style via class
  selectors on the host).
- The `:root` CSS custom properties are inherited through the shadow boundary
  automatically — no special handling needed.

### 2.4 What does NOT change

- The global `design.css` is still loaded by the console and manual for
  non-shadow-DOM elements (game primitives, plain HTML, the manual site).
- The `TOKENS` TypeScript constant is unchanged.
- The catalog class names are unchanged (no renames).
- The `dist/design.css` output is unchanged.

---

## 3. Component-by-Component Conversion

### 3.1 Simple layout wrappers (no observed attributes)

These components all follow the same pattern: create a shadow root, render a
single internal `<div class="europa-*">` with a `<slot>`, done.

| Component | Internal element | Shadow structure | Notes |
|-----------|-----------------|------------------|-------|
| `EuropaPage` | `<div class="europa-page">` | `shadow > div.europa-page > <slot>` | No attributes |
| `EuropaCard` | `<div class="europa-card">` | `shadow > div.europa-card > <slot>` | No attributes |
| `EuropaPlate` | `<div class="europa-plate">` | `shadow > div.europa-plate > <slot>` | No attributes |
| `EuropaStack` | `<div class="europa-stack">` | `shadow > div.europa-stack > <slot>` | No attributes |
| `EuropaContainer` | `<div class="europa-container">` | `shadow > div.europa-container > <slot>` | No attributes |
| `EuropaBadge` | `<span class="europa-badge">` | `shadow > span.europa-badge > <slot>` | No attributes |

**Conversion pattern** (using `EuropaPage` as template):

```ts
export class EuropaPage extends EuropaElement {
    protected render(): void {
        const shadow = this.ensureShadowRoot();
        if (shadow.children.length === 0) {
            const wrapper = document.createElement('div');
            wrapper.className = 'europa-page';
            const slot = document.createElement('slot');
            wrapper.appendChild(slot);
            shadow.appendChild(wrapper);
        }
    }
}
```

Key differences from Light DOM version:
- `appendChild` targets `shadow`, not `this`.
- `<slot>` is a real projection element (no longer inert).
- No reparenting loop — the browser handles projection.
- Children stay as host children — React 19's `removeChild` works.

### 3.2 Attribute-driven layout wrappers

| Component | Attributes | Internal structure | Special handling |
|-----------|-----------|-------------------|-----------------|
| `EuropaGrid` | `variant` | `shadow > div.europa-grid[modifier] > <slot>` | Variant → modifier class on internal div |
| `EuropaBanner` | `variant` | `shadow > div.europa-banner > <slot>` | Variant → `role` + `aria-live` on internal div |
| `EuropaChip` | `count` | `shadow > span.europa-chip > (text + <slot>)` | Count text node + projected children |
| `EuropaTypography` | `variant` | `shadow > (h2/h3/p/span) > <slot>` | Tag changes with variant |

#### `EuropaGrid` conversion

```ts
export class EuropaGrid extends EuropaElement {
    private _grid: HTMLDivElement | null = null;

    static override get observedAttributes(): string[] {
        return ['variant'];
    }

    protected override render(): void {
        const shadow = this.ensureShadowRoot();
        if (this._grid === null) {
            this._grid = document.createElement('div');
            const slot = document.createElement('slot');
            this._grid.appendChild(slot);
            shadow.appendChild(this._grid);
        }
        const variant = this.getAttribute('variant');
        this._grid.className = [
            'europa-grid',
            variant === 'sidebar' && 'europa-grid--sidebar',
            variant === 'wrap' && 'europa-grid--wrap',
        ].filter(Boolean).join(' ');
    }
}
```

#### `EuropaBanner` conversion

Same pattern as Grid but with `role`/`aria-live` on the internal div (moved
from host to internal, since the shadow root encapsulates them).

#### `EuropaChip` conversion

The chip has a text node for the count AND projects children:

```ts
protected override render(): void {
    const shadow = this.ensureShadowRoot();
    if (this._span === null) {
        this._span = document.createElement('span');
        this._span.className = 'europa-chip';
        this._countText = document.createTextNode('');
        this._span.appendChild(this._countText);
        const slot = document.createElement('slot');
        this._span.appendChild(slot);
        shadow.appendChild(this._span);
    }
    this._countText.nodeValue = this.getAttribute('count') ?? '';
}
```

#### `EuropaTypography` conversion

The semantic tag changes with variant. With Shadow DOM, the internal semantic
element wraps a `<slot>`:

```ts
protected override render(): void {
    const shadow = this.ensureShadowRoot();
    const variant = this._variant();
    const tag = VARIANT_TAGS[variant];

    if (this._el === null || this._el.tagName.toLowerCase() !== tag) {
        // Clear shadow root children when tag changes
        shadow.innerHTML = '';
        this._el = document.createElement(tag);
        const slot = document.createElement('slot');
        this._el.appendChild(slot);
        shadow.appendChild(this._el);
    }
    this._el.className = `europa-typography europa-typography--${variant}`;
}
```

### 3.3 Complex components

#### `EuropaButton` (form-associated)

**File**: `packages/design/src/components/generic/button.ts`

**Shadow structure**:
```
shadowRoot
  └── <button class="europa-button [modifier]">
        └── <slot></slot>
```

**Special considerations**:

1. **`static formAssociated = true` + `attachInternals()`**: These work
   identically with Shadow DOM. The form association is an HTML spec feature
   independent of DOM mode.

2. **Click event retargeting**: In Light DOM, clicking the internal `<button>`
   bubbles through the host — React's delegated listener catches it. In Shadow
   DOM, click events retarget to the host at the shadow boundary. React 19's
   `onClick` on a custom element attaches a listener on the host; the
   internal button's click retargets to the host at the boundary → React
   catches it. **This works correctly with Shadow DOM.**

3. **MutationObserver**: The existing `_childObserver` watches `this` for
   `childList` changes. With Shadow DOM, React commits children to the host
   (light-DOM children), and the `<slot>` projects them. The MutationObserver
   is no longer needed for reparenting — but it IS still needed for the case
   where React changes button label text (e.g. "Set name" → "Update name").
   With Shadow DOM + `<slot>`, label text changes are projected automatically.
   **The MutationObserver can be removed entirely.**

4. **`_updating` guard**: No longer needed — no reparenting.

5. **`connectedCallback` microtask queue**: The `queueMicrotask` in
   `connectedCallback` was needed because Light DOM reparenting would clear
   children added by React after `connectedCallback`. With Shadow DOM + `<slot>`,
   children are projected by the browser regardless of timing. The microtask
   queue can be simplified to a direct `render()` call (like the base class).

**Conversion sketch**:

```ts
export class EuropaButton extends EuropaElement {
    static formAssociated = true;
    private _button: HTMLButtonElement | null = null;
    private readonly _internals: ElementInternals;
    private readonly _handleClick: (event: Event) => void;

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._handleClick = (): void => {
            if (this.getAttribute('type') === 'submit') {
                this._internals.form?.requestSubmit();
            }
        };
        this.addEventListener('click', this._handleClick);
        // REMOVED: MutationObserver (no longer needed)
        // REMOVED: _updating guard
        // REMOVED: _renderQueued
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._handleClick);
        // REMOVED: _childObserver.disconnect()
    }

    // connectedCallback: use base class default (direct render())
    // REMOVED: microtask queue

    protected override render(): void {
        const shadow = this.ensureShadowRoot();
        if (this._button === null) {
            this._button = document.createElement('button');
            const slot = document.createElement('slot');
            this._button.appendChild(slot);
            shadow.appendChild(this._button);
            // REMOVED: appendChild to this (host)
            // REMOVED: child reparenting loops
        }
        // ... className, disabled, type, aria-label forwarding unchanged
    }
}
```

#### `EuropaModal` (focus trap + named slots)

**File**: `packages/design/src/components/generic/modal.ts`

**Shadow structure**:
```
shadowRoot
  └── div.europa-modal-backdrop
        └── div.europa-modal[role="dialog"]
              ├── h2.europa-modal__title
              ├── div.europa-modal__body
              │     └── <slot></slot>         ← default (body content)
              └── div.europa-modal__actions
                    └── <slot name="actions"></slot>
```

**Special considerations**:

1. **Focus trap (`_trapFocus`)**: Currently uses
   `this._dialog.querySelectorAll(FOCUSABLE_SELECTOR)` which, in Light DOM,
   finds all focusable descendants including reparented children. With Shadow
   DOM, `querySelectorAll` on the dialog does NOT cross the shadow boundary
   to find slotted host children. The fix is to query both the shadow tree
   AND the slotted elements:

   ```ts
   private _trapFocus(e: KeyboardEvent): void {
       const shadowFocusable = Array.from(
           this._dialog!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
       );
       const slottedFocusable = Array.from(
           this._dialog!.querySelectorAll('slot')
       ).flatMap((slot) =>
           slot.assignedElements({ flatten: true })
               .filter((el): el is HTMLElement =>
                   el instanceof HTMLElement &&
                   el.matches(FOCUSABLE_SELECTOR)
               )
       );
       const focusable = [...shadowFocusable, ...slottedFocusable].filter(
           (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0
       );
       // ... rest of trap logic unchanged
   }
   ```

   Alternative (simpler): query `this.shadowRoot!.querySelectorAll(...)` on the
   entire shadow tree, then also include `slot.assignedElements()`. The shadow
   root contains the backdrop/dialog/title/body/actions structure, and the slots
   project host children into the body/actions divs.

2. **Backdrop click handler**: `e.target === this._backdrop` — with Shadow DOM,
   click events inside the shadow retarget to the host, but the event's
   `target` inside the shadow root is the actual element. The backdrop click
   handler listens on `this._backdrop` (inside the shadow), so `e.target` is
   the real clicked element within the shadow. **This works unchanged.**

3. **Escape handler**: Document-level keydown listener — unaffected by Shadow DOM.

4. **`aria-labelledby`**: Points to the title element's ID. With Shadow DOM,
   `aria-labelledby` can reference IDs inside the shadow root (the title `<h2>`
   has `id` set, and `aria-labelledby` on the dialog `<div>` references it).
   Both are in the same shadow tree. **Works unchanged.**

5. **Named slot projection**: `<slot name="actions">` projects children with
   `slot="actions"` attribute. React 19 supports the `slot` prop on custom
   elements. The existing usage `<div slot="actions">` in JSX will project
   correctly. **Works unchanged.**

#### `EuropaWaiting` (no child projection)

**File**: `packages/design/src/components/generic/waiting.ts`

This component does NOT project children — it renders entirely from the
`message` attribute. The conversion is straightforward: create shadow root,
render internal structure, add `<slot>` (unused but harmless) or skip it.

**Shadow structure**:
```
shadowRoot
  └── div.europa-waiting
        ├── div.europa-waiting__plate
        │     ├── div.europa-waiting__pulse[aria-hidden="true"]
        │     └── p.europa-waiting__text
        └── <slot></slot>  ← optional, for future extensibility
```

No special handling needed. The component is purely attribute-driven.

### 3.4 Game primitives (7 components — STAY Light DOM)

| Component | Reason to stay Light DOM |
|-----------|------------------------|
| `EuropaTroopChip` | Leaf primitive, no child projection, applies inline styles |
| `EuropaCityMarker` | Leaf primitive, no child projection, applies inline styles |
| `EuropaPipeSlope` | Leaf primitive, no child projection, applies inline styles |
| `EuropaElevationSwatch` | Leaf primitive, no child projection, applies inline styles |
| `EuropaPlayerBadge` | Leaf primitive, no child projection, applies inline styles |
| `EuropaFogOverlay` | Leaf primitive, no child projection, applies inline styles |
| `EuropaReserveIndicator` | Leaf primitive, no child projection, applies inline styles |

These components render internal `<span>` elements but do NOT reparent host
children. They have no child-projection crash risk. Converting them to Shadow
DOM would add complexity (each would need its own `<style>` for inline token
colors) with no benefit. **Leave as Light DOM.**

The game primitives continue to use `this.appendChild(this._span)` — children
stay on the host, no reparenting. Since they never move host children, React 19
`removeChild` works fine.

---

## 4. Test Migration Strategy

### 4.1 Design package unit tests (happy-dom, node mode)

**Config**: `packages/design/vitest.config.ts` — `environment: 'happy-dom'`

**Affected files** (all under `packages/design/tests/components/generic/`):
- `page.test.ts`, `card.test.ts`, `plate.test.ts`, `stack.test.ts`,
  `container.test.ts`, `badge.test.ts`, `banner.test.ts`, `chip.test.ts`,
  `grid.test.ts`, `typography.test.ts`, `button.test.ts`, `modal.test.ts`,
  `waiting.test.ts`

**What breaks**: Tests use `host.querySelector('.europa-*')` to find internal
wrapper divs. With Shadow DOM, `querySelector` from outside the shadow root
does NOT reach into it.

**Fix pattern**: Replace `host.querySelector(...)` with
`host.shadowRoot!.querySelector(...)`:

```ts
// Before (Light DOM):
const page = host.querySelector('.europa-page');

// After (Shadow DOM):
const page = host.shadowRoot!.querySelector('.europa-page');
```

For slot projection assertions:
```ts
// Before (Light DOM):
expect(page?.contains(child)).toBe(true);

// After (Shadow DOM):
// Children stay on host — assert host contains them
expect(host.contains(child)).toBe(true);
// The slot inside the shadow root projects them visually
const slot = host.shadowRoot!.querySelector('slot');
expect(slot).not.toBeNull();
```

**happy-dom Shadow DOM support**: happy-dom v20+ supports `attachShadow()`,
`shadowRoot`, and `querySelector` on shadow roots. The `mode: 'open'` shadow
root is accessible. Verify during implementation that happy-dom handles:
- `attachShadow({ mode: 'open' })` ✓
- `shadowRoot.querySelector()` ✓
- `<slot>` elements (may be inert in happy-dom — but structural assertions
  only need `shadowRoot.querySelector('slot')`, not actual projection)
- `adoptedStyleSheets` (may not be implemented — tests don't need to verify
  CSS application, just DOM structure)

### 4.2 Conformance test

**File**: `packages/design/tests/components/conformance.test.ts`

**What breaks**: The `selector` field in scenarios (e.g.
`selector: '.europa-modal-backdrop'`) uses `host.querySelector(selector)`.
With Shadow DOM, these selectors won't reach into shadow roots.

**Fix**: Change the scenario runner to query through the shadow root:

```ts
// Before:
const el = host.querySelector(selector);

// After:
const el = host.shadowRoot!.querySelector(selector);
```

For scenarios with no explicit `selector` (default `':scope > *'`), the
default needs adjustment — with Shadow DOM, `:scope > *` on the host yields
nothing (the shadow root's children are not host children). Change to:

```ts
const selector = scenario.selector ?? ':scope > *';
const el = scenario.selector !== undefined
    ? host.shadowRoot!.querySelector(selector)
    : host.shadowRoot!.children[0]; // first child of shadow root
```

Or unify: always query through `host.shadowRoot!` for generic components, and
through `host` for game primitives (which stay Light DOM).

**Game primitive scenarios** remain unchanged — they query internal elements
via `host.querySelector(...)` which works because game primitives are Light DOM.

### 4.3 Modal integration test (browser mode)

**File**: `packages/design/tests/components/modal.integration.test.ts`

**What breaks**: `getDialogFocusables()` uses
`modal.querySelector('div[role="dialog"]')` then `dialog.querySelectorAll(FOCUSABLE_SELECTOR)`.

**Fix**: Query through shadow root, and include slotted elements:

```ts
function getDialogFocusables(modal: EuropaModal): HTMLElement[] {
    const dialog = modal.shadowRoot!.querySelector<HTMLElement>('div[role="dialog"]');
    if (dialog === null) return [];
    // Shadow tree focusables
    const shadowFocusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    // Slotted focusables (host children projected into slots)
    const slottedFocusable = Array.from(
        modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    return [...shadowFocusable, ...slottedFocusable];
}
```

The `body.appendChild(btn)` calls in `createOpenModal` append buttons to the
modal's `div.europa-modal__body` — with Shadow DOM, this is inside the shadow
root. Verify that appending to a shadow-root element works in real Chromium
(it does — shadow root elements are normal DOM nodes).

The backdrop click test (`backdrop?.click()`) queries through shadow root:
```ts
const backdrop = modal.shadowRoot!.querySelector<HTMLElement>('div.europa-modal-backdrop');
```

### 4.4 Console axe-core a11y tests

**File**: `packages/console/tests/setup-a11y-dom.ts`

**What breaks**: `axe.run(context, { runOnly: ... })` does NOT traverse open
shadow roots by default. Components inside shadow DOM will be invisible to axe.

**Fix**: Add `includeShadowDom: true` to the axe options:

```ts
const results = await axe.run(context, {
    runOnly: { type: 'tag', values: [...AXE_TAGS] },
    resultTypes: ['violations'],
    // Traverse open shadow roots
    includeShadowDom: true,
});
```

axe-core has supported `includeShadowDom` since v4.4. Verify the installed
version supports it.

### 4.5 Console component tests that query web component internals

**Files**:
- `packages/console/tests/component/ui/waiting-overlay.test.tsx` — queries
  `europa-waiting` internals
- `packages/console/tests/component/ui/profile-view.test.tsx` — queries
  `europa-page`, `europa-card`, etc.

**Fix**: Update selectors to traverse shadow roots where needed. For
React-rendered tests that check props/attributes on the custom element tag,
no changes are needed — only tests that reach INTO the shadow root need
updates.

---

## 5. Console Consumer Changes

### 5.1 `profile-view.tsx` — band-aid revert

**File**: `packages/console/src/ui/profile-view.tsx`

After Shadow DOM conversion, the restoring state (lines 120–152) can be
restored to use web components:

```tsx
// Restore to web components (remove the div className workaround):
if (identityStatus === 'restoring') {
    return (
        <europa-page>
            <europa-stack>
                <h1 ref={headingRef} id={headingId} tabIndex={-1}>
                    <europa-typography variant="heading">Profile</europa-typography>
                </h1>
                {/* ... connection status, card, etc. using web components */}
            </europa-stack>
        </europa-page>
    );
}
```

### 5.2 Other console consumers (no changes needed)

These files use web component tags in JSX but do NOT query their internals:

- `lobby-landing.tsx` — uses `<europa-banner variant="alert">` (lines 183, 193)
- `lobby-create-form.tsx` — uses `<europa-button type="submit">` (line 292)
- `lobby-match-list.tsx` — uses `<europa-button>` (lines 99, 116)
- `waiting-overlay.tsx` — uses `<europa-waiting message={headline}>` (line 162)

These all work unchanged — React 19 handles custom elements natively, and
Shadow DOM is transparent to JSX consumers. The `onClick` handlers on
`<europa-button>` work because click events retarget to the host at the
shadow boundary (React's delegated listener catches them on the host).

### 5.3 Files that use plain CSS classes (not web components)

These files use `europa-*` CSS class names directly, NOT web component tags.
They are unaffected by this change:

- `App.tsx` / `SurrenderModal.tsx` — uses `europa-modal-*` classes
- `ErrorBoundary.tsx` — uses `europa-lobby` classes
- `grid-overlay.tsx` / `cell-view.tsx` — uses canvas/HUD classes
- `lobby-runtime.tsx` — uses `europa-waiting__plate` / `europa-waiting__text`
  classes directly (the PreStartPlate and SpectatorPlate components)

---

## 6. Band-Aid Revert Plan

### Step 1: Complete Shadow DOM conversion

Implement all 13 generic component conversions (Wave 1–2 below).

### Step 2: Update ProfileView restoring state

In `packages/console/src/ui/profile-view.tsx`, replace the plain-div
restoring state (lines 120–152) with web component usage matching the
named/unnamed states.

### Step 3: Verify

Run the full console test suite (component + E2E + a11y) to confirm the
restoring state renders correctly through web components with no crash.

### Step 4: Update commit `b8572f0` reference

The AGENTS.md "Current state" section references this commit. Update to note
the revert.

---

## 7. `usePathname` / `patchHistoryForPathChanges` Assessment

### Current implementation

**File**: `packages/console/src/internal/lobby-runtime.tsx`

`patchHistoryForPathChanges()` (lines 84–95) monkey-patches
`history.pushState` and `history.replaceState` to dispatch a custom
`europa:pathchange` event. `usePathname()` (lines 66–81) subscribes to this
event via `useSyncExternalStore`, returning `window.location.pathname`.

### Assessment: CLEAN — no cruft

This is a well-implemented, minimal solution for a real problem: React's
`useSyncExternalStore` needs a notification when the URL changes via
`pushState`/`replaceState` (which do NOT fire `popstate`). The alternatives
are worse:

- **React Router / TanStack Router**: heavy dependencies for a 3-route SPA
  that already has a custom routing adapter (`route.ts`, `route-adapter.ts`).
- **`setInterval` polling**: wasteful and imprecise.
- **`popstate` only**: misses programmatic navigation.

The monkey-patch is:
- Idempotent (runs once via `useEffect([], [])`)
- Non-destructive (calls the original via `.bind()`)
- Documented (JSDoc + inline comments)
- Scoped (custom event name `europa:pathchange`)

**Recommendation**: Keep as-is. No cleanup needed.

---

## 8. Wave / Task Breakdown

### Wave 0: Foundation (must complete before any component conversion)

- [ ] **T-001**: Extend `build-css.ts` to emit `src/styles/catalog-styles.ts`
  — a TS module exporting `CATALOG_STYLESHEET: CSSStyleSheet` constructed
  from the catalog CSS text (`:root` block excluded). Run `pnpm build` to
  verify the module is emitted and the existing `dist/design.css` is unchanged.

- [ ] **T-002**: Update `base.ts` — add `ensureShadowRoot()` method that
  creates an open shadow root with `adoptedStyleSheets = [CATALOG_STYLESHEET]`.
  Update JSDoc to describe the new Shadow DOM architecture. Keep
  `setClasses()` and `setAttributeIf()` unchanged (they still work —
  `setClasses` sets `class` on the host, which is valid for external styling).

- [ ] **T-003**: Update `packages/design/vitest.config.ts` if needed — verify
  happy-dom supports `attachShadow({ mode: 'open' })` and
  `shadowRoot.querySelector()`. If not, add a polyfill in
  `tests/setup-element-internals.ts`.

### Wave 1: Simple layout wrappers [parallel-safe]

All 6 components follow the identical conversion pattern. Each is independent.

- [ ] **T-004** [P]: Convert `EuropaPage` — shadow root + `<div.europa-page>` + `<slot>`. Update `page.test.ts` to query through `shadowRoot`.
- [ ] **T-005** [P]: Convert `EuropaCard` — shadow root + `<div.europa-card>` + `<slot>`. Update `card.test.ts`.
- [ ] **T-006** [P]: Convert `EuropaPlate` — shadow root + `<div.europa-plate>` + `<slot>`. Update `plate.test.ts`.
- [ ] **T-007** [P]: Convert `EuropaStack` — shadow root + `<div.europa-stack>` + `<slot>`. Update `stack.test.ts`.
- [ ] **T-008** [P]: Convert `EuropaContainer` — shadow root + `<div.europa-container>` + `<slot>`. Update `container.test.ts`.
- [ ] **T-009** [P]: Convert `EuropaBadge` — shadow root + `<span.europa-badge>` + `<slot>`. Update `badge.test.ts`.

### Wave 2: Attribute-driven wrappers [parallel-safe, after Wave 0]

- [ ] **T-010** [P]: Convert `EuropaGrid` — shadow root + variant-driven classes on internal div + `<slot>`. Update `grid.test.ts`.
- [ ] **T-011** [P]: Convert `EuropaBanner` — shadow root + variant-driven `role`/`aria-live` on internal div + `<slot>`. Update `banner.test.ts`.
- [ ] **T-012** [P]: Convert `EuropaChip` — shadow root + `<span.europa-chip>` with count text node + `<slot>`. Update `chip.test.ts`.
- [ ] **T-013** [P]: Convert `EuropaTypography` — shadow root + tag-switching semantic element + `<slot>`. Update `typography.test.ts`.
- [ ] **T-014** [P]: Convert `EuropaWaiting` — shadow root + internal plate/pulse/text structure (no child projection). Update `waiting.test.ts`.

### Wave 3: Complex components (serial — each has unique concerns)

- [ ] **T-015**: Convert `EuropaButton` — shadow root + `<button>` + `<slot>`. Remove MutationObserver, `_updating` guard, `_renderQueued`, microtask queue. Keep `formAssociated` + `attachInternals()`. Verify click event retargeting. Update `button.test.ts`.

- [ ] **T-016**: Convert `EuropaModal` — shadow root + backdrop/dialog/title/body/actions + default `<slot>` + named `<slot name="actions">`. Update `_trapFocus` to query shadow root + `slot.assignedElements()`. Update `modal.test.ts` and `modal.integration.test.ts`.

### Wave 4: Test infrastructure + conformance

- [ ] **T-017**: Update `conformance.test.ts` — query through `host.shadowRoot!` for generic components, through `host` for game primitives. Adjust default selector from `':scope > *'` to `shadowRoot.children[0]`.

- [ ] **T-018**: Update `setup-a11y-dom.ts` — add `includeShadowDom: true` to `axe.run()` options.

- [ ] **T-019**: Update console component tests that query web component internals:
  - `tests/component/ui/waiting-overlay.test.tsx`
  - `tests/component/ui/profile-view.test.tsx`

### Wave 5: Console consumer cleanup

- [ ] **T-020**: Revert ProfileView restoring state band-aid — replace plain `<div className="europa-*">` with `<europa-page>`, `<europa-stack>`, `<europa-card>` web components.

- [ ] **T-021**: Extract shared `setHandleViaProfile` helper from E2E specs into `tests/e2e/helpers/profile.ts`. Update imports in `lobby.spec.ts` and `routing.spec.ts`.

### Wave 6: Spec & documentation updates

- [ ] **T-022**: Amend spec 014 — update FR-009 to permit Shadow DOM for generic components; update `contracts/web-components.contract.md` § 8 out-of-scope list; update `spec.md` Shadow DOM references; add Clarifications entry documenting the decision change.

- [ ] **T-023**: Update `DESIGN.md` — update the Shadow DOM / Light DOM contract section; document which components use Shadow DOM vs Light DOM.

- [ ] **T-024**: Update `AGENTS.md` — replace "Light DOM child projection" environment note with the new Shadow DOM pattern; update any other Light DOM references.

### Wave 7: Final verification

- [ ] **T-025**: Run full verification suite — `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, all package tests, browser-mode tests, E2E tests, coverage gates. Verify ≥80% coverage on every metric for design package.

- [ ] **T-026**: Live smoke test — `pnpm host` → verify two-seat match works end-to-end through the real wire (lobby → profile → match → board rendering → orders). Verify no `removeChild` errors in console.

---

## 9. Risks & Open Questions

### 9.1 happy-dom Shadow DOM support

**Risk**: happy-dom v20 may not fully implement `<slot>` projection or
`adoptedStyleSheets`. If `<slot>` elements are inert (project no content),
slot-projection tests will fail.

**Mitigation**: The conformance and unit tests assert DOM structure (class
names, attributes, slot element presence), NOT visual projection. If
`<slot>` is inert, the structural assertions still pass. Visual projection
is covered by the browser-mode integration tests and the E2E smoke test.

**Action**: During T-003, verify happy-dom behavior with a quick spike:
create a shadow root with a `<slot>`, append a child to the host, check
if `slot.assignedNodes()` returns the child.

### 9.2 React 19 click event retargeting

**Risk**: React 19's event delegation may not correctly catch click events
that retarget at the shadow boundary from internal `<button>` elements.

**Mitigation**: React 19 has native custom element support and handles
shadow DOM event retargeting. The `onClick` prop attaches a listener on the
host element; the internal button's click event retargets to the host at the
boundary → React's listener fires. This is documented behavior.

**Action**: Verify during T-015 with a focused browser-mode test:
`<europa-button onClick={fn}>` → click the internal `<button>` → assert `fn`
was called.

### 9.3 CSS custom property inheritance into shadow roots

**Risk**: CSS custom properties (e.g. `--europa-color-surface`) defined on
`:root` in the global `design.css` might not inherit into shadow roots.

**Mitigation**: CSS custom properties DO inherit through shadow boundaries
per the CSS spec (custom properties are inherited properties). The `:root`
block in the global stylesheet defines them on `<html>`, and they cascade
into every shadow root on the page. This is standard behavior, tested in
all modern browsers.

### 9.4 Modal focus trap with slotted content

**Risk**: The modal's focus trap must find focusable elements inside slotted
host children, not just inside the shadow tree. If the query misses slotted
elements, Tab could escape the modal.

**Mitigation**: The `_trapFocus` rewrite (§ 3.3, EuropaModal) explicitly
queries both shadow-tree elements AND `slot.assignedElements()`. The browser
integration test (`modal.integration.test.ts`) verifies the trap in real
Chromium.

### 9.5 Bundle size impact

**Risk**: Adding Shadow DOM code (shadow root creation, adoptedStyleSheets)
increases the component bundle.

**Mitigation**: The overhead is minimal — one `attachShadow()` call per
component instance, one `CSSStyleSheet` object shared globally. The catalog
CSS module is a string literal that gets tree-shaken if unused. The existing
bundle budget (15 KB gzip for `dist/components.js`) has ample headroom
(the Light DOM components are ~3.5 KB total).

### 9.6 Form association with Shadow DOM

**Risk**: `static formAssociated = true` + `attachInternals()` might behave
differently with Shadow DOM (e.g. the native `<button>` inside the shadow
might not participate in form submission).

**Mitigation**: Form association is an HTML spec feature that operates on
the host element, not on internal DOM. The `attachInternals()` call is on
the host (`this`). The `form.requestSubmit()` call in the click handler
uses `this._internals.form` which resolves to the ancestor `<form>` via
the host's DOM position. This is independent of Shadow DOM.

**Action**: Add a focused form-submission test in T-015:
`<form>` → `<europa-button type="submit">` → click → assert form's
`submit` event fires.

---

## Appendix A: Component Conversion Checklist

For each generic component, the conversion must verify:

- [ ] Shadow root created with `mode: 'open'`
- [ ] `adoptedStyleSheets` set to shared catalog sheet
- [ ] Internal structure renders inside shadow root (not host)
- [ ] `<slot>` element projects host children
- [ ] No `appendChild` to host element (only to shadow root children)
- [ ] No reparenting loops (`Array.from(this.childNodes)` removed)
- [ ] Unit tests query through `host.shadowRoot!`
- [ ] Class-name assertions pass
- [ ] Attribute forwarding passes
- [ ] Event dispatch (if any) works

## Appendix B: Files Changed Per Wave

| Wave | Files changed |
|------|--------------|
| 0 | `scripts/build-css.ts`, `src/styles/catalog-styles.ts` (new), `src/components/base.ts`, `tests/setup-element-internals.ts` (maybe), `vitest.config.ts` (maybe) |
| 1 | 6 component files + 6 test files |
| 2 | 5 component files + 5 test files |
| 3 | 2 component files + 2 test files + `modal.integration.test.ts` |
| 4 | `conformance.test.ts`, `setup-a11y-dom.ts`, 2 console test files |
| 5 | `profile-view.tsx`, `tests/e2e/helpers/profile.ts` (new), `lobby.spec.ts`, `routing.spec.ts` |
| 6 | `specs/014-*/spec.md`, `specs/014-*/contracts/web-components.contract.md`, `DESIGN.md`, `AGENTS.md` |
| 7 | (no file changes — verification only) |
