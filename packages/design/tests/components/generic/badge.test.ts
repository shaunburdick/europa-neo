import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaBadge } from '../../../src/components/generic/badge.js';

/**
 * Tests for the `europa-badge` component (spec 014, FR-001).
 *
 * The badge is a small pill-shaped label that wraps its slotted label text in
 * a `<span class="europa-badge">`. It uses light DOM (no Shadow DOM), has no
 * observed attributes, and is not auto-registered — the test registers it
 * explicitly via `customElements.define` in `beforeAll`.
 *
 * Covered here:
 * - Registration: `customElements.define('europa-badge', EuropaBadge)` works.
 * - Rendering: the internal `<span class="europa-badge">` is created.
 * - Slotted children project into the wrapping span.
 * - Cleanup: the element is removed from the document after each test.
 */
describe('europa-badge', () => {
    beforeAll(() => {
        customElements.define('europa-badge', EuropaBadge);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal span with the europa-badge class', () => {
        const badge = document.createElement('europa-badge');
        document.body.appendChild(badge);

        const span = badge.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        expect(span?.className).toBe('europa-badge');
    });

    it('projects slotted children into the wrapping span', () => {
        const badge = document.createElement('europa-badge');
        badge.textContent = 'Your match';
        document.body.appendChild(badge);

        const span = badge.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        expect(span?.textContent).toBe('Your match');
    });
});
