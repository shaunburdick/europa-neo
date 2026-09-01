import { EuropaElement } from '../base.js';

/**
 * `<europa-reserve-indicator>` — a reserve-percentage display wrapping the
 * `.europa-chip` catalog class.
 *
 * Renders a `<span class="europa-chip" role="img">` whose text content is the
 * `percent` attribute value (e.g. "30%") and whose `aria-label` describes the
 * reserves (e.g. "reserves 30%"). The `percent` attribute is a string in the
 * range 0–90 in steps of 10, matching the console's reserve indicator display
 * (spec 005, spec 014 contract §3.2).
 *
 * Uses light DOM and applies the shared catalog class directly — no Shadow DOM,
 * no `::part()`, no `adoptedStyleSheets`. This component is not
 * auto-registered; consumers call `customElements.define` explicitly (FR-004).
 *
 * Accessibility (FR-014): the indicator is exposed as `role="img"` with an
 * `aria-label` containing the percentage (e.g. "reserves 30%"), so the text
 * alone is never the only channel of information for screen readers.
 *
 * @example
 * ```html
 * <europa-reserve-indicator percent="30"></europa-reserve-indicator>
 * <europa-reserve-indicator percent="70"></europa-reserve-indicator>
 * <europa-reserve-indicator percent="0"></europa-reserve-indicator>
 * ```
 */
export class EuropaReserveIndicator extends EuropaElement {
    /** The internal `<span class="europa-chip" role="img">` element. */
    private _span: HTMLSpanElement | null = null;

    /** The text node holding the percentage display value. */
    private _text: Text | null = null;

    /**
     * The attributes this component observes. Changes to `percent` trigger a
     * re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['percent'];
    }

    /**
     * Create (once) or update the internal chip `<span>`.
     *
     * Idempotent: the span and text node are created on first call; only the
     * text content and `aria-label` are refreshed on subsequent calls
     * (attribute changes).
     */
    protected override render(): void {
        if (this._span === null || this._text === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-chip';
            this._span.setAttribute('role', 'img');
            this._text = document.createTextNode('');
            this._span.appendChild(this._text);
            this.appendChild(this._span);
        }

        const percent = this._percent();

        this._text.nodeValue = `${percent}%`;
        this._span.setAttribute('aria-label', `reserves ${percent}%`);
    }

    /**
     * Read and clamp the `percent` attribute to the range [0, 90] in steps
     * of 10.
     *
     * A missing or non-numeric value falls back to 0. Values not aligned to
     * a step of 10 are clamped to the nearest valid step.
     *
     * @returns The clamped percentage value.
     */
    private _percent(): number {
        const raw = Number(this.getAttribute('percent'));

        if (Number.isNaN(raw)) {
            return 0;
        }

        const clamped = Math.min(90, Math.max(0, raw));

        return Math.round(clamped / 10) * 10;
    }
}
