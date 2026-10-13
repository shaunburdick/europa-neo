/**
 * Direct-match seam import-failure proof (005 FR-037, 015 FR-019) —
 * PR #189 round-2 remediation.
 *
 * `main.tsx` boots the live runtime through a DYNAMIC import. When
 * that chunk fails to load, the credential-bearing seam must STILL be
 * gone from `window`: the entry point captures it and deletes the
 * global synchronously, BEFORE the import starts, then passes the
 * seam as an argument. The failure is reported through the console
 * error channel instead of surfacing as an unhandled rejection.
 *
 * The chunk failure is simulated at the module-resolution seam — the
 * mock factory throws where the chunk's evaluation would run. The
 * E2E twin in `tests/e2e/debug-handle-credentials.spec.ts` aborts the
 * REAL dev-server chunk request via `page.route`, proving the same
 * invariant against a genuine network-level import failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Collaborator mocks (hoisted by vitest) ──────────────────────────────────

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));
const createRouterSpy = vi.fn(() => ({}));

vi.mock('react-dom/client', () => ({ createRoot: createRootSpy }));
vi.mock('@tanstack/react-router', () => ({
    createRouter: createRouterSpy,
    RouterProvider: () => null,
}));
vi.mock('../../src/routing/route-tree', () => ({ routeTree: {} }));
vi.mock('../../src/render/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }));
vi.mock('../../src/net/ws-lobby-client', () => ({ createWsLobbyClient: vi.fn(() => ({ kind: 'fake-transport' })) }));
vi.mock('../../src/state/lobby-controller', () => ({
    createLobbyController: vi.fn(() => ({ store: {}, connect: vi.fn() })),
}));

// The dynamic-import target FAILS at module resolution — the
// module-level equivalent of a failed chunk load.
vi.mock('../../src/internal/live-runtime', () => {
    throw new Error('simulated live-runtime chunk load failure');
});

/** Boot the entry module fresh (module top-level runs the bootstrap). */
async function bootAt(url: string): Promise<void> {
    window.history.replaceState(null, '', url);
    await import('../../src/main');
}

interface SeamWindow {
    __europaTestMatch?: {
        readonly wsUrl: string;
        readonly matchId: string;
        readonly displayName: string;
        readonly reconnectToken?: string;
    };
}

const SEAM_TOKEN = 'seam-reconnect-token';

beforeEach(() => {
    vi.resetModules();
    renderSpy.mockClear();
    createRootSpy.mockClear();
    createRouterSpy.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    delete (window as SeamWindow).__europaTestMatch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('direct-match seam — failed dynamic import (005 FR-037, 015 FR-019)', () => {
    it('leaves no credential-bearing __europa* global behind and reports the failure', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        (window as SeamWindow).__europaTestMatch = {
            wsUrl: 'ws://127.0.0.1:9999',
            matchId: 'seam-match',
            displayName: 'SeamName',
            reconnectToken: SEAM_TOKEN,
        };

        await bootAt('/match/seam-match/join');

        // The failed import is HANDLED: an honest diagnostic reaches
        // the console error channel, carrying the failure itself (as
        // `cause` when the module runner wraps it) — pre-fix the
        // rejection was unhandled and nothing was reported.
        await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('direct-match'), expect.any(Error));
        const reported = consoleErrorSpy.mock.calls[0]?.[1] as { message?: string; cause?: { message?: string } };
        expect(`${reported.message ?? ''} ${reported.cause?.message ?? ''}`).toContain('chunk load failure');

        // The credential was captured and scrubbed SYNCHRONOUSLY,
        // before the import — the failure path cannot leak it.
        expect(Object.hasOwn(window, '__europaTestMatch')).toBe(false);
        const europaGlobals = Object.getOwnPropertyNames(window).filter((key) => key.startsWith('__europa'));
        expect(europaGlobals).not.toContain('__europaTestMatch');
        const json = europaGlobals
            .map((key) => JSON.stringify((window as unknown as Record<string, unknown>)[key] ?? null) ?? 'null')
            .join('\n');
        expect(json).not.toContain(SEAM_TOKEN);
    });
});
