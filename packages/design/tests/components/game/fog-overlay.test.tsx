import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaFogOverlay } from '../../../src/components/game/fog-overlay.js';

/**
 * Tests for the {@link EuropaFogOverlay} React component (spec 014, FR-014).
 *
 * The component renders a single `<div aria-hidden="true">` overlay when
 * visible, or nothing when hidden. The overlay is purely visual:
 * `aria-hidden="true"` ensures screen readers never announce it.
 *
 * The `visible` prop defaults to `true` — the overlay is shown unless
 * `visible={false}` is explicitly passed.
 *
 * Covered:
 * - Default visibility: overlay rendered when `visible` is absent.
 * - Hidden when `visible={false}` (renders nothing).
 * - Toggle behavior when `visible` prop changes.
 */
describe('EuropaFogOverlay', () => {
    it('renders the overlay div by default', () => {
        const { container } = render(<EuropaFogOverlay />);
        const overlay = container.querySelector('div[aria-hidden="true"]');
        expect(overlay).not.toBeNull();
    });

    it('renders nothing when visible is false', () => {
        const { container } = render(<EuropaFogOverlay visible={false} />);
        const overlay = container.querySelector('div[aria-hidden="true"]');
        expect(overlay).toBeNull();
    });

    it('toggles visibility when the visible prop changes', () => {
        const { rerender, container } = render(<EuropaFogOverlay />);
        let overlay = container.querySelector('div[aria-hidden="true"]');
        expect(overlay).not.toBeNull();

        rerender(<EuropaFogOverlay visible={false} />);
        overlay = container.querySelector('div[aria-hidden="true"]');
        expect(overlay).toBeNull();

        rerender(<EuropaFogOverlay visible={true} />);
        overlay = container.querySelector('div[aria-hidden="true"]');
        expect(overlay).not.toBeNull();
    });
});
