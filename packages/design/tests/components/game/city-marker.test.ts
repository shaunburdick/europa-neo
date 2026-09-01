import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaCityMarker } from '../../../src/components/game/city-marker.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the `<europa-city-marker>` component (spec 014, FR-009 / FR-010 /
 * FR-014).
 *
 * The component renders an internal `<span role="img">` marker whose inline
 * `backgroundColor`/`borderColor` reflect the owning player's color, selected
 * from the component-local `PLAYER_COLORS` map (reusing `TOKENS.color.*`).
 * The `owner` attribute (player 1–4) selects the color; an unknown or absent
 * owner falls back to `TOKENS.color.textMuted`. The `aria-label` is derived
 * from the owner (e.g. "1 city"; unknown/absent → "unknown city").
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - `aria-label` generation from the `owner` attribute.
 * - The internal span's inline style reflects the correct token color.
 * - `role="img"` is present on the internal span.
 * - Changing the `owner` attribute updates the color and `aria-label`.
 */
describe('europa-city-marker', () => {
    beforeAll(() => {
        customElements.define('europa-city-marker', EuropaCityMarker);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal span with role="img"', () => {
        const el = document.createElement('europa-city-marker');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]');
        expect(span).not.toBeNull();
    });

    it('derives the aria-label from the owner attribute', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '1');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]');
        expect(span?.getAttribute('aria-label')).toBe('1 city');
    });

    it('falls back to "unknown city" when the owner is absent', () => {
        const el = document.createElement('europa-city-marker');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]');
        expect(span?.getAttribute('aria-label')).toBe('unknown city');
    });

    it('falls back to "unknown city" when the owner is not a known player', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '9');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]');
        expect(span?.getAttribute('aria-label')).toBe('9 city');
    });

    it('applies the player color to the internal span inline style', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '2');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]') as HTMLSpanElement;
        expect(span.style.backgroundColor).toBe(TOKENS.color.city);
        expect(span.style.borderColor).toBe(TOKENS.color.city);
    });

    it('maps each player 1–4 to its token color', () => {
        const expected: ReadonlyArray<readonly [string, string]> = [
            ['1', TOKENS.color.accent],
            ['2', TOKENS.color.city],
            ['3', TOKENS.color.green],
            ['4', TOKENS.color.blue],
        ];

        for (const [owner, color] of expected) {
            const el = document.createElement('europa-city-marker');
            el.setAttribute('owner', owner);
            document.body.appendChild(el);

            const span = el.querySelector('span[role="img"]') as HTMLSpanElement;
            expect(span.style.backgroundColor, `owner ${owner}`).toBe(color);
            expect(span.style.borderColor, `owner ${owner}`).toBe(color);

            document.body.innerHTML = '';
        }
    });

    it('falls back to the muted text color for an unknown owner', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '9');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]') as HTMLSpanElement;
        expect(span.style.backgroundColor).toBe(TOKENS.color.textMuted);
        expect(span.style.borderColor).toBe(TOKENS.color.textMuted);
    });

    it('falls back to the muted text color when the owner is absent', () => {
        const el = document.createElement('europa-city-marker');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]') as HTMLSpanElement;
        expect(span.style.backgroundColor).toBe(TOKENS.color.textMuted);
        expect(span.style.borderColor).toBe(TOKENS.color.textMuted);
    });

    it('updates the color and aria-label when the owner attribute changes', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '1');
        document.body.appendChild(el);

        const span = el.querySelector('span[role="img"]') as HTMLSpanElement;
        expect(span.style.backgroundColor).toBe(TOKENS.color.accent);
        expect(span.getAttribute('aria-label')).toBe('1 city');

        el.setAttribute('owner', '3');
        expect(span.style.backgroundColor).toBe(TOKENS.color.green);
        expect(span.style.borderColor).toBe(TOKENS.color.green);
        expect(span.getAttribute('aria-label')).toBe('3 city');
    });

    it('does not duplicate the marker span across attribute changes', () => {
        const el = document.createElement('europa-city-marker');
        el.setAttribute('owner', '1');
        document.body.appendChild(el);

        el.setAttribute('owner', '2');
        el.setAttribute('owner', '4');

        const spans = el.querySelectorAll('span[role="img"]');
        expect(spans.length).toBe(1);
    });
});
