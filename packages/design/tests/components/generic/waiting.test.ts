/**
 * Tests for the `<europa-waiting>` web component (spec 014, FR-014).
 *
 * The waiting component is a light-DOM wrapper around the catalog's
 * `.europa-waiting` family of classes. It renders a root
 * `<div class="europa-waiting">` containing a plate
 * (`__plate`) that holds a decorative spinner pulse (`__pulse`,
 * `aria-hidden="true"`) and a message paragraph (`__text`).
 *
 * The `message` attribute drives the text shown in `__text`, and the
 * `reduced-motion` attribute adds the `.europa-waiting--reduced` modifier
 * class to the root to disable the pulse animation.
 *
 * The component does NOT auto-register (FR-004) — this suite registers it
 * explicitly via `customElements.define` in `beforeAll`.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaWaiting } from '../../../src/components/generic/waiting.js';

describe('europa-waiting', () => {
    /** The tag name this suite registers the component under. */
    const TAG = 'europa-waiting';

    beforeAll(() => {
        customElements.define(TAG, EuropaWaiting);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the root with plate, pulse, and text children', () => {
        const waiting = document.createElement(TAG);
        document.body.appendChild(waiting);

        const root = waiting.querySelector('div.europa-waiting');
        expect(root).not.toBeNull();
        expect(root?.className).toBe('europa-waiting');

        const plate = root?.querySelector('div.europa-waiting__plate');
        expect(plate).not.toBeNull();

        const pulse = plate?.querySelector('div.europa-waiting__pulse');
        expect(pulse).not.toBeNull();

        const text = plate?.querySelector('p.europa-waiting__text');
        expect(text).not.toBeNull();
    });

    it('marks the pulse as decorative with aria-hidden', () => {
        const waiting = document.createElement(TAG);
        document.body.appendChild(waiting);

        const pulse = waiting.querySelector('div.europa-waiting__pulse');
        expect(pulse?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders the message attribute as the text content', () => {
        const waiting = document.createElement(TAG);
        waiting.setAttribute('message', 'Waiting for opponent…');
        document.body.appendChild(waiting);

        const text = waiting.querySelector('p.europa-waiting__text');
        expect(text?.textContent).toBe('Waiting for opponent…');
    });

    it('updates the text when the message attribute changes', () => {
        const waiting = document.createElement(TAG);
        waiting.setAttribute('message', 'Connecting…');
        document.body.appendChild(waiting);

        waiting.setAttribute('message', 'Reconnecting…');

        const text = waiting.querySelector('p.europa-waiting__text');
        expect(text?.textContent).toBe('Reconnecting…');
    });

    it('adds the reduced-motion modifier class to the root', () => {
        const waiting = document.createElement(TAG);
        waiting.setAttribute('reduced-motion', '');
        document.body.appendChild(waiting);

        const root = waiting.querySelector('div.europa-waiting');
        expect(root?.classList.contains('europa-waiting--reduced')).toBe(true);
    });

    it('omits the reduced-motion modifier class by default', () => {
        const waiting = document.createElement(TAG);
        document.body.appendChild(waiting);

        const root = waiting.querySelector('div.europa-waiting');
        expect(root?.classList.contains('europa-waiting--reduced')).toBe(false);
    });
});
