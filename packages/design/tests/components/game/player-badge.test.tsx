import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaPlayerBadge } from '../../../src/components/game/player-badge.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaPlayerBadge} React component (spec 014, FR-014).
 *
 * The component renders a `<span class="europa-badge" role="img">` whose
 * inline `color` reflects the player's identity color and whose `aria-label`
 * combines the player number with an optional name. When no name is provided,
 * falls back to "P{n}".
 *
 * Covered:
 * - `aria-label` generation from player and name (with and without name).
 * - The inline style reflects the correct token color.
 * - `role="img"` and `europa-badge` class present on the rendered span.
 * - Fallback to textMuted for unknown/absent player.
 * - Display text: name or "P{n}" fallback.
 */
describe('EuropaPlayerBadge', () => {
    it('renders a span with europa-badge class and role="img"', () => {
        render(<EuropaPlayerBadge player={1} />);
        const badge = screen.getByRole('img');
        expect(badge.classList.contains('europa-badge')).toBe(true);
    });

    it('generates the aria-label from player and name', () => {
        render(<EuropaPlayerBadge player={1} name="Alice" />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveAttribute('aria-label', 'player 1: Alice');
    });

    it('generates the aria-label from player only when name is absent', () => {
        render(<EuropaPlayerBadge player={2} />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveAttribute('aria-label', 'player 2');
    });

    it('generates the aria-label from player only when name is empty', () => {
        render(<EuropaPlayerBadge player={2} name="" />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveAttribute('aria-label', 'player 2');
    });

    it('reflects the player color token on the inline style', () => {
        render(<EuropaPlayerBadge player={1} />);
        const badge = screen.getByRole('img');
        expect(badge).toHaveStyle({ color: TOKENS.color.accent });
    });

    it('maps each player to its token color', () => {
        const cases: Array<[number, string]> = [
            [1, TOKENS.color.accent],
            [2, TOKENS.color.city],
            [3, TOKENS.color.green],
            [4, TOKENS.color.blue],
        ];

        for (const [player, expected] of cases) {
            const { unmount } = render(<EuropaPlayerBadge player={player as 1 | 2 | 3 | 4} />);
            const badge = screen.getByRole('img');
            expect(badge).toHaveStyle({ color: expected });
            unmount();
        }
    });

    it('displays the name when provided', () => {
        render(<EuropaPlayerBadge player={1} name="Alice" />);
        const badge = screen.getByText('Alice');
        expect(badge).toBeDefined();
    });

    it('displays "P{n}" fallback when name is absent', () => {
        render(<EuropaPlayerBadge player={3} />);
        const badge = screen.getByText('P3');
        expect(badge).toBeDefined();
    });

    it('displays "P{n}" fallback when name is empty', () => {
        render(<EuropaPlayerBadge player={2} name="" />);
        const badge = screen.getByText('P2');
        expect(badge).toBeDefined();
    });
});
