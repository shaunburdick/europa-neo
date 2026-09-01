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
     * Idempotent: the span and count text node are created on first call;
     * light-DOM children are manually reparented into the span (projection
     * is manual, not via `<slot>` — slots are inert in light DOM). On
     * subsequent calls only the count text node is refreshed.
     */
    protected override render(): void {
        if (this._span === null || this._countText === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-chip';
            this._countText = document.createTextNode('');
            this._span.appendChild(this._countText);
            this.appendChild(this._span);

            // Manually reparent light-DOM children into the span.
            // Snapshot childNodes (live NodeList) before moving.
            const children = Array.from(this.childNodes);
            for (const child of children) {
                if (child !== this._span) {
                    this._span.appendChild(child);
                }
            }
        }

        // Reparent any host children not yet inside the span.
        // Handles children added after the initial render (e.g. when
        // setAttribute triggers render() before children are appended).
        const remaining = Array.from(this.childNodes);
        for (const child of remaining) {
            if (child !== this._span) {
                this._span.appendChild(child);
            }
        }

        this._countText.nodeValue = this.getAttribute('count') ?? '';
    }
}
