import { EuropaElement } from '../base.js';

/**
 * `<europa-chip>` — a pill-shaped count badge wrapping the `.europa-chip`
 * catalog class.
 *
 * Renders a `<span class="europa-chip">` whose text content is the `count`
 * attribute value (e.g. a troop count). Slotted children are rendered inside
 * the span alongside the count via a `<slot>` element. Uses light DOM and
 * applies the shared catalog class directly (FR-009 / FR-010).
 *
 * @example
 * ```html
 * <europa-chip count="12"></europa-chip>
 * <europa-chip count="5">troops</europa-chip>
 * ```
 */
export class EuropaChip extends EuropaElement {
    /** The internal `<span class="europa-chip">` element. */
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
     * Create (once) or update the internal chip `<span>`.
     *
     * Idempotent: the span, slot, and count text node are created on first
     * call; only the count text node is refreshed on subsequent calls
     * (attribute changes).
     */
    protected override render(): void {
        if (this._span === null || this._countText === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-chip';
            this._countText = document.createTextNode('');
            this._span.appendChild(this._countText);
            this._span.appendChild(document.createElement('slot'));
            this.appendChild(this._span);
        }

        this._countText.nodeValue = this.getAttribute('count') ?? '';
    }
}
