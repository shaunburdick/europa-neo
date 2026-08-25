/**
 * Boot/Join Version Logging Tests — Feature 009 FR-005 (T-008)
 *
 * Pins the two structured logging taps the match server emits:
 *
 *   - `match server listening` at the end of a successful `listen()`,
 *     carrying `appVersion` alongside the listener detail (host, port,
 *     tick rate);
 *   - `seat joined` on each successful player seat claim, carrying
 *     `appVersion` alongside the seat/connection detail.
 *
 * Uses a captured fake logger through the established `ServerDeps.logger`
 * injection seam (the production default is `NULL_LOGGER`), so assertions
 * read the exact detail objects the server emits. No TCP port is opened:
 * the listener binds port 0 and clients ride the `MockWebSocket` seam.
 */

import { computePlayerView } from '@europa/fog';
import { APP_VERSION } from '@europa/version';
import { describe, expect, it } from 'vitest';

import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { Logger, Server, ServerDeps } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** One captured `info` call: message plus the emitted detail object. */
interface InfoCall {
    readonly msg: string;
    readonly ctx: Readonly<Record<string, unknown>>;
}

/**
 * Build a {@link Logger} whose `info` calls are recorded; debug/warn/
 * error stay no-ops (FR-005 concerns only the two info taps).
 *
 * @returns The logger plus the live capture array to assert against.
 */
function captureLogger(): { readonly logger: Logger; readonly infos: InfoCall[] } {
    const infos: InfoCall[] = [];
    const logger: Logger = {
        debug: () => {},
        info: (msg, ctx) => {
            infos.push({ msg, ctx: ctx ?? {} });
        },
        warn: () => {},
        error: () => {},
    };
    return { logger, infos };
}

/**
 * Real engine/fog deps (mirroring `server.test.ts`'s `realDeps`) with
 * the given logger swapped in.
 *
 * @param logger Captured logger under test.
 * @returns Complete `ServerDeps` for `createMatchServer`.
 */
function depsWithLogger(logger: Logger): ServerDeps {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used by fixtures (sessions are pre-built)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {},
        logger,
    };
}

/**
 * Structural bridge to the server's internal test seam (same shape as
 * `server.test.ts`'s helper — declared locally so this file depends on
 * the public `Server` surface only).
 *
 * @param server Server to attach to.
 * @param socket Mock socket to inject.
 */
function injectSocket(server: Server, socket: MockWebSocket): void {
    const seam = (
        server as unknown as {
            __injectSocketForTest?: (s: MockWebSocket) => void;
        }
    ).__injectSocketForTest;
    if (!seam) {
        throw new Error('server does not expose __injectSocketForTest');
    }
    seam(socket);
}

describe('FR-005 version logging taps', () => {
    it('listen() logs "match server listening" carrying appVersion + listener detail', async () => {
        const { logger, infos } = captureLogger();
        const config = { ...NETWORK_DEFAULT_CONFIG, port: 0 };
        const server = createMatchServer(config, depsWithLogger(logger));

        await server.listen();

        const boot = infos.filter((entry) => entry.msg === 'match server listening');
        expect(boot).toHaveLength(1);
        expect(boot[0]?.ctx.appVersion).toBe(APP_VERSION);
        expect(boot[0]?.ctx.host).toBe(config.host);
        expect(boot[0]?.ctx.port).toBe(0);
        expect(boot[0]?.ctx.tickRateMs).toBe(NETWORK_DEFAULT_CONFIG.tickRateMs);

        // Idempotent listen must not double-log the boot line.
        await server.listen();
        expect(infos.filter((entry) => entry.msg === 'match server listening')).toHaveLength(1);

        await server.close();
    });

    it('a successful seat claim logs "seat joined" carrying appVersion + seat/connection detail', async () => {
        const { logger, infos } = captureLogger();
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0 }, depsWithLogger(logger));
        const match = scriptedMatch({ boardSize: 8 });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        attachPlayersForMatch(server, match);

        const socket = new MockWebSocket();
        injectSocket(server, socket);
        const client = new ScriptedClient(socket);
        client.hello();
        await client.nextMessage('helloAck');
        client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        await client.nextMessage('joinAck');

        const joins = infos.filter((entry) => entry.msg === 'seat joined');
        expect(joins).toHaveLength(1);
        expect(joins[0]?.ctx.appVersion).toBe(APP_VERSION);
        expect(joins[0]?.ctx.matchId).toBe(match.matchId);
        expect(joins[0]?.ctx.playerId).toBe(1);
        expect(typeof joins[0]?.ctx.connectionId).toBe('string');

        await server.close();
    });

    it('rejected joins never log "seat joined"', async () => {
        const { logger, infos } = captureLogger();
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0 }, depsWithLogger(logger));
        const match = scriptedMatch({ boardSize: 8 });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        attachPlayersForMatch(server, match);

        // Seat 3 does not exist on a 2-player match → the join is
        // rejected (`match_full`), which must stay silent on the info
        // channel.
        const socket = new MockWebSocket();
        injectSocket(server, socket);
        const client = new ScriptedClient(socket);
        client.hello();
        await client.nextMessage('helloAck');
        client.joinMatch(match.matchId, 'player', { requestedSeat: 3 });
        const reply = await client.nextMessage();

        expect(reply.type).toBe('error');
        expect(infos.filter((entry) => entry.msg === 'seat joined')).toHaveLength(0);

        await server.close();
    });
});
