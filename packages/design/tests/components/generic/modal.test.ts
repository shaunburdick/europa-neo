/**
 * Tests for the `<europa-modal>` web component (spec 014, FR-011 / FR-027).
 *
 * The modal is the most complex component in the set: it renders a
 * shadow-DOM `backdrop > dialog > title + body[slot] + actions[slot]`
 * structure, enforces the accessibility contract (`role="dialog"`,
 * `aria-modal="true"`, `aria-labelledby` pointing to the title), and
 * dispatches `europa-close` on Escape or backdrop click.
 *
 * This suite covers the component's OWN logic that happy-dom can reliably
 * exercise (FR-027): structural rendering through the shadow root, host
 * children staying in the light DOM (slot projection), a11y attributes,
 * and the Escape-close event. The full focus-trap and focus-restore
 * behavior (FR-011 d/f, FR-028) is covered by the browser integration test
 * (`modal.integration.test.ts`), which runs in real Chromium where focus
 * management is reliable — happy-dom's focus support is limited.
 *
 * The component does NOT auto-register (FR-004) — this suite registers it
 * explicitly via `customElements.define` in `beforeAll`.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaModal } from '../../../src/components/generic/modal.js';

describe('europa-modal', () => {
    /** The tag name this suite registers the component under. */
    const TAG = 'europa-modal';

    beforeAll(() => {
        customElements.define(TAG, EuropaModal);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the backdrop and dialog inside the shadow root when open', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        const backdrop = modal.shadowRoot?.querySelector('div.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();
        expect(backdrop?.className).toBe('europa-modal-backdrop');

        const dialog = backdrop?.querySelector('div.europa-modal');
        expect(dialog).not.toBeNull();
        expect(dialog?.className).toBe('europa-modal');
    });

    it('has tabindex=-1 on the dialog for focus()', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        const dialog = modal.shadowRoot?.querySelector('div.europa-modal');
        expect(dialog).not.toBeNull();
        expect(dialog?.getAttribute('tabindex')).toBe('-1');
    });

    it('sets role and aria-modal on the dialog', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        const dialog = modal.shadowRoot?.querySelector('div.europa-modal');
        expect(dialog?.getAttribute('role')).toBe('dialog');
        expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('renders the title attribute and links aria-labelledby to it', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        modal.setAttribute('title', 'Confirm surrender');
        document.body.appendChild(modal);

        const title = modal.shadowRoot?.querySelector('h2.europa-modal__title');
        expect(title).not.toBeNull();
        expect(title?.textContent).toBe('Confirm surrender');

        const dialog = modal.shadowRoot?.querySelector('div.europa-modal');
        const labelledBy = dialog?.getAttribute('aria-labelledby');
        expect(labelledBy).not.toBeNull();
        expect(title?.id).toBe(labelledBy);
    });

    it('renders the body and actions slots inside the shadow root', () => {
        const modal = document.createElement(TAG);
        modal.innerHTML = `
            <p>Body content</p>
            <div slot="actions">
                <button type="button">Cancel</button>
            </div>
        `;
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        const body = modal.shadowRoot?.querySelector('div.europa-modal__body');
        expect(body).not.toBeNull();
        expect(body?.querySelector('slot')).not.toBeNull();

        const actions = modal.shadowRoot?.querySelector('div.europa-modal__actions');
        expect(actions).not.toBeNull();
        const actionsSlot = actions?.querySelector('slot[name="actions"]');
        expect(actionsSlot).not.toBeNull();
    });

    it('keeps host children in the light DOM (slot projection, not reparenting)', () => {
        const modal = document.createElement(TAG);
        const bodyChild = document.createElement('p');
        bodyChild.textContent = 'Body content';
        const actionsChild = document.createElement('div');
        actionsChild.setAttribute('slot', 'actions');
        modal.appendChild(bodyChild);
        modal.appendChild(actionsChild);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        // Structural projection: slotted content stays in the host's light
        // DOM (never reparented into the shadow tree).
        expect(modal.contains(bodyChild)).toBe(true);
        expect(modal.contains(actionsChild)).toBe(true);
    });

    it('hides the host when open is absent', () => {
        const modal = document.createElement(TAG);
        document.body.appendChild(modal);

        expect(modal.hasAttribute('hidden')).toBe(true);
    });

    it('does not hide the host when open is present', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        expect(modal.hasAttribute('hidden')).toBe(false);
    });

    it('dispatches europa-close and removes open on Escape', () => {
        const modal = document.createElement(TAG);
        modal.setAttribute('open', '');
        document.body.appendChild(modal);

        let closeCount = 0;
        modal.addEventListener('europa-close', () => {
            closeCount += 1;
        });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(closeCount).toBe(1);
        expect(modal.hasAttribute('open')).toBe(false);
    });

    it('does not close on Escape when the modal is closed', () => {
        const modal = document.createElement(TAG);
        document.body.appendChild(modal);

        let closeCount = 0;
        modal.addEventListener('europa-close', () => {
            closeCount += 1;
        });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(closeCount).toBe(0);
    });
});
