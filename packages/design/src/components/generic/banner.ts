import { EuropaElement } from '../base.js';

/**
 * The `<europa-banner>` custom element — a light-DOM wrapper around the
 * catalog's `.europa-banner` class.
 *
 * Renders a single `<div class="europa-banner">` that wraps the slotted
 * message text. The `variant` attribute selects the accessibility contract
 * (FR-012): `status` (default) maps to `role="status"` + `aria-live="polite"`,
 * while `alert` maps to `role="alert"` + `aria-live="assertive"` so the
 * message is announced immediately.
 *
 * @example
 * ```html
 * <europa-banner variant="alert">Reconnecting to match…</europa-banner>
 * ```
 */
export class EuropaBanner extends EuropaElement {
    /** The internal `<div class="europa-banner">` wrapper. */
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
     * Create (once) or update the internal banner wrapper.
     *
     * Idempotent: on first call a `<div class="europa-banner">` is created
     * with a `<slot>` projecting the host's light-DOM children; on subsequent
     * calls (attribute changes) only the role/aria-live attributes are
     * refreshed to match the current `variant`.
     */
    protected override render(): void {
        if (this._banner === null) {
            const banner = document.createElement('div');
            banner.className = 'europa-banner';
            banner.appendChild(document.createElement('slot'));
            this.appendChild(banner);
            this._banner = banner;
        }

        const isAlert = this.getAttribute('variant') === 'alert';

        // Both variants always carry the live-region contract; ensure the
        // attributes are present, then set their variant-specific values.
        this.setAttributeIf(this._banner, 'role', true);
        this.setAttributeIf(this._banner, 'aria-live', true);
        this._banner.setAttribute('role', isAlert ? 'alert' : 'status');
        this._banner.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    }
}
