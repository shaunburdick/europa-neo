/**
 * Reconnect Credential Mismatch Tests (lobby identity bound) —
 * Feature 010 (T-011)
 *
 * Pins the intersection of feature 004's reconnect contract and
 * feature 010's lobby teardown semantics: a player whose LOBBY
 * IDENTITY is bound (directed identity event delivered, opaque guest
 * id and all) disconnects mid-match, and other credentials try to
 * claim the grace-held seat.
 *
 *   - UNKNOWN token → `token_invalid`; the seat is NOT burned: the
 *     rightful owner still reclaims afterwards (lookup-before-consume);
 *   - VALID token aimed at the WRONG match → `token_mismatch`, and the
 *     binding SURVIVES for the correct retry (review S2 semantics);
 *   - EXPIRED credential (`reconnectGraceMs: 0`) → `token_expired`;
 *   - TEARDOWN: every scenario shows the close funnel invoking
 *     `connectionClosed` exactly once for the dropped connection only
 *     — the dispatcher half of "identity enters grace" (the facade's
 *     handle-reservation half is pinned by matchmaking's suites);
 *   - SECRECY: no mismatched claimant or bystander ever observes the
 *     owner's session token, snapshot, or view; the non-secret guest ID
 *     remains an identity reference, and the v1.6 delivery channel stays
 *     directed to its owner.
 *
 * Real engine sessions + real fog; mock sockets keep every path
 * synchronous and deterministic.
 */

import { describe, expect, it } from 'vitest';

import { createMatchServer } from '../../src/server';
import type { IdentityState, MatchId, SessionToken } from '../../src/types';
import type { MockWebSocket } from '../fixtures/conn';
import { BEARER_GUEST_ID, FakeLobbyService, fakeLobbySource } from '../fixtures/fakeLobbyService';
import { RecordingMatchmakerBridge } from '../fixtures/fakeMatchmakerBridge';
import {
    connectClient,
    dispatcherDeps,
    framesOfType,
    type LobbyTestServer,
    lobbyTestConfig,
    plainEnvelope,
    required,
    sendLobby,
    sendRaw,
    transportErrors,
} from '../fixtures/lobbyHarness';
import { buildIdentityState, lobbyIdentityPayload } from '../fixtures/lobbyWire';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

/** Structural slices of decoded payloads (typed narrowing). */
interface ObservedJoinAck {
    readonly sessionToken: SessionToken;
    readonly playerId: number | null;
}

/**
 * Identity state carrying the non-secret guest id. Built through a
 * runtime narrowing so the optional field is attached only when
 * present (`exactOptionalPropertyTypes` discipline).
 */
function ownerIdentityState(): IdentityState {
    const guestPlayerId = BEARER_GUEST_ID;
    return guestPlayerId === undefined ? buildIdentityState() : buildIdentityState({ guestPlayerId });
}

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

/** Gameplay join request carrying an optional reconnect credential. */
function joinMatch(socket: MockWebSocket, matchId: MatchId, reconnectToken?: SessionToken): void {
    sendRaw(
        socket,
        plainEnvelope('joinMatch', {
            matchId,
            role: 'player',
            displayName: 'Claimant',
            ...(reconnectToken === undefined ? {} : { reconnectToken }),
        }),
    );
}

interface SeatedPlayer {
    readonly socket: MockWebSocket;
    readonly connectionId: string;
    readonly sessionToken: SessionToken;
    readonly matchId: MatchId;
}

/**
 * Seat a player on `match` AND bind a lobby identity whose directed
 * confirmation carries the non-secret guest id (the v1.6 delivery
 * channel under protection here).
 *
 * @param server Target server.
 * @param fake   The wired facade recorder.
 * @param match  Registered match to join.
 * @returns The seated player's socket, connection id, token, match.
 */
function seatPlayerWithIdentity(
    server: LobbyTestServer,
    fake: FakeLobbyService,
    match: ReturnType<typeof scriptedMatch>,
): SeatedPlayer {
    // Script the directed identity event to carry the identity id BEFORE
    // the handshake so the establish push includes it.
    fake.identityToDeliver = ownerIdentityState();

    const client = connectClient(server);
    joinMatch(client.socket, match.matchId);
    const ack = required(framesOfType(client.socket, 'joinAck')[0], 'joinAck').payload as ObservedJoinAck;

    sendLobby(client.socket, 'lobbyIdentity', lobbyIdentityPayload());
    const identities = framesOfType(client.socket, 'lobbyEvent');
    expect(identities).toHaveLength(1);
    const delivered = (
        required(identities[0], 'identity event').payload as {
            readonly event: { readonly kind: string; readonly identity: IdentityState };
        }
    ).event;
    expect(delivered.kind).toBe('identity');
    expect(delivered.identity.guestPlayerId).toBe(BEARER_GUEST_ID);

    return {
        socket: client.socket,
        connectionId: client.connectionId,
        sessionToken: ack.sessionToken,
        matchId: match.matchId,
    };
}

/**
 * Build a wired server whose bridge events land on a recording
 * observer (local composition — the harness's convenience builder
 * keeps an empty bridge).
 *
 * @param fake             Lobby facade recorder.
 * @param bridge           Bridge event recorder.
 * @param reconnectGraceMs Configurable grace window.
 * @returns The composed server.
 */
function observedServer(
    fake: FakeLobbyService,
    bridge: RecordingMatchmakerBridge,
    reconnectGraceMs?: number,
): LobbyTestServer {
    return createMatchServer(
        reconnectGraceMs === undefined ? lobbyTestConfig() : lobbyTestConfig({ reconnectGraceMs }),
        {
            ...dispatcherDeps(),
            matchmaker: bridge,
            lobby: fakeLobbySource(fake),
        },
    );
}

/** Assert a claimant received none of the seat-restoring frame kinds. */
function expectNoSeatFrames(socket: MockWebSocket): void {
    expect(framesOfType(socket, 'joinAck')).toHaveLength(0);
    expect(framesOfType(socket, 'snapshot')).toHaveLength(0);
    expect(framesOfType(socket, 'tick')).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// Credential mismatch scenarios
// ---------------------------------------------------------------------------

describe('reconnect with wrong credentials while a lobby identity is bound (T-011)', () => {
    it('an unknown token is token_invalid, leaks nothing, and leaves the seat reclaimable', async () => {
        const bridge = new RecordingMatchmakerBridge();
        const fake = new FakeLobbyService();
        const server = observedServer(fake, bridge);
        const match = registerMatch(server);

        const owner = seatPlayerWithIdentity(server, fake, match);
        owner.socket.close();

        // Grace entry engaged on BOTH seams: gameplay bridge event…
        expect(bridge.seatDisconnected).toHaveLength(1);
        expect(bridge.seatDisconnected[0]?.sessionToken).toBe(owner.sessionToken);
        expect(bridge.seatDisconnected[0]?.matchId).toBe(owner.matchId);
        // …and the lobby teardown hook (identity → grace window).
        expect(fake.closedCalls).toEqual([owner.connectionId]);

        // A stranger presents a bogus credential.
        const attacker = connectClient(server);
        joinMatch(attacker.socket, owner.matchId, 'bogus-token' as SessionToken);
        const error = required(transportErrors(attacker.socket)[0], 'rejection error');
        expect(error.code).toBe('token_invalid');

        // Nothing seat-shaped was handed over…
        expectNoSeatFrames(attacker.socket);
        // …and no bearer credential is disclosed in the rejection.
        const attackerWire = attacker.socket.sentRaw.join('\n');
        expect(attackerWire).not.toContain(owner.sessionToken);

        // The failed attempt burned nothing: the rightful owner reclaims.
        const ownerReturn = connectClient(server);
        joinMatch(ownerReturn.socket, owner.matchId, owner.sessionToken);
        expect(framesOfType(ownerReturn.socket, 'snapshot')).toHaveLength(1);
        expect(bridge.seatReconnected).toHaveLength(1);
        expect(bridge.seatReconnected[0]?.sessionToken).toBe(owner.sessionToken);

        awaitClose(server);
    });

    it('a valid token aimed at the wrong match is token_mismatch and survives for the right retry', async () => {
        const bridge = new RecordingMatchmakerBridge();
        const fake = new FakeLobbyService();
        const server = observedServer(fake, bridge);
        const homeMatch = registerMatch(server);
        const decoyMatch = registerMatch(server);

        const owner = seatPlayerWithIdentity(server, fake, homeMatch);
        owner.socket.close();
        expect(fake.closedCalls).toEqual([owner.connectionId]);

        // Right token, WRONG match: rejected without consuming.
        const attacker = connectClient(server);
        joinMatch(attacker.socket, decoyMatch.matchId, owner.sessionToken);
        expect(required(transportErrors(attacker.socket)[0], 'mismatch error').code).toBe('token_mismatch');
        expectNoSeatFrames(attacker.socket);

        // The binding survived (S2): the corrected retry on the SAME
        // connection restores the seat with snapshot resync.
        joinMatch(attacker.socket, owner.matchId, owner.sessionToken);
        expect(framesOfType(attacker.socket, 'snapshot')).toHaveLength(1);
        expect(bridge.seatReconnected).toHaveLength(1);

        // Only the owner's close ever reached the teardown hook.
        expect(fake.closedCalls).toEqual([owner.connectionId]);
        // And the decoy rejection never carried the owner's bearer token.
        expect(attacker.socket.sentRaw.join('\n')).not.toContain(owner.sessionToken);

        awaitClose(server);
    });

    it('an expired credential is token_expired and cannot attach to the seat', async () => {
        const bridge = new RecordingMatchmakerBridge();
        const fake = new FakeLobbyService();
        // Zero-length grace: any post-registration lookup is expired,
        // deterministically and without clock games.
        const server = observedServer(fake, bridge, 0);
        const match = registerMatch(server);

        const owner = seatPlayerWithIdentity(server, fake, match);
        owner.socket.close();
        expect(fake.closedCalls).toEqual([owner.connectionId]);

        const latecomer = connectClient(server);
        joinMatch(latecomer.socket, owner.matchId, owner.sessionToken);
        expect(required(transportErrors(latecomer.socket)[0], 'expiry error').code).toBe('token_expired');
        expectNoSeatFrames(latecomer.socket);

        // The expiry rejection carried no session credential.
        expect(latecomer.socket.sentRaw.join('\n')).not.toContain(owner.sessionToken);
        // No forfeit has fired yet: expiry ENFORCEMENT is the scheduler's
        // sweep (onSeatExpired), which never runs in mock-socket mode.
        expect(bridge.seatExpired).toHaveLength(0);

        awaitClose(server);
    });

    it('keeps the bound identity exclusive across mismatched attempts (no cross-connection leakage)', async () => {
        const bridge = new RecordingMatchmakerBridge();
        const fake = new FakeLobbyService();
        const server = observedServer(fake, bridge);
        const match = registerMatch(server);

        const owner = seatPlayerWithIdentity(server, fake, match);
        // Pre-disconnect delivery: exactly ONE identity event, carrying
        // the id, addressed to the owner.
        expect(lobbyEventKinds(owner.socket)).toEqual(['identity']);
        owner.socket.close();

        // Two strangers fail their claims while the seat sits in grace…
        const firstAttacker = connectClient(server);
        joinMatch(firstAttacker.socket, owner.matchId, 'wrong-1' as SessionToken);
        const secondAttacker = connectClient(server);
        joinMatch(secondAttacker.socket, owner.matchId, 'wrong-2' as SessionToken);
        expect(transportErrors(firstAttacker.socket).map((error) => error.code)).toEqual(['token_invalid']);
        expect(transportErrors(secondAttacker.socket).map((error) => error.code)).toEqual(['token_invalid']);

        // …and a pure bystander watches the whole time.
        const bystander = connectClient(server);

        // NONE of them sees any lobby event or identity frame.
        for (const observer of [firstAttacker.socket, secondAttacker.socket, bystander.socket]) {
            expect(framesOfType(observer, 'lobbyEvent')).toHaveLength(0);
        }
        // The owner's own stream receives the directed identity correlation.
        expect(owner.socket.sentRaw.join('\n')).toContain(BEARER_GUEST_ID);
        expect(fake.closedCalls).toEqual([owner.connectionId]);

        awaitClose(server);
    });
});

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Lobby event kinds delivered to one socket, in order. */
function lobbyEventKinds(socket: MockWebSocket): string[] {
    return framesOfType(socket, 'lobbyEvent').map(
        (frame) => (frame.payload as { readonly event: { readonly kind: string } }).event.kind,
    );
}

/**
 * Deterministic end-of-test shutdown (the server was built directly,
 * so its close promise must be awaited to keep the suite leak-free).
 *
 * @param server Server under test.
 */
async function awaitClose(server: LobbyTestServer): Promise<void> {
    await server.close();
}
