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
    // Bearer-shaped accessors a REAL adapter exposes (client.ts
    // sessionToken()/state().sessionToken) — the surfaces the
    // credential-free debug view must not forward (005 FR-037).
    const clientStateSpy = vi.fn(() => ({ connection: 'joined', sessionToken: 'inner-session-token' }));
    const clientSessionTokenSpy = vi.fn(() => 'inner-session-token');
    const fakeClient = {
        connect: connectSpy,
        joinMatch: joinMatchSpy,
        state: clientStateSpy,
        sessionToken: clientSessionTokenSpy,
    };
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
import { buildPlayerView, TEST_PLAYER_1 } from '../../fixtures/player-view';

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

/**
 * Loose probe of the published handle's credential-relevant surface —
 * deliberately wider than the runtime's own types so the test can ask
 * for accessors the credential-free view must NOT provide.
 */
interface LiveHandleProbe {
    readonly store: {
        getState(): { readonly session: Record<string, unknown>; readonly [key: string]: unknown };
        dispatch(action: unknown): void;
    };
    readonly client: {
        state(): Record<string, unknown>;
        sessionToken?: () => unknown;
    };
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

describe('credential-free debug handle (005 FR-037, 015 FR-019 — PR #189 review)', () => {
    it('exposes no seat/session/reconnect/resume token after a real seat grant, and consumes the seam', () => {
        seamWindow().__europaTestMatch = {
            wsUrl: 'ws://127.0.0.1:9999',
            matchId: 'seam-match',
            displayName: 'SeamName',
            reconnectToken: 'seam-reconnect-token',
        };

        mountLiveRuntime(document.getElementById('root') as HTMLElement);

        const raw = seamWindow().__europaLive;
        expect(raw).toBeDefined();
        const handle = raw as unknown as LiveHandleProbe;

        // The POPULATED case the review demanded: a REAL seat grant —
        // the server's joinAck bearer flows into the store through the
        // same dispatch path the order bridge uses. Pre-fix the handle
        // WAS the raw store, so this token sat one getState() away.
        handle.store.dispatch({
            kind: 'joined',
            sessionToken: 'granted-seat-token',
            playerId: TEST_PLAYER_1,
            view: buildPlayerView({ width: 8 }),
            players: [],
        });
        expect(handle.store.getState().session['playerId']).toBe(TEST_PLAYER_1);

        // No granted seat token anywhere on the published surface.
        expect(Object.hasOwn(handle.store.getState().session, 'sessionToken')).toBe(false);
        expect(JSON.stringify(handle.store.getState())).not.toContain('granted-seat-token');
        // The adapter's bearer accessors are not forwarded (pre-fix the
        // raw client answered sessionToken() with the seat token).
        expect(handle.client.sessionToken?.() ?? null).toBeNull();
        expect(JSON.stringify(handle.client.state())).not.toContain('inner-session-token');
        // The direct-match seam is consume-once: the reconnect bearer it
        // carried must not linger on window after boot.
        expect(Object.hasOwn(window, '__europaTestMatch')).toBe(false);
    });
});
