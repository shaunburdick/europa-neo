/**
 * Production-bootstrap unit tests — issue #129 (013 FR-025/AC-018,
 * 005 FR-037, 015 FR-019/FR-020).
 *
 * `src/main.tsx` is the SPA entry: it selects a boot mode at module
 * load, captures the `?ws=` transport override BEFORE stripping the
 * production query, and installs no debug globals on an unflagged
 * production boot. The heavy collaborators (router tree, React mount,
 * transport, controller) are mocked so these tests pin the bootstrap
 * LOGIC, not the application around it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Collaborator mocks (hoisted by vitest) ──────────────────────────────────

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));
const createRouterSpy = vi.fn(() => ({}));
const createWsLobbyClientSpy = vi.fn(() => ({ kind: 'fake-transport' }));
const connectSpy = vi.fn();
const fakeStore = { getState: () => ({}), subscribe: () => () => {}, dispatch: vi.fn() };
const createLobbyControllerSpy = vi.fn(() => ({ store: fakeStore, connect: connectSpy }));

vi.mock('react-dom/client', () => ({ createRoot: createRootSpy }));
vi.mock('@tanstack/react-router', () => ({
    createRouter: createRouterSpy,
    RouterProvider: () => null,
}));
vi.mock('../../src/routing/route-tree', () => ({ routeTree: {} }));
vi.mock('../../src/render/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }));
vi.mock('../../src/net/ws-lobby-client', () => ({ createWsLobbyClient: createWsLobbyClientSpy }));
vi.mock('../../src/state/lobby-controller', () => ({ createLobbyController: createLobbyControllerSpy }));

/** Boot the entry module fresh (module top-level runs the bootstrap). */
async function bootAt(url: string): Promise<void> {
    window.history.replaceState(null, '', url);
    await import('../../src/main');
}

/** The window-global handle declaration mirrored from `src/main.tsx`. */
interface BootstrapWindow {
    __europaLobby?: { readonly store: unknown };
    __europaTestOptIn?: { readonly lobby?: true };
}

let originalReplaceState: History['replaceState'];

beforeEach(() => {
    vi.resetModules();
    renderSpy.mockClear();
    createRootSpy.mockClear();
    createRouterSpy.mockClear();
    createWsLobbyClientSpy.mockClear();
    createLobbyControllerSpy.mockClear();
    connectSpy.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    delete (window as BootstrapWindow).__europaLobby;
    delete (window as BootstrapWindow).__europaTestOptIn;
    originalReplaceState = window.history.replaceState;
});

afterEach(() => {
    window.history.replaceState = originalReplaceState;
});

describe('production bootstrap — ?ws= capture before stripping (013 FR-025, AC-018)', () => {
    it('honors the ?ws= override even though the production query is stripped', async () => {
        await bootAt('/lobby?ws=ws://127.0.0.1:9999');

        // The transport was resolved from the CAPTURED query, not the
        // stripped one. Pre-fix this reads the post-strip (empty) search
        // and silently falls back to the same-origin default.
        expect(createLobbyControllerSpy).toHaveBeenCalledWith(expect.objectContaining({ url: 'ws://127.0.0.1:9999' }));
        // The query IS still stripped from the address bar afterwards.
        expect(window.location.search).toBe('');
    });

    it('renders the configuration-error page for a cross-host override before any connection', async () => {
        await bootAt('/lobby?ws=ws://evil.example:8080');

        expect(createWsLobbyClientSpy).not.toHaveBeenCalled();
        expect(createLobbyControllerSpy).not.toHaveBeenCalled();
        expect(connectSpy).not.toHaveBeenCalled();
        expect(renderSpy).toHaveBeenCalledTimes(1);
        const rendered = renderSpy.mock.calls[0]?.[0] as { props: { message: string } };
        expect(rendered.props.message).toContain('same host');
    });

    it('bootstraps the router with the resolved transport in typed context', async () => {
        await bootAt('/lobby?ws=ws://localhost:9999');

        expect(createRouterSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({ wsUrl: 'ws://localhost:9999' }),
            }),
        );
    });
});

describe('production bootstrap — no history monkey-patching (015 FR-020)', () => {
    it('does not wrap window.history.replaceState during bootstrap', async () => {
        await bootAt('/lobby?ws=ws://127.0.0.1:9999');

        // Pre-fix `guardReplaceStateUrlArgument` replaces the method
        // reference to compensate for a test init script — production
        // code patching a browser API (015 FR-020).
        expect(window.history.replaceState).toBe(originalReplaceState);
    });
});

describe('production bootstrap — debug-global sentinel gate (005 FR-037, 015 FR-019)', () => {
    it('installs no __europa* lobby handle on an unflagged production boot', async () => {
        await bootAt('/lobby?ws=ws://127.0.0.1:9999');

        const w = window as BootstrapWindow;
        expect(w.__europaLobby).toBeUndefined();
        expect(Object.hasOwn(window, '__europaLobby')).toBe(false);
    });

    it('installs the lobby handle when the pre-load sentinel opted in, carrying no bearer values', async () => {
        (window as BootstrapWindow).__europaTestOptIn = { lobby: true };
        await bootAt('/lobby?ws=ws://127.0.0.1:9999');

        const handle = (window as BootstrapWindow).__europaLobby;
        expect(handle).toBeDefined();
        expect(handle?.store).toBe(fakeStore);
        // The handle exposes the store surface only — no credential-bearing fields.
        expect(Object.keys(handle ?? {})).toEqual(['store']);
    });
});
