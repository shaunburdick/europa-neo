import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaGrid } from '../../../src/components/generic/grid.js';

/**
 * Tests for the `<europa-grid>` web component (spec 014, FR-001 generic
 * primitives).
 *
 * `EuropaGrid` is a Shadow DOM layout wrapper: on connect it renders a
 * single `<div class="europa-grid">` inside a shadow root with a `<slot>`
 * for projecting host children. It observes the `variant` attribute and
 * applies the catalog classes to the **internal wrapper div** (not the
 * host element):
 *
 * - `sidebar` → adds `europa-grid--sidebar`
 * - `wrap` → adds `europa-grid--wrap`
 * - absent/other → base `europa-grid` only
 *
 * The element does not auto-register on import (FR-004) — this suite
 * registers the class explicitly via `customElements.define` before running.
 *
 * Covered here:
 * - Registration via `customElements.define` (no auto-registration).
 * - On connect, an internal `<div class="europa-grid">` is rendered in the
 *   shadow root.
 * - The `variant="sidebar"` attribute adds `europa-grid--sidebar` to the
 *   internal div.
 * - The `variant="wrap"` attribute adds `europa-grid--wrap` to the internal
 *   div.
 * - The modifier class updates when `variant` changes after connect.
 * - Children remain host children and are projected via `<slot>`.
 */
describe('europa-grid', () => {
    beforeAll(() => {
        customElements.define('europa-grid', EuropaGrid);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an internal div with the europa-grid class on connect', () => {
        const host = document.createElement('europa-grid');
        document.body.appendChild(host);

        const shadow = host.shadowRoot;
        expect(shadow).not.toBeNull();

        const grid = shadow?.querySelector('.europa-grid');
        expect(grid).not.toBeNull();
        expect(grid).toBeInstanceOf(HTMLDivElement);
    });

    it('applies the europa-grid--sidebar modifier when variant is sidebar', () => {
        const host = document.createElement('europa-grid');
        host.setAttribute('variant', 'sidebar');
        document.body.appendChild(host);

        const grid = host.shadowRoot?.querySelector('.europa-grid');
        expect(grid?.classList.contains('europa-grid')).toBe(true);
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(true);
        expect(grid?.classList.contains('europa-grid--wrap')).toBe(false);
    });

    it('applies the europa-grid--wrap modifier when variant is wrap', () => {
        const host = document.createElement('europa-grid');
        host.setAttribute('variant', 'wrap');
        document.body.appendChild(host);

        const grid = host.shadowRoot?.querySelector('.europa-grid');
        expect(grid?.classList.contains('europa-grid')).toBe(true);
        expect(grid?.classList.contains('europa-grid--wrap')).toBe(true);
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(false);
    });

    it('does not apply a modifier class when variant is absent', () => {
        const host = document.createElement('europa-grid');
        document.body.appendChild(host);

        const grid = host.shadowRoot?.querySelector('.europa-grid');
        expect(grid?.classList.contains('europa-grid')).toBe(true);
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(false);
        expect(grid?.classList.contains('europa-grid--wrap')).toBe(false);
    });

    it('updates the modifier class when variant changes after connect', () => {
        const host = document.createElement('europa-grid');
        document.body.appendChild(host);

        const grid = host.shadowRoot?.querySelector('.europa-grid');
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(false);

        host.setAttribute('variant', 'sidebar');
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(true);
        expect(grid?.classList.contains('europa-grid--wrap')).toBe(false);

        host.setAttribute('variant', 'wrap');
        expect(grid?.classList.contains('europa-grid--wrap')).toBe(true);
        expect(grid?.classList.contains('europa-grid--sidebar')).toBe(false);
    });

    it('projects host children via slot projection', () => {
        const host = document.createElement('europa-grid');

        const child = document.createElement('p');
        child.textContent = 'Grid content';
        host.appendChild(child);

        // Connect after adding children so render() sets up the shadow root.
        document.body.appendChild(host);

        // Under Shadow DOM, children remain on the host and are projected
        // via the <slot> — they are NOT reparented into the wrapper div.
        expect(host.contains(child)).toBe(true);

        // The slot exists inside the wrapper.
        const grid = host.shadowRoot?.querySelector('div.europa-grid');
        expect(grid).not.toBeNull();
        const slot = grid?.querySelector('slot');
        expect(slot).not.toBeNull();
    });
});
