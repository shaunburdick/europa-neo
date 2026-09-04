import { TOKENS } from '../../tokens.js';

/**
 * The pipe flow directions {@link EuropaPipeSlope} can render, matching the
 * console's pipe-slope rendering (spec 005 FR-013).
 */
export type PipeSlopeDirection = 'downhill' | 'flat' | 'uphill' | 'stalled';

/**
 * Direction → canonical token color map.
 *
 * Uses only existing `TOKENS.color.pipe*` values — zero new hex literals
 * (FR-009 / FR-010).
 */
const DIRECTION_COLORS: Record<PipeSlopeDirection, string> = {
    downhill: TOKENS.color.pipeDownhill,
    flat: TOKENS.color.pipeFlat,
    uphill: TOKENS.color.pipeUphill,
    stalled: TOKENS.color.pipeStalled,
};

/**
 * Props for the {@link EuropaPipeSlope} component.
 */
export interface EuropaPipeSlopeProps {
    /** Pipe flow direction. Defaults to `'stalled'` when absent or invalid. */
    direction?: PipeSlopeDirection;
    /** Intensity of the elevation gradient (0–1). Defaults to 1. */
    intensity?: number;
}

/**
 * Validate and resolve the direction prop, falling back to `'stalled'`.
 *
 * @param raw - Raw direction input.
 * @returns A valid {@link PipeSlopeDirection}.
 */
function resolveDirection(raw?: PipeSlopeDirection): PipeSlopeDirection {
    if (raw === 'downhill' || raw === 'flat' || raw === 'uphill' || raw === 'stalled') {
        return raw;
    }
    return 'stalled';
}

/**
 * Clamp an intensity value to the range [0, 1]. NaN falls back to 1.
 *
 * @param raw - Raw intensity input.
 * @returns The clamped intensity.
 */
function resolveIntensity(raw?: number): number {
    if (raw === undefined || Number.isNaN(raw)) return 1;
    return Math.max(0, Math.min(1, raw));
}

/**
 * Build the aria-label string. When intensity < 1, includes a qualitative
 * description ("light", "moderate", or "strong").
 *
 * @param direction - A resolved pipe flow direction.
 * @param intensity - The resolved intensity (0–1).
 * @returns The aria-label value.
 */
function buildAriaLabel(direction: PipeSlopeDirection, intensity: number): string {
    const base = `pipe ${direction}`;
    if (direction === 'stalled' || intensity >= 1) return base;
    const qualifier = intensity < 0.33 ? 'light' : intensity < 0.67 ? 'moderate' : 'strong';
    return `${base}, ${qualifier} gradient`;
}

/**
 * A small inline-styled triangle that visualizes the flow direction of a
 * pipe segment.
 *
 * Reads the `direction` prop (`downhill` | `flat` | `uphill` | `stalled`)
 * and renders a `<span role="img">` whose fill color is the corresponding
 * canonical pipe token. An unknown or absent direction falls back to the
 * muted `pipeStalled` token. The triangle is drawn with CSS borders.
 *
 * Optionally reads the `intensity` prop (0–1, default 1) to scale the
 * triangle size. Stalled pipes always render at full size.
 *
 * Accessibility (FR-014): `role="img"` with computed `aria-label` describing
 * the flow direction and optional intensity qualifier.
 *
 * @example
 * ```tsx
 * <EuropaPipeSlope direction="downhill" />
 * <EuropaPipeSlope direction="uphill" intensity={0.5} />
 * <EuropaPipeSlope direction="stalled" />
 * ```
 */
export function EuropaPipeSlope({ direction: rawDir, intensity: rawInt }: EuropaPipeSlopeProps) {
    const direction = resolveDirection(rawDir);
    const intensity = resolveIntensity(rawInt);
    const color = DIRECTION_COLORS[direction];
    const scale = direction === 'stalled' ? 1 : 0.4 + intensity * 0.6;

    return (
        <span
            role="img"
            aria-label={buildAriaLabel(direction, intensity)}
            style={{
                display: 'inline-block',
                width: 0,
                height: 0,
                borderStyle: 'solid',
                borderTopColor: 'transparent',
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomWidth: Math.round(16 * scale),
                borderLeftWidth: Math.round(12 * scale),
                borderRightWidth: Math.round(12 * scale),
                borderBottomColor: color,
            }}
        />
    );
}
