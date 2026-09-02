import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaChip } from '../../../src/components/generic/chip.js';

/**
 * Tests for the `<europa-chip>` component (spec 014, FR-009 / FR-010).
 *
 * The component renders a `<span class="europa-chip">` inside a shadow root
 * whose text content is the `count` attribute value, alongside a `<slot>`
 * projecting host children. It uses Shadow DOM: the shared catalog
 * stylesheet is adopted into the shadow root and children remain host
 * children (never reparented).
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration on import).
 * - Initial render: an internal `<span class="europa-chip">` is created in
 *   the shadow root.
 * - The `count` attribute value is rendered as text content inside the span.
 * - Changing the `count` attribute updates the rendered text content.
 * - Children remain host children and are projected via `<slot>`.
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

        const shadow = el.shadowRoot;
        expect(shadow).not.toBeNull();

        const span = shadow?.querySelector('span.europa-chip');
        expect(span).not.toBeNull();
        expect(span?.className).toBe('europa-chip');
    });

    it('renders the count attribute value as text content', () => {
        const el = document.createElement('europa-chip');
        el.setAttribute('count', '12');
        document.body.appendChild(el);

        const span = el.shadowRoot?.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('12');
    });

    it('updates the text content when the count attribute changes', () => {
        const el = document.createElement('europa-chip');
        el.setAttribute('count', '5');
        document.body.appendChild(el);

        const span = el.shadowRoot?.querySelector('span.europa-chip');
        expect(span?.textContent).toBe('5');

        el.setAttribute('count', '42');
        expect(span?.textContent).toBe('42');
    });

    it('projects host children via slot projection', () => {
        const el = document.createElement('europa-chip');

        const child = document.createElement('span');
        child.textContent = 'troops';
        el.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(el);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the internal span.
        expect(el.contains(child)).toBe(true);

        // The slot exists inside the internal span.
        const span = el.shadowRoot?.querySelector('span.europa-chip');
        expect(span).not.toBeNull();
        const slot = span?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
