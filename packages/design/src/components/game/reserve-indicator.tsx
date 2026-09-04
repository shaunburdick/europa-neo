/**
 * Props for the {@link EuropaReserveIndicator} component.
 */
export interface EuropaReserveIndicatorProps {
    /** Reserve percentage (0–90). Values are clamped and rounded to nearest 10. */
    percent: number;
}

/**
 * Clamp a percent value to the range [0, 90] in steps of 10.
 *
 * A NaN value falls back to 0. Values not aligned to a step of 10 are
 * rounded to the nearest valid step.
 *
 * @param p - Raw percent input.
 * @returns The clamped percentage value.
 */
function clampPercent(p: number): number {
    if (Number.isNaN(p)) return 0;
    const clamped = Math.min(90, Math.max(0, p));
    return Math.round(clamped / 10) * 10;
}

/**
 * A reserve-percentage display wrapping the `.europa-chip` catalog class.
 *
 * Renders a `<span class="europa-chip" role="img">` whose text content is the
 * clamped percent value (e.g. "30%") and whose `aria-label` describes the
 * reserves (e.g. "reserves 30%").
 *
 * Accessibility (FR-014): `role="img"` with `aria-label` containing the
 * percentage, so the text alone is never the only channel of information.
 *
 * @example
 * ```tsx
 * <EuropaReserveIndicator percent={30} />
 * <EuropaReserveIndicator percent={70} />
 * ```
 */
export function EuropaReserveIndicator({ percent: raw }: EuropaReserveIndicatorProps) {
    const percent = clampPercent(raw);
    return (
        <span className="europa-chip" role="img" aria-label={`reserves ${percent}%`}>
            {percent}%
        </span>
    );
}
