import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaElevationSwatch } from '../../../src/components/game/elevation-swatch.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaElevationSwatch} React component (spec 021,
 * FR-008 — discrete band lookup).
 *
 * The component reads an `elevation` prop (0–100) and renders a
 * `<span role="img">` whose background color is computed by looking up
 * a discrete elevation band (6 bands) from `TOKENS.color.landBandLightness`.
 * The elevation range 0–100 is mapped to the palette's 0–255 range.
 *
 * Covered:
 * - Elevation → band-matched color at boundary and midpoint values.
 * - `aria-label` announcing the elevation value.
 * - Coercion: NaN → 0; out-of-range → clamped to [0, 100].
 * - `role="img"` present on the rendered span.
 */
describe('EuropaElevationSwatch', () => {
    /**
     * Helper: build the expected `hsl(...)` string for a given elevation
     * using the discrete band lookup matching the component's formula.
     *
     * Maps elevation 0–100 → palette 0–255 → band index 0–5 → lightness.
     */
    function expectedHsl(elevation: number): string {
        const clamped = Math.min(100, Math.max(0, elevation));
        const scaled = Math.round((clamped / 100) * 255);
        let band = 0;
        if (scaled > 0 && scaled < 255) {
            band = Math.min(5, Math.floor((scaled / 256) * TOKENS.color.landBandCount));
        } else if (scaled >= 255) {
            band = 5;
        }
        const lightness = TOKENS.color.landBandLightness[band];
        return `hsl(120, 12%, ${lightness}%)`;
    }

    it('sets the correct background color for elevation 0', () => {
        render(<EuropaElevationSwatch elevation={0} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(0) });
    });

    it('sets the correct background color for elevation 100', () => {
        render(<EuropaElevationSwatch elevation={100} />);
        const swatch = screen.getByRole('img');
        expect(swatch).toHaveStyle({ backgroundColor: expectedHsl(100) });
    });

    it('sets the correct background color for elevation 50', () => {
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

    it('uses discrete band colors at boundary elevations', () => {
        // Elevation 0 → band 0 → lightness 18
        render(<EuropaElevationSwatch elevation={0} />);
        expect(screen.getByRole('img')).toHaveStyle({ backgroundColor: 'hsl(120, 12%, 18%)' });

        // Elevation 42 → scaled to ~107 → band 2 → lightness 34
        render(<EuropaElevationSwatch elevation={42} />);
        const swatches = screen.getAllByRole('img');
        expect(swatches[1]).toHaveStyle({ backgroundColor: expectedHsl(42) });
    });
});
