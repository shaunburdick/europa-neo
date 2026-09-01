import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaContainer } from '../../../src/components/generic/container.js';

/**
 * Tests for the `<europa-container>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaContainer` is a light-DOM wrapper: on connect it renders a single
 * `<div class="europa-container">` with children manually reparented into
 * the wrapper. It observes no attributes and registers no element on import
 * — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-container">` is rendered.
 * - Children are reparented into the `.europa-container` div.
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

        const container = host.querySelector('.europa-container');
        expect(container).not.toBeNull();
        expect(container).toBeInstanceOf(HTMLDivElement);
    });

    it('projects slotted children into the europa-container div', () => {
        const host = document.createElement('europa-container');

        const child = document.createElement('p');
        child.textContent = 'Find a match below.';
        host.appendChild(child);

        // Connect after adding children so render() reparents them.
        document.body.appendChild(host);

        // Children are manually reparented into the wrapper (no <slot> in Light DOM).
        const container = host.querySelector('div.europa-container');
        expect(container).not.toBeNull();
        expect(container?.contains(child)).toBe(true);
    });
});
