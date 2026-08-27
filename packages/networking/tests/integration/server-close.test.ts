/**
 * Server-Close Drain Integration Test — Feature 010 defect fix (T-013 finding)
 *
 * Pins the contract's close() lifecycle clause (network-api `Server`
 * doc, step 4): "closes ALL connections with code 1001 ('going
 * away')" — match-bound AND lobby-only alike.
 *
 * The defect: `server.close()` swept only match-channel connections;
 * a lobby-only client (identity established, subscribed, never joined
 * a match) was silently dropped from the tracking map with its socket
 * still open. Upgraded WebSockets stay in the HTTP server's connection
 * count until they close, so one such socket held the
 * `httpServer.close()` callback open forever — observed live as a
 * lobby client sitting 'ready' on a zombie socket through a
 * kill+reboot.
 *
 * Like `frame-cap.test.ts`, this suite opens REAL TCP connections
 * against the server's bound port — the mock-injection seam bypasses
 * both `WebSocketServer` and the HTTP listener entirely, which is
 * exactly where this defect lived. Three scenarios:
 *
 *   1. LOBBY-ONLY: identity + subscription, no match → 1001 close,
 *      `connectionClosed` teardown fires per normal-close semantics,
 *      and `server.close()` completes (no zombie holds it open).
 *   2. MIXED: a live seat PLUS lobby activity on one connection →
 *      unchanged match-channel semantics (1001 'server going away',
 *      seat released WITHOUT the reconnect-reclaim bridge call, since
 *      a server-initiated close is not a transport loss) and the lobby
 *      teardown still fires for the same connection id.
 *   3. MATCH-ONLY control: no lobby facade wired at all → the
 *      historical behavior is untouched.
 */

import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { NETWORK_API_VERSION, NETWORK_TRANSPORT_CONSTANTS } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type {
    ConnectionId,
    MessageKind,
    NetworkPayload,
    ProtocolEnvelope,
    SequenceNumber,
    ServerDeps,
} from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { FakeLobbyService, fakeLobbySource } from '../fixtures/fakeLobbyService';
import { nextLobbyActionId } from '../fixtures/lobbyWire';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { TEST_TICK_MS } from './harness';

/** Real engine/fog deps (fog unused by hello/join traffic but required). */
function realDeps(): ServerDeps {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used by fixtures (sessions are pre-built)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId }) => ({
                player: playerId,
                tick: world.tick,
                visibleCells: [],
            }),
        },
        matchmaker: {},
        logger: NULL_LOGGER,
    };
}

/** Small sleep helper for bounded waits. */
function waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll a predicate until true or the deadline elapses. */
async function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error('waitForCondition: timed out');
        }
        await waitFor(5);
    }
}

/** Narrow an optional value or fail loudly with a label. */
function required<T>(value: T | undefined | null, label: string): T {
    if (value === undefined || value === null) {
        throw new Error(`expected ${label} to be present`);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Real-socket client driver
// ---------------------------------------------------------------------------

/** One client-side observation of the transport close. */
interface CloseObservation {
    readonly code: number;
    readonly reason: string;
}

/**
 * A real `ws` client speaking the protocol against the server's bound
 * port. Mirrors `ScriptedClient`'s cursor-based `nextMessage` polling,
 * minus the mock seam: frames travel over actual TCP, so every wait is
 * a poll condition (no sleeps racing the wire).
 */
class RealSocketClient {
    readonly socket: WebSocket;

    /** First close observation (code + reason), or null while open. */
    closeObservation: CloseObservation | null = null;

    private readonly frames: ProtocolEnvelope<NetworkPayload>[] = [];
    private readCursor = 0;
    private clientSeq = 0;

    /**
     * Open the connection and attach recording listeners immediately,
     * so no event can slip past between connect and assertion. The
     * error listener is mandatory: an unhandled 'error' on a WebSocket
     * crashes the process.
     *
     * @param port The server's bound port.
     */
    constructor(port: number) {
        this.socket = new WebSocket(`ws://127.0.0.1:${String(port)}`);
        this.socket.on('message', (data) => {
            const parsed: unknown = JSON.parse(data.toString());
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                this.frames.push(parsed as ProtocolEnvelope<NetworkPayload>);
            }
        });
        this.socket.on('close', (code, reason) => {
            this.closeObservation = { code, reason: reason.toString() };
        });
        this.socket.on('error', () => {
            // Observed and ignored: the suites only exercise clean
            // closes; the listener exists so the event is never
            // unhandled.
        });
    }

    /** Resolve once the transport is open. */
    async awaitOpen(): Promise<void> {
        await waitForCondition(() => this.socket.readyState === WebSocket.OPEN);
    }

    /**
     * Build, stamp, and transmit one envelope of the given kind.
     *
     * @param type    Wire message kind.
     * @param payload One of the protocol payloads.
     */
    send(type: MessageKind, payload: NetworkPayload): void {
        this.clientSeq += 1;
        const envelope: ProtocolEnvelope<NetworkPayload> = {
            type,
            version: NETWORK_API_VERSION,
            seq: this.clientSeq as SequenceNumber,
            payload,
        };
        this.socket.send(JSON.stringify(envelope));
    }

    /**
     * Await the next inbound frame of the given kind (cursor-based:
     * frames already consumed by earlier calls are never replayed).
     *
     * @param type      Message kind to wait for.
     * @param timeoutMs Max wall-clock ms to wait.
     * @returns The matching envelope.
     */
    async nextMessage(type: MessageKind, timeoutMs = 2000): Promise<ProtocolEnvelope<NetworkPayload>> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            while (this.readCursor < this.frames.length) {
                const frame = this.frames[this.readCursor];
                this.readCursor += 1;
                if (frame?.type === type) {
                    return frame;
                }
            }
            if (Date.now() >= deadline) {
                throw new Error(`RealSocketClient.nextMessage: timed out waiting for ${type}`);
            }
            await waitFor(5);
        }
    }
}

/**
 * Drive one client through hello and return it plus its server-
 * assigned connection id.
 *
 * @param port The server's bound port.
 * @returns The connected, greeted client and its connection id.
 */
async function connectAndGreet(port: number): Promise<{ client: RealSocketClient; connectionId: ConnectionId }> {
    const client = new RealSocketClient(port);
    await client.awaitOpen();
    client.send('hello', { protocolVersion: NETWORK_API_VERSION });
    const ack = await client.nextMessage('helloAck');
    const payload = ack.payload as { readonly connectionId: ConnectionId };
    return { client, connectionId: required(payload.connectionId, 'helloAck.connectionId') };
}

/**
 * Establish lobby identity and subscription on an already-greeted
 * client (the "lobby-only" state from the defect report: known to the
 * lobby, never joined to a match). Asserts the directed confirmations
 * so a routing regression fails here, not downstream.
 *
 * @param client The greeted client.
 */
async function establishLobbyPresence(client: RealSocketClient): Promise<void> {
    client.send('lobbyIdentity', {});
    const identityEvent = await client.nextMessage('lobbyEvent');
    expect((identityEvent.payload as { readonly event: { readonly kind: string } }).event.kind).toBe('identity');
    client.send('lobbySubscribe', { actionId: nextLobbyActionId() });
    const snapshotEvent = await client.nextMessage('lobbyEvent');
    expect((snapshotEvent.payload as { readonly event: { readonly kind: string } }).event.kind).toBe('snapshot');
}

/**
 * Post-close assertions shared by every scenario: the client saw the
 * contractual going-away close, its socket is fully CLOSED (no
 * zombie), and the server drained — `close()` resolved, which only
 * happens once `httpServer.close()`'s callback fires, which only
 * happens when NO upgraded socket is left open.
 *
 * @param client The drained client.
 */
async function assertGoingAwayDrain(client: RealSocketClient): Promise<void> {
    await waitForCondition(() => client.closeObservation !== null);
    expect(client.closeObservation?.code).toBe(NETWORK_TRANSPORT_CONSTANTS.goingAwayCloseCode);
    expect(client.closeObservation?.reason).toBe('server going away');
    expect(client.socket.readyState).toBe(WebSocket.CLOSED);
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe('server.close() drains every tracked connection (feature 010 defect)', () => {
    it('closes a lobby-only connection with 1001, fires its lobby teardown, and leaves no zombie socket', {
        timeout: 10_000,
    }, async () => {
        const fake = new FakeLobbyService();
        const server = createMatchServer(
            { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0 },
            { ...realDeps(), lobby: fakeLobbySource(fake) },
        );
        await server.listen();
        try {
            const port = server.__boundPortForTest();
            expect(port).toBeDefined();

            const { client, connectionId } = await connectAndGreet(required(port, 'bound port'));
            await establishLobbyPresence(client);

            // Sanity: the lobby-only state from the defect report is
            // genuinely established BEFORE the close under test.
            expect(fake.identityCalls).toHaveLength(1);
            expect(fake.subscribeCalls).toHaveLength(1);
            expect(fake.closedCalls).toHaveLength(0);

            // THE FIX UNDER TEST: must not hang on the lobby socket.
            await server.close();

            await assertGoingAwayDrain(client);

            // Lobby teardown fired per normal-close semantics — exactly
            // once, for exactly this connection.
            expect(fake.closedCalls).toEqual([connectionId]);

            // The close() promise resolved AND the post-close state is
            // consistent: nothing held httpServer.close() open.
            expect(server.__boundPortForTest()).toBeUndefined();
        } finally {
            await server.close(); // idempotent safety net for failed asserts
        }
    });

    it('preserves match-channel semantics for a mixed client (live seat + lobby activity)', {
        timeout: 10_000,
    }, async () => {
        const fake = new FakeLobbyService();
        let seatDisconnectedCalls = 0;
        const deps: ServerDeps = {
            ...realDeps(),
            matchmaker: {
                onSeatDisconnected: () => {
                    seatDisconnectedCalls += 1;
                },
            },
            lobby: fakeLobbySource(fake),
        };
        const server = createMatchServer(
            { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0, tickRateMs: TEST_TICK_MS },
            deps,
        );
        await server.listen();
        try {
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });
            const tokens = attachPlayersForMatch(server, match);

            const port = server.__boundPortForTest();
            expect(port).toBeDefined();
            const { client, connectionId } = await connectAndGreet(required(port, 'bound port'));

            // Join seat 1 over the real wire…
            client.send('joinMatch', {
                matchId: match.matchId,
                role: 'player',
                displayName: 'Nova',
                requestedSeat: 1,
            });
            const joinAck = await client.nextMessage('joinAck');
            expect(joinAck.payload).toMatchObject({ playerId: 1, sessionToken: tokens[0] });

            // …then layer lobby activity on TOP of the live seat (the
            // mixed state: matchId bound AND lobby presence).
            await establishLobbyPresence(client);
            expect(fake.closedCalls).toHaveLength(0);

            await server.close();

            // Existing match-channel semantics, now over a real socket:
            // 1001 + reason, full drain.
            await assertGoingAwayDrain(client);

            // Lobby teardown fired for the mixed connection too.
            expect(fake.closedCalls).toEqual([connectionId]);

            // A server-initiated close is NOT a transport loss: the
            // connection is 'closed' (not 'disconnected'), so no
            // reconnect binding is registered and the matchmaker bridge
            // never sees a seat disconnect.
            expect(seatDisconnectedCalls).toBe(0);

            expect(server.__boundPortForTest()).toBeUndefined();
        } finally {
            await server.close();
        }
    });

    it('keeps the historical match-only behavior: 1001 drain with no lobby facade wired', {
        timeout: 10_000,
    }, async () => {
        const server = createMatchServer(
            { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0, tickRateMs: TEST_TICK_MS },
            realDeps(),
        );
        await server.listen();
        try {
            const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });
            attachPlayersForMatch(server, match);

            const port = server.__boundPortForTest();
            expect(port).toBeDefined();
            const { client } = await connectAndGreet(required(port, 'bound port'));

            client.send('joinMatch', {
                matchId: match.matchId,
                role: 'player',
                displayName: 'Alpha',
                requestedSeat: 1,
            });
            await client.nextMessage('joinAck');

            await server.close();
            await assertGoingAwayDrain(client);
            expect(server.__boundPortForTest()).toBeUndefined();
        } finally {
            await server.close();
        }
    });
});
