/**
 * Tests for the `<europa-banner>` web component (spec 014, FR-012).
 *
 * The banner is a light-DOM wrapper around the catalog's `.europa-banner`
 * class. It renders a single `<div class="europa-banner">` that wraps a
 * `<slot>` projecting the host's light-DOM children. The `variant` attribute
 * selects the accessibility contract: `status` (default) maps to
 * `role="status"` + `aria-live="polite"`, while `alert` maps to
 * `role="alert"` + `aria-live="assertive"` so the message is announced
 * immediately.
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

        const wrapper = banner.querySelector('div.europa-banner');
        expect(wrapper).not.toBeNull();
        expect(wrapper?.className).toBe('europa-banner');
    });

    it('defaults to role=status and aria-live=polite', () => {
        const banner = document.createElement(TAG);
        document.body.appendChild(banner);

        const wrapper = banner.querySelector('div.europa-banner');
        expect(wrapper?.getAttribute('role')).toBe('status');
        expect(wrapper?.getAttribute('aria-live')).toBe('polite');
    });

    it('maps variant=alert to role=alert and aria-live=assertive', () => {
        const banner = document.createElement(TAG);
        banner.setAttribute('variant', 'alert');
        document.body.appendChild(banner);

        const wrapper = banner.querySelector('div.europa-banner');
        expect(wrapper?.getAttribute('role')).toBe('alert');
        expect(wrapper?.getAttribute('aria-live')).toBe('assertive');
    });

    it('projects slotted children into the internal div', () => {
        const banner = document.createElement(TAG);
        const child = document.createTextNode('Reconnecting to match…');
        banner.appendChild(child);
        document.body.appendChild(banner);

        // The child stays a light-DOM child of the host (slot projection, not
        // relocation).
        expect(banner.contains(child)).toBe(true);

        // The wrapper contains a <slot> that projects the host's children.
        const wrapper = banner.querySelector('div.europa-banner');
        expect(wrapper).not.toBeNull();
        const slot = wrapper?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
