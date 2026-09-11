import { TOKENS } from '../../tokens.js';

/**
 * Component-local player-color map (plan D-7).
 *
 * Each player maps to the dedicated `playerColorN` token (spec 012 FR-023,
 * issue #148). Unknown or absent player falls back to `textMuted`.
 *
 * | Player | Token key     | Hex value   |
 * | ------ | ------------- | ----------- |
 * | 1      | playerColor1  | #dc2626     |
 * | 2      | playerColor2  | #2563eb     |
 * | 3      | playerColor3  | #059669     |
 * | 4      | playerColor4  | #d97706     |
 * | *      | textMuted     | #9ca3af     |
 */
const PLAYER_COLORS: Record<number, string> = {
    1: TOKENS.color.playerColor1,
    2: TOKENS.color.playerColor2,
    3: TOKENS.color.playerColor3,
    4: TOKENS.color.playerColor4,
};

/**
 * Props for the {@link EuropaPlayerBadge} component.
 */
export interface EuropaPlayerBadgeProps {
    /** Player number (1–4) selecting the badge color. */
    player: 1 | 2 | 3 | 4;
    /** Optional display name. When absent or empty, falls back to "P{n}". */
    name?: string;
}

/**
 * A game-specific player badge with the player's identity color and an
 * accessible label.
 *
 * Renders a `<span class="europa-badge" role="img">` whose inline `color`
 * reflects the player's identity color and whose `aria-label` combines the
 * player number with an optional name. When no name is provided, falls back
 * to "P{n}".
 *
 * Accessibility (FR-014): `role="img"` with computed `aria-label`.
 *
 * @example
 * ```tsx
 * <EuropaPlayerBadge player={1} name="Alice" />
 * <EuropaPlayerBadge player={3} />
 * ```
 */
export function EuropaPlayerBadge({ player, name }: EuropaPlayerBadgeProps) {
    const color = PLAYER_COLORS[player] ?? TOKENS.color.textMuted;
    const displayText = name && name !== '' ? name : `P${player}`;
    return (
        <span
            className="europa-badge"
            role="img"
            aria-label={name && name !== '' ? `player ${player}: ${name}` : `player ${player}`}
            style={{ color }}
        >
            {displayText}
        </span>
    );
}
