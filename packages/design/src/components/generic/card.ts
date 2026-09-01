import { EuropaElement } from '../base.js';

/**
 * The `<europa-card>` custom element — a light-DOM wrapper for the
 * `europa-card` catalog class.
 *
 * Renders a single `<div class="europa-card">` with children manually
 * reparented into the wrapper. The class conveys no semantics, so the
 * host is responsible for supplying heading structure and any interactive
 * content.
 *
 * No attributes are observed; the element renders once on connect.
 *
 * @example
 * ```html
 * <europa-card>
 *     <h2>Match summary</h2>
 *     <p>You won!</p>
 * </europa-card>
 * ```
 */
export class EuropaCard extends EuropaElement {
    /** The internal `<div class="europa-card">` wrapper. */
    private _card: HTMLDivElement | null = null;

    /**
     * Create (once) the internal card wrapper, then apply the
     * `europa-card` catalog class. Children are manually reparented
     * into the wrapper on every render (slots are inert in light DOM).
     */
    protected render(): void {
        if (this._card === null) {
            const card = document.createElement('div');
            card.className = 'europa-card';
            this.appendChild(card);
            this._card = card;
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._card) {
                this._card.appendChild(child);
            }
        }
    }
}
