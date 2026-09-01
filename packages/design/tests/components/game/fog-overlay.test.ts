import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaFogOverlay } from '../../../src/components/game/fog-overlay.js';

/**
 * Tests for the `<europa-fog-overlay>` component (spec 014, FR-014).
 *
 * The component renders a single semi-transparent `<div aria-hidden="true">`
 * overlay that covers its host area to represent unexplored fog. It uses light
 * DOM (no Shadow DOM) and is purely visual: `aria-hidden="true"` is always
 * present so screen readers never announce it.
 *
 * The `visible` attribute is a boolean with a **default of true**: the overlay
 * is shown unless `visible` is explicitly set to `"false"` (or any value other
 * than `"true"`). Visibility is toggled via the `hidden` attribute on the
 * internal div.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - Default visibility: overlay visible (no `hidden` attribute) when `visible`
 *   is absent.
 * - Hidden when `visible="false"` (internal div carries `hidden`).
 * - `aria-hidden="true"` present on the internal div at all times.
 * - Changing the `visible` attribute toggles visibility.
 */
describe('europa-fog-overlay', () => {
    beforeAll(() => {
        customElements.define('europa-fog-overlay', EuropaFogOverlay);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('is visible by default when the visible attribute is absent', () => {
        const el = document.createElement('europa-fog-overlay');
        document.body.appendChild(el);

        const overlay = el.querySelector('div');
        expect(overlay).not.toBeNull();
        expect(overlay?.hasAttribute('hidden')).toBe(false);
    });

    it('is hidden when the visible attribute is set to "false"', () => {
        const el = document.createElement('europa-fog-overlay');
        el.setAttribute('visible', 'false');
        document.body.appendChild(el);

        const overlay = el.querySelector('div');
        expect(overlay).not.toBeNull();
        expect(overlay?.hasAttribute('hidden')).toBe(true);
    });

    it('always sets aria-hidden="true" on the internal overlay div', () => {
        const el = document.createElement('europa-fog-overlay');
        document.body.appendChild(el);

        const overlay = el.querySelector('div');
        expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    });

    it('toggles visibility when the visible attribute changes', () => {
        const el = document.createElement('europa-fog-overlay');
        document.body.appendChild(el);

        const overlay = el.querySelector('div');
        expect(overlay?.hasAttribute('hidden')).toBe(false);

        el.setAttribute('visible', 'false');
        expect(overlay?.hasAttribute('hidden')).toBe(true);

        el.setAttribute('visible', 'true');
        expect(overlay?.hasAttribute('hidden')).toBe(false);
    });
});
