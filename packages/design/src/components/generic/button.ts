import { EuropaElement } from '../base.js';

/**
 * `<europa-button>` — a button web component wrapping a native `<button>`
 * element with the shared `europa-*` CSS class catalog.
 *
 * Uses **Shadow DOM**: a native `<button class="europa-button …">` is
 * rendered inside an open shadow root (styled by the shared catalog
 * stylesheet adopted by {@link EuropaElement.ensureShadowRoot}), with a
 * `<slot>` element projecting the host's light-DOM children (label text,
 * icons) into the button. Host children are *projected*, never reparented,
 * so consumer DOM references stay valid.
 *
 * Renders a native `<button>` (FR-013) for full keyboard, focus, and form
 * participation. Applies `europa-button` + variant/size modifier classes
 * to the internal button element. Boolean attributes (`disabled`) and
 * passthrough attributes (`type`, `aria-label`) are forwarded to the
 * internal `<button>`.
 *
 * **Form association**: This element declares `static formAssociated = true`
 * and uses `ElementInternals` so that `<europa-button type="submit">` inside
 * a `<form>` triggers native form submission via `form.requestSubmit()`.
 * Form association operates on the host element and is independent of DOM
 * mode. The click handler is attached to the host element; clicks on the
 * internal button are composed and bubble across the shadow boundary to the
 * host, delegating to the associated form when `type="submit"`. (The
 * internal button itself has no form owner — its shadow tree contains no
 * `<form>` ancestor — so `requestSubmit()` is the only submission path and
 * there is no double-submission risk.)
 *
 * **Attributes**:
 * - `variant` — maps to `europa-button--<variant>` modifier class.
 * - `size` — maps to `europa-button--<size>` modifier class.
 * - `disabled` (boolean) — forwarded to the native button's `disabled`.
 * - `type` — forwarded to the native button's `type` (default `button`);
 *   `submit` also triggers form submission via ElementInternals.
 * - `aria-label` — forwarded to the native button.
 *
 * **Slots**: default — projects inside the native `<button>`.
 *
 * @example
 * ```html
 * <europa-button variant="primary">Deploy</europa-button>
 * <europa-button size="sm" disabled>Disabled</europa-button>
 * <europa-button type="submit" aria-label="Save changes">Save</europa-button>
 * ```
 */
export class EuropaButton extends EuropaElement {
    /**
     * Opt-in to the form-associated custom element API so that
     * `<europa-button type="submit">` participates in native form
     * submission (FR-013, ElementInternals).
     *
     * @see https://html.spec.whatwg.org/multipage/custom-elements.html#form-associated-custom-elements
     */
    static formAssociated = true;

    /** Reference to the internal native `<button>` inside the shadow root. */
    private _button: HTMLButtonElement | null = null;

    /** ElementInternals handle for form association. */
    private readonly _internals: ElementInternals;

    /**
     * Bound click handler reference so it can be added on construction
     * and removed on disconnection. Attached to the **host** element:
     * clicks on the internal (shadow) button are composed and bubble
     * across the shadow boundary to the host, so both real user clicks
     * on the button and programmatic `host.click()` trigger submission.
     */
    private readonly _handleClick: (event: Event) => void;

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._handleClick = (): void => {
            if (this.getAttribute('type') === 'submit') {
                const form = this._internals.form;
                if (form !== null) {
                    form.requestSubmit();
                }
            }
        };
        this.addEventListener('click', this._handleClick);
    }

    /**
     * Remove the host click listener when the element leaves the document.
     */
    disconnectedCallback(): void {
        this.removeEventListener('click', this._handleClick);
    }

    /**
     * The attributes this component observes. Changes trigger a re-render
     * via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['variant', 'size', 'disabled', 'type', 'aria-label'];
    }

    /**
     * Update the internal native button when host attributes change.
     *
     * No-op attribute writes (`oldValue === newValue`) skip the re-render.
     */
    override attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    /**
     * Create (once) or update the internal `<button>` element inside the
     * shadow root.
     *
     * Idempotent: on first call an open shadow root is created (via
     * {@link EuropaElement.ensureShadowRoot}) containing a native
     * `<button class="europa-button">` with a `<slot>` that projects the
     * host's light-DOM children. On subsequent calls only classes and
     * forwarded attributes are refreshed.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._button === null) {
            const button = document.createElement('button');
            button.appendChild(document.createElement('slot'));
            shadow.appendChild(button);
            this._button = button;
        }

        const variant = this.getAttribute('variant');
        const size = this.getAttribute('size');

        this._button.className = [
            'europa-button',
            variant && `europa-button--${variant}`,
            size && `europa-button--${size}`,
        ]
            .filter(Boolean)
            .join(' ');

        this.setAttributeIf(this._button, 'disabled', this.hasAttribute('disabled'));

        this._button.setAttribute('type', this.getAttribute('type') ?? 'button');

        const ariaLabel = this.getAttribute('aria-label');
        if (ariaLabel !== null) {
            this._button.setAttribute('aria-label', ariaLabel);
        } else {
            this._button.removeAttribute('aria-label');
        }
    }
}
