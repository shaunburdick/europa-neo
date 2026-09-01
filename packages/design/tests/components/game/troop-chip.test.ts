/**
 * Tests for the `<europa-troop-chip>` component (spec 014, T-047).
 *
 * A game-specific visual primitive that renders a player-colored troop-count
 * chip. The element is purely decorative (`role="img"`) — semantic meaning
 * is carried by a computed `aria-label` (FR-014). Uses light DOM; no
 * auto-registration on import (FR-004).
 *
 * Covered:
 * - `aria-label` generation: count+owner and count-only variants.
 * - `count`/`owner` attribute coercion: attribute changes update output.
 * - Player-color inline styles: border-color and color reflect the token
 *   mapped to the given owner value.
 * - `role="img"` present on the internal span.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaTroopChip } from '../../../src/components/game/troop-chip.js';
import { TOKENS } from '../../../src/tokens.js';

/** Expected owner → token color mapping (matches OWNER_COLORS in source). */
const OWNER_COLORS: Record<string, string> = {
    '1': TOKENS.color.accent,
    '2': TOKENS.color.city,
    '3': TOKENS.color.green,
    '4': TOKENS.color.blue,
};

describe('europa-troop-chip', () => {
    beforeAll(() => {
        customElements.define('europa-troop-chip', EuropaTroopChip);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // ── aria-label generation ──────────────────────────────────────────

    describe('aria-label', () => {
        it('includes player number when owner is present', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '12');
            el.setAttribute('owner', '1');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('aria-label')).toBe('12 troops, player 1');
        });

        it('omits player reference when owner is absent', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '7');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('aria-label')).toBe('7 troops');
        });

        it('reflects updated count in the aria-label', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '3');
            el.setAttribute('owner', '2');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('aria-label')).toBe('3 troops, player 2');

            el.setAttribute('count', '20');
            expect(span?.getAttribute('aria-label')).toBe('20 troops, player 2');
        });
    });

    // ── count / owner coercion ─────────────────────────────────────────

    describe('count and owner coercion', () => {
        it('renders the initial count as text content', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '5');
            el.setAttribute('owner', '3');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('5');
        });

        it('updates text content when count attribute changes', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '5');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.textContent).toBe('5');

            el.setAttribute('count', '42');
            expect(span?.textContent).toBe('42');
        });

        it('updates aria-label when owner attribute changes', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '8');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('aria-label')).toBe('8 troops');

            el.setAttribute('owner', '4');
            expect(span?.getAttribute('aria-label')).toBe('8 troops, player 4');
        });

        it('falls back to muted color when owner is removed', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '10');
            el.setAttribute('owner', '1');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.style.borderColor).toBe(TOKENS.color.accent);

            el.removeAttribute('owner');
            expect(span?.style.borderColor).toBe(TOKENS.color.textMuted);
        });
    });

    // ── player-color inline styles ─────────────────────────────────────

    describe('player-color', () => {
        for (const [owner, color] of Object.entries(OWNER_COLORS)) {
            it(`applies ${color} for owner="${owner}"`, () => {
                const el = document.createElement('europa-troop-chip');
                el.setAttribute('count', '1');
                el.setAttribute('owner', owner);
                document.body.appendChild(el);

                const span = el.querySelector('span.europa-chip');
                expect(span?.style.borderColor).toBe(color);
                expect(span?.style.color).toBe(color);
            });
        }

        it('uses textMuted color when owner is unknown', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '1');
            el.setAttribute('owner', '99');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.style.borderColor).toBe(TOKENS.color.textMuted);
            expect(span?.style.color).toBe(TOKENS.color.textMuted);
        });

        it('uses textMuted color when owner is absent', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '1');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.style.borderColor).toBe(TOKENS.color.textMuted);
            expect(span?.style.color).toBe(TOKENS.color.textMuted);
        });
    });

    // ── role attribute ─────────────────────────────────────────────────

    describe('role="img"', () => {
        it('has role="img" on the internal span', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '6');
            el.setAttribute('owner', '2');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('role')).toBe('img');
        });

        it('retains role="img" after attribute update', () => {
            const el = document.createElement('europa-troop-chip');
            el.setAttribute('count', '6');
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-chip');
            expect(span?.getAttribute('role')).toBe('img');

            el.setAttribute('count', '99');
            expect(span?.getAttribute('role')).toBe('img');
        });
    });
});
