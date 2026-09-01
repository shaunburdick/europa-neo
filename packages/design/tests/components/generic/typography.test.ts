import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaTypography } from '../../../src/components/generic/typography.js';

/**
 * Tests for the `europa-typography` component (spec 014, FR-001).
 *
 * The typography primitive renders a semantic element chosen by the `variant`
 * attribute: `heading` → `<h2>`, `subheading` → `<h3>`, `body` (default) →
 * `<p>`, and `label`/`caption` → `<span>`. Each rendered element carries the
 * `europa-typography` catalog class plus a `europa-typography--<variant>`
 * modifier. It uses light DOM (no Shadow DOM), observes only the `variant`
 * attribute, and is not auto-registered — the test registers it explicitly via
 * `customElements.define` in `beforeAll`.
 *
 * Covered here:
 * - Registration: `customElements.define('europa-typography', EuropaTypography)`
 *   works.
 * - Default rendering: no `variant` attribute produces a `<p>` with
 *   `europa-typography` + `europa-typography--body`.
 * - Variant rendering: each supported variant produces the correct semantic
 *   element and catalog modifier.
 * - Slotted children project into the semantic element.
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

        const el = typography.querySelector('p.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--body');
    });

    it('renders an <h2> with the heading modifier for variant="heading"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'heading');
        document.body.appendChild(typography);

        const el = typography.querySelector('h2.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--heading');
    });

    it('renders an <h3> with the subheading modifier for variant="subheading"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'subheading');
        document.body.appendChild(typography);

        const el = typography.querySelector('h3.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--subheading');
    });

    it('renders a <span> with the label modifier for variant="label"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'label');
        document.body.appendChild(typography);

        const el = typography.querySelector('span.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--label');
    });

    it('renders a <span> with the caption modifier for variant="caption"', () => {
        const typography = document.createElement('europa-typography');
        typography.setAttribute('variant', 'caption');
        document.body.appendChild(typography);

        const el = typography.querySelector('span.europa-typography');
        expect(el).not.toBeNull();
        expect(el?.className).toBe('europa-typography europa-typography--caption');
    });

    it('projects slotted children into the semantic element', () => {
        const typography = document.createElement('europa-typography');
        const child = document.createTextNode('Combat');
        typography.appendChild(child);
        document.body.appendChild(typography);

        // The child stays a light-DOM child of the host (slot projection, not
        // relocation into the semantic element).
        expect(typography.contains(child)).toBe(true);

        // The semantic element contains a <slot> that projects the host's
        // children.
        const el = typography.querySelector('p.europa-typography');
        expect(el).not.toBeNull();
        const slot = el?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
