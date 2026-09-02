import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaPage } from '../../../src/components/generic/page.js';

/**
 * Tests for the `<europa-page>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaPage` is a Shadow DOM wrapper: on connect it renders a single
 * `<div class="europa-page">` inside a shadow root with a `<slot>` for
 * projecting host children. It observes no attributes and registers no
 * element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-page">` is rendered in the shadow root.
 * - Host children are projected via `<slot>` (remain as host children).
 */
describe('europa-page', () => {
    beforeAll(() => {
        customElements.define('europa-page', EuropaPage);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-page class on connect', () => {
        const host = document.createElement('europa-page');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        expect(shadow).not.toBeNull();

        const page = shadow?.querySelector('.europa-page');
        expect(page).not.toBeNull();
        expect(page).toBeInstanceOf(HTMLDivElement);
    });

    it('contains a slot element inside the europa-page div', () => {
        const host = document.createElement('europa-page');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        const page = shadow?.querySelector('.europa-page');
        const slot = page?.querySelector('slot');
        expect(slot).not.toBeNull();
        expect(slot).toBeInstanceOf(HTMLSlotElement);
    });

    it('projects host children via slot projection', () => {
        const host = document.createElement('europa-page');

        const child = document.createElement('p');
        child.textContent = 'Match lobby';
        host.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(host);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(host.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const shadow = host.shadowRoot;
        const page = shadow?.querySelector('div.europa-page');
        expect(page).not.toBeNull();
        const slot = page?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
