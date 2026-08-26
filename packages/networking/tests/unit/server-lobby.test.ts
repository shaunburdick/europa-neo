/**
 * Lobby Dispatcher Unit Tests — Feature 010 (T-010)
 *
 * Pins the server-side lobby wiring over mock sockets (no TCP):
 *
 *   - ROUTING: every additive `lobby*` kind reaches the injected
 *     facade with correctly-typed arguments;
 *   - CORRELATION: responses echo the request's `actionId` exactly
 *     once, on the matching response only (audit item 6);
 *   - ERROR MAPPING: facade failures become actionable `error` lobby
 *     events with verbatim code/message/detail pass-through;
 *   - TEARDOWN: `connectionClosed` fires on every close path BEFORE
 *     the match-id early return (audit item 1 — a lobby-only
 *     connection has no matchId);
 *   - RATE LIMITING: dedicated per-connection lobby bucket trips on
 *     floods while normal cadence flows (audit item 7);
 *   - DIRECTED DELIVERY: identity events reach unsubscribed
 *     connections through THE one projection sink (audit item 8);
 *   - F-4 REGRESSION: the default arm's diagnostics are
 *     direction-aware;
 *   - SECRECY: the bearer-secret guest id never appears in any
 *     outbound frame (audit item 5);
 *   - PRESERVATION: heartbeat and protocol behavior are untouched.
 *
 * Uses the recording facade fixture (`fakeLobbyService.ts`) and the
 * wire builders (`lobbyWire.ts`) — no matchmaking import (the
 * dependency arrow points the other way).
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { encodeFrame } from '../../src/frame';
import { createMatchServer } from '../../src/server';
import type {
    IdentityState,
    LobbySnapshot,
    MessageKind,
    NetworkPayload,
    ProtocolEnvelope,
    SequenceNumber,
} from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import {
    BEARER_GUEST_ID,
    FakeLobbyService,
    fakeLobbySource,
    lobbyFailure,
    matchTarget,
} from '../fixtures/fakeLobbyService';
import {
    buildIdentityClaim,
    buildLobbyEntry,
    buildLobbyEnvelope,
    buildLobbySnapshot,
    lobbyCreatePayload,
    lobbyIdentityPayload,
    lobbyJoinPayload,
    lobbyLeavePayload,
    lobbySetHandlePayload,
    lobbySpectatePayload,
    lobbySubscribePayload,
} from '../fixtures/lobbyWire';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Server config: fast ticks + ephemeral port (no listener needed). */
function testConfig(): Parameters<typeof createMatchServer>[0] {
    return { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 10, port: 0 };
}

/** Minimal deps; the lobby source is merged in per suite. */
function baseDeps(): Parameters<typeof createMatchServer>[1] {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used by lobby dispatcher suites');
            },
        },
        fog: {
            computePlayerView: () => {
                throw new Error('fog not used by lobby dispatcher suites');
            },
        },
        matchmaker: {},
        logger: NULL_LOGGER,
    };
}

/**
 * Structural bridge to the server's mock-injection seam (same pattern
 * as server.test.ts — keeps the public `Server` surface the only typed
 * dependency).
 */
function injectSocket(server: ReturnType<typeof createMatchServer>, socket: MockWebSocket): void {
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

/** Monotonic client sequence behind {@link plainEnvelope}. */
let clientSeqCounter = 0;

/**
 * Build a generic (non-lobby) inbound envelope — used for hello, ping,
 * and deliberately misdirected server→client kinds.
 */
function plainEnvelope(type: MessageKind, payload: NetworkPayload): ProtocolEnvelope<NetworkPayload> {
    clientSeqCounter += 1;
    return { type, version: NETWORK_API_VERSION, seq: clientSeqCounter as SequenceNumber, payload };
}

/** Deliver one raw frame to the mock's inbound side. */
function sendRaw(socket: MockWebSocket, envelope: ProtocolEnvelope<NetworkPayload>): void {
    socket.receiveInbound(encodeFrame(envelope));
}

/** Deliver one lobby frame (version-stamped via the wire fixtures). */
function sendLobby(
    socket: MockWebSocket,
    type: Parameters<typeof buildLobbyEnvelope>[0],
    payload: Parameters<typeof buildLobbyEnvelope>[1],
): void {
    sendRaw(socket, buildLobbyEnvelope(type, payload));
}

/**
 * Attach a fresh mock client and complete the hello handshake.
 *
 * @returns The socket plus the server-assigned connection id.
 */
function connectClient(server: ReturnType<typeof createMatchServer>): { socket: MockWebSocket; connectionId: string } {
    const socket = new MockWebSocket();
    injectSocket(server, socket);
    sendRaw(socket, plainEnvelope('hello', { protocolVersion: NETWORK_API_VERSION }));
    const ack = socket.sentFrames.find((frame) => frame.type === 'helloAck');
    if (!ack) {
        throw new Error('helloAck never arrived');
    }
    const payload = ack.payload as { readonly connectionId: string };
    return { socket, connectionId: payload.connectionId };
}

/** All lobby events delivered to the client, in send order. */
function lobbyEvents(socket: MockWebSocket): Array<{ readonly kind: string } & Record<string, unknown>> {
    return socket.sentFrames
        .filter((frame) => frame.type === 'lobbyEvent')
        .map(
            (frame) => (frame.payload as { readonly event: { readonly kind: string } & Record<string, unknown> }).event,
        );
}

/** Transport-level error frames (`type: 'error'`), in send order. */
function transportErrors(socket: MockWebSocket): Array<{ readonly code: string; readonly message: string }> {
    return socket.sentFrames
        .filter((frame) => frame.type === 'error')
        .map((frame) => frame.payload as { readonly code: string; readonly message: string });
}

/** Build a server wired to a fresh recorder. */
function lobbyServer(fake: FakeLobbyService): ReturnType<typeof createMatchServer> {
    return createMatchServer(testConfig(), { ...baseDeps(), lobby: fakeLobbySource(fake) });
}

/**
 * Narrow an optional value or fail loudly with a label (keeps
 * assertions free of unsafe optional chaining while producing readable
 * failures).
 *
 * @param value Possibly-absent value.
 * @param label What was expected (for the failure message).
 * @returns The value, guaranteed present.
 */
function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) {
        throw new Error(`expected ${label} to be present`);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe('lobby dispatcher routing (T-010)', () => {
    it('routes every lobby kind to the facade with correctly-typed args', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        const claim = buildIdentityClaim();
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload({ claim }));
        sendLobby(socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));
        sendLobby(socket, 'lobbySubscribe', lobbySubscribePayload());
        sendLobby(socket, 'lobbyCreate', lobbyCreatePayload());
        sendLobby(socket, 'lobbyJoin', lobbyJoinPayload('match-wire-0001' as never));
        sendLobby(socket, 'lobbySpectate', lobbySpectatePayload('match-wire-0001' as never));
        sendLobby(socket, 'lobbyLeave', lobbyLeavePayload());

        expect(fake.identityCalls).toHaveLength(1);
        expect(fake.identityCalls[0]?.claim).toEqual(claim);
        expect(fake.identityCalls[0]?.connectionId).toBe(connectionId);
        expect(fake.setHandleCalls[0]?.handle).toBe('Nova');
        expect(fake.subscribeCalls).toHaveLength(1);
        expect(fake.createCalls).toHaveLength(1);
        expect(fake.joinCalls[0]?.matchId).toBe('match-wire-0001');
        expect(fake.spectateCalls[0]?.matchId).toBe('match-wire-0001');
        expect(fake.leaveCalls).toHaveLength(1);
        // Every routed call carried the requesting connection's id.
        expect(fake.setHandleCalls[0]?.connectionId).toBe(connectionId);
        expect(fake.joinCalls[0]?.connectionId).toBe(connectionId);
    });

    it('invokes the factory lazily, exactly once (memoized)', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        // Connect + close WITHOUT lobby traffic: factory must stay cold.
        const cold = connectClient(server);
        cold.socket.close();
        expect(fake.factoryInvocations).toBe(0);

        const { socket } = connectClient(server);
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        expect(fake.factoryInvocations).toBe(1);
        expect(fake.identityCalls).toHaveLength(2);
    });

    it('answers lobby frames gracefully when no lobby is wired, leaving gameplay intact', async () => {
        const server = createMatchServer(testConfig(), baseDeps());
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        const errors = transportErrors(socket);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe('internal_error');

        // The connection stays open and the heartbeat path still works.
        sendRaw(socket, plainEnvelope('ping', { clientTimeMs: 42 }));
        const pong = socket.sentFrames.find((frame) => frame.type === 'pong');
        expect((required(pong, 'pong').payload as { readonly clientTimeMs: number }).clientTimeMs).toBe(42);
    });
});

// ---------------------------------------------------------------------------
// Correlation + response shaping
// ---------------------------------------------------------------------------

describe('lobby response correlation (audit items 2, 6, 8)', () => {
    it('confirms setHandle via the DIRECTED identity event alone (no actionAccepted)', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));

        const events = lobbyEvents(socket);
        expect(events).toHaveLength(2);
        expect(events[0]?.kind).toBe('identity');
        expect(events[1]?.kind).toBe('identity');
        expect(events.some((event) => event.kind === 'actionAccepted')).toBe(false);
    });

    it('frames the subscribe baseline snapshot verbatim', () => {
        const fake = new FakeLobbyService();
        const row = buildLobbyEntry();
        const baseline: LobbySnapshot = buildLobbySnapshot({
            revision: 7 as LobbySnapshot['revision'],
            entries: [row],
        });
        fake.subscribeOutcome = { ok: true, data: baseline };
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySubscribe', lobbySubscribePayload());

        const snapshots = lobbyEvents(socket).filter((event) => event.kind === 'snapshot');
        expect(snapshots).toHaveLength(1);
        const delivered = required(snapshots[0], 'snapshot event').snapshot as LobbySnapshot;
        expect(delivered.revision).toBe(7);
        expect(delivered.entries).toEqual([row]);
    });

    it('acks create with actionAccepted + waiting transition, echoing the request actionId', () => {
        const fake = new FakeLobbyService();
        fake.createOutcome = { ok: true, data: matchTarget('match-created' as never) };
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        const actionId = 31337;
        sendLobby(socket, 'lobbyCreate', lobbyCreatePayload({ actionId: actionId as never }));

        const accepted = lobbyEvents(socket).find((event) => event.kind === 'actionAccepted');
        expect(accepted?.actionId).toBe(actionId);
        expect(accepted?.transition).toBe('waiting');
    });

    it('derives the join transition from the facade-delivered snapshot (auto-start → match)', () => {
        const fake = new FakeLobbyService();
        fake.joinOutcome = { ok: true, data: matchTarget('match-join' as never, 1) };
        fake.joinPush = buildLobbySnapshot({
            entries: [buildLobbyEntry({ matchId: 'match-join' as never, status: 'in_progress' })],
        });
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbyJoin', lobbyJoinPayload('match-join' as never));

        const accepted = lobbyEvents(socket).filter((event) => event.kind === 'actionAccepted');
        expect(accepted).toHaveLength(1);
        expect(accepted[0]?.transition).toBe('match');
    });

    it('keeps the join transition waiting when the row is still filling or nothing was peeked', () => {
        const fake = new FakeLobbyService();
        fake.joinOutcome = { ok: true, data: matchTarget('match-join' as never, 0) };
        fake.joinPush = buildLobbySnapshot({
            entries: [buildLobbyEntry({ matchId: 'match-join' as never, status: 'waiting' })],
        });
        const server = lobbyServer(fake);
        const subscribed = connectClient(server);
        sendLobby(subscribed.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(subscribed.socket, 'lobbyJoin', lobbyJoinPayload('match-join' as never));
        expect(lobbyEvents(subscribed.socket).filter((event) => event.kind === 'actionAccepted')[0]?.transition).toBe(
            'waiting',
        );

        // Unsubscribed actor: no broadcast reaches it during join, so
        // the honest hint is the neutral 'waiting'.
        const quiet = new FakeLobbyService();
        quiet.joinOutcome = { ok: true, data: matchTarget('match-join' as never, 1) };
        quiet.joinPush = null;
        const server2 = lobbyServer(quiet);
        const unsubscribed = connectClient(server2);
        sendLobby(unsubscribed.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(unsubscribed.socket, 'lobbyJoin', lobbyJoinPayload('match-join' as never));
        expect(lobbyEvents(unsubscribed.socket).filter((event) => event.kind === 'actionAccepted')[0]?.transition).toBe(
            'waiting',
        );
    });

    it('acks spectate with match and leave with the documented neutral transition', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySpectate', lobbySpectatePayload('match-running' as never));
        sendLobby(socket, 'lobbyLeave', lobbyLeavePayload());

        const accepted = lobbyEvents(socket).filter((event) => event.kind === 'actionAccepted');
        expect(accepted).toHaveLength(2);
        expect(accepted[0]?.transition).toBe('match');
        // Ruling: the closed transition union has no "back to lobby"
        // arm; leave confirmations carry the neutral value and clients
        // correlate by actionId.
        expect(accepted[1]?.transition).toBe('waiting');
    });

    it('maps facade failures to error events with verbatim code/message/detail + actionId', () => {
        const fake = new FakeLobbyService();
        fake.setHandleOutcome = {
            ok: false,
            error: lobbyFailure('handle_taken', 'That handle is already in use.', { normalized: 'nova' }),
        };
        fake.joinOutcome = { ok: false, error: lobbyFailure('match_full', 'The final open seat was just claimed.') };
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySetHandle', lobbySetHandlePayload('Nova', 9001 as never));
        sendLobby(socket, 'lobbyJoin', lobbyJoinPayload('match-full' as never, 9002 as never));

        const errors = lobbyEvents(socket).filter((event) => event.kind === 'error');
        expect(errors).toHaveLength(2);
        expect(errors[0]?.actionId).toBe(9001);
        expect(errors[0]?.code).toBe('handle_taken');
        expect(errors[0]?.message).toBe('That handle is already in use.');
        expect(errors[0]?.detail).toEqual({ normalized: 'nova' });
        // Absent detail stays absent (exactOptionalPropertyTypes wire
        // discipline — clients tolerate absence).
        expect(errors[1]?.actionId).toBe(9002);
        expect(errors[1]?.code).toBe('match_full');
        expect('detail' in errors[1]).toBe(false);
    });

    it('survives a throwing facade: internal_error reply, connection stays open', () => {
        const fake = new FakeLobbyService();
        fake.throwOnSetHandle = true;
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe('internal_error');
        // The connection still speaks protocol afterwards.
        sendRaw(socket, plainEnvelope('ping', { clientTimeMs: 7 }));
        expect(socket.sentFrames.some((frame) => frame.type === 'pong')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Teardown + directed delivery
// ---------------------------------------------------------------------------

describe('lobby teardown + directed delivery (audit items 1, 8)', () => {
    it('calls connectionClosed on transport close — even for lobby-only connections', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        expect(fake.closedCalls).toHaveLength(0);

        socket.close();
        expect(fake.closedCalls).toEqual([connectionId]);
    });

    it('calls connectionClosed on the server-initiated close path too', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        // Policy-violation hello forces a server-initiated close
        // (1008) — the OTHER entry into the shared disconnect funnel.
        sendRaw(socket, plainEnvelope('hello', { protocolVersion: '9.0.0' }));
        expect(fake.closedCalls).toEqual([connectionId]);
    });

    it('delivers directed identity events to connections that never subscribed', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        // Establish identity but NEVER subscribe…
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        expect(lobbyEvents(socket)).toHaveLength(1);

        // …then simulate a later facade-directed push (e.g., a rename
        // confirmation arriving out-of-band). It MUST reach the wire.
        const renamed: IdentityState = Object.freeze({ handle: 'Renamed', hasIdentity: true });
        fake.push(connectionId as never, { kind: 'identity', identity: renamed });

        const events = lobbyEvents(socket);
        expect(events).toHaveLength(2);
        expect(events[1]?.kind).toBe('identity');
        expect((required(events[1], 'directed identity event').identity as IdentityState).handle).toBe('Renamed');
    });

    it('drops sink deliveries addressed to unknown or closed connections without throwing', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket, connectionId } = connectClient(server);
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());

        expect(() =>
            fake.push('conn-does-not-exist' as never, { kind: 'identity', identity: fake.identityToDeliver }),
        ).not.toThrow();

        socket.close();
        expect(() =>
            fake.push(connectionId as never, { kind: 'identity', identity: fake.identityToDeliver }),
        ).not.toThrow();
        expect(lobbyEvents(socket)).toHaveLength(1); // nothing new was framed
    });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('lobby rate limiting (audit item 7)', () => {
    it('trips on an identity flood while the normal cadence flows untouched', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);

        // Flood: bucket capacity = 20/s × 2.0 burst = 40 tokens.
        const flooded = connectClient(server);
        for (let i = 0; i < 60; i++) {
            sendLobby(flooded.socket, 'lobbyIdentity', lobbyIdentityPayload());
        }
        const limited = transportErrors(flooded.socket).filter((error) => error.code === 'rate_limited');
        expect(limited.length).toBeGreaterThanOrEqual(3);
        // Rejected frames never reached the facade (each unknown claim
        // would otherwise mint a registry identity server-side).
        expect(fake.identityCalls.length).toBeLessThanOrEqual(40);
        expect(fake.identityCalls.length + limited.length).toBe(60);
        // Rate-limited connections stay open (policy mirrors FR-010).
        expect(flooded.socket.isOpen).toBe(true);

        // Normal cadence: a fresh client's first messages all route.
        const calm = connectClient(server);
        for (let i = 0; i < 3; i++) {
            sendLobby(calm.socket, 'lobbyIdentity', lobbyIdentityPayload());
        }
        expect(transportErrors(calm.socket)).toHaveLength(0);
        expect(fake.identityCalls.length).toBeLessThanOrEqual(43);
    });
});

// ---------------------------------------------------------------------------
// Default-arm direction awareness (F-4 regression pin)
// ---------------------------------------------------------------------------

describe('dispatcher default arm direction diagnostics (F-4)', () => {
    it('keeps the server-to-client wording for upstream-sent server frames', () => {
        const fake = new FakeLobbyService();
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        // Schema-VALID payloads for the misdirected kinds — the point is
        // the dispatcher's default arm, not schema rejection.
        const misdirected: Array<[MessageKind, NetworkPayload]> = [
            ['tick', { tick: 1, view: {} }],
            ['helloAck', { protocolVersion: 'x', connectionId: 'c', heartbeatIntervalMs: 1 }],
            ['terminal', { result: {} }],
        ];
        for (const [kind, payload] of misdirected) {
            sendRaw(socket, plainEnvelope(kind, payload));
        }
        const errors = transportErrors(socket);
        expect(errors).toHaveLength(3);
        for (const error of errors) {
            expect(error.code).toBe('protocol_sequence_error');
            expect(error.message).toContain('is a server-to-client message');
        }
        // The lobby facade saw none of this.
        expect(fake.identityCalls).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Secrecy (audit item 5)
// ---------------------------------------------------------------------------

describe('guest id secrecy', () => {
    it('never echoes the bearer-secret guest id in any outbound frame', () => {
        const fake = new FakeLobbyService();
        fake.setHandleOutcome = { ok: false, error: lobbyFailure('handle_invalid', 'bad handle') };
        const server = lobbyServer(fake);
        const { socket } = connectClient(server);

        // Full flow INCLUDING a claim carrying the secret and failing actions.
        sendLobby(
            socket,
            'lobbyIdentity',
            lobbyIdentityPayload({ claim: buildIdentityClaim({ guestPlayerId: BEARER_GUEST_ID }) }),
        );
        sendLobby(socket, 'lobbySetHandle', lobbySetHandlePayload('x', 1 as never));
        socket.close();

        const outbound = socket.sentRaw.join('\n');
        expect(outbound).not.toContain(BEARER_GUEST_ID);
        // Input direction reached the facade intact (the ONLY place the
        // id may travel).
        expect(fake.identityCalls[0]?.claim?.guestPlayerId).toBe(BEARER_GUEST_ID);
    });
});
