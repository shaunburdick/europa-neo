import { TOKENS } from '../../tokens.js';
import { EuropaElement } from '../base.js';

/**
 * Component-local player-color map (plan D-7).
 *
 * Reuses existing `TOKENS.color.*` values — zero new hex literals,
 * zero new token variables. Unknown or absent player falls back to
 * `textMuted`.
 *
 * | Player | Token key   | Hex value   |
 * | ------ | ----------- | ----------- |
 * | 1      | accent      | #f59e0b     |
 * | 2      | city        | #fbbf24     |
 * | 3      | green       | #059669     |
 * | 4      | blue        | #2563eb     |
 * | *      | textMuted   | #9ca3af     |
 */
const PLAYER_COLORS: Record<string, string> = {
    '1': TOKENS.color.accent,
    '2': TOKENS.color.city,
    '3': TOKENS.color.green,
    '4': TOKENS.color.blue,
};

/**
 * Game-specific web component that renders a player badge with the
 * player's identity color and an accessible label.
 *
 * Extends {@link EuropaElement} (light DOM, no Shadow DOM, no
 * `::part()`, no `adoptedStyleSheets`).
 *
 * Catalog class: `europa-badge`.
 *
 * @example
 * ```html
 * <europa-player-badge player="1" name="Alice"></europa-player-badge>
 * <europa-player-badge player="3"></europa-player-badge>
 * ```
 */
export class EuropaPlayerBadge extends EuropaElement {
    /** The internal `<span class="europa-badge" role="img">` element. */
    private _span: HTMLSpanElement | null = null;

    /**
     * The attributes this component observes. Changes to `player` or
     * `name` trigger a re-render via
     * {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['player', 'name'];
    }

    /**
     * Create (once) or refresh the internal badge `<span>`.
     *
     * Idempotent: the span is created on first call; subsequent calls
     * update its text content, `aria-label`, and inline `color` style.
     */
    protected override render(): void {
        if (this._span === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-badge';
            this._span.setAttribute('role', 'img');
            this.appendChild(this._span);
        }

        const player = this.getAttribute('player');
        const name = this.getAttribute('name');

        // --- Visible text (name or player label) ---------------------------
        // The badge must contain visible text content so it renders at the
        // correct size.  When a name is provided it becomes the badge text;
        // otherwise a "P{n}" fallback label keeps the badge visible.
        const displayText = name !== null && name !== '' ? name : `P${player ?? '?'}`;
        this._span.textContent = displayText;

        // --- Accessible label (FR-014) -----------------------------------
        if (name !== null && name !== '') {
            this._span.setAttribute('aria-label', `player ${player ?? '?'}: ${name}`);
        } else {
            this._span.setAttribute('aria-label', `player ${player ?? '?'}`);
        }

        // --- Player color --------------------------------------------------
        // `PLAYER_COLORS[key]` is `undefined` for an unknown or absent
        // player, so the nullish coalescing falls back to `textMuted`.
        // We guard the null attribute explicitly because `null` cannot be
        // used as an index type under `noUncheckedIndexedAccess`.
        const key = player ?? '';
        const color = PLAYER_COLORS[key] ?? TOKENS.color.textMuted;
        this._span.style.color = color;
    }
}
