import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaCard } from '../../../src/components/generic/card.js';

/**
 * Tests for the `<europa-card>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaCard` is a light-DOM wrapper: on connect it renders a single
 * `<div class="europa-card">` with children manually reparented into
 * the wrapper. It observes no attributes and registers no element on
 * import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-card">` is rendered.
 * - Children are reparented into the `.europa-card` div.
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

        const child = document.createElement('p');
        child.textContent = 'Match summary';
        host.appendChild(child);

        // Connect after adding children so render() reparents them.
        document.body.appendChild(host);

        // Children are manually reparented into the wrapper (no <slot> in Light DOM).
        const card = host.querySelector('div.europa-card');
        expect(card).not.toBeNull();
        expect(card?.contains(child)).toBe(true);
    });
});
