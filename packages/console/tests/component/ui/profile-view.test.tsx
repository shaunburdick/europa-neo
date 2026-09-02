/**
 * ProfileView component tests — feature 015 (T010).
 *
 * Covers the three identity states of the `/profile` route view:
 *
 *   - **unnamed**: handle input form, local validation, server error
 *     display, connection status line (FR-006, FR-015).
 *   - **named**: welcome card with handle in `<bdi>`, Continue button
 *     navigates to returnTo or `/lobby` (FR-007).
 *   - **restoring**: waiting spinner, disabled Continue (FR-008).
 *
 * Plus FR-010 auto-navigate: when identityStatus transitions from
 * unnamed to named, the view pushes history to returnTo or `/lobby`.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { register } from '@europa/design/components';

register();

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import type { LobbyActionStatus } from '../../../src/state/lobby-state';
import { ProfileView, type ProfileViewProps } from '../../../src/ui/profile-view';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal connection fixture. */
function connectionOf(status: string): { readonly status: string } {
    return { status };
}

/** Default idle action status. */
const idleAction: LobbyActionStatus = { phase: 'idle', error: null };

/** Loading action status. */
const loadingAction: LobbyActionStatus = { phase: 'loading', error: null };

/** Error action status with a code + message. */
function errorAction(code: string, message: string): LobbyActionStatus {
    return {
        phase: 'error',
        error: {
            code: code as never,
            message,
            detail: null,
        },
    };
}

/** Build props for ProfileView with overridable defaults. */
function propsOf(overrides: Partial<ProfileViewProps> = {}): ProfileViewProps {
    return {
        identityStatus: 'unnamed',
        handle: null,
        connection: connectionOf('idle'),
        actionStatus: idleAction,
        onSubmitHandle: vi.fn(),
        returnTo: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Unnamed state tests
// ---------------------------------------------------------------------------

describe('ProfileView — unnamed state', () => {
    test('renders heading "Profile"', async () => {
        const screen = await render(<ProfileView {...propsOf()} />);
        // The heading text is rendered inside <europa-typography>'s shadow
        // DOM (spec 014 Wave 2): the internal <h2> carries the text and is
        // exposed through the accessibility tree, so assert by role + name.
        // `level: 2` disambiguates from the page-level <h1> route header.
        await expect.element(screen.getByRole('heading', { name: 'Profile', level: 2 })).toBeVisible();
    });

    test('renders "Set up your profile" text', async () => {
        const screen = await render(<ProfileView {...propsOf()} />);
        await expect.element(screen.getByText('Set up your profile')).toBeVisible();
    });

    test('renders text input with label "Display name"', async () => {
        const screen = await render(<ProfileView {...propsOf()} />);
        await expect.element(screen.getByLabelText('Display name')).toBeVisible();
    });

    test('renders "Set name" submit button', async () => {
        const screen = await render(<ProfileView {...propsOf()} />);
        await expect.element(screen.getByRole('button', { name: 'Set name' })).toBeEnabled();
    });

    test('shows local validation error for empty handle submission', async () => {
        const onSubmitHandle = vi.fn();
        const screen = await render(<ProfileView {...propsOf({ onSubmitHandle })} />);
        const button = screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await button.click();
        await expect.element(screen.getByText(/Enter a name with at least one non-whitespace character/)).toBeVisible();
        expect(onSubmitHandle).not.toHaveBeenCalled();
    });

    test('shows local validation error for handle > 24 chars', async () => {
        const onSubmitHandle = vi.fn();
        const screen = await render(<ProfileView {...propsOf({ onSubmitHandle })} />);
        const input = screen.getByLabelText('Display name');
        await input.fill('A'.repeat(25));
        const button = screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await button.click();
        await expect.element(screen.getByText(/Names must be at most 24 characters/)).toBeVisible();
        expect(onSubmitHandle).not.toHaveBeenCalled();
    });

    test('calls onSubmitHandle with trimmed value on valid submission', async () => {
        const onSubmitHandle = vi.fn();
        const screen = await render(<ProfileView {...propsOf({ onSubmitHandle })} />);
        const input = screen.getByLabelText('Display name');
        await input.fill('  Nova  ');
        const button = screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await button.click();
        expect(onSubmitHandle).toHaveBeenCalledWith('Nova');
    });

    test('displays server error from actionStatus.error with role="alert"', async () => {
        const action = errorAction('handle_taken', 'That name is already in use.');
        const screen = await render(<ProfileView {...propsOf({ actionStatus: action })} />);
        await expect.element(screen.getByRole('alert')).toBeVisible();
        await expect.element(screen.getByText('That name is already in use.')).toBeVisible();
    });

    test('shows connection status line', async () => {
        const screen = await render(<ProfileView {...propsOf({ connection: connectionOf('ready') })} />);
        await expect.element(screen.getByText('Connection: Connected')).toBeVisible();
    });

    test('submit button shows "Saving…" and is disabled while loading', async () => {
        const screen = await render(<ProfileView {...propsOf({ actionStatus: loadingAction })} />);
        await expect.element(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    });

    test('input is disabled while loading', async () => {
        const screen = await render(<ProfileView {...propsOf({ actionStatus: loadingAction })} />);
        const input = screen.getByLabelText('Display name').element() as HTMLInputElement;
        expect(input.disabled).toBe(true);
    });

    test('local error is cleared when the user starts typing again', async () => {
        const onSubmitHandle = vi.fn();
        const screen = await render(<ProfileView {...propsOf({ onSubmitHandle })} />);
        // Submit empty to trigger local error.
        const button = screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await button.click();
        await expect.element(screen.getByText(/Enter a name/)).toBeVisible();
        // Start typing — error should disappear.
        const input = screen.getByLabelText('Display name');
        await input.fill('N');
        expect(screen.container.querySelector('.europa-lobby__error')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Named state tests
// ---------------------------------------------------------------------------

describe('ProfileView — named state', () => {
    test('renders "Welcome back, {handle}" with handle in bdi element', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'named', handle: 'Nova' })} />);
        await expect.element(screen.getByText('Welcome back, Nova')).toBeVisible();
        const handleEl = screen.container.querySelector('bdi.europa-lobby__handle');
        expect(handleEl).not.toBeNull();
        expect(handleEl?.textContent).toBe('Nova');
    });

    test('renders "Continue to lobby" button', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'named', handle: 'Nova' })} />);
        await expect.element(screen.getByRole('button', { name: 'Continue to lobby' })).toBeVisible();
    });

    test('clicking Continue navigates to /lobby via history.pushState', async () => {
        const pushState = vi.fn();
        vi.stubGlobal('history', { ...window.history, pushState });
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'named', handle: 'Nova' })} />);
        const button = screen.getByRole('button', { name: 'Continue to lobby' }).element() as HTMLButtonElement;
        await button.click();
        expect(pushState).toHaveBeenCalled();
        expect(pushState.mock.calls[0]?.[2]).toBe('/lobby');
    });

    test('when returnTo is present, Continue navigates to returnTo URL', async () => {
        const pushState = vi.fn();
        vi.stubGlobal('history', { ...window.history, pushState });
        const screen = await render(
            <ProfileView
                {...propsOf({
                    identityStatus: 'named',
                    handle: 'Nova',
                    returnTo: '/match/abc-123',
                })}
            />,
        );
        const button = screen.getByRole('button', { name: 'Continue to lobby' }).element() as HTMLButtonElement;
        await button.click();
        expect(pushState.mock.calls[0]?.[2]).toBe('/match/abc-123');
    });

    test('unnamed form is not present when named', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'named', handle: 'Nova' })} />);
        expect(screen.container.querySelector('.europa-lobby__form')).toBeNull();
        expect(screen.container.querySelector('.europa-lobby__input')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Restoring state tests
// ---------------------------------------------------------------------------

describe('ProfileView — restoring state', () => {
    test('shows "Restoring your session…" text', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'restoring' })} />);
        await expect.element(screen.getByText('Restoring your session…')).toBeVisible();
    });

    test('shows loading status line (native div, not europa-waiting)', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'restoring' })} />);
        const loadingLine = screen.container.querySelector('.europa-lobby__status-line[aria-hidden="true"]');
        expect(loadingLine).not.toBeNull();
        expect(loadingLine?.textContent).toBe('Loading…');
        // No europa-waiting component — native div avoids Light DOM crash.
        expect(screen.container.querySelector('europa-waiting')).toBeNull();
    });

    test('Continue button is disabled', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'restoring' })} />);
        await expect.element(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    test('form is not present when restoring', async () => {
        const screen = await render(<ProfileView {...propsOf({ identityStatus: 'restoring' })} />);
        expect(screen.container.querySelector('.europa-lobby__form')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Auto-navigate tests (FR-010)
// ---------------------------------------------------------------------------

describe('ProfileView — auto-navigate (FR-010)', () => {
    test('when identityStatus is named on mount, auto-navigates to /lobby', async () => {
        const pushState = vi.fn();
        vi.stubGlobal('history', { ...window.history, pushState });

        // The FR-010 effect fires on mount when named is already true —
        // this models the post-submission re-render where the parent
        // transitions identityStatus to 'named' before the next paint.
        // (Direct mount as 'named' avoids rerender DOM conflicts with
        // custom elements that reparent children.)
        await render(
            <ProfileView
                {...propsOf({
                    identityStatus: 'named',
                    handle: 'Nova',
                })}
            />,
        );
        await vi.waitFor(() => {
            expect(pushState).toHaveBeenCalled();
        });
        expect(pushState.mock.calls.at(-1)?.[2]).toBe('/lobby');
    });

    test('when returnTo is present, auto-navigates to returnTo instead', async () => {
        const pushState = vi.fn();
        vi.stubGlobal('history', { ...window.history, pushState });

        await render(
            <ProfileView
                {...propsOf({
                    identityStatus: 'named',
                    handle: 'Nova',
                    returnTo: '/match/xyz-789',
                })}
            />,
        );
        await vi.waitFor(() => {
            expect(pushState).toHaveBeenCalled();
        });
        expect(pushState.mock.calls.at(-1)?.[2]).toBe('/match/xyz-789');
    });
});
