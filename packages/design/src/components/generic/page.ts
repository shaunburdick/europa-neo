import { EuropaElement } from '../base.js';

/**
 * The `<europa-page>` custom element — a light-DOM wrapper for the
 * `europa-page` catalog class.
 *
 * Renders a single `<div class="europa-page">` with children manually
 * reparented into the wrapper. The class conveys no semantics, so the host
 * is responsible for supplying heading structure and any interactive content.
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
     * Create the internal page wrapper, then reparent light-DOM children
     * into it on every render (slots are inert in light DOM).
     */
    protected render(): void {
        if (this._page === null) {
            const page = document.createElement('div');
            page.className = 'europa-page';
            this.appendChild(page);
            this._page = page;
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._page) {
                this._page.appendChild(child);
            }
        }
    }
}
