import type { ReactNode } from 'react';

/**
 * A content-surface primitive that renders a `<div class="europa-plate">`.
 *
 * Projects host children directly. No attributes — the consumer
 * supplies heading structure as needed.
 *
 * @example
 * ```tsx
 * <EuropaPlate>
 *     <h3>Section title</h3>
 *     <p>Body content goes here.</p>
 * </EuropaPlate>
 * ```
 */
export interface EuropaPlateProps {
    /** Content projected inside the plate. */
    children?: ReactNode;
}

export function EuropaPlate({ children }: EuropaPlateProps) {
    return <div className="europa-plate">{children}</div>;
}
