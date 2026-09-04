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
    /** Additional CSS class names (e.g. status modifiers like `europa-badge--success`). */
    className?: string;
    /** Label text projected inside the badge. */
    children?: ReactNode;
}

export function EuropaBadge({ className, children }: EuropaBadgeProps) {
    return <span className={className ? `europa-badge ${className}` : 'europa-badge'}>{children}</span>;
}
