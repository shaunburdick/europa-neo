/**
 * Tests for the `<europa-banner>` web component (spec 014, FR-012).
 *
 * The banner is a Shadow DOM wrapper around the catalog's `.europa-banner`
 * class. It renders a single `<div class="europa-banner">` inside a shadow
 * root with a `<slot>` projecting host children into the wrapper. The
 * `variant` attribute selects both the accessibility contract and visual
 * style: `status` (default) maps to `role="status"` + `aria-live="polite"` +
 * blue background, while `alert` maps to `role="alert"` +
 * `aria-live="assertive"` + red background. Both live-region attributes live
 * on the internal wrapper div inside the shadow root.
 *
 * The component does NOT auto-register (FR-004) — this suite registers it
 * explicitly via `customElements.define` in `beforeAll`.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaBanner } from '../../../src/components/generic/banner.js';

describe('europa-banner', () => {
    /** The tag name this suite registers the component under. */
    const TAG = 'europa-banner';

    beforeAll(() => {
        customElements.define(TAG, EuropaBanner);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-banner class', () => {
        const banner = document.createElement(TAG);
        document.body.appendChild(banner);

        const shadow = banner.shadowRoot;
        expect(shadow).not.toBeNull();

        const wrapper = shadow?.querySelector('div.europa-banner');
        expect(wrapper).not.toBeNull();
        expect(wrapper?.className).toBe('europa-banner europa-banner--status');
    });

    it('defaults to role=status and aria-live=polite', () => {
        const banner = document.createElement(TAG);
        document.body.appendChild(banner);

        const wrapper = banner.shadowRoot?.querySelector('div.europa-banner');
        expect(wrapper?.getAttribute('role')).toBe('status');
        expect(wrapper?.getAttribute('aria-live')).toBe('polite');
    });

    it('applies europa-banner--status class by default', () => {
        const banner = document.createElement(TAG);
        document.body.appendChild(banner);

        const wrapper = banner.shadowRoot?.querySelector('div.europa-banner');
        expect(wrapper?.classList.contains('europa-banner--status')).toBe(true);
        expect(wrapper?.classList.contains('europa-banner--alert')).toBe(false);
    });

    it('maps variant=alert to role=alert, aria-live=assertive, and europa-banner--alert class', () => {
        const banner = document.createElement(TAG);
        banner.setAttribute('variant', 'alert');
        document.body.appendChild(banner);

        const wrapper = banner.shadowRoot?.querySelector('div.europa-banner');
        expect(wrapper?.getAttribute('role')).toBe('alert');
        expect(wrapper?.getAttribute('aria-live')).toBe('assertive');
        expect(wrapper?.classList.contains('europa-banner--alert')).toBe(true);
        expect(wrapper?.classList.contains('europa-banner--status')).toBe(false);
    });

    it('switches variant class when variant attribute changes', () => {
        const banner = document.createElement(TAG);
        document.body.appendChild(banner);

        const wrapper = banner.shadowRoot?.querySelector('div.europa-banner');
        expect(wrapper?.classList.contains('europa-banner--status')).toBe(true);

        banner.setAttribute('variant', 'alert');
        expect(wrapper?.classList.contains('europa-banner--alert')).toBe(true);
        expect(wrapper?.classList.contains('europa-banner--status')).toBe(false);

        banner.removeAttribute('variant');
        expect(wrapper?.classList.contains('europa-banner--status')).toBe(true);
        expect(wrapper?.classList.contains('europa-banner--alert')).toBe(false);
    });

    it('projects host children via slot projection', () => {
        const banner = document.createElement(TAG);
        const child = document.createTextNode('Reconnecting to match…');
        banner.appendChild(child);
        document.body.appendChild(banner);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(banner.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const wrapper = banner.shadowRoot?.querySelector('div.europa-banner');
        expect(wrapper).not.toBeNull();
        const slot = wrapper?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
