import { describe, expect, it, vi } from 'vitest';
import { printCreateBanner, printLobbyBanner, resolveConfig } from '../../scripts/host';
import type { HostConfig } from '../../scripts/host-config';

/**
 * TDD for host single-port collapse (T007).
 * These tests assert the NEW single-port contract and MUST fail before
 * T005/T006 land, then go green after.
 */

describe('host single-port collapse — TDD (T007)', () => {
    it('HostConfig no longer has staticPort', () => {
        const config = resolveConfig([], {}) as HostConfig | null;
        expect(config).not.toBeNull();
        // staticPort must not exist on the resolved config
        expect((config as unknown as Record<string, unknown>).staticPort).toBeUndefined();
        // single port must be present
        expect((config as unknown as Record<string, unknown>).port).toBeDefined();
        expect((config as HostConfig).port).toBe(8080);
        // wsPort alias still present for compat, equal to port
        expect((config as HostConfig).wsPort).toBe(8080);
    });

    it('HOST_STATIC_PORT env is rejected as unsupported (FR-012)', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig([], { HOST_STATIC_PORT: '5173' });
        expect(result).toBeNull();
        const output = errSpy.mock.calls.map((c) => String(c[0])).join('');
        expect(output).toMatch(/no longer supported/);
        expect(output).toMatch(/HOST_STATIC_PORT/);
        errSpy.mockRestore();
    });

    it('--static-port flag is rejected as unsupported (FR-012)', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig(['--static-port', '5173'], {});
        expect(result).toBeNull();
        const output = errSpy.mock.calls.map((c) => String(c[0])).join('');
        expect(output).toMatch(/no longer supported/);
        expect(output).toMatch(/--static-port/);
        errSpy.mockRestore();
    });

    it('--static-port=5173 inline form is also rejected as unsupported (FR-012)', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig(['--static-port=5173'], {});
        expect(result).toBeNull();
        const output = errSpy.mock.calls.map((c) => String(c[0])).join('');
        expect(output).toMatch(/no longer supported/);
        expect(output).toMatch(/--static-port/);
        errSpy.mockRestore();
    });

    it('unknown flag still errors', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig(['--unknown-flag'], {});
        expect(result).toBeNull();
        expect(errSpy.mock.calls.map((c) => String(c[0])).join('')).toMatch(/unknown argument/);
        errSpy.mockRestore();
    });

    it('wildcard bind without publicHost errors', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig(['--bind-host', '0.0.0.0'], {});
        expect(result).toBeNull();
        expect(errSpy.mock.calls.map((c) => String(c[0])).join('')).toMatch(
            /public-host.*required|required.*public-host/i,
        );
        errSpy.mockRestore();
    });

    it('HOST_PORT parsing: default 8080, custom, invalid', () => {
        expect(resolveConfig([], {})?.port).toBe(8080);
        expect(resolveConfig(['--port', '9090'], {})?.port).toBe(9090);
        expect(resolveConfig([], { HOST_PORT: '9090' })?.port).toBe(9090);

        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        expect(resolveConfig(['--port', 'not-a-number'], {})).toBeNull();
        expect(resolveConfig([], { HOST_PORT: '99999' })).toBeNull();
        expect(resolveConfig([], { HOST_PORT: '0' })).toBeNull();
        errSpy.mockRestore();
    });

    it('banner format has single port on both Match server and Console UI lines', () => {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            out.push(String(chunk));
            return true;
        });
        // After collapse, printLobbyBanner takes single port
        // Call with single port 8080
        printLobbyBanner(8080, 'localhost');
        const text = out.join('');
        // Both lines must contain :8080 and must NOT contain :5173
        expect(text).toMatch(/Match server.*:8080/);
        expect(text).toMatch(/Console UI.*:8080/);
        expect(text).not.toMatch(/:5173/);
        expect(text).toMatch(/→ http:\/\/localhost:8080\/lobby\n/);
        // Must not mention staticPort
        expect(text).not.toMatch(/staticPort/i);
        spy.mockRestore();
    });

    it('create banner also uses single port for ws and http URLs', () => {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            out.push(String(chunk));
            return true;
        });
        const fakeMatch = {
            matchId: 'test-match',
            seatTokens: ['tok1', 'tok2'],
            playerCount: 2,
            boardSize: 32,
        } as unknown as Parameters<typeof printCreateBanner>[2];
        printCreateBanner(9090, 'example.com', fakeMatch);
        const text = out.join('');
        expect(text).toMatch(/ws:\/\/example\.com:9090/);
        expect(text).toMatch(/http:\/\/example\.com:9090/);
        expect(text).not.toMatch(/:5173/);
        expect(text).toMatch(/Lobby\s+: http:\/\/example\.com:9090\/lobby/);
        // T-034-14: canonical /match/<matchId> scheme (no /join suffix)
        expect(text).toMatch(/Player 1 \(P1\) → http:\/\/example\.com:9090\/match\/test-match/);
        expect(text).toMatch(/Player 2 \(P2\) → http:\/\/example\.com:9090\/match\/test-match/);
        expect(text).not.toMatch(/\/match\/test-match\/join/);
        expect(text).not.toMatch(/[?&](?:live|ws|match|name|token)=?/i);
        expect(text).not.toContain('tok1');
        expect(text).not.toContain('tok2');
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// T-034-16: Banner output with --public-url (FR-034, issue #34)
// ---------------------------------------------------------------------------

describe('host banner with --public-url (T-034-16)', () => {
    function captureStdout(fn: () => void): string {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            out.push(String(chunk));
            return true;
        });
        try {
            fn();
            return out.join('');
        } finally {
            spy.mockRestore();
        }
    }

    const fakeMatch = {
        matchId: 'abc-123',
        seatTokens: ['tok1', 'tok2'],
        playerCount: 2,
        boardSize: 32,
    } as unknown as Parameters<typeof printCreateBanner>[2];

    describe('lobby banner with publicUrl', () => {
        it('uses publicUrl for the lobby link when provided', () => {
            const text = captureStdout(() => {
                printLobbyBanner(8080, 'localhost', 'https://game.example.com');
            });
            expect(text).toMatch(/→ https:\/\/game\.example\.com\/lobby/);
            // Console UI still uses the local address
            expect(text).toMatch(/Console UI\s+: http:\/\/localhost:8080/);
        });

        it('falls back to http://host:port when publicUrl is omitted', () => {
            const text = captureStdout(() => {
                printLobbyBanner(8080, 'localhost');
            });
            expect(text).toMatch(/→ http:\/\/localhost:8080\/lobby/);
        });
    });

    describe('create banner with publicUrl', () => {
        it('uses publicUrl for match join URLs when provided', () => {
            const text = captureStdout(() => {
                printCreateBanner(8080, 'localhost', fakeMatch, 'https://game.example.com');
            });
            expect(text).toMatch(/Player 1 \(P1\) → https:\/\/game\.example\.com\/match\/abc-123/);
            expect(text).toMatch(/Player 2 \(P2\) → https:\/\/game\.example\.com\/match\/abc-123/);
            // Should not use the old /join suffix
            expect(text).not.toMatch(/\/match\/abc-123\/join/);
        });

        it('falls back to http://host:port when publicUrl is omitted', () => {
            const text = captureStdout(() => {
                printCreateBanner(9090, 'example.com', fakeMatch);
            });
            expect(text).toMatch(/Player 1 \(P1\) → http:\/\/example\.com:9090\/match\/abc-123/);
        });

        it('preserves ws and Console UI local addresses regardless of publicUrl', () => {
            const text = captureStdout(() => {
                printCreateBanner(8080, 'localhost', fakeMatch, 'https://game.example.com');
            });
            expect(text).toMatch(/Match server\s+: ws:\/\/localhost:8080/);
            expect(text).toMatch(/Console UI\s+: http:\/\/localhost:8080/);
            expect(text).toMatch(/Lobby\s+: http:\/\/localhost:8080\/lobby/);
        });

        it('URL-encodes the match ID in the join URL', () => {
            const specialMatch = {
                ...fakeMatch,
                matchId: 'id with spaces',
            } as unknown as Parameters<typeof printCreateBanner>[2];
            const text = captureStdout(() => {
                printCreateBanner(8080, 'localhost', specialMatch, 'https://game.example.com');
            });
            expect(text).toMatch(/match\/id%20with%20spaces/);
        });
    });
});

// ---------------------------------------------------------------------------
// T-034-22: Host script publicBaseUrl absolute URL E2E
// ---------------------------------------------------------------------------

describe('host script publicBaseUrl absolute URL E2E (T-034-22, FR-034)', () => {
    function captureStdout(fn: () => void): string {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            out.push(String(chunk));
            return true;
        });
        try {
            fn();
            return out.join('');
        } finally {
            spy.mockRestore();
        }
    }

    const matchId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const seatTokens = ['tok-p1', 'tok-p2'];
    const fakeMatch = {
        matchId,
        seatTokens,
        playerCount: 2,
        boardSize: 32,
    } as unknown as Parameters<typeof printCreateBanner>[2];

    it('--public-url produces absolute /match/<matchId> URLs in terminal output', () => {
        const text = captureStdout(() => {
            printCreateBanner(8080, 'localhost', fakeMatch, 'https://game.example.com');
        });

        // Both player URLs must be absolute with the configured public URL.
        expect(text).toContain(`Player 1 (P1) → https://game.example.com/match/${matchId}`);
        expect(text).toContain(`Player 2 (P2) → https://game.example.com/match/${matchId}`);

        // Must NOT contain relative URLs or the old /join suffix.
        expect(text).not.toMatch(new RegExp(`/match/${matchId}/join`));
        expect(text).not.toMatch(/→ \/match\//);

        // The publicUrl must NOT leak into ws/Console UI lines.
        expect(text).toMatch(/Match server\s+: ws:\/\/localhost:8080/);
        expect(text).toMatch(/Console UI\s+: http:\/\/localhost:8080/);
    });

    it('lobby banner uses publicUrl for the lobby link', () => {
        const text = captureStdout(() => {
            printLobbyBanner(8080, 'localhost', 'https://game.example.com');
        });

        // The lobby URL must be absolute with the configured public URL.
        expect(text).toContain('→ https://game.example.com/lobby');

        // Console UI line stays local.
        expect(text).toMatch(/Console UI\s+: http:\/\/localhost:8080/);
    });

    it('without publicUrl, banner uses default http://host:port', () => {
        const text = captureStdout(() => {
            printCreateBanner(9090, 'example.com', fakeMatch);
        });

        // Default: http://example.com:9090/match/<matchId>
        expect(text).toContain(`Player 1 (P1) → http://example.com:9090/match/${matchId}`);
        expect(text).toContain(`Player 2 (P2) → http://example.com:9090/match/${matchId}`);
    });
});
