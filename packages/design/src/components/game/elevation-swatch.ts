import { TOKENS } from '../../tokens.js';
import { EuropaElement } from '../base.js';

/**
 * `<europa-elevation-swatch>` — a small inline-styled color swatch that
 * visualizes a land elevation value.
 *
 * Reads the `elevation` attribute (a number 0–100) and renders a
 * `<span role="img">` whose background color is computed by interpolating
 * the land elevation lightness band between `TOKENS.color.landMinLightnessPct`
 * and `TOKENS.color.landMaxLightnessPct`. The color is expressed as
 * `hsl(<landHue>, <landSaturationPct>%, <lightness>%)` using only canonical
 * design tokens — no new hex literals (FR-009 / FR-010).
 *
 * Accessibility (FR-014): the swatch is exposed as `role="img"` with an
 * `aria-label` describing the elevation value (e.g. "elevation 42"), so the
 * color alone is never the only channel of information.
 *
 * Uses light DOM and inline styles only — no Shadow DOM, no `::part()`,
 * no `adoptedStyleSheets`. This component is not auto-registered; consumers
 * call `customElements.define` explicitly (FR-004).
 *
 * @example
 * ```html
 * <europa-elevation-swatch elevation="42"></europa-elevation-swatch>
 * ```
 */
export class EuropaElevationSwatch extends EuropaElement {
    /** The internal `<span role="img">` element. */
    private _swatch: HTMLSpanElement | null = null;

    /**
     * The attributes this component observes. Changes to `elevation` trigger
     * a re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['elevation'];
    }

    /**
     * Create (once) or update the internal swatch `<span>`.
     *
     * Idempotent: the span is created on first call; only its background
     * color and `aria-label` are refreshed on subsequent calls (attribute
     * changes).
     */
    protected override render(): void {
        if (this._swatch === null) {
            this._swatch = document.createElement('span');
            this._swatch.setAttribute('role', 'img');
            this._swatch.style.display = 'inline-block';
            this._swatch.style.width = '24px';
            this._swatch.style.height = '24px';
            this._swatch.style.borderRadius = '2px';
            this.appendChild(this._swatch);
        }

        const elevation = this._elevation();
        const lightness = this._lightnessFor(elevation);

        this._swatch.style.backgroundColor = `hsl(${TOKENS.color.landHue}, ${TOKENS.color.landSaturationPct}%, ${lightness}%)`;
        this._swatch.setAttribute('aria-label', `elevation ${elevation}`);
    }

    /**
     * Read and clamp the `elevation` attribute to the range [0, 100].
     *
     * A missing or non-numeric value falls back to 0.
     *
     * @returns The clamped elevation value.
     */
    private _elevation(): number {
        const raw = Number(this.getAttribute('elevation'));

        if (Number.isNaN(raw)) {
            return 0;
        }

        return Math.min(100, Math.max(0, raw));
    }

    /**
     * Interpolate the swatch lightness between the land elevation band's
     * minimum and maximum based on the given elevation (0–100).
     *
     * @param elevation  A clamped elevation value in [0, 100].
     * @returns The interpolated lightness percentage.
     */
    private _lightnessFor(elevation: number): number {
        const { landMinLightnessPct, landMaxLightnessPct } = TOKENS.color;
        const t = elevation / 100;

        return landMinLightnessPct + (landMaxLightnessPct - landMinLightnessPct) * t;
    }
}
