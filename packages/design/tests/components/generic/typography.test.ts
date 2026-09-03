import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaTypography } from '../../../src/components/generic/typography.js';

/**
 * Tests for the `europa-typography` component (spec 014, FR-001).
 *
 * The typography primitive renders a semantic element chosen by the `variant`
 * attribute: `heading` → `<h2>`, `subheading` → `<h3>`, `body` (default) →
 * `<p>`, and `label`/`caption` → `<span>`. Each rendered element carries the
 * `europa-typography` catalog class plus a `europa-typography--<variant>`
 * modifier. It uses Shadow DOM: the semantic element lives inside the shadow
 * root with a `<slot>` projecting host children (they are never reparented).
 * It observes only the `variant` attribute and is not auto-registered — the
 * test registers it explicitly via `customElements.define` in `beforeAll`.
 *
 * Covered here:
 * - Registration: `customElements.define('europa-typography', EuropaTypography)`
 *   works.
 * - Default rendering: no `variant` attribute produces a `<p>` with
 *   `europa-typography` + `europa-typography--body`.
 * - Variant rendering: each supported variant produces the correct semantic
 *   element and catalog modifier.
 * - Changing `variant` rebuilds the semantic element with the new tag.
 * - Children remain host children and are projected via `<slot>`.
 * - Cleanup: the element is removed from the document after each test.
 */
describe('europa-typography', () => {
    beforeAll(() => {
        customElements.define('europa-typography', EuropaTypography);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders a <p> with the body modifier by default', () => {
        const typography = document.createElement('europa-typography');
        document.body.appendChild(typography);

        const shadow = typography.shadowRoot;
        expect(shadow).not.toBeNull();

        const el = shadow?.querySelector('p.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--body');
    });

    it('renders an <h2> with the heading modifier for variant="heading"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'heading');
        document.body.appendChild(typography);

        const el = typography.shadowRoot?.querySelector('h2.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--heading');
    });

    it('renders an <h3> with the subheading modifier for variant="subheading"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'subheading');
        document.body.appendChild(typography);

        const el = typography.shadowRoot?.querySelector('h3.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--subheading');
    });

    it('renders a <span> with the label modifier for variant="label"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'label');
        document.body.appendChild(typography);

        const el = typography.shadowRoot?.querySelector('span.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--label');
    });

    it('renders a <span> with the caption modifier for variant="caption"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'caption');
        document.body.appendChild(typography);

        const el = typography.shadowRoot?.querySelector('span.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--caption');
    });

    it('rebuilds the semantic element with the new tag when the variant changes', () => {
        const typography = document.createElement('europa-typography');
        document.body.appendChild(typography);

        // Default render is a <p>.
        const shadow = typography.shadowRoot;
        const paragraph = shadow?.querySelector('p.europa-typography');
        expect(paragraph).not.toBeNull();

        // Switching to heading replaces the <p> with an <h2>.
        typography.setAttribute('variant', 'heading');
        expect(shadow?.querySelector('p.europa-typography')).toBeNull();
        const heading = shadow?.querySelector('h2.europa-typography');
        expect(heading).not.toBeNull();
        expect(heading?.className).toBe('europa-typography europa-typography--heading');

        // Switching back to body replaces the <h2> with a fresh <p>.
        typography.setAttribute('variant', 'body');
        expect(shadow?.querySelector('h2.europa-typography')).toBeNull();
        const body = shadow?.querySelector('p.europa-typography');
        expect(body).not.toBeNull();
        expect(body?.className).toBe('europa-typography europa-typography--body');
    });

    it('keeps the same element when the variant changes within the same tag', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'label');
        document.body.appendChild(typography);

        const first = typography.shadowRoot?.querySelector('span.europa-typography');
        expect(first).not.toBeNull();

        // label → caption both render <span>; the element is reused.
        typography.setAttribute('variant', 'caption');
        const second = typography.shadowRoot?.querySelector('span.europa-typography');
        expect(second).not.toBeNull();
        expect(second).toBe(first);
        expect(second?.className).toBe('europa-typography europa-typography--caption');
    });

    it('projects host children via slot projection', () => {
        const typography = document.createElement('europa-typography');
        const child = document.createTextNode('Combat');
        typography.appendChild(child);
        document.body.appendChild(typography);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the semantic element.
        expect(typography.contains(child)).toBe(true);

        // The slot exists inside the semantic element.
        const el = typography.shadowRoot?.querySelector('p.europa-typography');
        expect(el).not.toBeNull();
        const slot = el?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
