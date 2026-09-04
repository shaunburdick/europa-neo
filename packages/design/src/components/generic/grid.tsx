import type { ReactNode } from 'react';

/**
 * A layout grid wrapper that renders a `<div class="europa-grid">`.
 *
 * The `variant` prop selects an optional modifier class:
 * - `sidebar` → adds `europa-grid--sidebar`
 * - `wrap` → adds `europa-grid--wrap`
 * - absent/other → base `europa-grid` only
 *
 * The element is layout-only: DOM order equals reading order, so no
 * ARIA roles are required.
 *
 * @example
 * ```tsx
 * <EuropaGrid variant="sidebar">
 *     <aside>Sidebar content</aside>
 *     <main>Main content</main>
 * </EuropaGrid>
 * ```
 */
export interface EuropaGridProps {
    /** Layout variant. */
    variant?: 'sidebar' | 'wrap';
    /** Content projected inside the grid. */
    children?: ReactNode;
}

export function EuropaGrid({ variant, children }: EuropaGridProps) {
    const classes = [
        'europa-grid',
        variant === 'sidebar' && 'europa-grid--sidebar',
        variant === 'wrap' && 'europa-grid--wrap',
    ]
        .filter(Boolean)
        .join(' ');

    return <div className={classes}>{children}</div>;
}
