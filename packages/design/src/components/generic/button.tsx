import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * A button component wrapping a native `<button>` element with the shared
 * `europa-*` CSS class catalog.
 *
 * Renders a native `<button>` for full keyboard, focus, and form
 * participation. Applies `europa-button` + variant/size modifier classes.
 * Boolean attributes (`disabled`) and passthrough attributes (`type`,
 * `aria-label`) are forwarded to the native button.
 *
 * **Form association**: In the React conversion, form submission is handled
 * natively by `<button type="submit">` inside a `<form>` — no
 * `ElementInternals` needed since React manages the DOM directly.
 *
 * **Attributes**:
 * - `variant` — maps to `europa-button--<variant>` modifier class.
 * - `size` — maps to `europa-button--<size>` modifier class.
 * - `disabled` — forwarded to the native button's `disabled`.
 * - `type` — forwarded to the native button's `type` (default `button`).
 * - `aria-label` — forwarded to the native button.
 *
 * @example
 * ```tsx
 * <EuropaButton variant="primary">Deploy</EuropaButton>
 * <EuropaButton size="sm" disabled>Disabled</EuropaButton>
 * <EuropaButton type="submit" aria-label="Save changes">Save</EuropaButton>
 * ```
 */
export interface EuropaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual variant modifier. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'warning' | 'error' | 'info';
    /** Size modifier. */
    size?: 'sm' | 'lg';
    /** Button type. Defaults to `'button'`. */
    type?: 'button' | 'submit' | 'reset';
    /** Content projected inside the button. */
    children?: ReactNode;
}

export function EuropaButton({
    variant,
    size,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
}: EuropaButtonProps) {
    const classes = [
        'europa-button',
        variant && `europa-button--${variant}`,
        size && `europa-button--${size}`,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button className={classes} disabled={disabled} type={type} {...rest}>
            {children}
        </button>
    );
}
