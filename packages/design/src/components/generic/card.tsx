import type { ReactNode } from 'react';

/**
 * A simple card wrapper that renders a `<div class="europa-card">`.
 *
 * Projects host children directly (no Shadow DOM, no slot semantics).
 * The class conveys no semantics — the consumer supplies heading
 * structure and interactive content.
 *
 * @example
 * ```tsx
 * <EuropaCard>
 *     <h2>Match summary</h2>
 *     <p>You won!</p>
 * </EuropaCard>
 * ```
 */
export interface EuropaCardProps {
    /** Content projected inside the card. */
    children?: ReactNode;
}

export function EuropaCard({ children }: EuropaCardProps) {
    return <div className="europa-card">{children}</div>;
}
