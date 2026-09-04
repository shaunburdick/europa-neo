import type { ReactNode } from 'react';

/**
 * A page-level wrapper that renders a `<div class="europa-page">`.
 *
 * Projects host children directly. The class conveys no semantics —
 * the consumer supplies heading structure and interactive content.
 *
 * @example
 * ```tsx
 * <EuropaPage>
 *     <h1>Match lobby</h1>
 *     <p>Pick a match to join.</p>
 * </EuropaPage>
 * ```
 */
export interface EuropaPageProps {
    /** Content projected inside the page wrapper. */
    children?: ReactNode;
}

export function EuropaPage({ children }: EuropaPageProps) {
    return <div className="europa-page">{children}</div>;
}
