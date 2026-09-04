/**
 * ProfileView a11y tests — feature 015 (T012).
 *
 * Proves that the `/profile` route view meets WCAG 2.2 AA:
 *
 *   1. Structure: heading focusability, label↔input association,
 *      error role/aria-invalid/aria-describedby.
 *   2. Keyboard navigation: all controls are native elements with
 *      logical tab order (heading → input → button).
 *   3. Automated axe-core scan: zero WCAG 2.2 A/AA violations in
 *      both the unnamed (handle form) and named (welcome card) states.
 *
 * Runs in Vitest Browser Mode (real Chromium, real DOM) per
 * vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { ProfileView, type ProfileViewProps } from '../../src/ui/profile-view';
import '../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sensible defaults for every prop — callers override per test. */
function defaultProps(overrides: Partial<ProfileViewProps> = {}): ProfileViewProps {
    return {
        identityStatus: 'unnamed',
        handle: null,
        connection: { status: 'ready' },
        actionStatus: { phase: 'idle', error: null },
        onSubmitHandle: () => undefined,
        returnTo: null,
        ...overrides,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('ProfileView a11y', () => {
    // -----------------------------------------------------------------------
    // Structure tests
    // -----------------------------------------------------------------------

    test('heading is focusable with tabIndex={-1}', async () => {
        const screen = await render(<ProfileView {...defaultProps()} />);

        // The heading text lives inside <europa-typography> shadow DOM, so
        // we query the <h1> by its structural role without relying on
        // accessible-name resolution across the shadow boundary.
        const heading = screen.container.querySelector('h1');
        expect(heading).not.toBeNull();
        expect(heading?.getAttribute('tabindex')).toBe('-1');
        // Should be focusable via programmatic focus (used for route-change
        // announcements).
        heading?.focus();
        expect(document.activeElement).toBe(heading);
    });

    test('input has a tied <label> via htmlFor/id', async () => {
        const screen = await render(<ProfileView {...defaultProps()} />);

        const label = screen.getByText('Display name');
        const input = screen.getByLabelText('Display name');

        // The label's htmlFor must point to the input's id.
        const htmlFor = label.element().getAttribute('for');
        expect(htmlFor).toBeTruthy();
        expect(input.element().id).toBe(htmlFor);

        // getByLabelText already confirms the programmatic association.
        await expect.element(input).toBeVisible();
    });

    test('error uses role="alert" when present', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    actionStatus: {
                        phase: 'error',
                        error: {
                            code: 'handle_taken',
                            message: 'Handle already taken',
                            detail: null,
                        },
                    },
                })}
            />,
        );

        const alert = screen.getByRole('alert');
        await expect.element(alert).toBeVisible();
    });

    test('input uses aria-invalid when error is present', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    actionStatus: {
                        phase: 'error',
                        error: {
                            code: 'handle_taken',
                            message: 'Handle already taken',
                            detail: null,
                        },
                    },
                })}
            />,
        );

        const input = screen.getByLabelText('Display name');
        expect(input.element().getAttribute('aria-invalid')).toBe('true');
    });

    test('error element id is referenced in input aria-describedby', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    actionStatus: {
                        phase: 'error',
                        error: {
                            code: 'handle_taken',
                            message: 'Handle already taken',
                            detail: null,
                        },
                    },
                })}
            />,
        );

        const input = screen.getByLabelText('Display name');
        const describedBy = input.element().getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();

        // The error element's id must appear in the space-separated
        // aria-describedby tokens.
        const alert = screen.getByRole('alert');
        const errorId = alert.element().id;
        expect(errorId).toBeTruthy();
        expect(describedBy?.split(/\s+/)).toContain(errorId);
    });

    // -----------------------------------------------------------------------
    // Keyboard navigation tests
    // -----------------------------------------------------------------------

    test('all unnamed-state controls are native keyboard-operable elements', async () => {
        const screen = await render(<ProfileView {...defaultProps()} />);

        // Input is a native <input>.
        const input = screen.getByLabelText('Display name');
        expect(input.element().tagName).toBe('INPUT');

        // Submit button is a native <button>.
        const button = screen.getByRole('button', { name: /Set name/ });
        expect(button.element().tagName).toBe('BUTTON');
        expect(button.element().getAttribute('type')).toBe('submit');
    });

    test('all named-state controls are native keyboard-operable elements', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    identityStatus: 'named',
                    handle: 'Nova',
                })}
            />,
        );

        const button = screen.getByRole('button', { name: /Continue to lobby/ });
        expect(button.element().tagName).toBe('BUTTON');
        expect(button.element().getAttribute('type')).toBe('button');
    });

    test('tab order is logical: heading → input → button', async () => {
        const screen = await render(<ProfileView {...defaultProps()} />);

        const heading = screen.container.querySelector('h1');
        expect(heading).not.toBeNull();
        const input = screen.getByLabelText('Display name').element();
        const button = screen.getByRole('button', { name: /Set name/ }).element();

        // Collect tabbable elements in DOM order.
        const tabbables = [heading as Element, input, button];

        // Verify the elements appear in the expected DOM sequence by
        // comparing document position (compareDocumentPosition).
        for (let i = 1; i < tabbables.length; i++) {
            const flags = tabbables[i - 1].compareDocumentPosition(tabbables[i]);
            // Node.DOCUMENT_POSITION_FOLLOWING = 0x04
            expect(flags & 0x04).toBeTruthy();
        }
    });

    // -----------------------------------------------------------------------
    // Automated axe-core checks
    // -----------------------------------------------------------------------

    test('axe-core: unnamed state has zero WCAG 2.2 AA violations', async () => {
        const screen = await render(<ProfileView {...defaultProps()} />);

        await expect.element(screen.getByText('Set up your profile')).toBeVisible();
        await expectNoDomA11yViolations(screen.container);
    });

    test('axe-core: named state has zero WCAG 2.2 AA violations', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    identityStatus: 'named',
                    handle: 'Nova',
                })}
            />,
        );

        await expect.element(screen.getByText('Welcome back,')).toBeVisible();
        await expectNoDomA11yViolations(screen.container);
    });

    test('axe-core: error state has zero WCAG 2.2 AA violations', async () => {
        const screen = await render(
            <ProfileView
                {...defaultProps({
                    actionStatus: {
                        phase: 'error',
                        error: {
                            code: 'handle_taken',
                            message: 'Handle already taken',
                            detail: null,
                        },
                    },
                })}
            />,
        );

        await expect.element(screen.getByRole('alert')).toBeVisible();
        await expectNoDomA11yViolations(screen.container);
    });
});
