import type { HTMLAttributes, ReactNode } from 'react';

/**
 * A status/alert banner that renders a `<div class="europa-banner">`.
 *
 * The `variant` prop selects the accessibility contract:
 * - `status` (default): `role="status"` + `aria-live="polite"`
 * - `alert`: `role="alert"` + `aria-live="assertive"`
 *
 * @example
 * ```tsx
 * <EuropaBanner variant="alert">Reconnecting to match…</EuropaBanner>
 * ```
 */
export interface EuropaBannerProps extends HTMLAttributes<HTMLDivElement> {
    /** Visual and accessibility variant. Defaults to `'status'`. */
    variant?: 'status' | 'alert';
    /** Content projected inside the banner. */
    children?: ReactNode;
}

export function EuropaBanner({ variant = 'status', children, className, ...rest }: EuropaBannerProps) {
    const isAlert = variant === 'alert';
    return (
        <div
            className={`europa-banner europa-banner--${variant}${className !== undefined ? ` ${className}` : ''}`}
            role={isAlert ? 'alert' : 'status'}
            aria-live={isAlert ? 'assertive' : 'polite'}
            {...rest}
        >
            {children}
        </div>
    );
}
