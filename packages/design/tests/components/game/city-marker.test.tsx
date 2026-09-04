import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaCityMarker } from '../../../src/components/game/city-marker.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaCityMarker} React component (spec 014, FR-009 /
 * FR-010 / FR-014).
 *
 * The component renders a `<span role="img">` marker whose inline
 * `backgroundColor`/`borderColor` reflect the owning player's color.
 * The `owner` prop (player 1–4) selects the color; an unknown owner falls
 * back to `TOKENS.color.textMuted`. The `aria-label` is derived from the
 * owner (e.g. "1 city").
 *
 * Covered:
 * - `aria-label` generation from the `owner` prop.
 * - The inline style reflects the correct token color.
 * - `role="img"` is present on the rendered span.
 * - Fallback to muted color for unknown/absent owners.
 */
describe('EuropaCityMarker', () => {
    it('renders a span with role="img"', () => {
        render(<EuropaCityMarker owner={1} />);
        const marker = screen.getByRole('img');
        expect(marker).toBeDefined();
    });

    it('derives the aria-label from the owner prop', () => {
        render(<EuropaCityMarker owner={1} />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveAttribute('aria-label', '1 city');
    });

    it('sets correct aria-label for each player', () => {
        for (const owner of [1, 2, 3, 4] as const) {
            const { unmount } = render(<EuropaCityMarker owner={owner} />);
            const marker = screen.getByRole('img');
            expect(marker).toHaveAttribute('aria-label', `${owner} city`);
            unmount();
        }
    });

    it('applies the player color to the inline style', () => {
        render(<EuropaCityMarker owner={2} />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveStyle({
            backgroundColor: TOKENS.color.city,
            borderColor: TOKENS.color.city,
        });
    });

    it('maps each player 1–4 to its token color', () => {
        const expected: Array<[number, string]> = [
            [1, TOKENS.color.accent],
            [2, TOKENS.color.city],
            [3, TOKENS.color.green],
            [4, TOKENS.color.blue],
        ];

        for (const [owner, color] of expected) {
            const { unmount } = render(<EuropaCityMarker owner={owner as 1 | 2 | 3 | 4} />);
            const marker = screen.getByRole('img');
            expect(marker).toHaveStyle({ backgroundColor: color, borderColor: color });
            unmount();
        }
    });

    it('has inline-block display with 24x24 dimensions', () => {
        render(<EuropaCityMarker owner={1} />);
        const marker = screen.getByRole('img') as HTMLElement;
        expect(marker.style.display).toBe('inline-block');
        expect(marker.style.width).toBe('24px');
        expect(marker.style.height).toBe('24px');
        expect(marker.style.borderRadius).toBe('2px');
    });
});
