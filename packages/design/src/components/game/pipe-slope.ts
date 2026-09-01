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
 * Optionally reads the `intensity` attribute (0–1, default 1) to scale the
 * triangle size. Intensity encodes the strength of the elevation gradient:
 * bigger triangles indicate stronger slopes. Stalled pipes ignore intensity
 * (always rendered at full size).
 *
 * Accessibility (FR-014): the indicator is exposed as `role="img"` with an
 * `aria-label` describing the flow direction and, when intensity < 1, a
 * qualitative intensity description (e.g. "pipe uphill, light gradient").
 *
 * Uses light DOM and inline styles only — no Shadow DOM, no `::part()`,
 * no `adoptedStyleSheets`. This component is not auto-registered; consumers
 * call `customElements.define` explicitly (FR-004).
 *
 * @example
 * ```html
 * <europa-pipe-slope direction="downhill"></europa-pipe-slope>
 * <europa-pipe-slope direction="uphill" intensity="0.5"></europa-pipe-slope>
 * <europa-pipe-slope direction="stalled"></europa-pipe-slope>
 * ```
 */
export class EuropaPipeSlope extends EuropaElement {
    /** The internal `<span role="img">` element. */
    private _indicator: HTMLSpanElement | null = null;

    /**
     * The attributes this component observes. Changes to `direction` or
     * `intensity` trigger a re-render via
     * {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['direction', 'intensity'];
    }

    /**
     * Create (once) or update the internal indicator `<span>`.
     *
     * Idempotent: the span is created on first call; only its fill color,
     * border widths, and `aria-label` are refreshed on subsequent calls
     * (attribute changes).
     *
     * The triangle is drawn with the CSS border technique: a zero-width
     * element with `borderWidth: 0 bottom right left`. The bottom border
     * forms the visible downward-pointing triangle; its color is set to
     * the direction token. The left and right borders are transparent and
     * form the slanted sides. The top border is 0px wide and invisible
     * regardless of color.
     *
     * Intensity scales the border widths proportionally: the base size is
     * 16px bottom / 12px sides; at intensity=0 this becomes 40% (6.4px /
     * 4.8px), at intensity=1 it stays at 100% (16px / 12px). Stalled
     * pipes always render at full size.
     */
    protected override render(): void {
        if (this._indicator === null) {
            this._indicator = document.createElement('span');
            this._indicator.setAttribute('role', 'img');
            this._indicator.style.display = 'inline-block';
            this._indicator.style.width = '0';
            this._indicator.style.height = '0';
            this._indicator.style.borderStyle = 'solid';
            this._indicator.style.borderTopColor = 'transparent';
            this._indicator.style.borderLeftColor = 'transparent';
            this._indicator.style.borderRightColor = 'transparent';
            this._indicator.style.borderBottomColor = 'transparent';
            this.appendChild(this._indicator);
        }

        const direction = this._direction();
        const intensity = this._intensity();
        const color = this._colorFor(direction);

        // Intensity scales the triangle size: 40% (intensity=0) to 100%
        // (intensity=1). Stalled pipes always render at full size.
        const scale = direction === 'stalled' ? 1 : 0.4 + intensity * 0.6;
        const bottomWidth = Math.round(16 * scale);
        const sideWidth = Math.round(12 * scale);

        this._indicator.style.borderBottomWidth = `${bottomWidth}px`;
        this._indicator.style.borderLeftWidth = `${sideWidth}px`;
        this._indicator.style.borderRightWidth = `${sideWidth}px`;
        this._indicator.style.borderBottomColor = color;

        // Build aria-label with optional intensity description.
        const label = this._buildAriaLabel(direction, intensity);
        this._indicator.setAttribute('aria-label', label);
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
     * Read the `intensity` attribute as a float in [0, 1]. Falls back to
     * 1 when absent, non-numeric, or out of range.
     *
     * @returns The resolved intensity.
     */
    private _intensity(): number {
        const raw = this.getAttribute('intensity');
        if (raw === null) {
            return 1;
        }
        const parsed = Number.parseFloat(raw);
        if (Number.isNaN(parsed)) {
            return 1;
        }
        return Math.max(0, Math.min(1, parsed));
    }

    /**
     * Build the aria-label string. When intensity < 1, includes a
     * qualitative description ("light", "moderate", or "strong").
     *
     * @param direction  A resolved pipe flow direction.
     * @param intensity  The resolved intensity (0–1).
     * @returns The aria-label value.
     */
    private _buildAriaLabel(direction: PipeSlopeDirection, intensity: number): string {
        const base = `pipe ${direction}`;
        if (direction === 'stalled' || intensity >= 1) {
            return base;
        }
        const qualifier = intensity < 0.33 ? 'light' : intensity < 0.67 ? 'moderate' : 'strong';
        return `${base}, ${qualifier} gradient`;
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
