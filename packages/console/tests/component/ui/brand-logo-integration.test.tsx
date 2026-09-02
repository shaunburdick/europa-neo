/**
 * Brand logo integration tests — spec 015 (T-022).
 *
 * Verifies the combined lockup logo in the lobby and the decorative
 * emblem in the branded footer render correctly with accessible names,
 * correct asset paths, and no page-name duplication.
 *
 * Coverage:
 *   - lobby: lockup logo renders with correct alt and src
 *   - lobby: logo does not duplicate the page heading text
 *   - footer: decorative emblem renders with empty alt and aria-hidden
 *   - footer: emblem uses the correct asset path
 *   - both: no controls or simulation logic are altered
 */

import { register } from '@europa/design/components';

register();

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { INITIAL_LOBBY_STATE } from '../../../src/state/lobby-reducer';
import type { LobbyState } from '../../../src/state/lobby-state';
import { BrandedFooter } from '../../../src/ui/branded-footer';
import { LobbyLanding } from '../../../src/ui/lobby-landing';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

/** Seed a lobby state with overridable fields on top of the initial value. */
function stateOf(overrides: Partial<LobbyState> = {}): LobbyState {
    return { ...INITIAL_LOBBY_STATE, ...overrides };
}

/** No-op callbacks for direct Landing renders. */
const noopCallbacks = {
    onSubmitHandle: (): void => undefined,
    onCreate: (): void => undefined,
    onJoin: (): void => undefined,
    onSpectate: (): void => undefined,
    onRetry: (): void => undefined,
    onAcknowledgeSuperseded: (): void => undefined,
};

/**
 * Query the DOM and return the element, throwing if not found.
 * Avoids non-null assertions after expect(...).not.toBeNull().
 */
function queryOrThrow<T extends Element>(container: ParentNode, selector: string, message?: string): T {
    const el = container.querySelector<T>(selector);
    if (el === null) {
        throw new Error(message ?? `Expected element matching "${selector}" to exist`);
    }
    return el;
}

// ----------------------------------------------------------------------------
// Lobby lockup logo
// ----------------------------------------------------------------------------

describe('Lobby lockup logo (spec 015 FR-012 / AC-005)', () => {
    test('renders a combined lockup image with correct alt text and source path', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        expect(logo.getAttribute('alt')).toBe('Europa Neo');
        expect(logo.getAttribute('src')).toBe('assets/brand/europa-neo-lockup-dark.svg');
        expect(logo.getAttribute('width')).toBe('240');
        expect(logo.getAttribute('height')).toBe('80');
    });

    test('logo does not duplicate the page heading name as adjacent text', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // The logo has alt="Europa Neo" and the h1 says "Europa Neo lobby".
        // The logo must NOT be wrapped in a link or have visible text
        // beside it that repeats the product name.
        const logo = queryOrThrow(screen.container, 'img.europa-lobby__logo');

        // Logo is a direct child of <main>, not inside a link or text node.
        const parent = logo.parentElement;
        expect(parent?.tagName).toBe('MAIN');
        expect(parent?.className).toContain('europa-lobby');

        // The heading is a sibling, not a parent or wrapper.
        const heading = queryOrThrow(screen.container, 'h1');
        expect(heading.textContent).toBe('Europa Neo lobby');
    });

    test('logo renders for unnamed visitors too', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'unnamed', handle: null });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        expect(logo.getAttribute('alt')).toBe('Europa Neo');
    });

    test('logo renders in the failure state', async () => {
        const state = stateOf({
            connection: 'failed',
            failure: {
                source: 'connection',
                code: 'connection_failed',
                message: 'Connection failed.',
                detail: null,
            },
        });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        expect(logo.getAttribute('src')).toBe('assets/brand/europa-neo-lockup-dark.svg');
    });
});

// ----------------------------------------------------------------------------
// Branded footer decorative emblem
// ----------------------------------------------------------------------------

describe('Branded footer emblem (spec 015 FR-012 / AC-005)', () => {
    test('renders a decorative emblem with empty alt and aria-hidden', async () => {
        const screen = await render(<BrandedFooter />);

        const emblem = queryOrThrow<HTMLImageElement>(screen.container, 'img[aria-hidden="true"]');
        expect(emblem.getAttribute('alt')).toBe('');
        expect(emblem.getAttribute('aria-hidden')).toBe('true');
        expect(emblem.getAttribute('src')).toBe('assets/brand/europa-neo-emblem.svg');
        expect(emblem.getAttribute('width')).toBe('16');
        expect(emblem.getAttribute('height')).toBe('16');
    });

    test('footer still contains the product name and version', async () => {
        const screen = await render(<BrandedFooter />);

        await expect.element(screen.getByText('Europa Neo')).toBeVisible();
        await expect.element(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
    });

    test('emblem does not interfere with the GitHub link', async () => {
        const screen = await render(<BrandedFooter />);

        const link = screen.getByRole('link', { name: 'GitHub' });
        await expect.element(link).toBeVisible();
        expect(link.element().getAttribute('href')).toBe('https://github.com/shaunburdick/europa-neo');
    });
});
