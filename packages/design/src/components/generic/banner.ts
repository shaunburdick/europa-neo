import { EuropaElement } from '../base.js';

/**
 * The `<europa-banner>` custom element — a Shadow DOM wrapper around the
 * catalog's `.europa-banner` class.
 *
 * Renders a single `<div class="europa-banner">` inside a shadow root, with
 * a `<slot>` element projecting host children into the wrapper. The
 * `variant` attribute selects the accessibility contract (FR-012): `status`
 * (default) maps to `role="status"` + `aria-live="polite"`, while `alert`
 * maps to `role="alert"` + `aria-live="assertive"` so the message is
 * announced immediately. Both live-region attributes live on the internal
 * wrapper div inside the shadow root, so the accessibility tree still sees
 * them.
 *
 * @example
 * ```html
 * <europa-banner variant="alert">Reconnecting to match…</europa-banner>
 * ```
 */
export class EuropaBanner extends EuropaElement {
    /** The internal `<div class="europa-banner">` wrapper inside the shadow root. */
    private _banner: HTMLDivElement | null = null;

    /**
     * The `variant` attribute is observed so that changing it re-renders the
     * element and updates the live-region role/aria-live contract.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['variant'];
    }

    /**
     * Create (once) or update the internal banner wrapper inside the shadow
     * root.
     *
     * On first call a `<div class="europa-banner">` with a `<slot>` is
     * created inside the shadow root — host children are projected, not
     * reparented. On subsequent calls the role/aria-live attributes and the
     * variant modifier class are refreshed to match the current `variant`.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._banner === null) {
            const banner = document.createElement('div');
            banner.className = 'europa-banner';

            const slot = document.createElement('slot');
            banner.appendChild(slot);

            shadow.appendChild(banner);
            this._banner = banner;
        }

        const isAlert = this.getAttribute('variant') === 'alert';

        // Apply variant-specific modifier class for visual differentiation.
        // The base `.europa-banner` class provides shared layout; the modifier
        // classes control background color per the accessibility contract.
        this._banner.classList.toggle('europa-banner--status', !isAlert);
        this._banner.classList.toggle('europa-banner--alert', isAlert);

        // Both variants always carry the live-region contract; the values are
        // variant-specific (status/polite vs alert/assertive).
        this._banner.setAttribute('role', isAlert ? 'alert' : 'status');
        this._banner.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    }
}
