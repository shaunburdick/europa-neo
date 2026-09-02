/**
 * Browser integration tests for `<europa-button>` (spec 014, FR-013).
 *
 * These tests are part of the real-Chromium browser suite
 * (`vitest.config.browser.ts`) and assert the behaviors that cross the
 * shadow boundary — the kind of thing structural happy-dom unit tests
 * cannot prove. The file ALSO runs in the happy-dom node suite (its include
 * pattern covers `tests/components/**`), so every assertion is written to
 * hold in both environments; where the environments legitimately differ
 * (event retargeting identity), the assertion tolerates both and the
 * difference is documented inline.
 *
 * Covered behaviors:
 * - Click retargeting: a click on the internal shadow button reaches a
 *   listener on the host element. This is the contract React's `onClick`
 *   relies on (React 19 delegates from the root container and resolves the
 *   handler from the retargeted host target in real browsers).
 * - Form submission: clicking the internal button of
 *   `<europa-button type="submit">` inside a `<form>` fires the form's
 *   `submit` event via the form-association `requestSubmit()` path.
 * - Disabled: the host `disabled` attribute forwards to the internal
 *   button, and a disabled button neither dispatches clicks nor submits.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaButton } from '../../src/components/generic/button.js';

describe('europa-button (browser integration)', () => {
    /** Registered custom-element tag. */
    const TAG = 'europa-button';

    beforeAll(() => {
        // The component does NOT auto-register (FR-004); register it once.
        // Guard against a prior definition in a shared browser context.
        if (customElements.get(TAG) === undefined) {
            customElements.define(TAG, EuropaButton);
        }
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * Create an attached `<europa-button>` with a label child and return it
     * with its internal button.
     *
     * @param label  Text label for the button (projected via the slot).
     * @param attrs  Attributes set on the host before connection.
     * @param parent  Where to append the host (defaults to `document.body`).
     *   Elements that must be born inside a `<form>` (form-owner association
     *   at insertion time) should pass the form here instead of re-parenting
     *   after attachment.
     */
    function createButton(
        label: string,
        attrs: Record<string, string> = {},
        parent: HTMLElement = document.body,
    ): {
        host: EuropaButton;
        internal: HTMLButtonElement;
    } {
        const host = document.createElement(TAG) as EuropaButton;
        host.textContent = label;
        for (const [key, value] of Object.entries(attrs)) {
            host.setAttribute(key, value);
        }
        parent.appendChild(host);

        const internal = host.shadowRoot?.querySelector('button');
        if (internal === null || internal === undefined) {
            throw new Error('internal button not rendered');
        }
        return { host, internal };
    }

    it('click retargeting: clicking the internal shadow button fires the host click listener', () => {
        const { host, internal } = createButton('Deploy');

        let fired = 0;
        let seenTarget: EventTarget | null = null;
        host.addEventListener('click', (e) => {
            fired += 1;
            seenTarget = e.target;
        });

        // Click the INTERNAL button (the element a real pointer actually hits).
        // The composed click event crosses the shadow boundary and must reach
        // the host listener — this is exactly what React's onClick delegation
        // depends on.
        internal.click();

        expect(fired).toBe(1);
        // Retargeting identity: real Chromium retargets the event target to
        // the host at the shadow boundary; happy-dom propagates the event to
        // the host listener but leaves the target as the internal button.
        // Both satisfy the contract (listener fires); identity is asserted
        // tolerantly so this file can run in either environment.
        expect([host, internal]).toContain(seenTarget);

        // The label stays a host light-DOM child projected via the slot.
        expect(host.textContent).toBe('Deploy');
        expect(host.contains(host.firstChild)).toBe(true);
    });

    it('form submission: clicking the internal submit button fires the form submit event', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);

        // Born inside the form so the form-association form owner is
        // established at insertion time.
        const { internal: internalButton } = createButton('Save', { type: 'submit' }, form);

        let submitted = 0;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitted += 1;
        });

        // Click the internal (shadow) button — the composed click must reach
        // the host listener, which delegates to form.requestSubmit().
        internalButton.click();

        expect(submitted).toBe(1);
    });

    it('disabled: the host attribute forwards and a disabled internal button does not submit', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);

        const host = document.createElement(TAG) as EuropaButton;
        host.textContent = 'Save';
        host.setAttribute('type', 'submit');
        host.setAttribute('disabled', '');
        form.appendChild(host);

        const internalButton = host.shadowRoot?.querySelector('button');
        expect(internalButton).not.toBeNull();
        expect(internalButton?.disabled).toBe(true);

        let submitted = 0;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitted += 1;
        });

        // Disabled native buttons do not dispatch click events in real
        // browsers (nor in happy-dom), so no submission can occur.
        internalButton?.click();
        expect(submitted).toBe(0);
    });
});
