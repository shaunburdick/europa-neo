import { EuropaElement } from '../base.js';

/**
 * `<europa-chip>` — a pill-shaped count badge wrapping the `.europa-chip`
 * catalog class.
 *
 * Renders a `<span class="europa-chip">` inside a shadow root whose first
 * text node is the `count` attribute value (e.g. a troop count). Host
 * children are projected inside the span after the count via a `<slot>`
 * element (Shadow DOM — no manual reparenting; FR-009 / FR-010).
 *
 * @example
 * ```html
 * <europa-chip count="12"></europa-chip>
 * <europa-chip count="5">troops</europa-chip>
 * ```
 */
export class EuropaChip extends EuropaElement {
    /** The internal `<span class="europa-chip">` element inside the shadow root. */
    private _span: HTMLSpanElement | null = null;

    /** The text node holding the `count` value. */
    private _countText: Text | null = null;

    /**
     * The attributes this component observes. Changes to `count` trigger a
     * re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['count'];
    }

    /**
     * Create (once) or update the internal chip `<span>` inside the shadow
     * root.
     *
     * Idempotent: the span, count text node, and `<slot>` are created on
     * first call — host children are projected via the slot, never
     * reparented. On subsequent calls only the count text node is refreshed
     * from the current `count` attribute value.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._span === null || this._countText === null) {
            const span = document.createElement('span');
            span.className = 'europa-chip';

            const countText = document.createTextNode('');
            span.appendChild(countText);

            const slot = document.createElement('slot');
            span.appendChild(slot);

            shadow.appendChild(span);
            this._span = span;
            this._countText = countText;
        }

        this._countText.nodeValue = this.getAttribute('count') ?? '';
    }
}
