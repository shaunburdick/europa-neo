import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaPlate } from '../../../src/components/generic/plate.js';

/**
 * Tests for the `<europa-plate>` component (spec 014, FR-001 / FR-027).
 *
 * `EuropaPlate` renders a `<div class="europa-plate">` that wraps a `<slot>`
 * in **light DOM** (no Shadow DOM, per FR-009). It observes no attributes and
 * is not auto-registered on import (FR-004) — this suite registers the class
 * explicitly via `customElements.define` before running.
 *
 * Covered here:
 * - Class composition: the internal wrapper carries the `europa-plate` class.
 * - Slot rendering: slotted children project into the wrapper div.
 * - Idempotent render: re-connecting does not duplicate the wrapper.
 */
describe('europa-plate', () => {
    beforeAll(() => {
        customElements.define('europa-plate', EuropaPlate);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-plate class', () => {
        const el = document.createElement('europa-plate');
        document.body.appendChild(el);

        const wrapper = el.querySelector('div.europa-plate');
        expect(wrapper).not.toBeNull();
    });

    it('projects slotted children into the wrapper div', () => {
        const el = document.createElement('europa-plate');
        el.innerHTML = '<h3>Section title</h3><p>Body content goes here.</p>';
        document.body.appendChild(el);

        const heading = el.querySelector('h3');
        expect(heading).not.toBeNull();
        expect(heading?.textContent).toBe('Section title');

        const paragraph = el.querySelector('p');
        expect(paragraph).not.toBeNull();
        expect(paragraph?.textContent).toBe('Body content goes here.');

        // The children stay light-DOM children of the host (slot projection, not relocation)
        expect(el.contains(heading as Node)).toBe(true);
        expect(el.contains(paragraph as Node)).toBe(true);

        // The wrapper contains a <slot> that projects the host's children
        const wrapper = el.querySelector('div.europa-plate');
        expect(wrapper).not.toBeNull();
        const slot = wrapper?.querySelector('slot');
        expect(slot).not.toBeNull();
    });

    it('does not duplicate the wrapper when re-connected', () => {
        const el = document.createElement('europa-plate');
        document.body.appendChild(el);

        // Re-inserting the element triggers connectedCallback again; the
        // render() method is idempotent and must not create a second wrapper.
        document.body.appendChild(el);

        const wrappers = el.querySelectorAll('div.europa-plate');
        expect(wrappers).toHaveLength(1);
    });
});
