import type { JSX, ReactNode } from 'react';

type TypographyVariant = 'heading' | 'subheading' | 'body' | 'label' | 'caption';

/**
 * Maps each variant to the semantic HTML element it renders.
 * `label` and `caption` both render a `<span>` — they differ only in the
 * catalog modifier class applied.
 */
const VARIANT_TAGS: Record<TypographyVariant, keyof JSX.IntrinsicElements> = {
    heading: 'h2',
    subheading: 'h3',
    body: 'p',
    label: 'span',
    caption: 'span',
};

/**
 * A semantic typography primitive that renders the correct heading/paragraph
 * element for a given `variant` and applies the matching `europa-typography`
 * catalog class.
 *
 * - `heading` → `<h2>`
 * - `subheading` → `<h3>`
 * - `body` (default) → `<p>`
 * - `label` → `<span>`
 * - `caption` → `<span>`
 *
 * @example
 * ```tsx
 * <EuropaTypography variant="heading">Combat</EuropaTypography>
 * <EuropaTypography variant="body">Some prose.</EuropaTypography>
 * ```
 */
export interface EuropaTypographyProps {
    /** Typography variant selecting the rendered element. Defaults to `'body'`. */
    variant?: TypographyVariant;
    /** Content projected inside the semantic element. */
    children?: ReactNode;
}

export function EuropaTypography({ variant = 'body', children }: EuropaTypographyProps) {
    const Tag = VARIANT_TAGS[variant];
    return <Tag className={`europa-typography europa-typography--${variant}`}>{children}</Tag>;
}
