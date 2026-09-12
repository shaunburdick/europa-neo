import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaPlayerBadge } from '../../../src/components/game/player-badge.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaPlayerBadge} React component (spec 014 v1.4,
 * issue #74).
 *
 * The component renders a `<span class="europa-badge" role="img">` whose
 * inline `color` reflects the caller-supplied `color` prop and whose text and
 * `aria-label` are the caller-supplied `name`. It is identity-agnostic: the
 * caller resolves a canonical `PlayerId` to a display name and color, and the
 * component never fabricates a `P{n}` label.
 *
 * Covered:
 * - `aria-label` equals the caller-supplied name.
 * - The inline style reflects the `color` prop.
 * - Fallback to `textMuted` when `color` is absent.
 * - `role="img"` and `europa-badge` class present on the rendered span.
 * - Display text equals the name.
 */
describe('EuropaPlayerBadge', () => {
    it('renders a span with europa-badge class and role="img"', () => {
        render(<EuropaPlayerBadge name="Alice" color={TOKENS.color.playerColor1} />);
        const badge = screen.getByRole('img');
        expect(badge.classList.contains('europa-badge')).toBe(true);
    });

    it('uses the name as the aria-label', () => {
        render(<EuropaPlayerBadge name="Alice" color={TOKENS.color.playerColor1} />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveAttribute('aria-label', 'Alice');
    });

    it('reflects the caller-supplied color token on the inline style', () => {
        render(<EuropaPlayerBadge name="Alice" color={TOKENS.color.playerColor1} />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveStyle({ color: TOKENS.color.playerColor1 });
    });

    it('accepts each canonical player-color token', () => {
        const cases: ReadonlyArray<readonly [string, string]> = [
            ['playerColor1', TOKENS.color.playerColor1],
            ['playerColor2', TOKENS.color.playerColor2],
            ['playerColor3', TOKENS.color.playerColor3],
            ['playerColor4', TOKENS.color.playerColor4],
        ];

        for (const [name, color] of cases) {
            const { unmount } = render(<EuropaPlayerBadge name="P" color={color} />);
            const badge = screen.getByRole('img');
            expect(badge, `expected ${name} to apply`).toHaveStyle({ color });
            unmount();
        }
    });

    it('accepts any CSS color string, not just design tokens', () => {
        render(<EuropaPlayerBadge name="Alice" color="rgb(1, 2, 3)" />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveStyle({ color: 'rgb(1, 2, 3)' });
    });

    it('displays the name as text', () => {
        render(<EuropaPlayerBadge name="Alice" color={TOKENS.color.playerColor1} />);
        expect(screen.getByText('Alice')).toBeDefined();
    });

    it('does not fabricate a P{n} fallback (name is the label)', () => {
        render(<EuropaPlayerBadge name="Player042" />);
        const badge = screen.getByRole('img');
        expect(badge.textContent).toBe('Player042');
        expect(badge).toHaveAttribute('aria-label', 'Player042');
    });

    it('falls back to textMuted color when color is absent', () => {
        render(<EuropaPlayerBadge name="Alice" />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveStyle({ color: TOKENS.color.textMuted });
    });
});
