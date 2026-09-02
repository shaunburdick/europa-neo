import { EuropaElement } from '../base.js';

/**
 * The `<europa-page>` custom element — a Shadow DOM wrapper for the
 * `europa-page` catalog class.
 *
 * Renders a single `<div class="europa-page">` inside a shadow root,
 * with a `<slot>` element for projecting host children. The class
 * conveys no semantics, so the host is responsible for supplying heading
 * structure and any interactive content.
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
    /** The internal `<div class="europa-page">` wrapper inside the shadow root. */
    private _page: HTMLDivElement | null = null;

    /**
     * Lazily create the shadow root and internal page wrapper with a
     * `<slot>` for projecting host children.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._page === null) {
            const page = document.createElement('div');
            page.className = 'europa-page';

            const slot = document.createElement('slot');
            page.appendChild(slot);

            shadow.appendChild(page);
            this._page = page;
        }
    }
}
