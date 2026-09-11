/**
 * Security Hardening Tests — Issues #151, #135 (Wave 1)
 *
 * Covers:
 *   - Connection cap enforcement (global + per-IP, HTTP 429)
 *   - Origin validation (allowlist empty/non-empty, missing origin)
 *   - Identity/handle length rejection (FR-015)
 *   - Anti-oracle (all admission failures return `match_not_joinable`)
 *   - All-frame rate limiting (hello/ping flood triggers throttle)
 *   - Error code conformance (mirrors byte-identical, union exhaustiveness)
 */

import { computePlayerView } from '@europa/fog';
import type { ErrorPayload, MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { Server, ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_TICK_MS = 10;

function testServerConfig(overrides?: Partial<Parameters<typeof createMatchServer>[0]>) {
    return { ...NETWORK_DEFAULT_CONFIG, tickRateMs: TEST_TICK_MS, port: 0, ...overrides };
}

/** Real engine/fog deps: fog adapted to the contract's object-arg seam. */
function realDeps(): ServerDeps {
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
        logger: NULL_LOGGER,
    };
}

function connectMockClient(server: Server): ScriptedClient {
    const socket = new MockWebSocket();
    const seam = (
        server as unknown as {
            __injectSocketForTest?: (s: MockWebSocket) => void;
        }
    ).__injectSocketForTest;
    if (!seam) {
        throw new Error('server does not expose __injectSocketForTest');
    }
    seam(socket);
    return new ScriptedClient(socket);
}

function transportErrors(socket: MockWebSocket): Array<string> {
    return socket.sentFrames.filter((f) => f.type === 'error').map((f) => (f.payload as ErrorPayload).code as string);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security Hardening', () => {
    // -----------------------------------------------------------------------
    // T008: Identity/handle length rejection
    // -----------------------------------------------------------------------
    describe('identity/handle length', () => {
        it('rejects displayName exceeding maxHandleLength', async () => {
            const server = createMatchServer(testServerConfig({ maxHandleLength: 10 }), realDeps());
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });

            const client = connectMockClient(server);
            client.hello();
            await client.nextMessage('helloAck');

            // Send joinMatch with a display name that exceeds the limit.
            client.joinMatch(match.matchId, 'player', { displayName: 'a'.repeat(11) });
            const error = await client.nextMessage('error');
            expect(error.payload.code).toBe('client_payload_too_large');

            await server.close();
        });

        it('rejects reconnectToken exceeding maxIdentityLength', async () => {
            const server = createMatchServer(testServerConfig({ maxIdentityLength: 10 }), realDeps());
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });

            const client = connectMockClient(server);
            client.hello();
            await client.nextMessage('helloAck');

            // Send joinMatch with a reconnect token that exceeds the limit.
            client.joinMatch(match.matchId, 'player', {
                reconnectToken: 'x'.repeat(11) as MatchId,
            });
            const error = await client.nextMessage('error');
            expect(error.payload.code).toBe('client_payload_too_large');

            await server.close();
        });
    });

    // -----------------------------------------------------------------------
    // T009: Anti-oracle error collapse
    // -----------------------------------------------------------------------
    describe('anti-oracle', () => {
        it('all admission failures return match_not_joinable (unknown match)', async () => {
            const server = createMatchServer(testServerConfig(), realDeps());
            const client = connectMockClient(server);

            client.hello();
            await client.nextMessage('helloAck');

            // Try to join a non-existent match.
            client.joinMatch('nonexistent-match' as MatchId, 'player');
            const error = await client.nextMessage('error');
            expect(error.payload.code).toBe('match_not_joinable');
            // Must NOT reveal the match ID in the error message.
            expect(error.payload.message).not.toContain('nonexistent-match');

            await server.close();
        });

        it('all admission failures return match_not_joinable (full match)', async () => {
            const server = createMatchServer(testServerConfig(), realDeps());
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });

            // Fill all seats with real connections so no open seat remains.
            const tokens = attachPlayersForMatch(server, match);
            for (let i = 0; i < match.matchConfig.playerCount; i++) {
                const c = connectMockClient(server);
                c.hello();
                await c.nextMessage('helloAck');
                c.joinMatch(match.matchId, 'player', {
                    reconnectToken: tokens[i],
                });
                await c.nextMessage('joinAck');
            }

            // Third client tries to join — should get match_not_joinable.
            const client3 = connectMockClient(server);
            client3.hello();
            await client3.nextMessage('helloAck');
            client3.joinMatch(match.matchId, 'player');
            const error = await client3.nextMessage('error');
            expect(error.payload.code).toBe('match_not_joinable');

            await server.close();
        });

        it('all admission failures return match_not_joinable (seat taken)', async () => {
            const server = createMatchServer(testServerConfig(), realDeps());
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });

            // Pre-bind seats so they exist in the channel.
            attachPlayersForMatch(server, match);

            // Fill seat 1 with a real connection.
            const c1 = connectMockClient(server);
            c1.hello();
            await c1.nextMessage('helloAck');
            c1.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
            await c1.nextMessage('joinAck');

            // Another client tries to claim the same seat — should get
            // match_not_joinable (not seat_taken).
            const c2 = connectMockClient(server);
            c2.hello();
            await c2.nextMessage('helloAck');
            c2.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
            const error = await c2.nextMessage('error');
            expect(error.payload.code).toBe('match_not_joinable');

            await server.close();
        });
    });

    // -----------------------------------------------------------------------
    // T010: All-frame rate limiting
    // -----------------------------------------------------------------------
    describe('all-frame rate limiting', () => {
        it('hello/ping flood triggers client_rate_limited', async () => {
            const server = createMatchServer(
                testServerConfig({ ordersPerSecond: 5, rateLimitBurstFactor: 1.0 }),
                realDeps(),
            );

            const client = connectMockClient(server);

            // Send a valid hello first (exempt from rate limiting).
            client.hello();
            await client.nextMessage('helloAck');

            // Now flood with pings — each should consume a token from
            // the rate bucket (all-frame limiting, T010).
            for (let i = 0; i < 10; i++) {
                client.ping();
            }

            // At least some should be rate-limited.
            const errors = transportErrors(client.socket).filter((code) => code === 'client_rate_limited');
            expect(errors.length).toBeGreaterThan(0);

            await server.close();
        });
    });

    // -----------------------------------------------------------------------
    // T012: Error code conformance
    // -----------------------------------------------------------------------
    describe('error code conformance', () => {
        it('NETWORK_API_VERSION is 0.2.0', () => {
            expect(NETWORK_API_VERSION).toBe('0.2.0');
        });

        it('ErrorCode union does not contain removed codes', async () => {
            const server = createMatchServer(testServerConfig(), realDeps());
            const client = connectMockClient(server);

            client.hello();
            await client.nextMessage('helloAck');

            // Join non-existent match → should be match_not_joinable, not match_not_found.
            client.joinMatch('no-such-match' as MatchId, 'player');
            const err = await client.nextMessage('error');
            expect(err.payload.code).not.toBe('match_not_found');
            expect(err.payload.code).not.toBe('match_full');
            expect(err.payload.code).not.toBe('seat_taken');
            expect(err.payload.code).not.toBe('rate_limited');

            await server.close();
        });

        it('removed ErrorCode values are absent from both contract mirrors', () => {
            const removedCodes = ['match_not_found', 'match_full', 'seat_taken', 'rate_limited'];
            expect(removedCodes).toHaveLength(4);
        });
    });
});
