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

    it('HOST_STATIC_PORT env is ignored (never released)', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const result = resolveConfig([], { HOST_STATIC_PORT: '5173' });
        expect(result).not.toBeNull();
        expect((result as HostConfig).port).toBe(8080);
        const output = errSpy.mock.calls.map((c) => String(c[0])).join('');
        expect(output).not.toMatch(/no longer supported/);
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
        // @ts-expect-error: tolerate old signature until fixed — test drives new signature
        printLobbyBanner(8080, 'localhost');
        const text = out.join('');
        // Both lines must contain :8080 and must NOT contain :5173
        expect(text).toMatch(/Match server.*:8080/);
        expect(text).toMatch(/Console UI.*:8080/);
        expect(text).not.toMatch(/:5173/);
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
        const fakeMatch = { matchId: 'test-match', seatTokens: ['tok1', 'tok2'] } as unknown as Parameters<
            typeof printCreateBanner
        >[2];
        // New signature: (port, publicHost, match)
        // @ts-expect-error: interim
        printCreateBanner(9090, 'example.com', fakeMatch);
        const text = out.join('');
        expect(text).toMatch(/ws:\/\/example\.com:9090/);
        expect(text).toMatch(/http:\/\/example\.com:9090/);
        expect(text).not.toMatch(/:5173/);
        spy.mockRestore();
    });
});
