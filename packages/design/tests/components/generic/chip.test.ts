import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaChip } from '../../../src/components/generic/chip.js';

/**
 * Tests for the `<europa-chip>` component (spec 014, FR-009 / FR-010).
 *
 * The component renders a `<span class="europa-chip">` whose text content is
 * the `count` attribute value, alongside a `<slot>` for slotted children. It
 * uses light DOM (no Shadow DOM) and applies the shared catalog class directly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - Initial render: an internal `<span class="europa-chip">` is created.
 * - The `count` attribute value is rendered as text content inside the span.
 * - Changing the `count` attribute updates the rendered text content.
 */
describe('europa-chip', () => {
    beforeAll(() => {
        customElements.define('europa-chip', EuropaChip);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal span with the europa-chip class', () => {
        const el = document.createElement('europa-chip');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span).not.toBeNull();
        expect(span?.className).toBe('europa-chip');
    });

    it('renders the count attribute value as text content', () => {
        const el = document.createElement('europa-chip');
        el.setAttribute('count', '12');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('12');
    });

    it('updates the text content when the count attribute changes', () => {
        const el = document.createElement('europa-chip');
        el.setAttribute('count', '5');
        document.body.appendChild(el);

        const span = el.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('5');

        el.setAttribute('count', '42');
        expect(span?.textContent).toBe('42');
    });
});
