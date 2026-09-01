import { EuropaElement } from '../base.js';

/**
 * A small pill-shaped label used to annotate content with a short piece of
 * metadata (e.g. a match status, a player count, or a "your match" marker).
 *
 * Renders a `<span class="europa-badge">` wrapping the slotted label text.
 * The badge has no observed attributes — its content is entirely the default
 * slot — so the base class's empty `observedAttributes` and the single
 * `render()` call from `connectedCallback` are all that is needed.
 *
 * Uses **light DOM**: the `europa-badge` catalog class is applied directly to
 * the wrapping `<span>`, so the element participates in the page's normal
 * stylesheet cascade.
 *
 * @example
 * ```html
 * <europa-badge>Your match</europa-badge>
 * ```
 */
export class EuropaBadge extends EuropaElement {
    /** The wrapping `<span class="europa-badge">` holding the slotted label. */
    private _span: HTMLSpanElement | null = null;

    /**
     * Create (once) or refresh the internal `<span class="europa-badge">`
     * and keep the slotted label children inside it.
     *
     * Idempotent: on first call the span is created and the element's
     * children are moved into it; on subsequent calls the existing span is
     * reused, so re-rendering never duplicates or orphans the label.
     */
    protected render(): void {
        if (this._span === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-badge';
            this.appendChild(this._span);
        }

        // Move any direct children (the slotted label) into the span so the
        // catalog class wraps them. `appendChild` relocates existing nodes,
        // so this is safe to run on every render.
        while (this.firstChild !== this._span) {
            const child = this.firstChild;
            if (child === null) {
                break;
            }
            this._span.appendChild(child);
        }
    }
}
