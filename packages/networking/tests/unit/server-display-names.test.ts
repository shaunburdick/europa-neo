/**
 * JoinAck display-name overlay tests — feature 010 R-013 (FR-020/SC-008).
 *
 * Pins the registration-boundary seam: `registerMatch` may carry per-seat
 * authoritative display names, which the channel overlays onto the
 * `JoinAckPayload.players` roster WITHOUT touching the engine world:
 *
 *   - seated joinAcks carry the registered names on the correct seats
 *     (index = PlayerId - 1) with every other Player field intact;
 *   - the roster stays correct AFTER the first authoritative tick
 *     (SC-008's persistence clause);
 *   - spectator joinAcks expose the same participant roster (FR-023);
 *   - arbitrary Unicode handles (valid per FR-004) pass through
 *     unharmed — proving no ASCII round-trip through the engine's
 *     serialize convention;
 *   - legacy registrations without names keep the engine's `"Player N"`
 *     placeholders verbatim (backward compatibility);
 *   - a shorter-than-playerCount array overlays only its indices
 *     (defensive contract for a SHOULD-length field).
 *
 * Uses the real engine + fog via the scripted fixture and drives clients
 * through `MockWebSocket` + `ScriptedClient` — no TCP port is opened.
 */

import { computePlayerView } from '@europa/fog';
import type { JoinAckPayload } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** Accelerated tick cadence (matches the unit/integration harness). */
const TEST_TICK_MS = 10;

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

/** Fast-tick ephemeral server wired with real engine/fog behavior. */
async function makeServer() {
    const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, tickRateMs: TEST_TICK_MS, port: 0 }, realDeps());
    // listen() starts the tick scheduler; port 0 binds an ephemeral port
    // the mock-socket clients never touch (integration-harness pattern).
    await server.listen();
    return server;
}

/**
 * Attach a mock socket and complete the handshake, returning the client
 * ready to join a match.
 */
async function connectGreeted(server: Awaited<ReturnType<typeof makeServer>>): Promise<ScriptedClient> {
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
    const client = new ScriptedClient(socket);
    client.hello();
    await client.nextMessage('helloAck');
    return client;
}

/** Await a joinAck and return its typed payload. */
async function nextJoinAck(client: ScriptedClient): Promise<JoinAckPayload> {
    const envelope = await client.nextMessage('joinAck');
    // The wire union correlates kind↔payload only at the schema level;
    // the joinAck arm narrows here (house cast convention).
    return envelope.payload as JoinAckPayload;
}

describe('joinAck display-name overlay (feature 010 R-013, FR-020/SC-008)', () => {
    it('seated joinAcks carry the registered names on the correct seats', async () => {
        const server = await makeServer();
        const match = scriptedMatch({
            boardSize: 8,
            playerCount: 2,
            tickRateMs: TEST_TICK_MS,
            displayNames: ['Nova', 'Orion'],
        });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: ['Nova', 'Orion'],
        });
        attachPlayersForMatch(server, match);

        const clientA = await connectGreeted(server);
        const clientB = await connectGreeted(server);
        clientA.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        clientB.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
        const ackA = await nextJoinAck(clientA);
        const ackB = await nextJoinAck(clientB);

        expect(ackA.players.map((player) => player.displayName)).toEqual(['Nova', 'Orion']);
        expect(ackB.players.map((player) => player.displayName)).toEqual(['Nova', 'Orion']);

        // Seat identity and every non-name Player field survive the
        // overlay exactly (structural diff against the raw world roster).
        const worldPlayers = match.engineSession.world().players;
        expect(ackA.players[0]).toEqual({ ...worldPlayers[0], displayName: 'Nova' });
        expect(ackA.players[1]).toEqual({ ...worldPlayers[1], displayName: 'Orion' });

        await server.close();
    });

    it('the roster remains correct after the first authoritative tick (SC-008)', async () => {
        const server = await makeServer();
        const match = scriptedMatch({
            boardSize: 8,
            playerCount: 2,
            tickRateMs: TEST_TICK_MS,
            displayNames: ['Nova', 'Orion'],
        });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: ['Nova', 'Orion'],
        });
        attachPlayersForMatch(server, match);

        // First seat joins BEFORE any tick...
        const clientA = await connectGreeted(server);
        clientA.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        await nextJoinAck(clientA);
        // ...and the first authoritative tick flows to that seat.
        await clientA.nextMessage('tick');

        // A peer joining AFTER the tick still sees authoritative labels.
        const clientB = await connectGreeted(server);
        clientB.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
        const ackB = await nextJoinAck(clientB);
        expect(ackB.players.map((player) => player.displayName)).toEqual(['Nova', 'Orion']);

        await server.close();
    });

    it('spectator joinAcks expose the same participant roster (FR-023)', async () => {
        const server = await makeServer();
        const match = scriptedMatch({
            boardSize: 8,
            playerCount: 2,
            tickRateMs: TEST_TICK_MS,
            displayNames: ['Nova', 'Orion'],
        });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: ['Nova', 'Orion'],
        });
        attachPlayersForMatch(server, match);
        server.enableSpectators(match.matchId);

        const spectator = await connectGreeted(server);
        spectator.joinMatch(match.matchId, 'spectator');
        const ack = await nextJoinAck(spectator);

        expect(ack.playerId).toBeNull();
        expect(ack.players.map((player) => player.displayName)).toEqual(['Nova', 'Orion']);

        await server.close();
    });

    it('Unicode handles pass through unharmed (no ASCII round-trip)', async () => {
        const server = await makeServer();
        const unicodeNames = ['城堡', '⚔️Orion⚔️'];
        const match = scriptedMatch({
            boardSize: 8,
            playerCount: 2,
            tickRateMs: TEST_TICK_MS,
            displayNames: unicodeNames,
        });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: unicodeNames,
        });
        attachPlayersForMatch(server, match);

        const client = await connectGreeted(server);
        client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        const ack = await nextJoinAck(client);

        // Exact strings — the overlay never routes through the engine's
        // ASCII-only serialize convention (non-ASCII would have become '?').
        expect(ack.players.map((player) => player.displayName)).toEqual(unicodeNames);

        await server.close();
    });

    it('legacy registrations without names keep the engine placeholders', async () => {
        const server = await makeServer();
        const match = scriptedMatch({ boardSize: 8, playerCount: 2, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        attachPlayersForMatch(server, match);

        const client = await connectGreeted(server);
        client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        const ack = await nextJoinAck(client);

        // The engine hardcodes "Player N" — the pre-feature-010 wire body.
        expect(ack.players.map((player) => player.displayName)).toEqual(['Player 1', 'Player 2']);

        await server.close();
    });

    it('a shorter name array overlays only its indices (defensive)', async () => {
        const server = await makeServer();
        const match = scriptedMatch({ boardSize: 8, playerCount: 2, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: ['Nova'],
        });
        attachPlayersForMatch(server, match);

        const client = await connectGreeted(server);
        client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
        const ack = await nextJoinAck(client);

        expect(ack.players.map((player) => player.displayName)).toEqual(['Nova', 'Player 2']);

        await server.close();
    });
});
