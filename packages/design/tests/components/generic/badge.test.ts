import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaBadge } from '../../../src/components/generic/badge.js';

/**
 * Tests for the `europa-badge` component (spec 014, FR-001).
 *
 * The badge is a small pill-shaped label that projects its label text
 * via a `<slot>` inside a `<span class="europa-badge">` in the shadow root.
 * It uses Shadow DOM, has no observed attributes, and is not auto-registered
 * — the test registers it explicitly via `customElements.define` in `beforeAll`.
 *
 * Covered here:
 * - Registration: `customElements.define('europa-badge', EuropaBadge)` works.
 * - Rendering: the internal `<span class="europa-badge">` is created in the shadow root.
 * - Slotted children are projected via `<slot>` (remain as host children).
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

        const shadow = badge.shadowRoot;
        expect(shadow).not.toBeNull();

        const span = shadow?.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        expect(span?.className).toBe('europa-badge');
    });

    it('contains a slot element inside the europa-badge span', () => {
        const badge = document.createElement('europa-badge');
        document.body.appendChild(badge);

        const shadow = badge.shadowRoot;
        const span = shadow?.querySelector('span.europa-badge');
        const slot = span?.querySelector('slot');
        expect(slot).not.toBeNull();
        expect(slot).toBeInstanceOf(HTMLSlotElement);
    });

    it('projects host children via slot projection', () => {
        const badge = document.createElement('europa-badge');
        badge.textContent = 'Your match';
        document.body.appendChild(badge);

        // Under Shadow DOM, text content remains on the host and is projected
        // via the <slot> — it is NOT reparented into the span.
        expect(badge.textContent).toBe('Your match');

        // The span and slot exist inside the shadow root.
        const shadow = badge.shadowRoot;
        const span = shadow?.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        const slot = span?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
