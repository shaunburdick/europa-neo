/**
 * Unit tests — tooltip positioning logic.
 *
 * Tests the pure `resolveTooltipPosition` function from the tooltip
 * system (Feature 018, FR-010–FR-013). Verifies viewport edge
 * detection and flip behavior without DOM interaction.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts (needs
 * `DOMRectReadOnly` and `window.innerHeight` — both available in
 * happy-dom too, but the test suite is colocated with browser tests).
 */

import { describe, expect, test } from 'vitest';
import { resolveTooltipPosition } from '../../src/qol/tooltip';

/**
 * Build a minimal DOMRectReadOnly-like object for testing.
 * DOMRectReadOnly is a sealed class in browsers — we create a
 * plain object matching the interface shape for the pure function.
 */
function makeRect(top: number, bottom: number): DOMRectReadOnly {
    return {
        top,
        bottom,
        left: 0,
        right: 100,
        width: 100,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON(): Record<string, number> {
            return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top };
        },
    };
}

describe('resolveTooltipPosition', () => {
    describe('preferred "above"', () => {
        test('returns "above" when there is enough room above the trigger', () => {
            const rect = makeRect(200, 230);
            const result = resolveTooltipPosition(rect, 40, 'above');
            expect(result).toBe('above');
        });

        test('flips to "below" when trigger is too close to the top edge', () => {
            const rect = makeRect(10, 40);
            const result = resolveTooltipPosition(rect, 40, 'above');
            expect(result).toBe('below');
        });

        test('flips to "below" when trigger is at the very top (0px)', () => {
            const rect = makeRect(0, 30);
            const result = resolveTooltipPosition(rect, 40, 'above');
            expect(result).toBe('below');
        });
    });

    describe('preferred "below"', () => {
        test('returns "below" when there is enough room below the trigger', () => {
            const rect = makeRect(100, 130);
            const result = resolveTooltipPosition(rect, 40, 'below');
            expect(result).toBe('below');
        });

        test('flips to "above" when trigger is too close to the bottom edge', () => {
            // window.innerHeight is 768 in happy-dom; trigger near bottom.
            const rect = makeRect(740, 760);
            const result = resolveTooltipPosition(rect, 40, 'below');
            expect(result).toBe('above');
        });
    });

    describe('null rect', () => {
        test('returns preferred position when trigger rect is null', () => {
            const result = resolveTooltipPosition(null, 40, 'above');
            expect(result).toBe('above');
        });

        test('returns "below" preferred when rect is null', () => {
            const result = resolveTooltipPosition(null, 40, 'below');
            expect(result).toBe('below');
        });
    });

    describe('edge cases', () => {
        test('tooltip height of zero near top edge still flips when gap threshold unmet', () => {
            const rect = makeRect(5, 35);
            const result = resolveTooltipPosition(rect, 0, 'above');
            // top(5) - height(0) - gap(8) = -3 < 0 → flips to below.
            expect(result).toBe('below');
        });

        test('tooltip height of zero with ample room stays above', () => {
            const rect = makeRect(200, 230);
            const result = resolveTooltipPosition(rect, 0, 'above');
            expect(result).toBe('above');
        });

        test('very tall tooltip flips when near top', () => {
            const rect = makeRect(50, 80);
            const result = resolveTooltipPosition(rect, 200, 'above');
            expect(result).toBe('below');
        });
    });
});
