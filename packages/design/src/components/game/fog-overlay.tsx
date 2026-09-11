/**
 * Props for the {@link EuropaFogOverlay} component.
 */
export interface EuropaFogOverlayProps {
    /** Whether the fog overlay is visible. Defaults to `true`. */
    visible?: boolean;
}

/**
 * A fog-of-war visual indicator.
 *
 * Renders a single `<div>` overlay that covers its host area to represent
 * unexplored fog. The overlay is purely visual (FR-014):
 * it carries `aria-hidden="true"` so screen readers never announce it.
 *
 * Styled via the `.europa-fog-overlay` catalog class (catalog.css):
 * `position: absolute; inset: 0; background: var(--europa-color-overlay-soft)`.
 * The `overlaySoft` token (`rgba(26, 34, 51, 0.6)`) provides a semi-transparent
 * dark wash that visually distinguishes fog-covered cells without obscuring
 * the underlying terrain pattern entirely.
 *
 * The `visible` prop controls whether the overlay is shown. The default is
 * **visible** (`true`) — a fog overlay is present by default and hidden
 * only when the fog clears.
 *
 * @example
 * ```tsx
 * <EuropaFogOverlay />
 * <EuropaFogOverlay visible={false} />
 * ```
 */
export function EuropaFogOverlay({ visible = true }: EuropaFogOverlayProps) {
    if (!visible) return null;
    return <div className="europa-fog-overlay" aria-hidden="true" />;
}
