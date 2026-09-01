import { TOKENS } from '../../tokens.js';
import { EuropaElement } from '../base.js';

/**
 * Player-color map — maps owner attribute values to design token colors.
 *
 * Uses only existing `TOKENS.color.*` values (plan D-7); zero new hex
 * literals, zero new token variables (FR-010 / FR-023).
 */
const OWNER_COLORS: Record<string, string> = {
    '1': TOKENS.color.accent,
    '2': TOKENS.color.city,
    '3': TOKENS.color.green,
    '4': TOKENS.color.blue,
};

/**
 * `<europa-troop-chip>` — a game-specific visual primitive that renders a
 * player-colored troop-count chip.
 *
 * Extends the generic `.europa-chip` catalog class with player-ownership
 * color coding via inline `border-color` and `color` styles. The element
 * is purely decorative (`role="img"`) — the semantic meaning is carried
 * by a computed `aria-label` (FR-014).
 *
 * Uses light DOM and applies the shared catalog class directly
 * (FR-009 / FR-010). Does NOT auto-register; the registry handles bulk
 * registration via `register()` (FR-004).
 *
 * @example
 * ```html
 * <europa-troop-chip count="12" owner="1"></europa-troop-chip>
 * <europa-troop-chip count="5" owner="3"></europa-troop-chip>
 * ```
 */
export class EuropaTroopChip extends EuropaElement {
    /** The internal `<span class="europa-chip">` element. */
    private _span: HTMLSpanElement | null = null;

    /** The text node holding the troop count. */
    private _countText: Text | null = null;

    /**
     * The attributes this component observes. Changes to `count` or `owner`
     * trigger a re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['count', 'owner'];
    }

    /**
     * Create (once) or update the internal chip `<span>`.
     *
     * Idempotent: the span and count text node are created on first call;
     * on subsequent calls (attribute changes) the count text, player-color
     * inline styles, and accessibility attributes are refreshed.
     */
    protected override render(): void {
        if (this._span === null || this._countText === null) {
            this._span = document.createElement('span');
            this._span.className = 'europa-chip';
            this._countText = document.createTextNode('');
            this._span.appendChild(this._countText);
            this.appendChild(this._span);
        }

        const count = this.getAttribute('count') ?? '';
        const owner = this.getAttribute('owner');
        // `OWNER_COLORS[key]` is `undefined` for absent or unknown owners,
        // so the nullish fallback yields `textMuted` in both cases. We
        // guard the null attribute explicitly because `null` cannot be
        // used as an index type under `noUncheckedIndexedAccess`.
        const key = owner ?? '';
        const color = OWNER_COLORS[key] ?? TOKENS.color.textMuted;

        this._countText.nodeValue = count;

        // Player-color border and text via inline style (plan D-7).
        this._span.style.borderColor = color;
        this._span.style.color = color;

        // Accessibility: decorative image role with computed label (FR-014).
        this._span.setAttribute('role', 'img');
        this._span.setAttribute('aria-label', owner !== null ? `${count} troops, player ${owner}` : `${count} troops`);
    }
}
