import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaCityMarker } from '../../../src/components/game/city-marker.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaCityMarker} React component (spec 014 v1.4,
 * issue #74).
 *
 * The component renders a `<span role="img">` marker whose inline
 * `backgroundColor`/`borderColor` reflect the caller-supplied `color` prop.
 * It is identity-agnostic: the caller resolves a canonical `PlayerId` to a
 * color and (optionally) an accessible `label`. An absent color falls back to
 * `TOKENS.color.textMuted`; an absent label falls back to `'city'`.
 *
 * Covered:
 * - Default and caller-supplied `aria-label` values (never a player number).
 * - The inline style reflects the `color` prop.
 * - Fallback to the muted token for an absent color.
 * - `role="img"` present on the rendered span.
 */
describe('EuropaCityMarker', () => {
    it('renders a span with role="img"', () => {
        render(<EuropaCityMarker color={TOKENS.color.playerColor1} />);
        const marker = screen.getByRole('img');
        expect(marker).toBeDefined();
    });

    it('defaults the aria-label to "city"', () => {
        render(<EuropaCityMarker color={TOKENS.color.playerColor1} />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveAttribute('aria-label', 'city');
    });

    it('uses a caller-supplied accessible label', () => {
        render(<EuropaCityMarker color={TOKENS.color.playerColor2} label="Alice's city" />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveAttribute('aria-label', "Alice's city");
    });

    it('applies the caller-supplied color to the inline style', () => {
        render(<EuropaCityMarker color={TOKENS.color.playerColor2} />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveStyle({
            backgroundColor: TOKENS.color.playerColor2,
            borderColor: TOKENS.color.playerColor2,
        });
    });

    it('accepts each canonical player-color token', () => {
        const cases: ReadonlyArray<readonly [string, string]> = [
            ['playerColor1', TOKENS.color.playerColor1],
            ['playerColor2', TOKENS.color.playerColor2],
            ['playerColor3', TOKENS.color.playerColor3],
            ['playerColor4', TOKENS.color.playerColor4],
        ];

        for (const [name, color] of cases) {
            const { unmount } = render(<EuropaCityMarker color={color} />);
            const marker = screen.getByRole('img');
            expect(marker, `expected ${name} to apply`).toHaveStyle({ backgroundColor: color, borderColor: color });
            unmount();
        }
    });

    it('accepts any CSS color string, not just design tokens', () => {
        render(<EuropaCityMarker color="rgb(1, 2, 3)" />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)', borderColor: 'rgb(1, 2, 3)' });
    });

    it('has inline-block display with 24x24 dimensions', () => {
        render(<EuropaCityMarker color={TOKENS.color.playerColor1} />);
        const marker = screen.getByRole('img') as HTMLElement;
        expect(marker.style.display).toBe('inline-block');
        expect(marker.style.width).toBe('24px');
        expect(marker.style.height).toBe('24px');
        expect(marker.style.borderRadius).toBe('2px');
    });

    it('falls back to textMuted color when color is absent', () => {
        render(<EuropaCityMarker />);
        const marker = screen.getByRole('img');
        expect(marker).toHaveStyle({
            backgroundColor: TOKENS.color.textMuted,
            borderColor: TOKENS.color.textMuted,
        });
    });
});
