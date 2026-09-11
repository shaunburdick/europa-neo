import { TOKENS } from '../../tokens.js';

/**
 * Component-local player-color map for game primitives.
 *
 * Each player maps to the dedicated `playerColorN` token (spec 012 FR-023,
 * issue #148). These tokens are the single source of truth for player
 * ownership colors; no other file should hardcode player-color hex values.
 */
const PLAYER_COLORS: Record<number, string> = {
    1: TOKENS.color.playerColor1,
    2: TOKENS.color.playerColor2,
    3: TOKENS.color.playerColor3,
    4: TOKENS.color.playerColor4,
};

/**
 * Props for the {@link EuropaCityMarker} component.
 */
export interface EuropaCityMarkerProps {
    /** Player number (1–4) selecting the marker color. */
    owner: 1 | 2 | 3 | 4;
}

/**
 * A city ownership indicator.
 *
 * Renders a small inline-styled `<span role="img">` marker filled with the
 * owning player's color. The `owner` prop selects the color from the
 * component-local `PLAYER_COLORS` map; an unknown owner falls back to the
 * muted text color.
 *
 * Accessibility (FR-014): `role="img"` with an `aria-label` derived from the
 * owner (e.g. "1 city").
 *
 * @example
 * ```tsx
 * <EuropaCityMarker owner={2} />
 * ```
 */
export function EuropaCityMarker({ owner }: EuropaCityMarkerProps) {
    const color = PLAYER_COLORS[owner] ?? TOKENS.color.textMuted;
    return (
        <span
            role="img"
            aria-label={`${owner} city`}
            style={{
                display: 'inline-block',
                width: 24,
                height: 24,
                borderRadius: 2,
                backgroundColor: color,
                borderColor: color,
            }}
        />
    );
}
