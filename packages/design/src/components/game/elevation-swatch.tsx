import { TOKENS } from '../../tokens.js';

/**
 * Props for the {@link EuropaElevationSwatch} component.
 */
export interface EuropaElevationSwatchProps {
    /** Elevation value in the range [0, 100]. Out-of-range values are clamped. */
    elevation: number;
}

/**
 * Clamp an elevation value to the range [0, 100]. NaN falls back to 0.
 *
 * @param e - Raw elevation input.
 * @returns The clamped elevation value.
 */
function clampElevation(e: number): number {
    if (Number.isNaN(e)) return 0;
    return Math.min(100, Math.max(0, e));
}

/**
 * Interpolate the swatch lightness between the land elevation band's
 * minimum and maximum based on the given elevation (0–100).
 *
 * @param elevation - A clamped elevation value in [0, 100].
 * @returns The interpolated lightness percentage.
 */
function lightnessFor(elevation: number): number {
    const t = elevation / 100;
    return TOKENS.color.landMinLightnessPct + (TOKENS.color.landMaxLightnessPct - TOKENS.color.landMinLightnessPct) * t;
}

/**
 * A small inline-styled color swatch that visualizes a land elevation value.
 *
 * Reads the `elevation` prop (0–100) and renders a `<span role="img">` whose
 * background color is computed by interpolating the land elevation lightness
 * band between `TOKENS.color.landMinLightnessPct` and
 * `TOKENS.color.landMaxLightnessPct`. The color is expressed as
 * `hsl(<landHue>, <landSaturationPct>%, <lightness>%)` using only canonical
 * design tokens — no new hex literals (FR-009 / FR-010).
 *
 * Accessibility (FR-014): `role="img"` with an `aria-label` describing the
 * elevation value (e.g. "elevation 42"), so the color alone is never the
 * only channel of information.
 *
 * @example
 * ```tsx
 * <EuropaElevationSwatch elevation={42} />
 * ```
 */
export function EuropaElevationSwatch({ elevation: raw }: EuropaElevationSwatchProps) {
    const elevation = clampElevation(raw);
    return (
        <span
            role="img"
            aria-label={`elevation ${elevation}`}
            style={{
                display: 'inline-block',
                width: 24,
                height: 24,
                borderRadius: 2,
                backgroundColor: `hsl(${TOKENS.color.landHue}, ${TOKENS.color.landSaturationPct}%, ${lightnessFor(elevation)}%)`,
            }}
        />
    );
}
