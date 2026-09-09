import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaElevationSwatch } from '../../../src/components/game/elevation-swatch.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaElevationSwatch} React component (spec 024,
 * FR-041 — 4 biome zones replacing 6 bands).
 *
 * The component reads an `elevation` prop (0–100) and renders a
 * `<span role="img">` whose background color is computed by looking up
 * a biome zone (4 zones) from `TOKENS.color.biomeZones`. The elevation
 * range 0–100 is mapped to the palette's 0–255 range.
 *
 * Covered:
 * - Elevation → biome-zone-matched color at boundary and midpoint values.
 * - `aria-label` announcing the elevation value.
 * - Coercion: NaN → 0; out-of-range → clamped to [0, 100].
 * - `role="img"` present on the rendered span.
 * - 4 distinct biome zones visible (AC-024).
 */
describe('EuropaElevationSwatch', () => {
    /**
     * Helper: build the expected `hsl(...)` string for a given elevation
     * using the biome zone lookup matching the component's formula.
     *
     * Maps elevation 0–100 → palette 0–255 → biome zone → HSL color.
     */
    function expectedHsl(elevation: number): string {
        const clamped = Math.min(100, Math.max(0, elevation));
        const scaled = Math.round((clamped / 100) * 255);
        const zones = TOKENS.color.biomeZones;
        let zoneIndex = 0;
        for (let i = 0; i < zones.length; i++) {
            if (scaled <= zones[i].elevationMax) {
                zoneIndex = i;
                break;
            }
        }
        const zone = zones[zoneIndex];
        const prevMax = zoneIndex === 0 ? 0 : zones[zoneIndex - 1].elevationMax;
        const zoneSpan = zone.elevationMax - prevMax;
        const t = zoneSpan === 0 ? 0 : (scaled - prevMax) / zoneSpan;
        const lightness = Math.round(zone.lightnessMin + t * (zone.lightnessMax - zone.lightnessMin));
        return `hsl(${zone.hue}, ${zone.saturationPct}%, ${lightness}%)`;
    }

    it('sets the correct background color for elevation 0 (Ice Plains)', () => {
        render(<EuropaElevationSwatch elevation={0} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(0) });
    });

    it('sets the correct background color for elevation 100 (Peaks)', () => {
        render(<EuropaElevationSwatch elevation={100} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(100) });
    });

    it('sets the correct background color for elevation 50 (Fractured Ice)', () => {
        render(<EuropaElevationSwatch elevation={50} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(50) });
    });

    it('sets aria-label with the elevation value', () => {
        render(<EuropaElevationSwatch elevation={42} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveAttribute('aria-label', 'elevation 42');
    });

    it('coerces NaN elevation to 0', () => {
        render(<EuropaElevationSwatch elevation={Number.NaN} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(0) });
        expect(swatch).toHaveAttribute('aria-label', 'elevation 0');
    });

    it('clamps negative elevation to 0', () => {
        render(<EuropaElevationSwatch elevation={-10} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(0) });
        expect(swatch).toHaveAttribute('aria-label', 'elevation 0');
    });

    it('clamps elevation above 100 to 100', () => {
        render(<EuropaElevationSwatch elevation={200} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(100) });
        expect(swatch).toHaveAttribute('aria-label', 'elevation 100');
    });

    it('has inline-block display with 24x24 dimensions', () => {
        render(<EuropaElevationSwatch elevation={50} />);
        const swatch = screen.getByRole('img') as HTMLElement;
        expect(swatch.style.display).toBe('inline-block');
        expect(swatch.style.width).toBe('24px');
        expect(swatch.style.height).toBe('24px');
        expect(swatch.style.borderRadius).toBe('2px');
    });

    it('renders 4 distinct biome zone colors across the elevation range', () => {
        // Elevation 10 → Smooth Ice (hue 210)
        // Elevation 45 → Fractured Ice (hue 170)
        // Elevation 70 → Rocky Outcrops (hue 30)
        // Elevation 90 → Ice Peaks (hue 200)
        const elevations = [10, 45, 70, 90];
        const expectedHues = [210, 170, 30, 200];

        for (let i = 0; i < elevations.length; i++) {
            render(<EuropaElevationSwatch elevation={elevations[i]} />);
            const swatch = screen.getAllByRole('img')[i];
            const bg = swatch.style.backgroundColor;
            // Verify the hue appears in the HSL string
            expect(bg).toContain(`${expectedHues[i]}`);
        }
    });

    it('uses biome zone colors at zone boundaries', () => {
        // Elevation 0 → Smooth Ice (hue 210, lightness 38)
        render(<EuropaElevationSwatch elevation={0} />);
        expect(screen.getByRole('img')).toHaveStyle({ backgroundColor: 'hsl(210, 65%, 38%)' });

        // Elevation 100 → Ice Peaks (hue 200, lightness 95)
        render(<EuropaElevationSwatch elevation={100} />);
        const swatches = screen.getAllByRole('img');
        expect(swatches[1]).toHaveStyle({ backgroundColor: expectedHsl(100) });
    });
});
