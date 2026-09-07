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
 * Map swatch elevation (0–100) to palette band index (0–5).
 * The palette uses 0–255 range; the swatch maps its 0–100 input
 * to the palette's 0–255 range for band lookup.
 *
 * @param elevation - Clamped elevation in [0, 100].
 * @returns Band index 0–5.
 */
function bandIndex(elevation: number): number {
    const scaled = Math.round((elevation / 100) * 255);
    if (scaled <= 0) return 0;
    if (scaled >= 255) return 5;
    return Math.min(5, Math.floor((scaled / 256) * TOKENS.color.landBandCount));
}

/**
 * Look up the lightness for a swatch elevation using discrete bands
 * matching the board's visual language.
 *
 * @param elevation - Clamped elevation in [0, 100].
 * @returns The band-matched lightness percentage.
 */
function lightnessFor(elevation: number): number {
    const band = bandIndex(elevation);
    return TOKENS.color.landBandLightness[band] ?? TOKENS.color.landMinLightnessPct;
}

/**
 * A small inline-styled color swatch that visualizes a land elevation value.
 *
 * Reads the `elevation` prop (0–100) and renders a `<span role="img">` whose
 * background color is computed by looking up a discrete elevation band (6 bands)
 * from `TOKENS.color.landBandLightness`. The color is expressed as
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
