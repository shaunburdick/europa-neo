import { TOKENS } from '../../tokens.js';

/**
 * Props for the {@link EuropaCityMarker} component.
 */
export interface EuropaCityMarkerProps {
    /**
     * CSS color used to fill the marker (background and border). The caller
     * supplies the owning player's identity color — typically a
     * `TOKENS.color.playerColor*` value. When absent, the marker falls back to
     * `TOKENS.color.textMuted`.
     */
    color?: string;
    /**
     * Accessible name for the marker. Defaults to `'city'`. Callers may supply
     * an owner-specific label (e.g. a player's name) without the component
     * needing to know anything about identity ordering.
     */
    label?: string;
}

/**
 * A city ownership indicator.
 *
 * Renders a small inline-styled `<span role="img">` marker filled with a color
 * supplied by the caller via the `color` prop. The component is deliberately
 * identity-agnostic: a canonical `PlayerId` is resolved to a color by the
 * caller, keeping identity-to-color policy out of the presentational layer
 * (issue #74). When no color is supplied the marker falls back to the muted
 * text token.
 *
 * Accessibility: `role="img"` with an `aria-label` that defaults to `'city'`
 * and may be overridden by the caller-supplied `label`. The label never
 * encodes a numeric player number.
 *
 * @example
 * ```tsx
 * <EuropaCityMarker color={TOKENS.color.playerColor2} />
 * <EuropaCityMarker color={TOKENS.color.playerColor2} label="Alice's city" />
 * ```
 */
export function EuropaCityMarker({ color, label }: EuropaCityMarkerProps) {
    const resolvedColor = color ?? TOKENS.color.textMuted;
    return (
        <span
            role="img"
            aria-label={label ?? 'city'}
            style={{
                display: 'inline-block',
                width: 24,
                height: 24,
                borderRadius: 2,
                backgroundColor: resolvedColor,
                borderColor: resolvedColor,
            }}
        />
    );
}
