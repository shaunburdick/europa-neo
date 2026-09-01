import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaPage } from '../../../src/components/generic/page.js';

/**
 * Tests for the `<europa-page>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaPage` is a light-DOM wrapper: on connect it renders a single
 * `<div class="europa-page">` with children manually reparented into
 * the wrapper. It observes no attributes and registers no element on
 * import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-page">` is rendered.
 * - Children are reparented into the `.europa-page` div.
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

        const page = host.querySelector('.europa-page');
        expect(page).not.toBeNull();
        expect(page).toBeInstanceOf(HTMLDivElement);
    });

    it('projects slotted children into the europa-page div', () => {
        const host = document.createElement('europa-page');

        const child = document.createElement('p');
        child.textContent = 'Match lobby';
        host.appendChild(child);

        // Connect after adding children so render() reparents them.
        document.body.appendChild(host);

        // Children are manually reparented into the wrapper (no <slot> in Light DOM).
        const page = host.querySelector('div.europa-page');
        expect(page).not.toBeNull();
        expect(page?.contains(child)).toBe(true);
    });
});
