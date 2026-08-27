/**
 * Lobby Protocol Validation & Error Tests — Feature 010 (T-011)
 *
 * Pins the dispatcher's ADVERSARIAL half — everything
 * `server-lobby.test.ts` deliberately does not do (that suite drives
 * only well-formed frames):
 *
 *   - SCHEMA: every client→server lobby kind is rejected cleanly when a
 *     required payload field is missing, wrong-typed, or null
 *     (`malformed_payload` naming the field per the PAYLOAD_FIELDS
 *     table in `src/validate.ts`); rejections never reach the facade;
 *     the connection survives and keeps speaking protocol;
 *   - TOLERANCE: optional-field absence AND unknown extra fields are
 *     admitted (the additive wire tolerance lobby-wire.md normatively
 *     requires);
 *   - VERSION POLICY (FR-004): an old-boundary client sending lobby
 *     frames gets `version_mismatch` + close 1008 BEFORE any routing
 *     (the facade is never even constructed), while same-boundary
 *     patch drift is accepted gracefully;
 *   - UNKNOWN KINDS: the existing unknown-message policy holds in the
 *     lobby era — including future `lobby*`-prefixed kinds, which must
 *     degrade to `unknown_message_kind`, not crash or misroute;
 *   - F-4 COMPLEMENT: the remaining server→client kinds sent upstream
 *     keep the historical "is a server-to-client message" wording
 *     (T-010 pinned tick/helloAck/terminal; this adds joinAck,
 *     snapshot, orderAck, pong, error, and the lobby-era `lobbyEvent`),
 *     and client→server lobby kinds NEVER produce that misdiagnosis.
 *
 * Malformed frames travel as raw JSON (`sendJson`) because malformed
 * frames by definition cannot be built with well-typed builders — the
 * wire is where they actually arrive.
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import type { MatchId } from '../../src/types';
import { FakeLobbyService } from '../fixtures/fakeLobbyService';
import {
    bareLobbyServer,
    connectClient,
    expectFacadeUntouched,
    framesOfType,
    lobbyEvents,
    plainEnvelope,
    required,
    sendJson,
    sendLobby,
    sendRaw,
    transportErrors,
    wiredLobbyServer,
} from '../fixtures/lobbyHarness';
import {
    lobbyCreatePayload,
    lobbyIdentityPayload,
    lobbyJoinPayload,
    lobbyLeavePayload,
    lobbySetHandlePayload,
    lobbySpectatePayload,
    lobbySubscribePayload,
} from '../fixtures/lobbyWire';

/** A branded stand-in match id for join/spectate requests. */
const TARGET_MATCH_ID: MatchId = 'match-target' as MatchId;

// ---------------------------------------------------------------------------
// Schema validation matrix
// ---------------------------------------------------------------------------

/**
 * One row per schema violation: [kind, broken payload, exact rejection
 * fragment from `src/validate.ts`]. Covers missing, wrong-typed, and
 * null required fields for all six kinds that DECLARE required fields
 * (`lobbyIdentity` declares none — its absence rows would test
 * nothing).
 */
const MALFORMED_LOBBY_FRAMES: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
    // lobbySetHandle requires handle: string + actionId: number
    ['lobbySetHandle', { actionId: 1 }, 'payload.handle is required'],
    ['lobbySetHandle', { handle: 'Nova' }, 'payload.actionId is required'],
    ['lobbySetHandle', { handle: 7, actionId: 1 }, 'payload.handle must be a string'],
    ['lobbySetHandle', { handle: 'Nova', actionId: '1' }, 'payload.actionId must be a number'],
    ['lobbySetHandle', { handle: null, actionId: 1 }, 'payload.handle must not be null'],
    // lobbySubscribe requires actionId: number
    ['lobbySubscribe', {}, 'payload.actionId is required'],
    ['lobbySubscribe', { actionId: 'soon' }, 'payload.actionId must be a number'],
    ['lobbySubscribe', { actionId: null }, 'payload.actionId must not be null'],
    // lobbyCreate requires actionId: number
    ['lobbyCreate', {}, 'payload.actionId is required'],
    ['lobbyCreate', { actionId: false }, 'payload.actionId must be a number'],
    // lobbyJoin requires actionId: number + matchId: string
    ['lobbyJoin', { matchId: 'match-1' }, 'payload.actionId is required'],
    ['lobbyJoin', { actionId: 1 }, 'payload.matchId is required'],
    ['lobbyJoin', { actionId: 1, matchId: 99 }, 'payload.matchId must be a string'],
    // lobbySpectate requires actionId: number + matchId: string
    ['lobbySpectate', { actionId: 1 }, 'payload.matchId is required'],
    ['lobbySpectate', { matchId: 'match-1' }, 'payload.actionId is required'],
    ['lobbySpectate', { actionId: 1, matchId: null }, 'payload.matchId must not be null'],
    // lobbyLeave requires actionId: number
    ['lobbyLeave', {}, 'payload.actionId is required'],
];

describe('lobby payload schema validation (T-011)', () => {
    for (const [kind, payload, expectedFragment] of MALFORMED_LOBBY_FRAMES) {
        it(`rejects ${kind}: ${expectedFragment}`, () => {
            const fake = new FakeLobbyService();
            const server = wiredLobbyServer(fake);
            const { socket } = connectClient(server);

            sendJson(socket, { type: kind, version: NETWORK_API_VERSION, seq: 1, payload });

            const errors = transportErrors(socket);
            expect(errors).toHaveLength(1);
            expect(errors[0]?.code).toBe('malformed_payload');
            expect(errors[0]?.message).toContain(expectedFragment);
            expect(errors[0]?.message).toContain(kind);
            // The rejection happened at the schema gate: nothing routed.
            expectFacadeUntouched(fake);
            // Rejections never close a healthy connection.
            expect(socket.isOpen).toBe(true);
        });
    }

    it('keeps the connection fully usable after a burst of malformed lobby frames', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        sendJson(socket, { type: 'lobbySubscribe', version: NETWORK_API_VERSION, seq: 1, payload: {} });
        sendJson(socket, { type: 'lobbyLeave', version: NETWORK_API_VERSION, seq: 2, payload: { actionId: 'x' } });
        sendJson(socket, { type: 'lobbyJoin', version: NETWORK_API_VERSION, seq: 3, payload: { actionId: 1 } });
        expect(transportErrors(socket)).toHaveLength(3);

        // The socket is unpoisoned: a well-formed frame still routes…
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        expect(fake.identityCalls).toHaveLength(1);
        // …and the heartbeat path still answers.
        sendRaw(socket, plainEnvelope('ping', { clientTimeMs: 42 }));
        const pong = required(framesOfType(socket, 'pong')[0], 'pong');
        expect((pong.payload as { readonly clientTimeMs: number }).clientTimeMs).toBe(42);
    });

    it('admits absent optional fields and unknown extra fields on lobby frames (additive tolerance)', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        // lobbyIdentity's ONLY field is optional; an unknown extra field
        // must be tolerated so newer clients stay compatible.
        sendJson(socket, {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { futureField: 'ignored-by-this-server' },
        });
        // Same tolerance for a kind WITH required fields.
        sendJson(socket, {
            type: 'lobbySetHandle',
            version: NETWORK_API_VERSION,
            seq: 2,
            payload: { handle: 'Nova', actionId: 7, clientHint: true },
        });

        expect(transportErrors(socket)).toHaveLength(0);
        expect(fake.identityCalls).toHaveLength(1);
        expect(fake.setHandleCalls).toHaveLength(1);
        expect(fake.setHandleCalls[0]?.handle).toBe('Nova');
    });

    it('rejects envelope-shape violations on lobby kinds without routing them', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);
        const base = { type: 'lobbyIdentity', version: NETWORK_API_VERSION, payload: {} };

        sendJson(socket, { ...base, seq: 0 }); // seq below the uint32 floor
        sendJson(socket, { ...base, seq: 1.5 }); // non-integer seq
        sendJson(socket, { ...base, seq: 2, version: '' }); // empty version string
        sendJson(socket, { type: 'lobbyIdentity', version: NETWORK_API_VERSION, seq: 3, payload: [] }); // array payload

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(4);
        for (const error of errors) {
            expect(error.code).toBe('malformed_payload');
        }
        expectFacadeUntouched(fake);
        expect(socket.isOpen).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Version policy for lobby frames (FR-004)
// ---------------------------------------------------------------------------

describe('version policy for lobby frames (FR-004)', () => {
    it('an old-boundary client sending lobbyIdentity gets version_mismatch + close 1008 before any routing', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        // Schema-valid lobby frame, wrong breaking boundary ('0.0' ≠ '0.1'
        // under pre-1.0 semver). The gate fires BEFORE the dispatcher.
        sendJson(socket, { type: 'lobbyIdentity', version: '0.0.9', seq: 1, payload: {} });

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe('version_mismatch');
        expect(errors[0]?.message).toContain('unsupported protocol version');
        // Policy drift closes the connection with 1008 (FR-004).
        expect(socket.closes).toEqual([{ code: 1008, reason: 'policy violation' }]);
        // The facade was never even constructed — let alone called.
        expect(fake.factoryInvocations).toBe(0);
        expectFacadeUntouched(fake);
    });

    it('same-boundary patch drift on lobby frames is accepted gracefully', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        // '0.1.99' shares the '0.1' boundary with NETWORK_API_VERSION:
        // graceful acceptance, full routing.
        sendJson(socket, {
            type: 'lobbySubscribe',
            version: '0.1.99',
            seq: 1,
            payload: { actionId: 5 },
        });

        expect(transportErrors(socket)).toHaveLength(0);
        expect(fake.subscribeCalls).toHaveLength(1);
        // The baseline snapshot reply still arrives.
        expect(lobbyEvents(socket).filter((event) => event.kind === 'snapshot')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Unknown / malformed frames in the lobby era
// ---------------------------------------------------------------------------

describe('unknown-message policy in the lobby era (T-011)', () => {
    it('unknown kinds get unknown_message_kind and stay open — including future lobby-prefixed kinds', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        sendJson(socket, { type: 'gossip', version: NETWORK_API_VERSION, seq: 1, payload: {} });
        // A FUTURE additive lobby kind this server predates: same polite
        // policy — never a crash, never a misroute into the facade.
        sendJson(socket, { type: 'lobbyHorizon', version: NETWORK_API_VERSION, seq: 2, payload: {} });

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(2);
        expect(errors[0]?.code).toBe('unknown_message_kind');
        expect(errors[1]?.code).toBe('unknown_message_kind');
        expectFacadeUntouched(fake);
        expect(socket.isOpen).toBe(true);

        // The connection keeps working: the next valid frame routes.
        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        expect(fake.identityCalls).toHaveLength(1);
    });

    it('non-JSON garbage is malformed_payload and leaves the connection usable', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        socket.receiveInbound('this is not json');
        socket.receiveInbound('[1, 2, 3]'); // valid JSON, not an envelope object

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(2);
        expect(errors[0]?.code).toBe('malformed_payload');
        expect(errors[1]?.code).toBe('malformed_payload');
        expect(socket.isOpen).toBe(true);

        sendRaw(socket, plainEnvelope('ping', { clientTimeMs: 9 }));
        expect(framesOfType(socket, 'pong')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Direction-aware unrouted diagnostics (F-4 complement)
// ---------------------------------------------------------------------------

describe('dispatcher default-arm direction diagnostics (F-4 complement)', () => {
    it('every remaining server-to-client kind sent upstream keeps the historical wording', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        // Schema-valid payloads for the misdirected kinds — the point is
        // the default arm's wording, not schema rejection. T-010 pinned
        // tick/helloAck/terminal; these are the six remaining kinds,
        // including the lobby-era lobbyEvent push frame.
        const misdirected: Array<[string, Record<string, unknown>]> = [
            ['joinAck', { sessionToken: 't', playerId: 1, view: {}, tick: 0, players: [] }],
            ['snapshot', { tick: 1, view: {} }],
            ['orderAck', { seq: 1, result: { ok: true } }],
            ['pong', { clientTimeMs: 1, serverTimeMs: 2 }],
            ['error', { code: 'rate_limited', message: 'x' }],
            ['lobbyEvent', { event: { kind: 'identity', identity: { handle: null, hasIdentity: true } } }],
        ];
        let seq = 1;
        for (const [kind, payload] of misdirected) {
            sendJson(socket, { type: kind, version: NETWORK_API_VERSION, seq: seq++, payload });
        }

        const errors = transportErrors(socket);
        expect(errors).toHaveLength(misdirected.length);
        for (const error of errors) {
            expect(error.code).toBe('protocol_sequence_error');
            expect(error.message).toContain('is a server-to-client message');
        }
        // The lobby facade saw none of this.
        expectFacadeUntouched(fake);
    });

    it('client-to-server lobby kinds never produce the server-to-client misdiagnosis', () => {
        // (a) On a legacy host (no lobby wired) each kind earns the honest
        //     unavailable-lobby error — never a direction lie.
        const bare = bareLobbyServer();
        const legacy = connectClient(bare);
        sendLobby(legacy.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(legacy.socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));
        sendLobby(legacy.socket, 'lobbySubscribe', lobbySubscribePayload());
        sendLobby(legacy.socket, 'lobbyCreate', lobbyCreatePayload());
        sendLobby(legacy.socket, 'lobbyJoin', lobbyJoinPayload(TARGET_MATCH_ID));
        sendLobby(legacy.socket, 'lobbySpectate', lobbySpectatePayload(TARGET_MATCH_ID));
        sendLobby(legacy.socket, 'lobbyLeave', lobbyLeavePayload());
        const bareErrors = transportErrors(legacy.socket);
        expect(bareErrors).toHaveLength(7);
        for (const error of bareErrors) {
            expect(error.code).toBe('internal_error');
            expect(error.message).not.toContain('server-to-client');
            expect(error.message).not.toContain('not routed');
        }

        // (b) On a wired host every kind routes silently: zero transport
        //     errors of any kind.
        const fake = new FakeLobbyService();
        const wired = wiredLobbyServer(fake);
        const modern = connectClient(wired);
        sendLobby(modern.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(modern.socket, 'lobbySetHandle', lobbySetHandlePayload('Nova'));
        sendLobby(modern.socket, 'lobbySubscribe', lobbySubscribePayload());
        sendLobby(modern.socket, 'lobbyCreate', lobbyCreatePayload());
        sendLobby(modern.socket, 'lobbyJoin', lobbyJoinPayload(TARGET_MATCH_ID));
        sendLobby(modern.socket, 'lobbySpectate', lobbySpectatePayload(TARGET_MATCH_ID));
        sendLobby(modern.socket, 'lobbyLeave', lobbyLeavePayload());
        expect(transportErrors(modern.socket)).toHaveLength(0);
        // Every request earned exactly its documented response event:
        // identity ×2 (establish + rename confirm), snapshot baseline,
        // and four actionAccepted acks.
        const events = lobbyEvents(modern.socket);
        expect(events.map((event) => event.kind)).toEqual([
            'identity',
            'identity',
            'snapshot',
            'actionAccepted',
            'actionAccepted',
            'actionAccepted',
            'actionAccepted',
        ]);
    });
});
