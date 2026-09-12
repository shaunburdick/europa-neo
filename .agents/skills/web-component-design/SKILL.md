---
name: web-component-design
description: Design, build, test, and integrate standards-based custom elements and framework-agnostic Web Components. Covers lifecycle timing, Light DOM and Shadow DOM composition, accessibility, form submission with ElementInternals, registration, SSR boundaries, CSS integration, React interoperability, Vitest/Playwright testing, and package design. Use when asked to "build a web component", "create a custom element", "design a framework-agnostic component", "use Shadow DOM", "use Light DOM", "integrate with React/Vue/Svelte", "submit a form from a custom element", or any work involving `customElements.define`, `HTMLElement`, slots, `attachShadow`, or `attachInternals`.
license: MIT
metadata:
  author: shaunburdick
  version: "1.1.0"
---

# Web Component Design

Build standards-based, framework-agnostic Web Components that behave correctly in plain HTML, React, Vue, server-rendered applications, test environments, and browser automation.

## Core Principles

1. **Use platform standards first**
   - Extend `HTMLElement`.
   - Use `customElements.define()`.
   - Use native HTML controls whenever possible.
   - Keep components independent of React, Vue, and Svelte.

2. **Make registration explicit**
   - Do not register components as an import side effect.
   - Export an idempotent `register()` function.
   - Guard duplicate registration with `customElements.get()`.
   - Export individual constructors for selective registration and testing.

   ```ts
   export function register(): void {
       if (typeof customElements === 'undefined') {
           return;
       }

       for (const { tag, ctor } of REGISTRY) {
           if (customElements.get(tag) === undefined) {
               customElements.define(tag, ctor);
           }
       }
   }
   ```

3. **Separate browser-only and server-safe entry points**
   - An SSR-safe `register()` does not make component imports safe in a DOM-less runtime.
   - `class Example extends HTMLElement` can throw when `HTMLElement` is unavailable.
   - If SSR imports are required, provide a browser-only subpath or dynamically import components on the client.
   - Test the actual package entry in a DOM-less environment.

4. **Keep package exports deliberate**
   - Preserve existing exports.
   - Use a dedicated subpath such as `@example/design/components`.
   - Import CSS separately from component JavaScript.
   - Keep the component bundle independently measurable.
   - Avoid unnecessary runtime dependencies.

## Component Architecture

### Base class

A small base class may centralize lifecycle and DOM helpers:

```ts
export abstract class ExampleElement extends HTMLElement {
    static get observedAttributes(): string[] {
        return [];
    }

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(
        _name: string,
        _oldValue: string | null,
        _newValue: string | null,
    ): void {
        this.render();
    }

    protected abstract render(): void;
}
```

Guidelines:

- Make `render()` idempotent.
- Cache internal nodes instead of rebuilding the tree on every attribute change.
- Add `override` when overriding members declared by the immediate base class.
- Do not add `override` to methods only inherited from `HTMLElement` unless the base class declares them.
- Handle nullable DOM references and `noUncheckedIndexedAccess` explicitly.
- Prefer normal guards over non-null assertions.

### Attributes

- Define `observedAttributes` narrowly.
- Normalize malformed values to documented defaults.
- Treat boolean attributes explicitly.
- Reflect only attributes in the public contract.
- Update existing DOM nodes when attributes change.
- Avoid render loops caused by changing observed attributes during `render()`.

## Light DOM and Shadow DOM

Choose the composition model intentionally.

### Shadow DOM

Shadow DOM provides real slot projection and style encapsulation. Use it when encapsulation and native slot behavior matter.

```ts
const root = this.attachShadow({ mode: 'open' });
root.innerHTML = '<button class="example-button"><slot></slot></button>';
```

### Light DOM

Light DOM keeps internal markup visible and allows existing global CSS to apply directly. Use it when catalog classes must style internal elements or consumers need direct markup access.

#### Critical Light DOM rule

`<slot>` only projects nodes inside a shadow root. A `<slot>` in Light DOM is inert:

```ts
const wrapper = document.createElement('div');
wrapper.append(document.createElement('slot'));
this.append(wrapper);
```

The host's children remain siblings of `wrapper`.

If Light DOM requires children inside an internal native element, explicitly reparent them:

```ts
const children = Array.from(this.childNodes);

for (const child of children) {
    if (child !== this._button) {
        this._button.appendChild(child);
    }
}
```

Important:

- Snapshot `childNodes` before moving nodes.
- Run reparenting after the wrapper exists.
- Re-run it when framework children may arrive after `connectedCallback`.
- Exclude internal nodes from the move.
- Route named content explicitly, for example with `slot="actions"`.
- Document that the component takes ownership of Light DOM children.
- Test updates, removals, unmounts, reconnects, and framework reconciliation.
- Be cautious: moving nodes can conflict with framework DOM ownership.

When framework-owned children must remain untouched, prefer Shadow DOM or a framework-rendered native element.

## React and Framework Interoperability

### React 19 timing

React 19 can commit custom-element attributes and `connectedCallback()` before it finishes committing Light DOM children. A synchronous render may create a wrapper, move or replace children, and then have React commit children afterward.

For components that consume framework-provided children, defer initial rendering:

```ts
private _renderQueued = false;

override connectedCallback(): void {
    if (this._renderQueued) {
        return;
    }

    this._renderQueued = true;
    queueMicrotask(() => {
        this._renderQueued = false;

        if (this.isConnected) {
            this.render();
        }
    });
}

override attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
): void {
    if (oldValue !== newValue && this._button !== null) {
        this.render();
    }
}
```

Test:

- Mount with children.
- Change, add, and remove children.
- Change attributes before and after initialization.
- Unmount, disconnect, and reconnect.
- Verify event propagation, form submission, and disabled behavior.

Do not assume static HTML tests prove React interoperability.

## Accessibility

### Prefer native semantics

A custom element has no implicit native semantics merely because its name suggests them. Prefer a real native control inside the component; let it own role, keyboard behavior, focus, disabled state, form behavior, and accessible name.

Do not add `role="button"` to the host solely to make a test pass unless the host itself is intentionally the interactive control and fully implements keyboard and focus behavior.

### Modal requirements

A dialog should include:

- `role="dialog"`.
- `aria-modal="true"`.
- `aria-labelledby` referencing a visible title.
- `tabindex="-1"` on the dialog container when it must receive focus.
- Focus moved into the dialog on open.
- Focus restored on close.
- Escape handling.
- Backdrop handling that ignores clicks inside dialog content.
- Tab and Shift+Tab trapping.
- Cleanup of document listeners in `disconnectedCallback()`.

### Live regions and decorative visuals

Use `role="status"`/`aria-live="polite"` for ordinary status and `role="alert"`/`aria-live="assertive"` for urgent alerts.

Decorative visuals should use `aria-hidden="true"`. Informative primitives should have a meaningful accessible name, commonly with `role="img"` and `aria-label`.

Never rely on color alone to communicate state; add text, shape, labels, or other redundant encoding.

## Form Integration and ElementInternals

### The submit button problem

Browsers only recognize **native** `<button>`, `<input type="submit">`, and `<input type="image">` as form submit buttons. A custom element like `<my-button type="submit">` inside a `<form>` will **not** trigger form submission when clicked — the form's `submit` event never fires, `onSubmit` handlers are never called, and `requestSubmit()` is never invoked.

This is a silent failure: the element renders correctly, but clicking it does nothing inside a form context.

### The fix: ElementInternals API

Use the standards-based `ElementInternals` API to make custom elements participate in form submission:

```ts
class MyButton extends HTMLElement {
    static formAssociated = true;

    private _internals: ElementInternals;

    constructor() {
        super();
        this._internals = this.attachInternals();

        this.addEventListener('click', this._handleClick);
    }

    _handleClick = () => {
        if (this.getAttribute('type') === 'submit' && this._internals.form) {
            // Use requestSubmit(), NOT form.submit()
            // requestSubmit() fires the 'submit' event and respects validation
            // form.submit() bypasses validation and the submit event
            this._internals.form.requestSubmit();
        }
    };

    disconnectedCallback() {
        this.removeEventListener('click', this._handleClick);
    }
}

customElements.define('my-button', MyButton);
```

### Key rules

1. **`static formAssociated = true`** must be on the class passed to `customElements.define()` — not on a parent class.
2. **`this.attachInternals()`** can only be called **once** per element instance — must be in the constructor.
3. **Use `form.requestSubmit()`** not `form.submit()` — `requestSubmit()` fires the `submit` event, triggers constraint validation, and respects `novalidate`; `form.submit()` bypasses all of that.
4. **Click listener on the host** — for Light DOM components, the click on the internal `<button>` bubbles up to the host naturally.
5. **Clean up** in `disconnectedCallback` to prevent leaks on element reuse.

### When to apply

Any custom element that replaces a native `<button type="submit">`, `<input type="submit">`, or `<input type="image">` inside a `<form>` **must** use ElementInternals. Without it, form submission is silently broken.

Elements with `type="button"` (non-submit) that use `onClick` handlers are **not affected** — they don't participate in form submission.

### Browser support

- Chrome 87+ (Nov 2020)
- Firefox 97+ (Feb 2022)
- Safari 16.4+ (Mar 2023)

Covers all browsers supporting ES2022 modules.

### Testing gap: happy-dom

happy-dom (used by Vitest) does **not** implement `attachInternals()`. Tests will throw `TypeError: this.attachInternals is not a function`. Add a polyfill:

```ts
// tests/setup-element-internals.ts
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.attachInternals) {
    HTMLElement.prototype.attachInternals = function (this: Element) {
        const host = this;
        const internals = {
            form: null,
            labels: [],
            validity: { valid: true, valueMissing: false },
            setFormValue: () => {},
            setValidity: () => {},
            checkValidity: () => true,
            reportValidity: () => true,
        };

        // Make `form` a dynamic getter so it resolves at read time
        Object.defineProperty(internals, 'form', {
            get() {
                return host.closest('form');
            },
        });

        return internals as unknown as ElementInternals;
    };
}
```

## CSS and Visual Integration

- Apply catalog classes to the element actually styled, not only the custom-element host.
- Empty inline elements collapse to zero dimensions. Visual primitives need explicit `display`, width, and height.
- CSS triangles require color on the visible border; a color on a zero-width border is invisible.
- Reuse canonical tokens. Do not duplicate hex literals or create unnecessary token variables.
- Keep shared structural styling separate from application-specific positioning, z-index, and fullscreen overlays.
- For reduced motion, use `animation: none`, not an extremely fast animation.

## Registration and Test Isolation

Custom-element registries are global within a document and generally cannot be reset between tests.

```ts
beforeAll(() => {
    if (customElements.get('example-button') === undefined) {
        customElements.define('example-button', ExampleButton);
    }
});
```

Best practices:

- Register once per browser context when possible.
- Keep registration idempotent.
- Do not rely on test order.
- Test that importing a module does not auto-register.
- Test repeated `register()` calls.
- Verify registration in the actual browser context.

### Vitest Browser Mode

Verify setup behavior in the repository's exact Vitest version and configuration; do not assume Node and browser setup execute in the same context.

- Keep browser setup files browser-safe.
- Do not import Node-only Playwright wrappers, filesystem APIs, or Node built-ins into browser setup.
- Split DOM-only a11y helpers from Node/Playwright helpers.
- If setup timing is unreliable, use a browser-side registration import in each affected test entry.
- Prefer one documented registration strategy after confirming it works.
- Add a smoke test proving registration precedes framework rendering.
- Clear Vite/Vitest caches when diagnosing stale module graphs.

## Testing Strategy

Test component logic and integration boundaries, not library behavior.

### Unit tests

Use `happy-dom` or `jsdom` for rendered structure, classes, attributes, defaults, updates, native forwarding, labels, events, idempotence, fallbacks, and token-derived styles.

If rendering is deferred, flush the lifecycle explicitly:

```ts
await new Promise<void>((resolve) => queueMicrotask(resolve));
```

Do not assert synchronously against intentionally deferred rendering.

### Browser integration tests

Use real Chromium for focus movement, focus trapping/restoration, keyboard behavior, native forms, CSS layout, accessibility-tree behavior, and framework/custom-element integration.

### Locators

Prefer accessible locators when they accurately represent the user-facing control:

```ts
page.getByRole('button', { name: 'Save' });
```

Some browser automation integrations do not traverse custom-element boundaries when building the accessibility tree. First verify the internal native control is rendered. Then use a DOM boundary locator for implementation-level assertions:

```ts
const button = container.querySelector('example-button button');
expect(button).not.toBeNull();
await expect.element(button).toBeVisible();
await expect.element(button).toBeEnabled();
```

Do not weaken `toBeVisible()` or `toBeEnabled()` into `toBeDefined()` merely to make a test pass.

### React integration tests

For child-consuming components, add real framework tests covering mount, child updates, add/remove, events, disabled state, unmount, reconnect, and attribute updates.

### Conformance tests

Use a table-driven suite covering every registered tag. Verify registry membership, explicit registration, catalog classes, attributes, accessibility obligations, token-derived styles, and no duplicate nodes after rerender.

Keep conformance tests aligned with the rendering architecture. For Light DOM manual reparenting, test containment rather than inert slot presence.

## Package and Build Design

Typical layout:

```text
src/
    components/
        base.ts
        registry.ts
        register.ts
        index.ts
        generic/
        game/
    styles/
        catalog.css
    index.ts
```

Recommended package checks:

- TypeScript strict mode.
- Lint and formatting.
- Unit and browser integration tests.
- Accessibility checks.
- Bundle-size budget.
- CSS vendor identity/drift checks.
- Registry/documentation parity.
- No duplicated design-token literals.
- No accidental auto-registration.
- Fresh-install or clean-clone verification.

## Documentation

Document every custom element's tag, attributes/defaults, boolean semantics, child behavior, events, focus behavior, accessibility obligations, styling requirements, registration instructions, framework caveats, and SSR restrictions.

Maintain a machine-checkable catalog guard ensuring every registered tag has documentation.

## Debugging Checklist

When a component appears empty or invisible:

1. Is it registered in the actual browser context?
2. Did `connectedCallback()` run?
3. Did a framework append children after the callback?
4. Is a Light DOM `<slot>` incorrectly expected to project content?
5. Did rerender remove or relocate framework-owned nodes?
6. Is the internal styled wrapper empty?
7. Is the element inline with zero intrinsic size?
8. Are styles and token variables loaded?
9. Did positioning move it outside the visible frame?
10. Is a CSS triangle color on a zero-width border?
11. Does browser setup import a Node-only dependency?
12. Is the test querying the host instead of the internal native control?
13. Is a stale Vite/Vitest cache preserving an old module graph?
14. Does the test await the component's actual render lifecycle?

Inspect the rendered DOM directly before changing selectors or production behavior.

## Research Guidance

When making decisions about Web Components, consult current authoritative documentation first:

- MDN Web Components and Custom Elements: https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- WHATWG HTML Custom Elements: https://html.spec.whatwg.org/dev/custom-elements.html
- React custom HTML elements: https://react.dev/reference/react-dom/components#custom-html-elements
- Playwright locators: https://playwright.dev/docs/locators
- Vitest Browser Mode: https://vitest.dev/guide/browser/

Record the relevant source and version when behavior depends on a framework, browser, test runner, or bundler.
