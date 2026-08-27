/**
 * Old Gameplay-Client Compatibility Tests — Feature 010 (T-011)
 *
 * Pins NFR-004 at the dispatcher boundary: the additive lobby family
 * must be INVISIBLE to clients that never speak it, and a lobby-era
 * client may mix both families on one socket.
 *
 *   - LEGACY CLIENT: a gameplay-only client on a LOBBY-WIRED server
 *     gets the complete pre-lobby flow - hello/joinAck (seat + token +
 *     fog view), accepted orders, ping/pong - with zero lobby frames
 *     on its wire and the facade factory never invoked (cold wiring);
 *   - LEGACY RECONNECT: drop, reclaim with the session token, snapshot
 *     resync works exactly as feature 004 shipped it, with the lobby
 *     teardown hook firing invisibly alongside;
 *   - ISOLATION: another connection's lobby activity never leaks into
 *     a legacy client's stream;
 *   - MIXED CLIENT: identity/handle/subscribe frames interleave with
 *     joinMatch/ping/order on ONE socket - every response arrives, in
 *     order, correctly correlated, and gameplay authority (order
 *     acceptance, token reclaim) is unaffected by lobby usage.
 *
 * Real engine sessions (`scriptedMatch`) + real fog so joinAck views
 * are genuine; mock sockets keep everything synchronous and
 * deterministic.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../src/types';
import type { MockWebSocket } from '../fixtures/conn';
import { FakeLobbyService } from '../fixtures/fakeLobbyService';
import {
    connectClient,
    framesOfType,
    type LobbyTestServer,
    lobbyEvents,
    plainEnvelope,
    required,
    sendLobby,
    sendRaw,
    snapshotRevisions,
    transportErrors,
    wiredLobbyServer,
} from '../fixtures/lobbyHarness';
import {
    buildIdentityState,
    buildLobbySnapshot,
    lobbyIdentityPayload,
    lobbySetHandlePayload,
    lobbySubscribePayload,
} from '../fixtures/lobbyWire';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

// ---------------------------------------------------------------------------
// Shared scenario helpers
// ---------------------------------------------------------------------------

/** Register a small deterministic match with pre-bound seats. */
function registerMatch(server: LobbyTestServer): ReturnType<typeof scriptedMatch> {
    const match = scriptedMatch({ boardSize: 8, tickRateMs: 10 });
    server.registerMatch({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);
    return match;
}

/** Gameplay join request for a seat (lowest open when no seat given). */
function joinMatch(socket: MockWebSocket, matchId: MatchId, requestedSeat?: number): void {
    sendRaw(
        socket,
        plainEnvelope('joinMatch', {
            matchId,
            role: 'player',
            displayName: 'Legacy',
            ...(requestedSeat === undefined ? {} : { requestedSeat }),
        }),
    );
}

/** Structural slice of a decoded joinAck payload (typed narrowing). */
interface ObservedJoinAck {
    readonly sessionToken: SessionToken;
    readonly playerId: number | null;
    readonly tick: number;
    readonly players: ReadonlyArray<unknown>;
}

/** Extract THE joinAck from a socket's outbound stream. */
function joinAckOf(socket: MockWebSocket): ObservedJoinAck {
    const frame = required(framesOfType(socket, 'joinAck')[0], 'joinAck');
    return frame.payload as ObservedJoinAck;
}

/** Structural slice of a decoded snapshot payload (typed narrowing). */
interface ObservedSnapshot {
    readonly tick: number;
}

/** Extract THE reconnect snapshot from a socket's outbound stream. */
function snapshotOf(socket: MockWebSocket): ObservedSnapshot {
    const frame = required(framesOfType(socket, 'snapshot')[0], 'snapshot');
    return frame.payload as ObservedSnapshot;
}

// ---------------------------------------------------------------------------
// Legacy client (never sends lobby frames)
// ---------------------------------------------------------------------------

describe('legacy gameplay client on a lobby-wired server (NFR-004)', () => {
    it('gets the full pre-lobby flow with zero lobby traffic and a cold facade', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const match = registerMatch(server);

        const legacy = connectClient(server);
        joinMatch(legacy.socket, match.matchId, 1);

        // Seat claim: exactly the feature-004 ack shape.
        const ack = joinAckOf(legacy.socket);
        expect(ack.playerId).toBe(1);
        expect(ack.sessionToken.length).toBeGreaterThan(0);
        expect(ack.players).toHaveLength(2);
        expect(ack.tick).toBe(0);

        // Orders still accepted into the pipeline (synchronous gate).
        const before = server.stats().totalOrdersAccepted;
        sendRaw(legacy.socket, plainEnvelope('order', { order: { kind: 'surrender', player: 1 } }));
        expect(server.stats().totalOrdersAccepted).toBe(before + 1);

        // Heartbeat unchanged.
        sendRaw(legacy.socket, plainEnvelope('ping', { clientTimeMs: 123 }));
        const pong = required(framesOfType(legacy.socket, 'pong')[0], 'pong');
        expect((pong.payload as { readonly clientTimeMs: number }).clientTimeMs).toBe(123);

        // The lobby wiring is INVISIBLE: no lobby frames on this wire…
        expect(framesOfType(legacy.socket, 'lobbyEvent')).toHaveLength(0);
        expect(transportErrors(legacy.socket)).toHaveLength(0);
        // …and the facade was never constructed, let alone called.
        expect(fake.factoryInvocations).toBe(0);
        expect(fake.identityCalls).toHaveLength(0);
    });

    it('never observes another connection lobby activity (stream isolation)', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const match = registerMatch(server);

        const legacy = connectClient(server);
        joinMatch(legacy.socket, match.matchId, 1);
        joinAckOf(legacy.socket); // drain the joinAck

        // A neighbor does loud lobby business on the same server.
        const neighbor = connectClient(server);
        sendLobby(neighbor.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(neighbor.socket, 'lobbySubscribe', lobbySubscribePayload());
        fake.push(neighbor.connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot() });

        // The legacy stream gained NOTHING lobby-shaped.
        expect(framesOfType(legacy.socket, 'lobbyEvent')).toHaveLength(0);
        expect(legacy.socket.sentRaw.join('\n')).not.toContain('lobbyEvent');
        expect(legacy.socket.isOpen).toBe(true);
    });

    it('reconnects through the untouched feature-004 path while lobby teardown fires invisibly', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const match = registerMatch(server);
        const owner = connectClient(server);
        joinMatch(owner.socket, match.matchId, 1);
        const { sessionToken } = joinAckOf(owner.socket);
        const ownerConnectionId = (
            required(framesOfType(owner.socket, 'helloAck')[0], 'helloAck').payload as {
                readonly connectionId: string;
            }
        ).connectionId;

        // A lobby-era client materializes the (lazy) facade BEFORE the
        // transport loss, so the teardown hook is live when the owner
        // drops. The legacy flow itself ran untouched either way.
        const lobbyUser = connectClient(server);
        sendLobby(lobbyUser.socket, 'lobbyIdentity', lobbyIdentityPayload());

        // Transport loss mid-match.
        owner.socket.close();

        // Fresh connection reclaims the seat with the token: snapshot
        // resync, same player id - the shipped US2 behavior.
        const rejoiner = connectClient(server);
        sendRaw(
            rejoiner.socket,
            plainEnvelope('joinMatch', {
                matchId: match.matchId,
                role: 'player',
                displayName: 'Legacy',
                reconnectToken: sessionToken,
            }),
        );
        expect(snapshotOf(rejoiner.socket).tick).toBe(0);
        expect(framesOfType(rejoiner.socket, 'joinAck')).toHaveLength(0);

        // Lobby teardown rode along invisibly: the close funnel invoked
        // connectionClosed for the dropped connection only - NOT for the
        // still-open lobby user or the rejoiner.
        expect(fake.closedCalls).toEqual([ownerConnectionId]);
        // And neither wire ever carried lobby frames.
        expect(framesOfType(owner.socket, 'lobbyEvent')).toHaveLength(0);
        expect(framesOfType(rejoiner.socket, 'lobbyEvent')).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Mixed lobby + gameplay on one socket
// ---------------------------------------------------------------------------

describe('mixed lobby-era client (both families on one socket)', () => {
    it('interleaves identity/handle/subscribe with join/ping/order, every reply in order', () => {
        const fake = new FakeLobbyService();
        // Script a distinctive directed identity so the mixed stream can
        // be asserted content-wise, not just kind-wise.
        fake.identityToDeliver = buildIdentityState({ handle: 'Nova' });
        const server = wiredLobbyServer(fake);
        const match = registerMatch(server);

        const client = connectClient(server);
        sendLobby(client.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(client.socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));
        joinMatch(client.socket, match.matchId, 2);
        sendLobby(client.socket, 'lobbySubscribe', lobbySubscribePayload());
        sendRaw(client.socket, plainEnvelope('ping', { clientTimeMs: 55 }));

        // Exact outbound frame-type sequence: every family answered, in
        // request order, nothing coalesced or dropped.
        expect(client.socket.sentFrames.map((frame) => frame.type)).toEqual([
            'helloAck',
            'lobbyEvent',
            'lobbyEvent',
            'joinAck',
            'lobbyEvent',
            'pong',
        ]);

        // Content spot-checks per family.
        const identities = lobbyEvents(client.socket).filter((event) => event.kind === 'identity');
        expect(identities).toHaveLength(2);
        const snapshots = lobbyEvents(client.socket).filter((event) => event.kind === 'snapshot');
        expect(snapshots).toHaveLength(1);
        const ack = joinAckOf(client.socket);
        expect(ack.playerId).toBe(2);

        // Gameplay authority intact after lobby usage: the order gate
        // accepts (its bucket is independent of the lobby bucket).
        const before = server.stats().totalOrdersAccepted;
        sendRaw(client.socket, plainEnvelope('order', { order: { kind: 'surrender', player: 2 } }));
        expect(server.stats().totalOrdersAccepted).toBe(before + 1);
        expect(transportErrors(client.socket)).toHaveLength(0);
    });

    it('reclaims its seat with the gameplay token after heavy lobby activity', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const match = registerMatch(server);

        const first = connectClient(server);
        sendLobby(first.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(first.socket, 'lobbySubscribe', lobbySubscribePayload());
        joinMatch(first.socket, match.matchId, 1);
        const { sessionToken } = joinAckOf(first.socket);
        expect(snapshotRevisions(first.socket)).toEqual([7]); // scripted baseline

        first.socket.close();

        const second = connectClient(server);
        sendRaw(
            second.socket,
            plainEnvelope('joinMatch', {
                matchId: match.matchId,
                role: 'player',
                displayName: 'Mixed',
                reconnectToken: sessionToken,
            }),
        );
        expect(snapshotOf(second.socket).tick).toBe(0);
        // The reclaiming connection is addressed by NO lobby event.
        expect(framesOfType(second.socket, 'lobbyEvent')).toHaveLength(0);
    });
});
