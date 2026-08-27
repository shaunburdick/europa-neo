/** URL override security tests for the identity-bearing runtime entrypoints. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWsLobbyClient, createWsMatchClient } = vi.hoisted(() => ({
    createWsLobbyClient: vi.fn(),
    createWsMatchClient: vi.fn(),
}));

vi.mock('../../../src/net/ws-lobby-client', () => ({ createWsLobbyClient }));
vi.mock('../../../src/net/ws-match-client', () => ({ createWsMatchClient }));

import { mountLiveRuntime } from '../../../src/internal/live-runtime';
import { mountLobbyRuntime } from '../../../src/internal/lobby-runtime';

function setPageUrl(search: string): void {
    window.history.replaceState({}, '', `/?${search}`);
}

describe('identity-bearing runtime URL overrides', () => {
    beforeEach(() => {
        createWsLobbyClient.mockReset();
        createWsMatchClient.mockReset();
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('rejects an external lobby endpoint before sending lobbyIdentity', async () => {
        setPageUrl('ws=wss%3A%2F%2Fattacker.example%2Fcollect');

        mountLobbyRuntime(document.querySelector('#root') as HTMLElement);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(createWsLobbyClient).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('same host as this page');
    });

    it('rejects an external direct-live endpoint before constructing its match client', () => {
        setPageUrl('live&ws=wss%3A%2F%2Fattacker.example%2Fcollect&match=m-1&name=Alice');

        mountLiveRuntime(document.querySelector('#root') as HTMLElement);

        expect(createWsMatchClient).not.toHaveBeenCalled();
        expect(window.__europaLive?.bootError).toContain('same host as this page');
    });
});
