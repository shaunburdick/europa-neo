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
 * Look up the biome zone color for a swatch elevation.
 * Returns an HSL string with the zone's hue, saturation, and
 * interpolated lightness within the zone's range.
 *
 * @param elevation - Clamped elevation in [0, 100].
 * @returns HSL color string: `hsl(H, S%, L%)`.
 */
function biomeZoneColor(elevation: number): string {
    const scaled = Math.round((elevation / 100) * 255);
    // findIndex returns -1 when no match; Math.max clamps to 0.
    const zoneIdx = Math.max(
        0,
        TOKENS.color.biomeZones.findIndex((z) => scaled <= z.elevationMax),
    );
    // at() with fallback handles noUncheckedIndexedAccess; tuple always
    // has 4 elements (spec 024 FR-001) so [0] is always defined.
    const config = TOKENS.color.biomeZones.at(zoneIdx) ?? TOKENS.color.biomeZones[0];
    const prevMax = zoneIdx > 0 ? (TOKENS.color.biomeZones[zoneIdx - 1]?.elevationMax ?? 0) : 0;
    const zoneSpan = config.elevationMax - prevMax;
    const t = zoneSpan === 0 ? 0 : (scaled - prevMax) / zoneSpan;
    const lightness = Math.round(config.lightnessMin + t * (config.lightnessMax - config.lightnessMin));
    return `hsl(${config.hue}, ${config.saturationPct}%, ${lightness}%)`;
}

/**
 * A small inline-styled color swatch that visualizes a land elevation value.
 *
 * Reads the `elevation` prop (0–100) and renders a `<span role="img">` whose
 * background color is computed by looking up a biome zone (4 zones) from
 * `TOKENS.color.biomeZones`. The color is expressed as
 * `hsl(<hue>, <saturationPct>%, <lightness>%)` using only canonical
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
                backgroundColor: biomeZoneColor(elevation),
            }}
        />
    );
}
