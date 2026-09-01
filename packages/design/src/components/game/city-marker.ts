import { TOKENS } from '../../tokens.js';
import { EuropaElement } from '../base.js';

/**
 * Component-local player-color map for game primitives.
 *
 * Reuses existing `TOKENS.color.*` values — no new token variables and no new
 * hex literals (FR-010, plan decision D-7). This is a component-local source
 * of truth for player colors that the manual can consume; it is not a shared
 * token-table entry.
 */
const PLAYER_COLORS: Readonly<Record<string, string>> = {
    '1': TOKENS.color.accent,
    '2': TOKENS.color.city,
    '3': TOKENS.color.green,
    '4': TOKENS.color.blue,
};

/**
 * `<europa-city-marker>` — a city ownership indicator.
 *
 * Renders a small inline-styled `<span role="img">` marker filled with the
 * owning player's color. The `owner` attribute (string, player 1–4) selects
 * the color from the component-local `PLAYER_COLORS` map; an unknown or absent
 * owner falls back to the muted text color. Uses light DOM and applies no
 * catalog class (the shape is inline-styled from token values, FR-009 /
 * FR-010).
 *
 * **Attributes**
 * - `owner` (string, default: none) — player number 1–4 selecting the marker
 *   color; unknown/absent falls back to `TOKENS.color.textMuted`.
 *
 * **Slots**: none.
 *
 * **Events**: none.
 *
 * **A11y (FR-014)**: `role="img"` with an `aria-label` derived from the owner
 * (e.g. "player 1 city").
 *
 * @example
 * ```html
 * <europa-city-marker owner="2"></europa-city-marker>
 * ```
 */
export class EuropaCityMarker extends EuropaElement {
    /** The internal `<span role="img">` marker element. */
    private _marker: HTMLSpanElement | null = null;

    /**
     * The attributes this component observes. Changes to `owner` trigger a
     * re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['owner'];
    }

    /**
     * Create (once) or update the internal marker `<span>`.
     *
     * Idempotent: the span is created on first call; only its color and
     * `aria-label` are refreshed on subsequent calls (attribute changes).
     */
    protected override render(): void {
        if (this._marker === null) {
            this._marker = document.createElement('span');
            this._marker.setAttribute('role', 'img');
            this._marker.style.display = 'inline-block';
            this._marker.style.width = '24px';
            this._marker.style.height = '24px';
            this._marker.style.borderRadius = '2px';
            this.appendChild(this._marker);
        }

        const owner = this.getAttribute('owner');
        const color =
            owner !== null && PLAYER_COLORS[owner] !== undefined ? PLAYER_COLORS[owner] : TOKENS.color.textMuted;

        this._marker.style.backgroundColor = color;
        this._marker.style.borderColor = color;
        this._marker.setAttribute('aria-label', `${owner ?? 'unknown'} city`);
    }
}
