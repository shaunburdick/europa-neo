import { TOKENS } from '../../tokens.js';

/**
 * Player-color map — maps owner values to design token colors.
 *
 * Uses only existing `TOKENS.color.*` values (plan D-7); zero new hex
 * literals, zero new token variables (FR-010 / FR-023).
 */
const OWNER_COLORS: Record<number, string> = {
    1: TOKENS.color.accent,
    2: TOKENS.color.city,
    3: TOKENS.color.green,
    4: TOKENS.color.blue,
};

/**
 * Props for the {@link EuropaTroopChip} component.
 */
export interface EuropaTroopChipProps {
    /** The troop count to display. */
    count: number;
    /** Optional owner player number (1–4). When absent, the chip uses muted color. */
    owner?: 1 | 2 | 3 | 4;
}

/**
 * A game-specific visual primitive that renders a player-colored troop-count chip.
 *
 * Extends the generic `.europa-chip` catalog class with player-ownership
 * color coding via inline `border-color` and `color` styles. The element
 * is purely decorative (`role="img"`) — the semantic meaning is carried
 * by a computed `aria-label` (FR-014).
 *
 * @example
 * ```tsx
 * <EuropaTroopChip count={12} owner={1} />
 * <EuropaTroopChip count={5} owner={3} />
 * ```
 */
export function EuropaTroopChip({ count, owner }: EuropaTroopChipProps) {
    const color = owner !== undefined ? OWNER_COLORS[owner] : TOKENS.color.textMuted;
    return (
        <span
            className="europa-chip"
            role="img"
            aria-label={owner !== undefined ? `${count} troops, player ${owner}` : `${count} troops`}
            style={{ borderColor: color, color }}
        >
            {count}
        </span>
    );
}
