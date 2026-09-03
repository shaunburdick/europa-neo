/**
 * Browser integration tests for `<europa-modal>` focus-trap behavior (spec 014,
 * FR-011 / FR-028).
 *
 * These tests run in real Chromium via Vitest browser mode
 * (`vitest.config.browser.ts`) and assert actual browser focus state — the
 * kind of behavior happy-dom cannot reliably simulate (FR-028). They are
 * complementary to the happy-dom unit suite in `generic/modal.test.ts`, which
 * covers the component's own DOM/a11y logic that does not depend on real focus.
 *
 * Covered behaviors:
 * - Tab / Shift+Tab focus-trap cycling (forward wraps last→first, reverse
 *   wraps first→last among the flattened focusables).
 * - Focus cannot escape the dialog to an element outside it.
 * - Escape closes the modal and restores focus to the previously-focused
 *   element, firing `europa-close`.
 * - Backdrop click closes the modal and fires `europa-close`; clicking inside
 *   the dialog does not.
 * - Toggling the `open` attribute shows/hides the modal.
 *
 * Shadow DOM note (Wave 3): `<europa-modal>` renders its backdrop/dialog
 * structure inside an open shadow root and projects host children via the
 * body's default `<slot>`. Focusable content is therefore supplied as plain
 * host children — the natural post-conversion pattern — and the focusable
 * enumeration helper below mirrors the component's flattened-tree walk
 * (shadow tree → slots → assigned subtrees). The file also runs in the
 * happy-dom node suite, where `slot.assignedElements()` and focus simulation
 * are supported, so every assertion holds in both environments.
 *
 * Focus entry: the component's `render()` calls `this._dialog.focus()` when
 * opened; the dialog carries `tabindex="-1"` and lives inside the shadow
 * root, so `document.activeElement` reports the `<europa-modal>` host with
 * the dialog itself as `shadowRoot.activeElement`. The trap resolves the
 * deep active element, so the boundary conditions work from the dialog too.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EuropaModal } from '../../src/components/generic/modal.js';

/** The selector the component uses to enumerate focusable elements. */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The disabled/negative-tabindex guard the component applies to every source. */
function isFocusable(el: Element): boolean {
    return el.matches(FOCUSABLE_SELECTOR) && !el.hasAttribute('disabled') && el.tabIndex >= 0;
}

/**
 * Collect the focusable elements inside the dialog, in flattened document
 * order. Mirrors the component's `_collectFocusables` walk: shadow-tree
 * children, then slots (into their assigned light-DOM elements), then
 * nested open shadow roots.
 *
 * @param dialog  The dialog element (inside the modal's shadow root).
 * @param out  The accumulator for focusable elements.
 */
function collectFocusablesIn(container: ParentNode, out: HTMLElement[]): void {
    for (const child of container.children) {
        if (child instanceof HTMLSlotElement) {
            for (const assigned of child.assignedElements()) {
                collectInto(assigned, out);
            }
            continue;
        }
        collectInto(child, out);
    }
}

/**
 * Append `el` itself when focusable, then recurse into its children and its
 * open shadow root, if any. Mirrors the component's per-element walk.
 *
 * @param el  The element to visit.
 * @param out  The accumulator for focusable elements.
 */
function collectInto(el: Element, out: HTMLElement[]): void {
    if (isFocusable(el)) {
        out.push(el as HTMLElement);
    }
    if (el.shadowRoot !== null) {
        collectFocusablesIn(el.shadowRoot, out);
    }
    collectFocusablesIn(el, out);
}

/**
 * Returns the focusable elements rendered inside the dialog (title bar,
 * body, and actions regions of the flattened tree).
 *
 * @param modal  The `<europa-modal>` element to inspect.
 * @returns The array of focusable `HTMLElement`s inside the dialog.
 */
function getDialogFocusables(modal: EuropaModal): HTMLElement[] {
    const dialog = modal.shadowRoot?.querySelector<HTMLElement>('div[role="dialog"]');
    if (dialog === null || dialog === undefined) return [];
    const out: HTMLElement[] = [];
    collectFocusablesIn(dialog, out);
    return out;
}

describe('europa-modal (browser integration)', () => {
    /** Registered custom-element tag. */
    const TAG = 'europa-modal';

    beforeAll(() => {
        // The component does NOT auto-register (FR-004); register it once.
        // Guard against a prior definition in a shared browser context.
        if (customElements.get(TAG) === undefined) {
            customElements.define(TAG, EuropaModal);
        }
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * Create and open a modal with focusable buttons supplied as HOST
     * children (they project through the body's default slot), plus
     * optionally one focusable button OUTSIDE the modal in the document
     * body.
     *
     * The modal is attached to the document first (so `connectedCallback`
     * synchronously renders the shadow structure), then buttons are added
     * to the host (slot projection makes them part of the flattened
     * dialog), and finally `open` is set — which triggers
     * `attributeChangedCallback` to capture `_previousFocus` and `render()`
     * to run focus management.
     *
     * @param options  Optional configuration for inside/outside buttons.
     * @returns The modal plus the inside and outside buttons for assertions.
     */
    function createOpenModal(options?: {
        /** Number of focusable buttons inside the dialog body. Default 3. */
        insideCount?: number;
        /** Whether to add a focusable button OUTSIDE the modal. Default false. */
        withOutsideButton?: boolean;
    }): {
        modal: EuropaModal;
        insideButtons: HTMLButtonElement[];
        outsideButton: HTMLButtonElement | null;
    } {
        const { insideCount = 3, withOutsideButton = false } = options ?? {};

        let outsideButton: HTMLButtonElement | null = null;
        if (withOutsideButton) {
            outsideButton = document.createElement('button');
            outsideButton.type = 'button';
            outsideButton.textContent = 'Outside';
            document.body.appendChild(outsideButton);
        }

        const modal = document.createElement(TAG) as EuropaModal;

        // Attach first so connectedCallback renders the shadow structure.
        document.body.appendChild(modal);

        // Slotted content: plain host children project through the default
        // slot into the flattened dialog.
        for (let i = 0; i < insideCount; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `Btn ${i}`;
            modal.appendChild(btn);
        }

        // Set open AFTER the slotted content exists so focus management runs.
        modal.setAttribute('open', '');

        const insideButtons = getDialogFocusables(modal).filter(
            (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
        );

        return { modal, insideButtons, outsideButton };
    }

    /**
     * Dispatch a Tab keydown on `document` (the modal listens at the document
     * level) and return the element that ends up focused.
     *
     * Synthetic key events do not trigger the browser's native focus movement,
     * so the only focus change is the one the modal's trap performs explicitly.
     *
     * @param shift  When true, dispatch Shift+Tab.
     * @returns The element that is focused after the event.
     */
    function pressTab(shift = false): HTMLElement {
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Tab',
                shiftKey: shift,
                bubbles: true,
                cancelable: true,
            }),
        );
        return document.activeElement as HTMLElement;
    }

    // ─── T-054-1: Focus trap cycles Tab (forward) ────────────────────────

    it('focus trap cycles Tab forward: last → first', () => {
        const { modal, insideButtons } = createOpenModal({ insideCount: 3 });
        expect(insideButtons.length).toBe(3);

        const [first, , last] = insideButtons;

        // Position focus on the last focusable to set up the wrap condition.
        last.focus();
        expect(document.activeElement).toBe(last);

        // Tab on the last focusable should wrap to the first.
        const focused = pressTab(false);
        expect(focused).toBe(first);
        expect(document.activeElement).toBe(first);

        modal.removeAttribute('open');
    });

    // ─── T-054-2: Focus trap cycles Shift+Tab (reverse) ──────────────────

    it('focus trap cycles Shift+Tab reverse: first → last', () => {
        const { modal, insideButtons } = createOpenModal({ insideCount: 3 });
        const [first, , last] = insideButtons;

        // Position focus on the first focusable.
        first.focus();
        expect(document.activeElement).toBe(first);

        // Shift+Tab on the first focusable should wrap to the last.
        const focused = pressTab(true);
        expect(focused).toBe(last);
        expect(document.activeElement).toBe(last);

        modal.removeAttribute('open');
    });

    // ─── T-054-3: Focus cannot escape ────────────────────────────────────

    it('focus never escapes to an element outside the dialog', () => {
        const { modal, insideButtons, outsideButton } = createOpenModal({
            insideCount: 3,
            withOutsideButton: true,
        });
        expect(outsideButton).not.toBeNull();
        expect(insideButtons.length).toBe(3);

        const [first, , last] = insideButtons;

        // Start with focus INSIDE the dialog on the last button.
        last.focus();
        expect(document.activeElement).toBe(last);

        // Tab from the last focusable wraps to the first (still inside).
        let focused = pressTab(false);
        expect(focused).toBe(first);
        expect(focused).not.toBe(outsideButton);
        // Slotted elements stay light-DOM children of the host, so tree
        // containment still holds across the shadow boundary.
        expect(modal.contains(focused)).toBe(true);

        // Additional Tabs keep focus on the first (boundary no-op), never outside.
        for (let i = 0; i < 4; i++) {
            focused = pressTab(false);
            expect(focused).not.toBe(outsideButton);
            expect(modal.contains(focused)).toBe(true);
        }

        // Now start from the first focusable and Shift+Tab to wrap to the last.
        first.focus();
        expect(document.activeElement).toBe(first);
        focused = pressTab(true);
        expect(focused).toBe(last);
        expect(focused).not.toBe(outsideButton);
        expect(modal.contains(focused)).toBe(true);

        // Additional Shift+Tabs keep focus on the last, never outside.
        for (let i = 0; i < 4; i++) {
            focused = pressTab(true);
            expect(focused).not.toBe(outsideButton);
            expect(modal.contains(focused)).toBe(true);
        }

        modal.removeAttribute('open');
    });

    // ─── T-054-4: Escape closes and restores focus ──────────────────────

    it('Escape closes the modal and restores focus to the previous element', () => {
        const outsideButton = document.createElement('button');
        outsideButton.type = 'button';
        outsideButton.textContent = 'Outside';
        document.body.appendChild(outsideButton);

        // Focus the outside button BEFORE opening the modal.
        outsideButton.focus();
        expect(document.activeElement).toBe(outsideButton);

        const modal = document.createElement(TAG) as EuropaModal;
        document.body.appendChild(modal);
        modal.setAttribute('open', '');

        // Dispatch Escape on document (the modal listens at document level).
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );

        // Modal should now be closed and focus restored to the outside button.
        expect(modal.hasAttribute('open')).toBe(false);
        expect(document.activeElement).toBe(outsideButton);
    });

    it('Escape fires the europa-close event', () => {
        const { modal } = createOpenModal({ insideCount: 2 });

        let closeFired = false;
        modal.addEventListener('europa-close', () => {
            closeFired = true;
        });

        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );

        expect(closeFired).toBe(true);
        expect(modal.hasAttribute('open')).toBe(false);
    });

    // ─── T-054-5: Backdrop click closes ──────────────────────────────────

    it('clicking the backdrop closes the modal and fires europa-close', () => {
        const { modal } = createOpenModal({ insideCount: 2 });

        let closeFired = false;
        modal.addEventListener('europa-close', () => {
            closeFired = true;
        });

        const backdrop = modal.shadowRoot?.querySelector<HTMLElement>('div.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();

        // Click the backdrop element directly (e.target === backdrop).
        backdrop?.click();

        expect(closeFired).toBe(true);
        expect(modal.hasAttribute('open')).toBe(false);
    });

    it('clicking inside the dialog does NOT close the modal', () => {
        const { modal } = createOpenModal({ insideCount: 2 });

        let closeFired = false;
        modal.addEventListener('europa-close', () => {
            closeFired = true;
        });

        const dialog = modal.shadowRoot?.querySelector<HTMLElement>('div[role="dialog"]');
        expect(dialog).not.toBeNull();

        dialog?.click();

        expect(closeFired).toBe(false);
        expect(modal.hasAttribute('open')).toBe(true);

        modal.removeAttribute('open');
    });

    // ─── T-054-6: open toggling ──────────────────────────────────────────

    it('removing the open attribute hides the modal (sets hidden)', () => {
        const modal = document.createElement(TAG) as EuropaModal;
        modal.appendChild(document.createElement('div'));
        document.body.appendChild(modal);

        modal.setAttribute('open', '');
        expect(modal.hasAttribute('hidden')).toBe(false);

        modal.removeAttribute('open');
        expect(modal.hasAttribute('hidden')).toBe(true);
    });

    it('setting the open attribute removes hidden (shows the modal)', () => {
        const modal = document.createElement(TAG) as EuropaModal;
        modal.appendChild(document.createElement('div'));
        document.body.appendChild(modal);

        // Initially hidden.
        expect(modal.hasAttribute('hidden')).toBe(true);

        modal.setAttribute('open', '');
        expect(modal.hasAttribute('hidden')).toBe(false);

        modal.removeAttribute('open');
    });

    it('re-opening after close shows the modal again', () => {
        const modal = document.createElement(TAG) as EuropaModal;
        modal.appendChild(document.createElement('div'));
        document.body.appendChild(modal);

        // Open → hidden cleared.
        modal.setAttribute('open', '');
        expect(modal.hasAttribute('hidden')).toBe(false);

        // Close → hidden set.
        modal.removeAttribute('open');
        expect(modal.hasAttribute('hidden')).toBe(true);

        // Re-open → hidden cleared again.
        modal.setAttribute('open', '');
        expect(modal.hasAttribute('hidden')).toBe(false);

        modal.removeAttribute('open');
    });
});
