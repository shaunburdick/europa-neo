import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaPlayerBadge } from '../../../src/components/game/player-badge.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the `<europa-player-badge>` component (spec 014, FR-014).
 *
 * The component renders an internal `<span class="europa-badge" role="img">`
 * whose inline `color` reflects the player's identity color (from the
 * component-local `PLAYER_COLORS` map, reusing `TOKENS.color.*`) and whose
 * `aria-label` combines the player number with an optional name. It uses
 * light DOM (no Shadow DOM) and applies the shared catalog class directly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - `aria-label` generation from player and name (with and without name).
 * - The internal span's inline style reflects the correct token color.
 * - `role="img"` present on the internal span.
 * - `europa-badge` class present on the internal span.
 * - Attribute changes update the color and aria-label.
 */
describe('europa-player-badge', () => {
    beforeAll(() => {
        customElements.define('europa-player-badge', EuropaPlayerBadge);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal span with the europa-badge class and role="img"', () => {
        const el = document.createElement('europa-player-badge');
        el.setAttribute('player', '1');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        expect(span?.className).toBe('europa-badge');
        expect(span?.getAttribute('role')).toBe('img');
    });

    it('generates the aria-label from player and name', () => {
        const el = document.createElement('europa-player-badge');
        el.setAttribute('player', '1');
        el.setAttribute('name', 'Alice');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span?.getAttribute('aria-label')).toBe('player 1: Alice');
    });

    it('generates the aria-label from player only when name is absent', () => {
        const el = document.createElement('europa-player-badge');
        el.setAttribute('player', '2');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span?.getAttribute('aria-label')).toBe('player 2');
    });

    it('reflects the player color token on the internal span', () => {
        const el = document.createElement('europa-player-badge');
        el.setAttribute('player', '1');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span?.style.color).toBe(TOKENS.color.accent);
    });

    it('maps each player to its token color', () => {
        const cases: Array<[string, string]> = [
            ['1', TOKENS.color.accent],
            ['2', TOKENS.color.city],
            ['3', TOKENS.color.green],
            ['4', TOKENS.color.blue],
        ];

        for (const [player, expected] of cases) {
            const el = document.createElement('europa-player-badge');
            el.setAttribute('player', player);
            document.body.appendChild(el);

            const span = el.querySelector('span.europa-badge');
            expect(span?.style.color, `player ${player}`).toBe(expected);

            document.body.innerHTML = '';
        }
    });

    it('falls back to textMuted for an unknown or absent player', () => {
        const el = document.createElement('europa-player-badge');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span?.style.color).toBe(TOKENS.color.textMuted);

        el.setAttribute('player', '9');
        expect(span?.style.color).toBe(TOKENS.color.textMuted);
    });

    it('updates the color and aria-label when attributes change', () => {
        const el = document.createElement('europa-player-badge');
        el.setAttribute('player', '1');
        el.setAttribute('name', 'Alice');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-badge');
        expect(span?.style.color).toBe(TOKENS.color.accent);
        expect(span?.getAttribute('aria-label')).toBe('player 1: Alice');

        el.setAttribute('player', '3');
        el.setAttribute('name', 'Bob');
        expect(span?.style.color).toBe(TOKENS.color.green);
        expect(span?.getAttribute('aria-label')).toBe('player 3: Bob');

        el.removeAttribute('name');
        expect(span?.getAttribute('aria-label')).toBe('player 3');
    });
});
