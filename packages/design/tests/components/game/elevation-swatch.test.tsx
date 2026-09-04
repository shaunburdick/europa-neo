import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaElevationSwatch } from '../../../src/components/game/elevation-swatch.js';

/**
 * Tests for the {@link EuropaElevationSwatch} React component (spec 014,
 * FR-009 / FR-010).
 *
 * The component reads an `elevation` prop (0–100) and renders a
 * `<span role="img">` whose background color is computed by interpolating
 * the land elevation lightness band between `TOKENS.color.landMinLightnessPct`
 * (26) and `TOKENS.color.landMaxLightnessPct` (62). The color formula is:
 *
 *     hsl(120, 12%, <lightness>%)
 *     lightness = 26 + (62 − 26) × (elevation / 100)
 *
 * Covered:
 * - Elevation → land-band color formula at boundary and midpoint values.
 * - `aria-label` announcing the elevation value.
 * - Coercion: NaN → 0; out-of-range → clamped to [0, 100].
 * - `role="img"` present on the rendered span.
 */
describe('EuropaElevationSwatch', () => {
    /**
     * Helper: build the expected `hsl(...)` string for a given elevation.
     *
     * Reimplements the component's formula so tests catch formula drift in
     * either direction.
     */
    function expectedHsl(elevation: number): string {
        const clamped = Math.min(100, Math.max(0, elevation));
        const lightness = 26 + (62 - 26) * (clamped / 100);
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
});
