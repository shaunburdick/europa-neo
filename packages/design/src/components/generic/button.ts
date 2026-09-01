import { EuropaElement } from '../base.js';

/**
 * `<europa-button>` — a button web component wrapping a native `<button>`
 * element with the shared `europa-*` CSS class catalog.
 *
 * Renders a native `<button>` (FR-013) for full keyboard, focus, and form
 * participation. Applies `europa-button` + variant/size modifier classes
 * to the host element via light DOM. Boolean attributes (`disabled`) and
 * passthrough attributes (`type`, `aria-label`) are forwarded to the
 * internal `<button>`.
 *
 * **Attributes**:
 * - `variant` — maps to `europa-button--<variant>` modifier class.
 * - `size` — maps to `europa-button--<size>` modifier class.
 * - `disabled` (boolean) — forwarded to the native button's `disabled`.
 * - `type` — forwarded to the native button's `type` (default `button`).
 * - `aria-label` — forwarded to the native button.
 *
 * **Slots**: default — renders inside the native `<button>`.
 *
 * @example
 * ```html
 * <europa-button variant="primary">Deploy</europa-button>
 * <europa-button size="sm" disabled>Disabled</europa-button>
 * <europa-button type="submit" aria-label="Save changes">Save</europa-button>
 * ```
 */
export class EuropaButton extends EuropaElement {
    /** Reference to the internal native `<button>` element. */
    private _button: HTMLButtonElement | null = null;

    /**
     * The attributes this component observes. Changes trigger a re-render
     * via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static get observedAttributes(): string[] {
        return ['variant', 'size', 'disabled', 'type', 'aria-label'];
    }

    /**
     * Create (once) or update the internal `<button>` element.
     *
     * Idempotent: the button and its `<slot>` are created on first call;
     * only classes and forwarded attributes are refreshed on subsequent
     * calls (attribute changes).
     */
    protected render(): void {
        if (this._button === null) {
            this._button = document.createElement('button');
            this._button.appendChild(document.createElement('slot'));
            this.appendChild(this._button);
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
