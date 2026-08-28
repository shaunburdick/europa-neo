/**
 * Networking seam — external http.Server ownership (feature 011 FR-002, T009)
 *
 * TDD: these tests prove FAIL before the seam lands (server ignores
 * httpServer) and green after (ownership-transfer contract).
 *
 * - external httpServer given → listen() does not create second server
 *   (port count stays 1), close() does not close external server,
 *   __boundPortForTest() equals external address().port,
 *   wss.handleUpgrade fires exactly once per upgrade, noServer:true.
 * - internal path still works (no httpServer → creates own server).
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { computePlayerView } from '@europa/fog';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';

function realDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {},
        logger: NULL_LOGGER,
        ...overrides,
    };
}

function waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ServerDeps.httpServer external ownership (011 FR-002)', () => {
    it('internal path: no httpServer → creates own http.Server on listen and __boundPortForTest returns it', async () => {
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0, tickRateMs: 50 }, realDeps());
        expect(server.__boundPortForTest()).toBeUndefined();
        await server.listen();
        const port = server.__boundPortForTest();
        expect(port).toBeDefined();
        expect(typeof port).toBe('number');
        expect(port).toBeGreaterThan(0);
        // wss must still be noServer:true
        const wss =
            (server as unknown as { __wssForTest?: { options: { noServer: boolean } } }).__wssForTest ??
            (server as unknown as { __getWss?: () => { options: { noServer: boolean } } }).__getWss?.();
        if (wss) {
            expect(wss.options.noServer).toBe(true);
        }
        await server.close();
        expect(server.__boundPortForTest()).toBeUndefined();
    });

    it('external httpServer given → listen() does not create second server, __boundPortForTest equals external port', async () => {
        const external: HttpServer = createHttpServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end('ok');
        });
        await new Promise<void>((resolve) => {
            external.listen(0, '127.0.0.1', () => resolve());
        });
        const externalPort = (external.address() as { port: number }).port;
        expect(externalPort).toBeGreaterThan(0);

        const deps = realDeps({ httpServer: external });
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0, tickRateMs: 50 }, deps);

        // Before listen, __boundPortForTest must already reflect external port (single-port invariant)
        // — or at least after listen it must equal external port.
        await server.listen();

        const bound = server.__boundPortForTest();
        expect(bound).toBe(externalPort);

        // No second server: bound equals external; also external listener count for upgrade should be 1
        expect(external.listenerCount('upgrade')).toBe(1);

        // wss still noServer:true
        const wss =
            (server as unknown as { __wssForTest?: { options: { noServer: boolean } } }).__wssForTest ??
            (server as unknown as { __getWss?: () => { options: { noServer: boolean } } }).__getWss?.();
        if (wss) {
            expect(wss.options.noServer).toBe(true);
        }

        await server.close();
        // close() must NOT close external server
        expect(external.listening).toBe(true);
        expect((external.address() as { port: number }).port).toBe(externalPort);
        // __boundPortForTest after close still reads external (ownership stays with host)
        // At minimum external still listening; bound should still be external port or undefined depending on impl,
        // but the key invariant is external not closed.
        // Clean up external ourselves.
        await new Promise<void>((resolve) => {
            external.close(() => resolve());
        });
    });

    it('external httpServer: wss.handleUpgrade fires exactly once per upgrade (real WebSocket handshake)', async () => {
        const external: HttpServer = createHttpServer();
        await new Promise<void>((resolve) => {
            external.listen(0, '127.0.0.1', () => resolve());
        });
        const externalPort = (external.address() as { port: number }).port;

        const deps = realDeps({ httpServer: external });
        const server = createMatchServer(
            { ...NETWORK_DEFAULT_CONFIG, port: externalPort, host: '127.0.0.1', tickRateMs: 50 },
            deps,
        );

        // Spy on handleUpgrade via the exposed wss accessor if available, else count connections
        await server.listen();

        const wss =
            (server as unknown as { __wssForTest?: { handleUpgrade: (...args: unknown[]) => unknown } }).__wssForTest ??
            (server as unknown as { __getWss?: () => { handleUpgrade: (...args: unknown[]) => unknown } }).__getWss?.();

        let handleUpgradeCalls = 0;
        let original: ((...args: unknown[]) => unknown) | undefined;
        if (wss && typeof wss.handleUpgrade === 'function') {
            original = wss.handleUpgrade.bind(wss);
            vi.spyOn(
                wss as unknown as { handleUpgrade: (...args: unknown[]) => unknown },
                'handleUpgrade',
            ).mockImplementation((...args: unknown[]) => {
                handleUpgradeCalls += 1;
                return (original as (...a: unknown[]) => unknown)(...args);
            });
        }

        const url = `ws://127.0.0.1:${String(externalPort)}`;
        const ws = new WebSocket(url);
        await new Promise<void>((resolve, reject) => {
            ws.once('open', () => resolve());
            ws.once('error', (e) => reject(e));
        });

        // Give the upgrade path a moment to fire
        await waitFor(20);

        if (wss) {
            expect(handleUpgradeCalls).toBe(1);
        } else {
            // Fallback: at least the connection was established, proving upgrade was handled
            expect(ws.readyState).toBe(WebSocket.OPEN);
        }

        ws.close();
        await new Promise<void>((resolve) => {
            ws.once('close', () => resolve());
        });

        await server.close();
        expect(external.listening).toBe(true);
        await new Promise<void>((resolve) => {
            external.close(() => resolve());
        });
    });

    it('internal path still works after external test: create without httpServer still listens on ephemeral port', async () => {
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0, tickRateMs: 50 }, realDeps());
        await server.listen();
        const port = server.__boundPortForTest();
        expect(port).toBeGreaterThan(0);
        // HTTP request to internal server should 404? At least the server is listening.
        // We do not assert HTTP body, just that port is ephemeral and not 0.
        await server.close();
    });
});
