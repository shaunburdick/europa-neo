import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaReserveIndicator } from '../../../src/components/game/reserve-indicator.js';

/**
 * Tests for the {@link EuropaReserveIndicator} React component (spec 014,
 * FR-009 / FR-010 / FR-014).
 *
 * The component renders a `<span class="europa-chip" role="img">` whose text
 * content is the clamped percent value (e.g. "30%") and whose `aria-label`
 * describes the reserves (e.g. "reserves 30%").
 *
 * Covered:
 * - Percent → aria-label mapping.
 * - Percentage text rendered inside the span.
 * - Coercion: NaN → 0; out-of-range → clamped to [0, 90]; non-step values
 *   rounded to nearest multiple of 10.
 * - `role="img"` and `europa-chip` class on the rendered span.
 */
describe('EuropaReserveIndicator', () => {
    it('sets aria-label from the percent prop', () => {
        render(<EuropaReserveIndicator percent={30} />);
        const chip = screen.getByRole('img');
        expect(chip).toHaveAttribute('aria-label', 'reserves 30%');
    });

    it('renders the percentage text inside the span', () => {
        render(<EuropaReserveIndicator percent={70} />);
        const chip = screen.getByText('70%');
        expect(chip).toBeDefined();
    });

    describe('percent coercion', () => {
        it('falls back to 0 when percent is NaN', () => {
            render(<EuropaReserveIndicator percent={Number.NaN} />);
            const chip = screen.getByText('0%');
            expect(chip).toBeDefined();
            expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'reserves 0%');
        });

        it('clamps percent above 90 to 90', () => {
            render(<EuropaReserveIndicator percent={100} />);
            const chip = screen.getByText('90%');
            expect(chip).toBeDefined();
            expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'reserves 90%');
        });

        it('clamps negative percent to 0', () => {
            render(<EuropaReserveIndicator percent={-20} />);
            const chip = screen.getByText('0%');
            expect(chip).toBeDefined();
            expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'reserves 0%');
        });

        it('rounds non-step-of-10 values to nearest step', () => {
            render(<EuropaReserveIndicator percent={33} />);
            const chip = screen.getByText('30%');
            expect(chip).toBeDefined();
            expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'reserves 30%');
        });
    });
});
