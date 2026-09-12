import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaTroopChip } from '../../../src/components/game/troop-chip.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaTroopChip} React component (spec 014 v1.4,
 * issue #74).
 *
 * A game-specific visual primitive that renders a caller-colored troop-count
 * chip. The element is purely decorative (`role="img"`) — semantic meaning is
 * carried by a computed `aria-label` derived from the count alone (FR-014).
 * The component is identity-agnostic: it takes an explicit `color` prop and
 * knows nothing about player ordering.
 *
 * Covered:
 * - `aria-label` derives from the count and never mentions a player.
 * - The inline `border-color`/`color` reflect the caller-supplied `color`.
 * - Fallback to `textMuted` when `color` is absent.
 * - `role="img"` and `europa-chip` class present on the rendered span.
 */
describe('EuropaTroopChip', () => {
    // ── aria-label generation ──────────────────────────────────────────

    describe('aria-label', () => {
        it('derives the label from the count alone', () => {
            render(<EuropaTroopChip count={12} color={TOKENS.color.playerColor1} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '12 troops');
        });

        it('does not mention a player even when a color is supplied', () => {
            render(<EuropaTroopChip count={7} color={TOKENS.color.playerColor3} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '7 troops');
        });

        it('uses the same label when color is absent', () => {
            render(<EuropaTroopChip count={5} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveAttribute('aria-label', '5 troops');
        });
    });

    // ── count rendering ───────────────────────────────────────────────

    describe('count rendering', () => {
        it('renders the count as text content', () => {
            render(<EuropaTroopChip count={5} color={TOKENS.color.playerColor3} />);
            expect(screen.getByText('5')).toBeDefined();
        });

        it('renders the europa-chip catalog class', () => {
            render(<EuropaTroopChip count={5} />);
            const chip = screen.getByRole('img');
            expect(chip.classList.contains('europa-chip')).toBe(true);
        });
    });

    // ── caller-supplied color ──────────────────────────────────────────

    describe('color', () => {
        const cases: ReadonlyArray<readonly [string, string]> = [
            ['playerColor1', TOKENS.color.playerColor1],
            ['playerColor2', TOKENS.color.playerColor2],
            ['playerColor3', TOKENS.color.playerColor3],
            ['playerColor4', TOKENS.color.playerColor4],
        ];

        for (const [name, color] of cases) {
            it(`applies the ${name} token color`, () => {
                render(<EuropaTroopChip count={1} color={color} />);
                const chip = screen.getByRole('img');
                expect(chip).toHaveStyle({ borderColor: color, color });
            });
        }

        it('accepts any CSS color string, not just design tokens', () => {
            render(<EuropaTroopChip count={1} color="rgb(1, 2, 3)" />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveStyle({ borderColor: 'rgb(1, 2, 3)', color: 'rgb(1, 2, 3)' });
        });

        it('uses textMuted color when color is absent', () => {
            render(<EuropaTroopChip count={1} />);
            const chip = screen.getByRole('img');
            expect(chip).toHaveStyle({
                borderColor: TOKENS.color.textMuted,
                color: TOKENS.color.textMuted,
            });
        });
    });
});
