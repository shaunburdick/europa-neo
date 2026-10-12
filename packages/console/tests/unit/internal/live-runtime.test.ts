/**
 * Live-runtime seam tests — issue #129 (013 FR-025/FR-035, FR-016).
 *
 * The direct-match entry (`mountLiveRuntime`) reads ONLY the
 * `window.__europaTestMatch` seam object: the former
 * `?live`/`?match=`/`?name=`/`?token=` query consumption is retired,
 * so a query-driven boot without the seam fails loudly instead of
 * mounting, and a `?token=` bearer can never reach the runtime.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Collaborator mocks (hoisted by vitest) ──────────────────────────────────

const { createRootSpy, createConsoleClientSpy, createWsMatchClientSpy, createOrderBridgeSpy } = vi.hoisted(() => {
    const renderSpy = vi.fn();
    const createRootSpy = vi.fn(() => ({ render: renderSpy }));
    const joinMatchSpy = vi.fn(async () => {});
    const connectSpy = vi.fn(async () => {});
    const fakeClient = { connect: connectSpy, joinMatch: joinMatchSpy };
    const createConsoleClientSpy = vi.fn(() => fakeClient);
    const createWsMatchClientSpy = vi.fn(() => ({
        state: () => ({ connection: 'idle' }),
        onConnectionChanged: vi.fn(),
    }));
    const createOrderBridgeSpy = vi.fn(() => ({ handleEffect: vi.fn() }));
    return { createRootSpy, createConsoleClientSpy, createWsMatchClientSpy, createOrderBridgeSpy };
});

vi.mock('react-dom/client', () => ({ createRoot: createRootSpy }));
vi.mock('../../../src/render/App', () => ({ App: () => null }));
vi.mock('../../../src/net/client', () => ({ createConsoleClient: createConsoleClientSpy }));
vi.mock('../../../src/net/ws-match-client', () => ({ createWsMatchClient: createWsMatchClientSpy }));
vi.mock('../../../src/state/order-actions', () => ({ createOrderBridge: createOrderBridgeSpy }));

import { mountLiveRuntime } from '../../../src/internal/live-runtime';

/** Window shape mirrored from the runtime's global declarations. */
interface SeamWindow {
    __europaTestMatch?: {
        readonly wsUrl: string;
        readonly matchId: string;
        readonly displayName: string;
        readonly reconnectToken?: string;
    };
    __europaLive?: { readonly store?: unknown; readonly client?: unknown; bootError: string | null };
}

function seamWindow(): SeamWindow {
    return window as SeamWindow;
}

beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    delete seamWindow().__europaTestMatch;
    delete seamWindow().__europaLive;
    window.history.replaceState(null, '', '/?match=QUERYMATCH&name=QueryName&token=query-token');
});

describe('direct-match seam retirement (013 FR-025/FR-035)', () => {
    it('fails loudly when the seam is missing, even with legacy query params present', () => {
        mountLiveRuntime(document.getElementById('root') as HTMLElement);

        // Pre-fix the retired `?match=`/`?name=` query drove a full mount.
        expect(seamWindow().__europaLive?.bootError).toContain('__europaTestMatch');
        expect(seamWindow().__europaLive?.store).toBeUndefined();
        expect(createConsoleClientSpy).not.toHaveBeenCalled();
        expect(createRootSpy).not.toHaveBeenCalled();
    });

    it('uses the seam object and ignores conflicting legacy query params', () => {
        seamWindow().__europaTestMatch = {
            wsUrl: 'ws://127.0.0.1:9999',
            matchId: 'seam-match',
            displayName: 'SeamName',
            reconnectToken: 'seam-token',
        };

        mountLiveRuntime(document.getElementById('root') as HTMLElement);

        expect(seamWindow().__europaLive?.bootError).toBeNull();
        const clientArgs = createConsoleClientSpy.mock.calls[0]?.[0] as {
            readonly url: string;
            readonly displayName: string;
            readonly matchId: string;
            readonly reconnectToken?: string;
        };
        expect(clientArgs.url).toBe('ws://127.0.0.1:9999');
        expect(clientArgs.matchId).toBe('seam-match');
        expect(clientArgs.displayName).toBe('SeamName');
        expect(clientArgs.reconnectToken).toBe('seam-token');
        const store = seamWindow().__europaLive?.store as { getState: () => { session: { matchId: string } } };
        expect(store.getState().session.matchId).toBe('seam-match');
    });

    it('fails loudly when the seam carries no match identifier', () => {
        seamWindow().__europaTestMatch = { wsUrl: 'ws://127.0.0.1:9999', matchId: '', displayName: '' };

        mountLiveRuntime(document.getElementById('root') as HTMLElement);

        expect(seamWindow().__europaLive?.bootError).toContain('match identifier');
        expect(createConsoleClientSpy).not.toHaveBeenCalled();
    });

    it('falls back to the same-origin transport when the seam wsUrl is empty (reads no query)', () => {
        seamWindow().__europaTestMatch = { wsUrl: '', matchId: 'seam-match', displayName: '' };

        mountLiveRuntime(document.getElementById('root') as HTMLElement);

        const clientArgs = createConsoleClientSpy.mock.calls[0]?.[0] as { readonly url: string };
        expect(clientArgs.url).toMatch(/^wss?:\/\/localhost:\d+$/);
    });
});
