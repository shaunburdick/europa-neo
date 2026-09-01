import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaElevationSwatch } from '../../../src/components/game/elevation-swatch.js';

/**
 * Tests for the `<europa-elevation-swatch>` component (spec 014, FR-009 / FR-010).
 *
 * The component reads an `elevation` attribute (0–100) and renders a
 * `<span role="img">` whose background color is computed by interpolating
 * the land elevation lightness band between `TOKENS.color.landMinLightnessPct`
 * (26) and `TOKENS.color.landMaxLightnessPct` (62). The color formula is:
 *
 *     hsl(120, 12%, <lightness>%)
 *     lightness = 26 + (62 − 26) × (elevation / 100)
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - Elevation → land-band color formula at boundary and midpoint values.
 * - `aria-label` announcing the elevation value.
 * - Coercion: missing / non-numeric → 0; out-of-range → clamped to [0, 100].
 * - `role="img"` present on the internal span.
 */
describe('europa-elevation-swatch', () => {
    beforeAll(() => {
        customElements.define('europa-elevation-swatch', EuropaElevationSwatch);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

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
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '0');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(0));
    });

    it('sets the correct background color for elevation 100', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '100');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(100));
    });

    it('sets the correct background color for elevation 50', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '50');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(50));
    });

    it('sets the correct background color for elevation 42', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '42');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(42));
    });

    it('sets aria-label with the elevation value', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '42');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.getAttribute('aria-label')).toBe('elevation 42');
    });

    it('coerces missing elevation to 0', () => {
        const el = document.createElement('europa-elevation-swatch');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(0));
        expect(span?.getAttribute('aria-label')).toBe('elevation 0');
    });

    it('coerces non-numeric elevation to 0', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', 'abc');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(0));
        expect(span?.getAttribute('aria-label')).toBe('elevation 0');
    });

    it('clamps negative elevation to 0', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '-10');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(0));
        expect(span?.getAttribute('aria-label')).toBe('elevation 0');
    });

    it('clamps elevation above 100 to 100', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '200');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.style.backgroundColor).toBe(expectedHsl(100));
        expect(span?.getAttribute('aria-label')).toBe('elevation 100');
    });

    it('renders role="img" on the internal span', () => {
        const el = document.createElement('europa-elevation-swatch');
        el.setAttribute('elevation', '50');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.getAttribute('role')).toBe('img');
    });
});
