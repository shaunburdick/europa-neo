/**
 * Version-Mismatch Integration Test — Feature 004 Polish (T047)
 *
 * FR-004 end-to-end through the real server dispatch path
 (`ScriptedClient` → `Connection.handleInbound` → `handleEnvelope`):
 *
 *   - A `hello` claiming protocol version `0.2.0` is rejected with a
 *     `version_mismatch` error frame and the socket is closed with
 *     code 1008 ("policy violation").
 *   - A `hello` claiming `0.1.5` (patch drift within the same minor)
 *     is accepted — the handshake completes with a `helloAck`.
 *
 * Version ruling (Wave 6B-1, honored here): pre-1.0 minors are the
 * BREAKING boundary — `0.2.0` is major drift from `0.1.0`, so only
 * `0.1.x` variants interoperate. The unit suite proves the comparator;
 * this suite proves the wire consequences (error frame + ws close).
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { createMatchServer } from '../../src/server';
import type { ErrorPayload, HelloAckPayload } from '../../src/types';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { connectMockClient, realDeps, startJoinedMatch, testServerConfig } from './harness';

describe('version-mismatch enforcement (FR-004, T047)', () => {
    it('a hello offering 0.2.0 receives a version_mismatch error and the socket closes with 1008', async () => {
        const h = await startJoinedMatch();
        try {
            // A fresh connection that has not yet greeted the server.
            const client = connectMockClient(h.server);
            client.hello('0.2.0');

            // The rejection rides an `error` frame back before the close.
            const error = await client.nextMessage('error');
            const payload = error.payload as ErrorPayload;
            expect(payload.code).toBe('version_mismatch');
            expect(payload.detail).toMatchObject({ received: '0.2.0' });

            // FR-004's "gracefully" means: tell the client why, THEN close
            // with the policy-violation code (not an abrupt TCP reset).
            expect(client.socket.closes).toEqual([{ code: 1008, reason: 'policy violation' }]);
            expect(client.socket.isOpen).toBe(false);

            // The other match participants are untouched: the match keeps
            // ticking for the well-behaved clients.
            const tick = await h.clients[0].nextMessage('tick');
            expect((tick.payload as { tick: number }).tick).toBeGreaterThanOrEqual(1);
        } finally {
            await h.server.close();
        }
    });

    it('a hello offering 0.1.5 (same-minor patch drift) is accepted with a helloAck', async () => {
        // Purpose-built harness (not `startJoinedMatch`): seat 2 must stay
        // open so the drift-tolerant client can prove full functionality
        // by claiming it after the accepted handshake.
        const server = createMatchServer(testServerConfig(), realDeps());
        await server.listen();
        try {
            const match = scriptedMatch({ boardSize: 8, tickRateMs: 10 });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });
            attachPlayersForMatch(server, match);

            // Seat 1 goes to a current-version client.
            const seat1 = connectMockClient(server);
            seat1.hello();
            await seat1.nextMessage('helloAck');
            seat1.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
            await seat1.nextMessage('joinAck');

            // The patch-drifted client negotiates cleanly and joins seat 2.
            const client = connectMockClient(server);
            client.hello('0.1.5');

            const ack = await client.nextMessage('helloAck');
            const payload = ack.payload as HelloAckPayload;
            // The server answers with ITS current version so the client can
            // record the negotiated protocol level.
            expect(payload.protocolVersion).toBe(NETWORK_API_VERSION);
            expect(client.socket.closes).toEqual([]);

            client.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
            const joinAck = await client.nextMessage('joinAck');
            expect((joinAck.payload as { playerId: number | null }).playerId).toBe(2);
        } finally {
            await server.close();
        }
    });
});
