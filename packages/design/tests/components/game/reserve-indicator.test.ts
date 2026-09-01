import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaReserveIndicator } from '../../../src/components/game/reserve-indicator.js';

/**
 * Tests for the `<europa-reserve-indicator>` component (spec 014, FR-009 /
 * FR-010 / FR-014).
 *
 * The component renders a `<span class="europa-chip" role="img">` whose text
 * content is the clamped percent value (e.g. "30%") and whose `aria-label`
 * describes the reserves (e.g. "reserves 30%"). It uses light DOM and applies
 * the shared catalog class directly.
 *
 * Covered here (T-053):
 * - Registration via `customElements.define` (no auto-registration on import).
 * - Percent → aria-label mapping (e.g. percent="30" → "reserves 30%").
 * - Percentage text rendered inside the internal span.
 * - Coercion: missing / non-numeric percent falls back to 0; out-of-range
 *   values clamp to [0, 90]; non-step values round to nearest multiple of 10.
 * - `role="img"` and `europa-chip` class on the internal span.
 */
describe('europa-reserve-indicator', () => {
    beforeAll(() => {
        customElements.define('europa-reserve-indicator', EuropaReserveIndicator);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('sets aria-label from the percent attribute', () => {
        const el = document.createElement('europa-reserve-indicator');
        el.setAttribute('percent', '30');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span).not.toBeNull();
        expect(span?.getAttribute('aria-label')).toBe('reserves 30%');
    });

    it('renders the percentage text inside the span', () => {
        const el = document.createElement('europa-reserve-indicator');
        el.setAttribute('percent', '70');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('70%');
    });

    it('renders the span with role="img" and europa-chip class', () => {
        const el = document.createElement('europa-reserve-indicator');
        el.setAttribute('percent', '50');
        document.body.appendChild(el);

        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span?.getAttribute('role')).toBe('img');
        expect(span?.className).toBe('europa-chip');
    });

    describe('percent coercion', () => {
        it('falls back to 0 when percent is missing', () => {
            const el = document.createElement('europa-reserve-indicator');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('0%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 0%');
        });

        it('falls back to 0 when percent is non-numeric', () => {
            const el = document.createElement('europa-reserve-indicator');
            el.setAttribute('percent', 'abc');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('0%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 0%');
        });

        it('clamps percent above 90 to 90', () => {
            const el = document.createElement('europa-reserve-indicator');
            el.setAttribute('percent', '100');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('90%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 90%');
        });

        it('clamps negative percent to 0', () => {
            const el = document.createElement('europa-reserve-indicator');
            el.setAttribute('percent', '-20');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('0%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 0%');
        });

        it('rounds non-step-of-10 values to nearest step', () => {
            const el = document.createElement('europa-reserve-indicator');
            el.setAttribute('percent', '33');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('30%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 30%');
        });

        it('rounds 35 up to 40 (nearest step of 10)', () => {
            const el = document.createElement('europa-reserve-indicator');
            el.setAttribute('percent', '35');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('40%');
            expect(span?.getAttribute('aria-label')).toBe('reserves 40%');
        });
    });

    it('updates display when percent attribute changes', () => {
        const el = document.createElement('europa-reserve-indicator');
        el.setAttribute('percent', '20');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('20%');
        expect(span?.getAttribute('aria-label')).toBe('reserves 20%');

        el.setAttribute('percent', '60');
        expect(span?.textContent).toBe('60%');
        expect(span?.getAttribute('aria-label')).toBe('reserves 60%');
    });
});
