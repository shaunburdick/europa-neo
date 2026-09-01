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

    /** Whether the initial render has already been queued for this element. */
    private _renderQueued = false;

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
     * Render after the host's light-DOM children have been committed.
     * React 19 appends custom-element children after `connectedCallback`; a
     * synchronous render would otherwise be cleared by that commit.
     */
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

    /** Update an already-rendered native button when host attributes change. */
    override attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue !== newValue && this._button !== null) {
            this.render();
        }
    }

    /**
     * Create (once) or update the internal `<button>` element.
     *
     * Idempotent: the button is created on first call and light-DOM
     * children are manually reparented into it (projection is manual,
     * not via `<slot>` — slots are inert in light DOM). On subsequent
     * calls only classes and forwarded attributes are refreshed.
     */
    protected override render(): void {
        if (this._button === null) {
            this._button = document.createElement('button');
            this.appendChild(this._button);

            // Manually reparent light-DOM children into the button.
            // Snapshot childNodes (live NodeList) before moving.
            const children = Array.from(this.childNodes);
            for (const child of children) {
                if (child !== this._button) {
                    this._button.appendChild(child);
                }
            }
        }

        // Reparent any host children not yet inside the button.
        // Handles children added after the initial render (e.g. when
        // setAttribute triggers render() before children are appended).
        const remaining = Array.from(this.childNodes);
        for (const child of remaining) {
            if (child !== this._button) {
                this._button.appendChild(child);
            }
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
