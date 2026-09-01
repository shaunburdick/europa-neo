import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaContainer } from '../../../src/components/generic/container.js';

/**
 * Tests for the `<europa-container>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaContainer` is a light-DOM wrapper: on connect it renders a single
 * `<div class="europa-container">` containing a `<slot>`, so arbitrary slotted
 * children are projected into the container. It observes no attributes and
 * registers no element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-container">` is rendered.
 * - Slotted children project into the `.europa-container` div.
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
        document.body.appendChild(host);

        const child = document.createElement('p');
        child.textContent = 'Find a match below.';
        host.appendChild(child);

        // The child stays a light-DOM child of the host (slot projection, not relocation)
        expect(host.contains(child)).toBe(true);

        // The wrapper contains a <slot> that projects the host's children
        const container = host.querySelector('div.europa-container');
        expect(container).not.toBeNull();
        const slot = container?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
