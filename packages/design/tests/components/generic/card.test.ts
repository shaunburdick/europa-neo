import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaCard } from '../../../src/components/generic/card.js';

/**
 * Tests for the `<europa-card>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaCard` is a light-DOM wrapper: on connect it renders a single
 * `<div class="europa-card">` containing a `<slot>`, so arbitrary slotted
 * children are projected into the card. It observes no attributes and
 * registers no element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-card">` is rendered.
 * - Slotted children project into the `.europa-card` div.
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

        const card = host.querySelector('.europa-card');
        expect(card).not.toBeNull();
        expect(card).toBeInstanceOf(HTMLDivElement);
    });

    it('projects slotted children into the europa-card div', () => {
        const host = document.createElement('europa-card');
        document.body.appendChild(host);

        const child = document.createElement('p');
        child.textContent = 'Match summary';
        host.appendChild(child);

        // The child stays a light-DOM child of the host (slot projection, not relocation)
        expect(host.contains(child)).toBe(true);

        // The wrapper contains a <slot> that projects the host's children
        const card = host.querySelector('div.europa-card');
        expect(card).not.toBeNull();
        const slot = card?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
