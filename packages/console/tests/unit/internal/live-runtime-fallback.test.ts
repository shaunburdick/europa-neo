/**
 * Live-runtime same-origin fallback tests — feature 011 (T-013).
 *
 * After the single-port collapse the direct ?live route must tolerate a
 * missing ?ws= parameter by falling back to same-origin
 * `${protocol==='https:'?'wss':'ws'}://${location.host}` (spec FR-006).
 * Explicit ?ws= cross-host overrides must still hard-error before client
 * construction (FR-007).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWsMatchClient } = vi.hoisted(() => ({
    createWsMatchClient: vi.fn(() => ({
        state: () => ({ connection: 'idle' }),
        onConnectionChanged: vi.fn(),
        disconnect: vi.fn(),
    })),
}));

const { createConsoleClient } = vi.hoisted(() => ({
    createConsoleClient: vi.fn(() => ({
        connect: vi.fn(async () => {}),
        joinMatch: vi.fn(async () => {}),
        onEnvelope: vi.fn(() => vi.fn()),
        close: vi.fn(),
        state: vi.fn(),
        onConnectionChanged: vi.fn(),
    })),
}));

vi.mock('../../../src/net/ws-match-client', () => ({ createWsMatchClient }));
vi.mock('../../../src/net/client', () => ({ createConsoleClient }));

// Import after mocks are hoisted — the module under test captures the mocked factories at import time.
import { mountLiveRuntime } from '../../../src/internal/live-runtime';

function setPageUrl(search: string): void {
    window.history.replaceState({}, '', `/?${search}`);
}

describe('live-runtime same-origin fallback (011)', () => {
    beforeEach(() => {
        vi.mocked(createWsMatchClient).mockClear();
        vi.mocked(createConsoleClient).mockClear();
        document.body.innerHTML = '<div id="root"></div>';
        // Ensure a deterministichost for same-origin derivation; happy-dom defaults to localhost.
        // No need to mutate window.location.host — rely on whatever the test env provides and assert via the call.
        delete (window as unknown as { __europaLive?: unknown }).__europaLive;
    });

    it('missing ?ws= no longer bootErrors — derives same-origin URL and constructs the client', async () => {
        // Direct live route without an explicit ws override — the 011 contract says this must
        // tolerate absence and connect same-origin instead of hard-erroring on missing ?ws.
        setPageUrl('live&match=m-1&name=Alice');

        mountLiveRuntime(document.querySelector('#root') as HTMLElement);
        // Boot is async (connect+join) but client construction is sync; bootError is set sync for missing params.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(window.__europaLive?.bootError).toBeNull();
        expect(createWsMatchClient).toHaveBeenCalledTimes(1);
        expect(createConsoleClient).toHaveBeenCalledTimes(1);
        // The URL handed to the adapter must be a ws(s):// URL derived from location.host (same-origin fallback).
        const urlArg = (vi.mocked(createConsoleClient).mock.calls[0]?.[0] as { url?: string } | undefined)?.url;
        expect(urlArg).toMatch(/^wss?:\/\//);
        // It must NOT be the old 'requires ?ws' bootError path — already asserted null above.
    });

    it('still hard-errors before client construction when ?ws= is cross-host', () => {
        setPageUrl('live&ws=wss%3A%2F%2Fattacker.example%2Fcollect&match=m-1&name=Alice');

        mountLiveRuntime(document.querySelector('#root') as HTMLElement);

        expect(createWsMatchClient).not.toHaveBeenCalled();
        expect(createConsoleClient).not.toHaveBeenCalled();
        expect(window.__europaLive?.bootError).toContain('same host as this page');
    });

    it('keeps ?live&ws= compatibility for Playwright fixtures (explicit same-host ws still works)', async () => {
        // Existing E2E fixtures pass an explicit same-host ws; that path must keep working unchanged.
        const explicit = `ws://${window.location.hostname}:9876`;
        setPageUrl(`live&ws=${encodeURIComponent(explicit)}&match=m-1&name=Alice`);

        mountLiveRuntime(document.querySelector('#root') as HTMLElement);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(window.__europaLive?.bootError).toBeNull();
        expect(createConsoleClient).toHaveBeenCalledTimes(1);
        const urlArg = (vi.mocked(createConsoleClient).mock.calls[0]?.[0] as { url?: string } | undefined)?.url;
        expect(urlArg).toBe(explicit);
    });
});
