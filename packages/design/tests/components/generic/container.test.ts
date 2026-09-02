import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaContainer } from '../../../src/components/generic/container.js';

/**
 * Tests for the `<europa-container>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaContainer` is a Shadow DOM wrapper: on connect it renders a single
 * `<div class="europa-container">` inside a shadow root with a `<slot>` for
 * projecting host children. It observes no attributes and registers no
 * element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-container">` is rendered in the shadow root.
 * - Host children are projected via `<slot>` (remain as host children).
 */
describe('europa-container', () => {
    beforeAll(() => {
        customElements.define('europa-container', EuropaContainer);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-container class on connect', () => {
        const host = document.createElement('europa-container');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        expect(shadow).not.toBeNull();

        const container = shadow?.querySelector('.europa-container');
        expect(container).not.toBeNull();
        expect(container).toBeInstanceOf(HTMLDivElement);
    });

    it('contains a slot element inside the europa-container div', () => {
        const host = document.createElement('europa-container');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        const container = shadow?.querySelector('.europa-container');
        const slot = container?.querySelector('slot');
        expect(slot).not.toBeNull();
        expect(slot).toBeInstanceOf(HTMLSlotElement);
    });

    it('projects host children via slot projection', () => {
        const host = document.createElement('europa-container');

        const child = document.createElement('p');
        child.textContent = 'Find a match below.';
        host.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(host);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(host.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const shadow = host.shadowRoot;
        const container = shadow?.querySelector('div.europa-container');
        expect(container).not.toBeNull();
        const slot = container?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
