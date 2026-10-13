/**
 * Production-bootstrap unit tests — issue #129 (013 FR-025/AC-018,
 * 005 FR-037, 015 FR-019/FR-020).
 *
 * `src/main.tsx` is the SPA entry: it selects a boot mode at module
 * load, captures the `?ws=` transport override BEFORE stripping the
 * production query, and installs no debug globals on an unflagged
 * production boot. The direct-match seam branch is pinned here too:
 * the entry captures the credential-bearing `window.__europaTestMatch`
 * seam and removes it SYNCHRONOUSLY, passing it to the
 * dynamically-imported live runtime as an argument (005 FR-037,
 * 015 FR-019). The heavy collaborators (router tree, React mount,
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

/** A real seat grant's bearer, seeded into the fake store's state (populated case). */
const SEAT_SESSION_TOKEN = 'seat-secret-0001';

const fakeLobbyState = {
    viewMode: 'match',
    handle: 'Alice',
    activeMatchId: 'm-1',
    identityStatus: 'named',
    connection: 'ready',
    matchVisibility: 'public',
    snapshot: { entries: [{ matchId: 'm-1', status: 'waiting', seatsFilled: 1, capacity: 2 }] },
    // The RAW store carries the matchmaking-issued seat bearer — the
    // credential the debug handle must not publish (005 FR-037).
    seatSessionToken: SEAT_SESSION_TOKEN,
};
const fakeStore = { getState: () => fakeLobbyState, subscribe: () => () => {}, dispatch: vi.fn() };
const createLobbyControllerSpy = vi.fn(() => ({ store: fakeStore, connect: connectSpy }));

// ─── Direct-match seam chunk mock (PR #189 round 2) ──────────────────────────
//
// `main.tsx` loads the live runtime through a DYNAMIC import — the
// async window the review flagged. This mock records the
// window-global state at chunk-evaluation time (the LAST moment of
// that window) and captures the arguments the runtime is mounted
// with, so the tests below can pin that the credential-bearing seam
// is already off `window` before the chunk resolves, and that it
// reaches the runtime as an ARGUMENT, never through a global.
const { mountLiveRuntimeSpy, seamGlobalAtChunkEval } = vi.hoisted(() => ({
    mountLiveRuntimeSpy: vi.fn(),
    seamGlobalAtChunkEval: [] as boolean[],
}));
vi.mock('../../src/internal/live-runtime', () => {
    seamGlobalAtChunkEval.push(Object.hasOwn(window, '__europaTestMatch'));
    return { mountLiveRuntime: mountLiveRuntimeSpy };
});

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
    __europaTestMatch?: {
        readonly wsUrl: string;
        readonly matchId: string;
        readonly displayName: string;
        readonly reconnectToken?: string;
    };
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
    mountLiveRuntimeSpy.mockClear();
    seamGlobalAtChunkEval.length = 0;
    document.body.innerHTML = '<div id="root"></div>';
    delete (window as BootstrapWindow).__europaLobby;
    delete (window as BootstrapWindow).__europaTestOptIn;
    delete (window as BootstrapWindow).__europaTestMatch;
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

    it('installs a credential-free lobby PROJECTION when the pre-load sentinel opted in', async () => {
        (window as BootstrapWindow).__europaTestOptIn = { lobby: true };
        await bootAt('/lobby?ws=ws://127.0.0.1:9999');

        const handle = (window as BootstrapWindow).__europaLobby;
        expect(handle).toBeDefined();
        // The handle exposes the store surface only — and that surface
        // is a CREDENTIAL-FREE projection, never the raw controller
        // store (005 FR-037, 015 FR-019).
        expect(Object.keys(handle ?? {})).toEqual(['store']);
        const store = handle?.store as unknown as { getState(): Record<string, unknown> };
        expect(store).not.toBe(fakeStore);

        const state = store.getState();
        // The fields the four dependent lobby E2E specs read ride through.
        expect(state).toMatchObject({
            viewMode: 'match',
            handle: 'Alice',
            activeMatchId: 'm-1',
            identityStatus: 'named',
            connection: 'ready',
            matchVisibility: 'public',
        });
        expect(state['snapshot']).toEqual({
            entries: [{ matchId: 'm-1', status: 'waiting', seatsFilled: 1, capacity: 2 }],
        });
        // Populated case: the raw fake store's state above carries the
        // seat bearer token — the projection must not.
        expect(Object.hasOwn(state, 'seatSessionToken')).toBe(false);
        expect(JSON.stringify(state)).not.toContain(SEAT_SESSION_TOKEN);
        expect(JSON.stringify(handle)).not.toContain(SEAT_SESSION_TOKEN);
    });
});

describe('direct-match seam boot — consume-once before the dynamic import (005 FR-037, 015 FR-019)', () => {
    it('removes the credential-bearing seam from window synchronously, before the chunk loads', async () => {
        (window as BootstrapWindow).__europaTestMatch = {
            wsUrl: 'ws://127.0.0.1:9999',
            matchId: 'seam-match',
            displayName: 'SeamName',
            reconnectToken: 'seam-reconnect-token',
        };

        await bootAt('/match/seam-match/join');

        // Checkpoint 1 — right after the entry module's SYNCHRONOUS
        // execution: the dynamic import is still in flight, and the
        // reconnect bearer is already off `window`. Pre-fix the global
        // survives here until `mountLiveRuntime` reads it AFTER the
        // chunk resolves — the credential-exposure window the PR #189
        // round-2 review flagged.
        expect(Object.hasOwn(window, '__europaTestMatch')).toBe(false);

        // Checkpoint 2 — the chunk-evaluation instant (the LAST moment
        // of the import window): still clean.
        await vi.waitFor(() => expect(mountLiveRuntimeSpy).toHaveBeenCalled());
        expect(seamGlobalAtChunkEval).toEqual([false]);

        // Checkpoint 3 — the seam reached the runtime as an ARGUMENT
        // (the non-global startup mechanism), and no credential-bearing
        // `__europa*` global remains on window.
        expect(mountLiveRuntimeSpy).toHaveBeenCalledWith(document.getElementById('root'), {
            wsUrl: 'ws://127.0.0.1:9999',
            matchId: 'seam-match',
            displayName: 'SeamName',
            reconnectToken: 'seam-reconnect-token',
        });
        const europaGlobals = Object.getOwnPropertyNames(window).filter((key) => key.startsWith('__europa'));
        expect(europaGlobals).not.toContain('__europaTestMatch');
    });
});
