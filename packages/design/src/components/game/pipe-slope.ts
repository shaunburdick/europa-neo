import { TOKENS } from '../../tokens.js';
import { EuropaElement } from '../base.js';

/**
 * The pipe flow directions `<europa-pipe-slope>` can render, matching the
 * console's pipe-slope rendering (spec 005 FR-013).
 */
export type PipeSlopeDirection = 'downhill' | 'flat' | 'uphill' | 'stalled';

/**
 * `<europa-pipe-slope>` — a small inline-styled triangle that visualizes the
 * flow direction of a pipe segment.
 *
 * Reads the `direction` attribute (`downhill` | `flat` | `uphill` | `stalled`)
 * and renders a `<span role="img">` whose fill color is the corresponding
 * canonical pipe token (`TOKENS.color.pipeDownhill` / `pipeFlat` / `pipeUphill`
 * / `pipeStalled`). An unknown or absent direction falls back to the muted
 * `pipeStalled` token. The triangle is drawn with CSS borders using the token
 * value directly — no new hex literals (FR-009 / FR-010).
 *
 * Accessibility (FR-014): the indicator is exposed as `role="img"` with an
 * `aria-label` describing the flow direction (e.g. "pipe downhill"), so the
 * color alone is never the only channel of information.
 *
 * Uses light DOM and inline styles only — no Shadow DOM, no `::part()`,
 * no `adoptedStyleSheets`. This component is not auto-registered; consumers
 * call `customElements.define` explicitly (FR-004).
 *
 * @example
 * ```html
 * <europa-pipe-slope direction="downhill"></europa-pipe-slope>
 * <europa-pipe-slope direction="stalled"></europa-pipe-slope>
 * ```
 */
export class EuropaPipeSlope extends EuropaElement {
    /** The internal `<span role="img">` element. */
    private _indicator: HTMLSpanElement | null = null;

    /**
     * The attributes this component observes. Changes to `direction` trigger
     * a re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['direction'];
    }

    /**
     * Create (once) or update the internal indicator `<span>`.
     *
     * Idempotent: the span is created on first call; only its fill color and
     * `aria-label` are refreshed on subsequent calls (attribute changes).
     *
     * The triangle is drawn with the CSS border technique: a zero-width
     * element with `borderWidth: 0 top, 12px right, 16px bottom, 12px left`.
     * The 16px bottom border forms the visible downward-pointing triangle;
     * its color is set to the direction token. The left and right borders
     * (12px each) are transparent and form the slanted sides. The top
     * border is 0px wide and invisible regardless of color.
     */
    protected override render(): void {
        if (this._indicator === null) {
            this._indicator = document.createElement('span');
            this._indicator.setAttribute('role', 'img');
            this._indicator.style.display = 'inline-block';
            this._indicator.style.width = '0';
            this._indicator.style.height = '0';
            this._indicator.style.borderStyle = 'solid';
            this._indicator.style.borderWidth = '0 12px 16px 12px';
            this._indicator.style.borderTopColor = 'transparent';
            this._indicator.style.borderLeftColor = 'transparent';
            this._indicator.style.borderRightColor = 'transparent';
            this._indicator.style.borderBottomColor = 'transparent';
            this.appendChild(this._indicator);
        }

        const direction = this._direction();
        const color = this._colorFor(direction);

        // The 16px bottom border IS the visible triangle — color it with the
        // direction token. The 12px left/right borders are transparent (they
        // form the slanted sides). The 0px top border is invisible regardless
        // of its color value.
        this._indicator.style.borderBottomColor = color;
        this._indicator.setAttribute('aria-label', `pipe ${direction}`);
    }

    /**
     * Read the `direction` attribute, falling back to `stalled` when it is
     * absent or not one of the known pipe flow directions.
     *
     * @returns The resolved pipe flow direction.
     */
    private _direction(): PipeSlopeDirection {
        const raw = this.getAttribute('direction');

        if (raw === 'downhill' || raw === 'flat' || raw === 'uphill' || raw === 'stalled') {
            return raw;
        }

        return 'stalled';
    }

    /**
     * Map a pipe flow direction to its canonical token color.
     *
     * @param direction  A resolved pipe flow direction.
     * @returns The token color value for the direction.
     */
    private _colorFor(direction: PipeSlopeDirection): string {
        switch (direction) {
            case 'downhill':
                return TOKENS.color.pipeDownhill;
            case 'flat':
                return TOKENS.color.pipeFlat;
            case 'uphill':
                return TOKENS.color.pipeUphill;
            case 'stalled':
                return TOKENS.color.pipeStalled;
        }
    }
}
