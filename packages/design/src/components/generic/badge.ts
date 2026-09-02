import { EuropaElement } from '../base.js';

/**
 * A small pill-shaped label used to annotate content with a short piece of
 * metadata (e.g. a match status, a player count, or a "your match" marker).
 *
 * Renders a `<span class="europa-badge">` inside a shadow root, with a
 * `<slot>` element for projecting the label text. The badge has no observed
 * attributes — its content is entirely the default slot — so the base
 * class's empty `observedAttributes` and the single `render()` call from
 * `connectedCallback` are all that is needed.
 *
 * Uses **Shadow DOM**: the `europa-badge` catalog class is applied to the
 * internal `<span>`, and the shared stylesheet is adopted into the shadow root.
 *
 * @example
 * ```html
 * <europa-badge>Your match</europa-badge>
 * ```
 */
export class EuropaBadge extends EuropaElement {
    /** The wrapping `<span class="europa-badge">` inside the shadow root. */
    private _span: HTMLSpanElement | null = null;

    /**
     * Lazily create the shadow root and internal badge span with a
     * `<slot>` for projecting the label text.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._span === null) {
            const span = document.createElement('span');
            span.className = 'europa-badge';

            const slot = document.createElement('slot');
            span.appendChild(slot);

            shadow.appendChild(span);
            this._span = span;
        }
    }
}
