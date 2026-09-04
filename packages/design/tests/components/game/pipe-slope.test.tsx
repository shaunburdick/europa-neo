import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaPipeSlope } from '../../../src/components/game/pipe-slope.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the {@link EuropaPipeSlope} React component (spec 014, FR-009 /
 * FR-010 / FR-014).
 *
 * The component reads a `direction` prop (`downhill` | `flat` | `uphill` |
 * `stalled`) and renders a `<span role="img">` whose `borderBottomColor` is
 * the corresponding canonical pipe token. The triangle is drawn with CSS
 * borders. An unknown or absent direction falls back to the muted
 * `pipeStalled` token.
 *
 * Covered:
 * - Each direction maps to the correct `TOKENS.color.pipe*` value.
 * - `aria-label` is generated from the direction.
 * - Internal span carries `role="img"`.
 * - Unknown / absent direction falls back to `pipeStalled`.
 * - Intensity attribute scales the triangle size.
 * - Intensity qualifier in aria-label (light/moderate/strong).
 */
describe('EuropaPipeSlope', () => {
    // ── direction → token color ────────────────────────────────────────

    describe('direction → token color', () => {
        const cases: Array<{
            direction: 'downhill' | 'flat' | 'uphill' | 'stalled';
            tokenKey: keyof typeof TOKENS.color;
            label: string;
        }> = [
            { direction: 'downhill', tokenKey: 'pipeDownhill', label: 'downhill' },
            { direction: 'flat', tokenKey: 'pipeFlat', label: 'flat' },
            { direction: 'uphill', tokenKey: 'pipeUphill', label: 'uphill' },
            { direction: 'stalled', tokenKey: 'pipeStalled', label: 'stalled' },
        ];

        for (const { direction, tokenKey, label } of cases) {
            it(`sets borderBottomColor to ${label} token (${TOKENS.color[tokenKey]})`, () => {
                render(<EuropaPipeSlope direction={direction} />);
                const indicator = screen.getByRole('img');
                expect(indicator).toHaveStyle({ borderBottomColor: TOKENS.color[tokenKey] });
            });
        }
    });

    // ── aria-label generation ──────────────────────────────────────────

    describe('aria-label', () => {
        it('sets aria-label to "pipe <direction>" for each valid direction at full intensity', () => {
            for (const direction of ['downhill', 'flat', 'uphill', 'stalled'] as const) {
                const { unmount } = render(<EuropaPipeSlope direction={direction} />);
                const indicator = screen.getByRole('img');
                expect(indicator).toHaveAttribute('aria-label', `pipe ${direction}`);
                unmount();
            }
        });
    });

    // ── unknown / absent direction → stalled fallback ───────────────────

    describe('unknown / absent direction falls back to stalled', () => {
        it('falls back to stalled when direction is absent', () => {
            render(<EuropaPipeSlope />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({ borderBottomColor: TOKENS.color.pipeStalled });
            expect(indicator).toHaveAttribute('aria-label', 'pipe stalled');
        });

        it('falls back to stalled for an unrecognized direction value', () => {
            // @ts-expect-error — testing runtime fallback for invalid direction
            render(<EuropaPipeSlope direction="diagonal" />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({ borderBottomColor: TOKENS.color.pipeStalled });
            expect(indicator).toHaveAttribute('aria-label', 'pipe stalled');
        });
    });

    // ── intensity attribute ────────────────────────────────────────────

    describe('intensity attribute', () => {
        it('default intensity produces full-size triangle (16px bottom, 12px sides)', () => {
            render(<EuropaPipeSlope direction="downhill" />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({
                borderBottomWidth: 16,
                borderLeftWidth: 12,
                borderRightWidth: 12,
            });
        });

        it('intensity 0.5 produces smaller triangle than full intensity', () => {
            const { rerender } = render(<EuropaPipeSlope direction="downhill" />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({ borderBottomWidth: 16 });

            rerender(<EuropaPipeSlope direction="downhill" intensity={0.5} />);
            const style = (indicator as HTMLElement).style;
            const bottomWidth = Number.parseInt(style.borderBottomWidth, 10);
            expect(bottomWidth).toBeLessThan(16);
            expect(bottomWidth).toBeGreaterThan(0);
        });

        it('intensity 0 produces minimum-size triangle (40% of base)', () => {
            render(<EuropaPipeSlope direction="downhill" intensity={0} />);
            const indicator = screen.getByRole('img');
            // 40% of 16 = 6.4, rounded to 6
            expect(indicator).toHaveStyle({ borderBottomWidth: 6 });
            // 40% of 12 = 4.8, rounded to 5
            expect(indicator).toHaveStyle({ borderLeftWidth: 5 });
        });

        it('stalled direction ignores intensity (always full size)', () => {
            render(<EuropaPipeSlope direction="stalled" intensity={0} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({
                borderBottomWidth: 16,
                borderLeftWidth: 12,
            });
        });

        it('aria-label includes intensity qualifier when intensity < 1', () => {
            render(<EuropaPipeSlope direction="uphill" intensity={0.2} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveAttribute('aria-label', 'pipe uphill, light gradient');
        });

        it('aria-label includes "moderate" for intensity around 0.5', () => {
            render(<EuropaPipeSlope direction="downhill" intensity={0.5} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveAttribute('aria-label', 'pipe downhill, moderate gradient');
        });

        it('aria-label includes "strong" for intensity around 0.8', () => {
            render(<EuropaPipeSlope direction="uphill" intensity={0.8} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveAttribute('aria-label', 'pipe uphill, strong gradient');
        });

        it('aria-label omits qualifier when intensity is 1', () => {
            render(<EuropaPipeSlope direction="downhill" intensity={1} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveAttribute('aria-label', 'pipe downhill');
        });

        it('non-numeric intensity falls back to full size', () => {
            render(<EuropaPipeSlope direction="downhill" intensity={Number.NaN} />);
            const indicator = screen.getByRole('img');
            expect(indicator).toHaveStyle({ borderBottomWidth: 16 });
        });

        it('out-of-range intensity is clamped', () => {
            const { rerender } = render(<EuropaPipeSlope direction="downhill" intensity={2} />);
            const indicator = screen.getByRole('img');
            // Clamped to 1 → full size
            expect(indicator).toHaveStyle({ borderBottomWidth: 16 });

            rerender(<EuropaPipeSlope direction="downhill" intensity={-1} />);
            // Clamped to 0 → minimum size
            expect(indicator).toHaveStyle({ borderBottomWidth: 6 });
        });
    });
});
