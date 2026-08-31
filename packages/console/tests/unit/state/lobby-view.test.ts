import { describe, expect, it } from 'vitest';

import { LobbyServerUrlError, resolveLobbyServerUrl } from '../../../src/state/lobby-view';

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

describe('resolveLobbyServerUrl same-origin fallback (011 single-port)', () => {
    it('defaults to same-origin host when no override is present (http → ws)', () => {
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'http:',
                host: 'localhost:8080',
                hostname: 'localhost',
            } as never),
        ).toBe('ws://localhost:8080');
    });

    it('preserves non-default ports from location.host (same-origin, not hardcoded 8080)', () => {
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'http:',
                host: 'example.com:9090',
                hostname: 'example.com',
            } as never),
        ).toBe('ws://example.com:9090');
        // Host without explicit port stays without port — same-origin, not :8080.
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'http:',
                host: 'example.com',
                hostname: 'example.com',
            } as never),
        ).toBe('ws://example.com');
    });

    it('uses wss for https pages (same-origin scheme)', () => {
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'https:',
                host: 'secure.example:8443',
                hostname: 'secure.example',
            } as never),
        ).toBe('wss://secure.example:8443');
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'https:',
                host: 'localhost:8080',
                hostname: 'localhost',
            } as never),
        ).toBe('wss://localhost:8080');
    });

    it('prefers location.host over hostname when both are present', () => {
        // New contract: PageLocator.host (location.host) is the same-origin source.
        // Old code used hostname:+8080 and would ignore host — this pins the new path.
        expect(
            resolveLobbyServerUrl('', {
                protocol: 'http:',
                host: 'a.example:3000',
                hostname: 'b.example',
            } as never),
        ).toBe('ws://a.example:3000');
    });

    it('falls back to localhost:8080 when host is empty (file:// / test context)', () => {
        expect(resolveLobbyServerUrl('', { protocol: 'http:', host: '', hostname: '' } as never)).toBe(
            'ws://localhost:8080',
        );
        expect(resolveLobbyServerUrl('', { protocol: 'file:', host: '', hostname: '' } as never)).toBe(
            'ws://localhost:8080',
        );
        // Undefined host (backwards-compat missing property) also falls back via LOBBY_DEFAULT_SERVER_PORT.
        expect(resolveLobbyServerUrl('', { protocol: 'http:', hostname: 'localhost' } as never)).toBe(
            'ws://localhost:8080',
        );
    });

    it('still validates ?ws= overrides: same-host and loopback alias allowed, cross-host and credentials rejected', () => {
        const pageWithHost = {
            protocol: 'http:',
            host: 'localhost:8080',
            hostname: 'localhost',
        } as never;
        // Same-host with different port is allowed.
        expect(resolveLobbyServerUrl('?ws=ws://localhost:9999', pageWithHost)).toBe('ws://localhost:9999');
        // Loopback alias: page localhost ↔ 127.0.0.1 is allowed in both directions.
        expect(
            resolveLobbyServerUrl('?ws=ws://127.0.0.1:8080', {
                protocol: 'http:',
                host: 'localhost:8080',
                hostname: 'localhost',
            } as never),
        ).toBe('ws://127.0.0.1:8080');
        expect(
            resolveLobbyServerUrl('?ws=ws://localhost:8080', {
                protocol: 'http:',
                host: '127.0.0.1:8080',
                hostname: '127.0.0.1',
            } as never),
        ).toBe('ws://localhost:8080');
        // Cross-host still rejected.
        expect(() =>
            resolveLobbyServerUrl('?ws=wss://attacker.example/collect', {
                protocol: 'http:',
                host: 'localhost:8080',
                hostname: 'localhost',
            } as never),
        ).toThrow(LobbyServerUrlError);
        // Credentials still rejected.
        expect(() => resolveLobbyServerUrl('?ws=wss://user:secret@localhost:8080', pageWithHost)).toThrow(
            LobbyServerUrlError,
        );
    });

    it('LOBBY_DEFAULT_SERVER_PORT is documented as default HOST_PORT, not a second listener', async () => {
        const fs = await import('node:fs');
        const { resolve } = await import('node:path');
        // Try multiple candidate locations: import.meta.url-relative (works in vitest) and cwd-relative.
        const candidates: string[] = [];
        try {
            // From tests/unit/state/lobby-view.test.ts → 4 levels up to packages/console
            candidates.push(new URL('../../../../src/state/lobby-view.ts', import.meta.url).pathname);
        } catch {}
        try {
            candidates.push(new URL('../../../src/state/lobby-view.ts', import.meta.url).pathname);
        } catch {}
        candidates.push(resolve('packages/console/src/state/lobby-view.ts'));
        candidates.push(resolve('src/state/lobby-view.ts'));
        let content: string | null = null;
        for (const candidate of candidates) {
            try {
                content = fs.readFileSync(candidate, 'utf8');
                break;
            } catch {}
        }
        if (content === null) {
            throw new Error(`could not locate lobby-view.ts (tried ${candidates.join(', ')})`);
        }
        expect(content).toContain('LOBBY_DEFAULT_SERVER_PORT');
        expect(content).toMatch(/default HOST_PORT/i);
        expect(content).toMatch(/not a second listener/i);
    });
});
