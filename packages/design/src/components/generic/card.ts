import { EuropaElement } from '../base.js';

/**
 * The `<europa-card>` custom element — a light-DOM wrapper for the
 * `europa-card` catalog class.
 *
 * Renders a single `<div class="europa-card">` containing a `<slot>` so
 * arbitrary slotted children are projected into the card. The class conveys
 * no semantics, so the host is responsible for supplying heading structure
 * and any interactive content.
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
     * Create (once) the internal card wrapper and slot, then apply the
     * `europa-card` catalog class. Idempotent: subsequent calls no-op.
     */
    protected render(): void {
        if (this._card !== null) {
            return;
        }

        const card = document.createElement('div');
        card.className = 'europa-card';
        card.appendChild(document.createElement('slot'));
        this.appendChild(card);
        this._card = card;
    }
}
