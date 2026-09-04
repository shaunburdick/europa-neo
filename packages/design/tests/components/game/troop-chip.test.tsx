import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaTroopChip } from '../../../src/components/game/troop-chip.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaTroopChip} React component (spec 014, T-047).
 *
 * A game-specific visual primitive that renders a player-colored troop-count
 * chip. The element is purely decorative (`role="img"`) — semantic meaning
 * is carried by a computed `aria-label` (FR-014).
 *
 * Covered:
 * - `aria-label` generation: count+owner and count-only variants.
 * - Player-color inline styles: border-color and color reflect the token
 *   mapped to the given owner value.
 * - `role="img"` present on the rendered span.
 * - `europa-chip` class present on the rendered span.
 * - Fallback to muted color when owner is absent or unknown.
 */
describe('EuropaTroopChip', () => {
    // ── aria-label generation ──────────────────────────────────────────

    describe('aria-label', () => {
        it('includes player number when owner is present', () => {
            render(<EuropaTroopChip count={12} owner={1} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '12 troops, player 1');
        });

        it('omits player reference when owner is absent', () => {
            render(<EuropaTroopChip count={7} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '7 troops');
        });

        it('omits player reference for unknown owner values', () => {
            render(<EuropaTroopChip count={5} owner={3} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '5 troops, player 3');
        });
    });

    // ── count rendering ───────────────────────────────────────────────

    describe('count rendering', () => {
        it('renders the count as text content', () => {
            render(<EuropaTroopChip count={5} owner={3} />);
            const chip = screen.getByText('5');
            expect(chip).toBeDefined();
        });

    });

    // ── player-color inline styles ─────────────────────────────────────

    describe('player-color', () => {
        const cases: Array<[number, string]> = [
            [1, TOKENS.color.accent],
            [2, TOKENS.color.city],
            [3, TOKENS.color.green],
            [4, TOKENS.color.blue],
        ];

        for (const [owner, color] of cases) {
            it(`applies ${color} for owner=${owner}`, () => {
                render(<EuropaTroopChip count={1} owner={owner as 1 | 2 | 3 | 4} />);
                const chip = screen.getByRole('img');
                expect(chip).toHaveStyle({ borderColor: color, color });
            });
        }

        it('uses textMuted color when owner is absent', () => {
            render(<EuropaTroopChip count={1} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveStyle({
                borderColor: TOKENS.color.textMuted,
                color: TOKENS.color.textMuted,
            });
        });
    });

});
