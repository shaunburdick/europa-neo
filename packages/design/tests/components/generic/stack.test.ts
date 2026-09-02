import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaStack } from '../../../src/components/generic/stack.js';

/**
 * Tests for the `<europa-stack>` custom element (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaStack` is a Shadow DOM layout primitive: on connect it renders a
 * single `<div class="europa-stack">` inside a shadow root with a `<slot>`
 * for projecting host children. It observes no attributes and registers no
 * element on import — the test registers it explicitly.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-stack">` is rendered in the shadow root.
 * - Host children are projected via `<slot>` (remain as host children).
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

        const shadow = host.shadowRoot;
        expect(shadow).not.toBeNull();

        const stack = shadow?.querySelector('.europa-stack');
        expect(stack).not.toBeNull();
        expect(stack).toBeInstanceOf(HTMLDivElement);
    });

    it('contains a slot element inside the europa-stack div', () => {
        const host = document.createElement('europa-stack');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        const stack = shadow?.querySelector('.europa-stack');
        const slot = stack?.querySelector('slot');
        expect(slot).not.toBeNull();
        expect(slot).toBeInstanceOf(HTMLSlotElement);
    });

    it('projects host children via slot projection', () => {
        const host = document.createElement('europa-stack');

        const child = document.createElement('p');
        child.textContent = 'First item';
        host.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(host);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(host.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const shadow = host.shadowRoot;
        const stack = shadow?.querySelector('div.europa-stack');
        expect(stack).not.toBeNull();
        const slot = stack?.querySelector('slot');
        expect(slot).not.toBeNull();
    });

    it('does not duplicate the wrapper when re-connected', () => {
        const host = document.createElement('europa-stack');
        document.body.appendChild(host);

        // Re-inserting the element triggers connectedCallback again; the
        // render() method is idempotent and must not create a second wrapper.
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        const stacks = shadow?.querySelectorAll('div.europa-stack');
        expect(stacks).toHaveLength(1);
    });
});
