import { TOKENS } from '../../tokens.js';

/**
 * Props for the {@link EuropaPlayerBadge} component.
 */
export interface EuropaPlayerBadgeProps {
    /**
     * The player's display name. It is also used verbatim as the badge's
     * accessible name. Required: the badge no longer fabricates a `P{n}`
     * fallback from a numeric seat/identity (issue #74) — callers own the
     * label, which is typically a handle or the canonical identity.
     */
    name: string;
    /**
     * CSS color used for the badge text. The caller supplies the player's
     * identity color — typically a `TOKENS.color.playerColor*` value. When
     * absent, the badge falls back to `TOKENS.color.textMuted`.
     */
    color?: string;
}

/**
 * A game-specific player badge with a caller-supplied identity color and
 * accessible name.
 *
 * Renders a `<span class="europa-badge" role="img">` whose inline `color`
 * comes from the `color` prop and whose text content and `aria-label` are the
 * caller-supplied `name`. The component is identity-agnostic: a canonical
 * `PlayerId` is resolved to a display name and color by the caller, keeping
 * identity-to-color and identity-to-label policy out of the presentational
 * layer (issue #74). When no color is supplied the badge falls back to the
 * muted text token.
 *
 * Accessibility: `role="img"` with a computed `aria-label` equal to the
 * caller-supplied `name` — never a fabricated "player N".
 *
 * @example
 * ```tsx
 * <EuropaPlayerBadge name="Alice" color={TOKENS.color.playerColor1} />
 * <EuropaPlayerBadge name="Bob" />
 * ```
 */
export function EuropaPlayerBadge({ name, color }: EuropaPlayerBadgeProps) {
    const resolvedColor = color ?? TOKENS.color.textMuted;
    return (
        <span className="europa-badge" role="img" aria-label={name} style={{ color: resolvedColor }}>
            {name}
        </span>
    );
}
