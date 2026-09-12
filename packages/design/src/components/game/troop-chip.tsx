import { TOKENS } from '../../tokens.js';

/**
 * Props for the {@link EuropaTroopChip} component.
 */
export interface EuropaTroopChipProps {
    /** The troop count to display. */
    count: number;
    /**
     * CSS color used for the chip's text and border. The caller supplies the
     * owning player's identity color — typically a `TOKENS.color.playerColor*`
     * value. When absent, the chip falls back to `TOKENS.color.textMuted`.
     */
    color?: string;
}

/**
 * A game-specific visual primitive that renders a caller-colored troop-count
 * chip.
 *
 * Extends the generic `.europa-chip` catalog class with inline `border-color`
 * and `color` values taken from the `color` prop. The component deliberately
 * does **not** know about player ordering or identity: a canonical `PlayerId`
 * is resolved to a color by the caller, keeping the presentational layer free
 * of identity-to-color policy (issue #74). When no color is supplied the chip
 * falls back to `TOKENS.color.textMuted`.
 *
 * Accessibility: the element is a `role="img"` whose computed `aria-label` is
 * derived from the count alone (e.g. "12 troops"). It never encodes a player
 * number — callers that need an identity in the accessible name should use a
 * different component (e.g. `EuropaPlayerBadge` with a `name`).
 *
 * @example
 * ```tsx
 * <EuropaTroopChip count={12} color={TOKENS.color.playerColor1} />
 * <EuropaTroopChip count={5} />
 * ```
 */
export function EuropaTroopChip({ count, color }: EuropaTroopChipProps) {
    const resolvedColor = color ?? TOKENS.color.textMuted;
    return (
        <span
            className="europa-chip"
            role="img"
            aria-label={`${count} troops`}
            style={{ borderColor: resolvedColor, color: resolvedColor }}
        >
            {count}
        </span>
    );
}
