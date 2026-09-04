import type { ReactNode } from 'react';

/**
 * A vertical-stack layout primitive that renders a `<div class="europa-stack">`.
 *
 * Projects host children directly. The catalog class provides vertical
 * spacing and flex direction via the shared catalog stylesheet.
 *
 * @example
 * ```tsx
 * <EuropaStack>
 *     <EuropaButton>First</EuropaButton>
 *     <EuropaButton>Second</EuropaButton>
 * </EuropaStack>
 * ```
 */
export interface EuropaStackProps {
    /** Content projected inside the stack. */
    children?: ReactNode;
}

export function EuropaStack({ children }: EuropaStackProps) {
    return <div className="europa-stack">{children}</div>;
}
