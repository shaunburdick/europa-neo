import { EuropaElement } from '../base.js';

/**
 * The `<europa-banner>` custom element — a light-DOM wrapper around the
 * catalog's `.europa-banner` class.
 *
 * Renders a single `<div class="europa-banner">` with children manually
 * reparented into the wrapper. The `variant` attribute selects the
 * accessibility contract (FR-012): `status` (default) maps to
 * `role="status"` + `aria-live="polite"`, while `alert` maps to
 * `role="alert"` + `aria-live="assertive"` so the message is announced
 * immediately.
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
     * On first call a `<div class="europa-banner">` is created and light-DOM
     * children are manually reparented into it (slots are inert in light DOM).
     * On subsequent calls the role/aria-live attributes are refreshed to match
     * the current `variant`, and any late-arriving children are reparented.
     */
    protected override render(): void {
        if (this._banner === null) {
            const banner = document.createElement('div');
            banner.className = 'europa-banner';
            this.appendChild(banner);
            this._banner = banner;
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._banner) {
                this._banner.appendChild(child);
            }
        }

        const isAlert = this.getAttribute('variant') === 'alert';

        // Apply variant-specific modifier class for visual differentiation.
        // The base `.europa-banner` class provides shared layout; the modifier
        // classes control background color per the accessibility contract.
        this._banner.classList.toggle('europa-banner--status', !isAlert);
        this._banner.classList.toggle('europa-banner--alert', isAlert);

        // Both variants always carry the live-region contract; ensure the
        // attributes are present, then set their variant-specific values.
        this.setAttributeIf(this._banner, 'role', true);
        this.setAttributeIf(this._banner, 'aria-live', true);
        this._banner.setAttribute('role', isAlert ? 'alert' : 'status');
        this._banner.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
    }
}
