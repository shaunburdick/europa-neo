import { TOKENS } from '../../tokens.js';

/**
 * Component-local player-color map for game primitives.
 *
 * Reuses existing `TOKENS.color.*` values — no new token variables and no new
 * hex literals (FR-010, plan decision D-7).
 */
const PLAYER_COLORS: Record<number, string> = {
    1: TOKENS.color.accent,
    2: TOKENS.color.city,
    3: TOKENS.color.green,
    4: TOKENS.color.blue,
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
