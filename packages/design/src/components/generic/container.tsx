import type { ReactNode } from 'react';

/**
 * A container wrapper that renders a `<div class="europa-container">`.
 *
 * Projects host children directly. The class conveys no semantics —
 * the consumer supplies heading structure and interactive content.
 *
 * @example
 * ```tsx
 * <EuropaContainer>
 *     <h2>Lobby</h2>
 *     <p>Find a match below.</p>
 * </EuropaContainer>
 * ```
 */
export interface EuropaContainerProps {
    /** Content projected inside the container. */
    children?: ReactNode;
}

export function EuropaContainer({ children }: EuropaContainerProps) {
    return <div className="europa-container">{children}</div>;
}
