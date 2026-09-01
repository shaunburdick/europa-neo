import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaStack } from '../../../src/components/generic/stack.js';

/**
 * Tests for the `<europa-stack>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaStack` is a light-DOM layout primitive: on connect it renders a
 * single `<div class="europa-stack">` with children manually reparented
 * into the wrapper. It observes no attributes and registers no element on
 * import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-stack">` is rendered.
 * - Children are reparented into the `.europa-stack` div.
 * - Idempotent render: re-connecting does not duplicate the wrapper.
 */
describe('europa-stack', () => {
    beforeAll(() => {
        customElements.define('europa-stack', EuropaStack);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-stack class on connect', () => {
        const host = document.createElement('europa-stack');
        document.body.appendChild(host);

        const stack = host.querySelector('.europa-stack');
        expect(stack).not.toBeNull();
        expect(stack).toBeInstanceOf(HTMLDivElement);
    });

    it('projects slotted children into the europa-stack div', () => {
        const host = document.createElement('europa-stack');

        const child = document.createElement('p');
        child.textContent = 'First item';
        host.appendChild(child);

        // Connect after adding children so render() reparents them.
        document.body.appendChild(host);

        // Children are manually reparented into the wrapper (no <slot> in Light DOM).
        const stack = host.querySelector('div.europa-stack');
        expect(stack).not.toBeNull();
        expect(stack?.contains(child)).toBe(true);
    });

    it('does not duplicate the wrapper when re-connected', () => {
        const host = document.createElement('europa-stack');
        document.body.appendChild(host);

        // Re-inserting the element triggers connectedCallback again; the
        // render() method is idempotent and must not create a second wrapper.
        document.body.appendChild(host);

        const stacks = host.querySelectorAll('div.europa-stack');
        expect(stacks).toHaveLength(1);
    });
});
