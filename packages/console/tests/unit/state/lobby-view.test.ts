/**
 * Lobby route derivation unit tests — feature 010 (T-014).
 *
 * Pins the DIRECT LIVE-TEST ROUTE compatibility contract: URLs mounting
 * the live full-stack runtime (`?live&ws=&match=&name=[&token=]`) must
 * resolve to the match view and never be forced through the lobby;
 * every other entry defaults to the lobby view. Pure string-in/
 * classification-out — no DOM, no history, no side effects.
 */

import { describe, expect, it } from 'vitest';

import {
    hasDirectMatchRoute,
    LobbyServerUrlError,
    resolveInitialViewMode,
    resolveLobbyServerUrl,
} from '../../../src/state/lobby-view';

describe('hasDirectMatchRoute', () => {
    it('recognizes the canonical live-test route shape', () => {
        expect(hasDirectMatchRoute('?live&ws=ws://localhost:8080&match=m-1&name=Nova')).toBe(true);
    });

    it('accepts the reconnect variant with a token parameter', () => {
        expect(hasDirectMatchRoute('?live&ws=ws://h:8080&match=m-1&name=Nova&token=tok')).toBe(true);
    });

    it('is order-independent across parameters', () => {
        expect(hasDirectMatchRoute('?match=m-1&ws=ws://h:8080&live')).toBe(true);
    });

    it('tolerates a missing leading question mark (window.location.search parity)', () => {
        expect(hasDirectMatchRoute('live&ws=ws://h:8080&match=m-1')).toBe(true);
    });

    it('rejects routes missing any required coordinate', () => {
        expect(hasDirectMatchRoute('?live')).toBe(false);
        expect(hasDirectMatchRoute('?live&ws=ws://h:8080')).toBe(false);
        expect(hasDirectMatchRoute('?live&match=m-1')).toBe(false);
        expect(hasDirectMatchRoute('?ws=ws://h:8080&match=m-1')).toBe(false);
    });

    it('rejects non-live URLs, including the plain landing and demo harness', () => {
        expect(hasDirectMatchRoute('')).toBe(false);
        expect(hasDirectMatchRoute('?')).toBe(false);
        expect(hasDirectMatchRoute('?e2e')).toBe(false);
    });
});

describe('resolveInitialViewMode', () => {
    it('drops direct live-test routes straight into the match view', () => {
        expect(resolveInitialViewMode('?live&ws=ws://localhost:8080&match=m-1&name=Nova')).toBe('match');
    });

    it('defaults every other entry to the lobby view', () => {
        for (const search of ['', '?', '?e2e', '?live', '?live&ws=ws://h:8080']) {
            expect(resolveInitialViewMode(search)).toBe('lobby');
        }
    });
});

describe('resolveLobbyServerUrl security policy', () => {
    const page = { protocol: 'https:', hostname: 'game.example', port: '443' };

    it('accepts same-host ws and wss overrides, including separate server ports', () => {
        expect(resolveLobbyServerUrl('?ws=ws://game.example:8080', page)).toBe('ws://game.example:8080');
        expect(resolveLobbyServerUrl('?ws=wss://game.example:9443/path', page)).toBe('wss://game.example:9443/path');
    });

    it('rejects external overrides before they can be used by a client', () => {
        expect(() => resolveLobbyServerUrl('?ws=wss://attacker.example/collect', page)).toThrow(LobbyServerUrlError);
    });

    it('rejects malformed and credential-bearing overrides deterministically', () => {
        expect(() => resolveLobbyServerUrl('?ws=not%20a%20websocket%20url', page)).toThrow(LobbyServerUrlError);
        expect(() => resolveLobbyServerUrl('?ws=wss://user:secret@game.example:9443', page)).toThrow(
            LobbyServerUrlError,
        );
    });
});
