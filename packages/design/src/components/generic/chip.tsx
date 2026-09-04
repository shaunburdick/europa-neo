import type { ReactNode } from 'react';

/**
 * A pill-shaped count badge that renders a `<span class="europa-chip">`.
 *
 * The `count` prop is rendered as text content before any projected
 * children (e.g. a troop count followed by a label).
 *
 * @example
 * ```tsx
 * <EuropaChip count={12} />
 * <EuropaChip count={5}>troops</EuropaChip>
 * ```
 */
export interface EuropaChipProps {
    /** Numeric or string count displayed before children. */
    count?: number | string;
    /** Optional label text projected after the count. */
    children?: ReactNode;
}

export function EuropaChip({ count, children }: EuropaChipProps) {
    return (
        <span className="europa-chip">
            {count}
            {children}
        </span>
    );
}
