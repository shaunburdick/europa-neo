import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaCard } from '../../../src/components/generic/card.js';

/**
 * Tests for the `<europa-card>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaCard` is a Shadow DOM wrapper: on connect it renders a single
 * `<div class="europa-card">` inside a shadow root with a `<slot>` for
 * projecting host children. It observes no attributes and registers no
 * element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-card">` is rendered in the shadow root.
 * - Host children are projected via `<slot>` (remain as host children).
 */
describe('europa-card', () => {
    beforeAll(() => {
        customElements.define('europa-card', EuropaCard);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-card class on connect', () => {
        const host = document.createElement('europa-card');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        expect(shadow).not.toBeNull();

        const card = shadow?.querySelector('.europa-card');
        expect(card).not.toBeNull();
        expect(card).toBeInstanceOf(HTMLDivElement);
    });

    it('contains a slot element inside the europa-card div', () => {
        const host = document.createElement('europa-card');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        const card = shadow?.querySelector('.europa-card');
        const slot = card?.querySelector('slot');
        expect(slot).not.toBeNull();
        expect(slot).toBeInstanceOf(HTMLSlotElement);
    });

    it('projects host children via slot projection', () => {
        const host = document.createElement('europa-card');

        const child = document.createElement('p');
        child.textContent = 'Match summary';
        host.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(host);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(host.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const shadow = host.shadowRoot;
        const card = shadow?.querySelector('div.europa-card');
        expect(card).not.toBeNull();
        const slot = card?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
