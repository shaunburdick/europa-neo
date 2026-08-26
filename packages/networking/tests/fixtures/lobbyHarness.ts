/**
 * Lobby Dispatcher Test Harness — Feature 010 (T-011)
 *
 * Shared server/client plumbing for the Wave-3 dispatcher suites
 * (protocol validation, legacy-client compatibility, revision
 * ordering, reconnect credential mismatch, rate-limit recovery).
 * Extracted from the per-file harness pattern of
 * `server-lobby.test.ts` so the T-011 suites stay focused on their
 * assertions:
 *
 *   - {@link lobbyTestConfig} / {@link wiredLobbyServer} /
 *     {@link bareLobbyServer} — server construction over mock sockets
 *     (no TCP); the wired variant injects a {@link FakeLobbyService}
 *     through the real `ServerDeps.lobby` seam;
 *   - {@link connectClient} — mock attach + hello handshake;
 *   - raw-frame drivers ({@link sendRaw}, {@link sendJson},
 *     {@link sendLobby}) — the JSON path is how malformed and
 *     wrong-version frames actually reach the decoder;
 *   - outbound observers ({@link framesOfType}, {@link lobbyEvents},
 *     {@link transportErrors}, {@link snapshotRevisions});
 *   - {@link expectFacadeUntouched} — the nothing-was-routed guard.
 *
 * Fog is REAL (adapted to the contract's object-arg seam) so suites
 * that join matches get genuine fog-filtered views; the engine factory
 * throws because sessions are pre-built via `registerMatch`. No
 * matchmaking import — the dependency arrow points the other way.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import { computePlayerView } from '@europa/fog';
import { expect } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { encodeFrame } from '../../src/frame';
import { createMatchServer } from '../../src/server';
import type {
    ConnectionId,
    MessageKind,
    NetworkPayload,
    ProtocolEnvelope,
    SequenceNumber,
    ServerConfig,
    ServerDeps,
} from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket } from './conn';
import { type FakeLobbyService, fakeLobbySource } from './fakeLobbyService';
import { buildLobbyEnvelope, type LobbyMessageKind, type LobbyPayloadMap } from './lobbyWire';

/** The concrete server surface the suites drive (incl. test seams). */
export type LobbyTestServer = ReturnType<typeof createMatchServer>;

// ---------------------------------------------------------------------------
// Server construction
// ---------------------------------------------------------------------------

/**
 * Server config for dispatcher suites: fast ticks, ephemeral port, no
 * listener started (mock sockets only).
 *
 * @param overrides Per-suite config deltas (e.g., `reconnectGraceMs: 0`
 *                  for expired-credential scenarios).
 * @returns The merged config.
 */
export function lobbyTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return { ...NETWORK_DEFAULT_CONFIG, tickRateMs: 10, port: 0, ...overrides };
}

/**
 * Base deps for dispatcher suites: real fog (object-arg seam), a
 * throwing engine factory (sessions arrive pre-built), no-op logger.
 * Merge a `RecordingMatchmakerBridge` over `matchmaker` when a suite
 * observes bridge events.
 *
 * @returns The base deps.
 */
export function dispatcherDeps(): ServerDeps {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used by lobby dispatcher suites');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {},
        logger: NULL_LOGGER,
    };
}

/**
 * Build a server with a recording lobby facade injected through the
 * production `ServerDeps.lobby` seam.
 *
 * @param fake      The recorder the facade hands back.
 * @param overrides Optional config deltas.
 * @returns The wired server.
 */
export function wiredLobbyServer(fake: FakeLobbyService, overrides: Partial<ServerConfig> = {}): LobbyTestServer {
    return createMatchServer(lobbyTestConfig(overrides), {
        ...dispatcherDeps(),
        lobby: fakeLobbySource(fake),
    });
}

/**
 * Build a server WITHOUT a lobby source — the legacy-host shape whose
 * lobby family must answer gracefully (`internal_error`) while
 * gameplay stays intact.
 *
 * @param overrides Optional config deltas.
 * @returns The bare server.
 */
export function bareLobbyServer(overrides: Partial<ServerConfig> = {}): LobbyTestServer {
    return createMatchServer(lobbyTestConfig(overrides), dispatcherDeps());
}

// ---------------------------------------------------------------------------
// Socket injection + handshake
// ---------------------------------------------------------------------------

/**
 * Attach a mock socket through the server's test seam (same structural
 * bridge as `server.test.ts` — keeps the public `Server` surface the
 * only typed dependency).
 *
 * @param server Target server.
 * @param socket Mock socket to attach.
 */
export function injectSocket(server: LobbyTestServer, socket: MockWebSocket): void {
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
 * Build a generic inbound envelope with the next monotonic client seq.
 * Used for well-formed gameplay frames (hello, joinMatch, ping, …).
 *
 * @param type    Wire message kind.
 * @param payload The kind's payload.
 * @returns A version-stamped envelope ready for {@link sendRaw}.
 */
export function plainEnvelope(type: MessageKind, payload: NetworkPayload): ProtocolEnvelope<NetworkPayload> {
    clientSeqCounter += 1;
    return { type, version: NETWORK_API_VERSION, seq: clientSeqCounter as SequenceNumber, payload };
}

/**
 * Deliver one encoded frame to the mock's inbound side.
 *
 * @param socket   Target mock.
 * @param envelope Frame to deliver.
 */
export function sendRaw(socket: MockWebSocket, envelope: ProtocolEnvelope<NetworkPayload>): void {
    socket.receiveInbound(encodeFrame(envelope));
}

/**
 * Deliver one lobby frame (version-stamped, compile-time kind ↔ payload
 * pairing via the wire fixtures).
 *
 * @param socket  Target mock.
 * @param type    Lobby message kind.
 * @param payload The kind's payload.
 */
export function sendLobby<K extends LobbyMessageKind>(
    socket: MockWebSocket,
    type: K,
    payload: LobbyPayloadMap[K],
): void {
    sendRaw(socket, buildLobbyEnvelope(type, payload));
}

/**
 * Deliver a RAW JSON text frame — exactly what a broken, hostile, or
 * legacy client puts on the wire. This is the only honest way to test
 * schema rejection: malformed frames by definition cannot be built
 * with well-typed envelope builders.
 *
 * @param socket Target mock.
 * @param frame  Arbitrary JSON-serializable frame shape.
 */
export function sendJson(socket: MockWebSocket, frame: Record<string, unknown>): void {
    socket.receiveInbound(JSON.stringify(frame));
}

/**
 * Attach a fresh mock client and complete the hello handshake at the
 * current protocol version.
 *
 * @param server Target server.
 * @returns The socket plus the server-assigned connection id (branded
 *          so it can flow straight into facade/sink calls).
 */
export function connectClient(server: LobbyTestServer): { socket: MockWebSocket; connectionId: ConnectionId } {
    const socket = new MockWebSocket();
    injectSocket(server, socket);
    sendRaw(socket, plainEnvelope('hello', { protocolVersion: NETWORK_API_VERSION }));
    const ack = framesOfType(socket, 'helloAck')[0];
    const payload = ack?.payload as { readonly connectionId: string } | undefined;
    if (!payload) {
        throw new Error('helloAck never arrived');
    }
    return { socket, connectionId: payload.connectionId as ConnectionId };
}

// ---------------------------------------------------------------------------
// Outbound observers
// ---------------------------------------------------------------------------

/**
 * All decoded outbound frames of one kind, in send order.
 *
 * @param socket Observed mock.
 * @param type   Message kind to select.
 * @returns The matching envelopes.
 */
export function framesOfType(socket: MockWebSocket, type: MessageKind): Array<ProtocolEnvelope<NetworkPayload>> {
    return socket.sentFrames.filter((frame) => frame.type === type);
}

/** Shape of one decoded lobby event as observed on the wire. */
export type ObservedLobbyEvent = { readonly kind: string } & Record<string, unknown>;

/**
 * All lobby events delivered to the client, in send order.
 *
 * @param socket Observed mock.
 * @returns The unwrapped events.
 */
export function lobbyEvents(socket: MockWebSocket): ObservedLobbyEvent[] {
    return framesOfType(socket, 'lobbyEvent').map(
        (frame) => (frame.payload as { readonly event: ObservedLobbyEvent }).event,
    );
}

/**
 * Revisions of every snapshot event delivered to the client, in send
 * order — the stream a client's apply-only-newer gate consumes.
 *
 * @param socket Observed mock.
 * @returns The revision numbers.
 */
export function snapshotRevisions(socket: MockWebSocket): number[] {
    return lobbyEvents(socket)
        .filter((event) => event.kind === 'snapshot')
        .map((event) => (event.snapshot as { readonly revision: number }).revision);
}

/** Shape of one transport-level error payload as observed on the wire. */
export interface ObservedTransportError {
    readonly code: string;
    readonly message: string;
}

/**
 * Transport-level error frames (`type: 'error'`), in send order.
 *
 * @param socket Observed mock.
 * @returns The code/message pairs.
 */
export function transportErrors(socket: MockWebSocket): ObservedTransportError[] {
    return framesOfType(socket, 'error').map((frame) => frame.payload as ObservedTransportError);
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
export function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) {
        throw new Error(`expected ${label} to be present`);
    }
    return value;
}

/**
 * Assert a recorder saw ZERO routed calls on any facade method — the
 * shared "schema rejection happened before routing" guard.
 *
 * @param fake The recorder to inspect.
 */
export function expectFacadeUntouched(fake: FakeLobbyService): void {
    expect(fake.identityCalls).toHaveLength(0);
    expect(fake.setHandleCalls).toHaveLength(0);
    expect(fake.subscribeCalls).toHaveLength(0);
    expect(fake.createCalls).toHaveLength(0);
    expect(fake.joinCalls).toHaveLength(0);
    expect(fake.spectateCalls).toHaveLength(0);
    expect(fake.leaveCalls).toHaveLength(0);
}
