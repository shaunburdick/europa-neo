import { EuropaElement } from '../base.js';

/**
 * The `<europa-page>` custom element — a light-DOM wrapper for the
 * `europa-page` catalog class.
 *
 * Renders a single `<div class="europa-page">` containing a `<slot>` so
 * arbitrary slotted children are projected into the page. The class conveys
 * no semantics, so the host is responsible for supplying heading structure
 * and any interactive content.
 *
 * No attributes are observed; the element renders once on connect.
 *
 * @example
 * ```html
 * <europa-page>
 *     <h1>Match lobby</h1>
 *     <p>Pick a match to join.</p>
 * </europa-page>
 * ```
 */
export class EuropaPage extends EuropaElement {
    /** The internal `<div class="europa-page">` wrapper. */
    private _page: HTMLDivElement | null = null;

    /**
     * Create (once) the internal page wrapper and slot, then apply the
     * `europa-page` catalog class. Idempotent: subsequent calls no-op.
     */
    protected render(): void {
        if (this._page !== null) {
            return;
        }

        const page = document.createElement('div');
        page.className = 'europa-page';
        page.appendChild(document.createElement('slot'));
        this.appendChild(page);
        this._page = page;
    }
}
