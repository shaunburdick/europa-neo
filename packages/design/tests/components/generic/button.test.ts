import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaButton } from '../../../src/components/generic/button.js';

/**
 * Tests for the `<europa-button>` web component (spec 014, FR-013).
 *
 * The component renders a native `<button>` **inside an open shadow root**
 * with the composed `europa-button` base class plus
 * `europa-button--<variant>` and `europa-button--<size>` modifier classes,
 * and forwards `disabled`, `type`, and `aria-label` to the internal button.
 * Host light-DOM children (the label) are projected via a `<slot>` and stay
 * in the host's light DOM.
 *
 * Covered here (happy-dom, structural assertions only):
 * - Internal native `<button>` rendering with the `europa-button` base class.
 * - Variant attribute → `europa-button--<variant>` modifier class.
 * - Size attribute → `europa-button--<size>` modifier class.
 * - `disabled` (boolean) forwards to the internal button's `disabled`.
 * - `type` forwards to the internal button's `type` (default `button`).
 * - `aria-label` forwards to the internal button.
 * - Host children stay in the light DOM and project through the `<slot>`.
 *
 * Click retargeting and real form submission are covered by the browser
 * integration suite (`button.integration.test.ts`) running in real Chromium.
 */
describe('europa-button', () => {
    /** The element under test, created fresh per test. */
    let element: EuropaButton;

    beforeAll(() => {
        customElements.define('europa-button', EuropaButton);
    });

    afterEach(() => {
        element.remove();
    });

    it('renders an internal native <button> with the europa-button base class', () => {
        element = document.createElement('europa-button');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button).not.toBeNull();
        expect(button?.classList.contains('europa-button')).toBe(true);
    });

    it('maps the variant attribute to a europa-button--<variant> modifier class', () => {
        element = document.createElement('europa-button');
        element.setAttribute('variant', 'primary');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.classList.contains('europa-button--primary')).toBe(true);
    });

    it('maps the size attribute to a europa-button--<size> modifier class', () => {
        element = document.createElement('europa-button');
        element.setAttribute('size', 'sm');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.classList.contains('europa-button--sm')).toBe(true);
    });

    it('forwards the disabled attribute to the internal button', () => {
        element = document.createElement('europa-button');
        element.setAttribute('disabled', '');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.disabled).toBe(true);
    });

    it('does not disable the internal button when disabled is absent', () => {
        element = document.createElement('europa-button');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.disabled).toBe(false);
    });

    it('forwards the type attribute to the internal button', () => {
        element = document.createElement('europa-button');
        element.setAttribute('type', 'submit');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.getAttribute('type')).toBe('submit');
    });

    it('defaults the internal button type to "button"', () => {
        element = document.createElement('europa-button');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.getAttribute('type')).toBe('button');
    });

    it('forwards the aria-label attribute to the internal button', () => {
        element = document.createElement('europa-button');
        element.setAttribute('aria-label', 'Deploy the fleet');
        document.body.appendChild(element);

        const button = element.shadowRoot?.querySelector('button');
        expect(button?.getAttribute('aria-label')).toBe('Deploy the fleet');
    });

    it('projects host children through the slot and keeps them in the light DOM', () => {
        element = document.createElement('europa-button');
        const label = document.createTextNode('Deploy');
        element.appendChild(label);
        document.body.appendChild(element);

        // Structural projection: the label stays a host light-DOM child
        // (never reparented into the shadow tree) and remains visible as
        // the element's flattened text content.
        expect(element.contains(label)).toBe(true);
        expect(element.textContent).toBe('Deploy');

        const slot = element.shadowRoot?.querySelector('button > slot');
        expect(slot).not.toBeNull();
    });

    it('triggers form.requestSubmit() when type="submit" and clicked inside a form', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const button = document.createElement('europa-button');
        button.setAttribute('type', 'submit');
        form.appendChild(button);

        let submitted = false;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitted = true;
        });
        button.click();
        expect(submitted).toBe(true);
    });

    it('does NOT trigger form submission when type="button"', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        const button = document.createElement('europa-button');
        button.setAttribute('type', 'button');
        form.appendChild(button);

        let submitted = false;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitted = true;
        });
        button.click();
        expect(submitted).toBe(false);
    });
});
