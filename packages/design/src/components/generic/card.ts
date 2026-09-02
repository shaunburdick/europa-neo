import { EuropaElement } from '../base.js';

/**
 * The `<europa-card>` custom element — a Shadow DOM wrapper for the
 * `europa-card` catalog class.
 *
 * Renders a single `<div class="europa-card">` inside a shadow root,
 * with a `<slot>` element for projecting host children. The class
 * conveys no semantics, so the host is responsible for supplying heading
 * structure and any interactive content.
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
    /** The internal `<div class="europa-card">` wrapper inside the shadow root. */
    private _card: HTMLDivElement | null = null;

    /**
     * Lazily create the shadow root and internal card wrapper with a
     * `<slot>` for projecting host children.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._card === null) {
            const card = document.createElement('div');
            card.className = 'europa-card';

            const slot = document.createElement('slot');
            card.appendChild(slot);

            shadow.appendChild(card);
            this._card = card;
        }
    }
}
