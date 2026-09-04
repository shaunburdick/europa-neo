import type { ReactNode } from 'react';

/**
 * A small pill-shaped label used to annotate content with a short piece of
 * metadata (e.g. a match status, a player count, or a "your match" marker).
 *
 * Renders a `<span class="europa-badge">` with projected children.
 *
 * @example
 * ```tsx
 * <EuropaBadge>Your match</EuropaBadge>
 * ```
 */
export interface EuropaBadgeProps {
    /** Label text projected inside the badge. */
    children?: ReactNode;
}

export function EuropaBadge({ children }: EuropaBadgeProps) {
    return <span className="europa-badge">{children}</span>;
}
