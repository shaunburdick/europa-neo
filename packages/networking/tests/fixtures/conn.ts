/**
 * Mock WebSocket + Scripted Client Fixtures — Feature 004
 *
 * Test-only transport doubles. `MockWebSocket` mirrors the small
 * slice of the `ws` `WebSocket` surface the networking layer uses
 * (`send`, `close`, `on('message'|'close')`) without opening a real
 * TCP port: tests drive inbound frames via `receiveInbound(text)` and
 * observe outbound frames in `sentFrames` / `sentRaw`.
 *
 * `ScriptedClient` is an end-to-end driver over a `MockWebSocket`
 * that issues well-formed envelope sequences (`hello` → `joinMatch`
 * → `order` → `ping`) with per-client monotonic sequence numbers, and
 * awaits replies by message kind (`nextMessage`). US1's integration
 * tests will drive it against the real server; because it speaks
 * plain envelopes into the mock, it works unchanged against either
 * an injected-connection seam or a live port.
 *
 * **Wave 6B note**: tasks.md T019 describes `ScriptedClient` as using
 * "the `Connection` API" — that class lands with US1 (T025). The
 * client is therefore implemented directly over the mock's ws-like
 * surface here; when `Connection` exists, only its constructor wiring
 * changes, not its call sites.
 */

import { EventEmitter } from 'node:events';

import type { Order } from '@europa/engine';
import { NETWORK_API_VERSION } from '../../src/constants';
import { encodeFrame, tryDecodeFrame } from '../../src/frame';
import type {
    ConnectionRole,
    MatchId,
    MessageKind,
    NetworkPayload,
    ProtocolEnvelope,
    SequenceNumber,
    SessionToken,
} from '../../src/types';

// ----------------------------------------------------------------------------
// MockWebSocket
// ----------------------------------------------------------------------------

/** Recorded payload of one `close()` call. */
export interface CloseRecord {
    readonly code: number;
    readonly reason: string;
}

/** Handler signature for inbound `message` events. */
export type MessageHandler = (data: string) => void;

/** Handler signature for `close` events. */
export type CloseHandler = (code: number, reason: string) => void;

/**
 * In-memory WebSocket double. Directional conventions:
 *
 *   - `send(data)`      — outbound (what this end transmits). Every
 *     call is recorded raw; valid envelopes are also decoded into
 *     `sentFrames`. Invalid JSON is recorded raw only — mirroring
 *     `ws`, which transmits bytes regardless of protocol validity.
 *   - `receiveInbound`  — test-side driver for inbound frames;
 *     emits `'message'` exactly like a real socket would.
 *   - `close(code)`     — records the close and emits `'close'`.
 *     Idempotent (second close is a no-op), like `ws`.
 */
export class MockWebSocket {
    private readonly events = new EventEmitter();

    /** Raw outbound frames in send order. */
    readonly sentRaw: string[] = [];
    /** Decoded outbound envelopes in send order (valid frames only). */
    readonly sentFrames: ProtocolEnvelope<NetworkPayload>[] = [];
    /** Recorded close calls (at most one entry — close is idempotent). */
    readonly closes: CloseRecord[] = [];
    /** Recorded transport errors (emitted only when a test drives them). */
    readonly errors: Error[] = [];
    /** Whether the socket is open. Flips false on first `close()`. */
    isOpen = true;

    /**
     * Queue an outbound frame. Mirrors `ws.WebSocket.send(data)`.
     *
     * @param data The serialized frame text.
     * @throws If the socket has been closed.
     */
    send(data: string): void {
        if (!this.isOpen) {
            throw new Error('MockWebSocket.send: socket is closed');
        }
        this.sentRaw.push(data);
        const decoded = tryDecodeFrame(data);
        if (decoded.ok) {
            this.sentFrames.push(decoded.envelope);
        }
    }

    /**
     * Close the socket. Records `{ code, reason }` once, flips
     * `isOpen`, and emits `'close'`. Further sends throw; further
     * closes are no-ops.
     *
     * @param code   WebSocket close code. Default `1000` (normal).
     * @param reason Human-readable close reason.
     */
    close(code = 1000, reason = ''): void {
        if (!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.closes.push({ code, reason });
        this.events.emit('close', code, reason);
    }

    /**
     * Subscribe to socket events (ws-like surface).
     *
     * @overload on(event: 'message', handler: MessageHandler): this
     * @overload on(event: 'close', handler: CloseHandler): this
     * @overload on(event: 'error', handler: (error: Error) => void): this
     *
     * @param event   Event name.
     * @param handler Callback.
     * @returns This socket (chainable).
     */
    on(event: 'message', handler: MessageHandler): this;
    on(event: 'close', handler: CloseHandler): this;
    on(event: 'error', handler: (error: Error) => void): this;
    on(event: string, handler: (...args: unknown[]) => void): this {
        this.events.on(event, handler);
        return this;
    }

    /**
     * Unsubscribe a previously-registered handler.
     *
     * @param event   Event name.
     * @param handler The exact handler reference passed to {@link on}.
     * @returns This socket (chainable).
     */
    off(event: string, handler: (...args: unknown[]) => void): this {
        this.events.off(event, handler);
        return this;
    }

    /**
     * Test-side driver: deliver an inbound frame as if it arrived from
     * the peer. Emits `'message'` synchronously.
     *
     * @param text The raw frame text.
     */
    receiveInbound(text: string): void {
        this.events.emit('message', text);
    }
}

// ----------------------------------------------------------------------------
// ScriptedClient
// ----------------------------------------------------------------------------

/** Small sleep helper for the polling loop in `nextMessage`. */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * End-to-end driver over a {@link MockWebSocket}: builds correct
 * envelopes (version-stamped, monotonic `clientSeq`), injects them
 * into the mock's inbound side, and awaits outbound frames by kind.
 */
export class ScriptedClient {
    private clientSeq = 0;
    private readCursor = 0;

    /**
     * @param socket The mock this client speaks through.
     */
    constructor(readonly socket: MockWebSocket) {}

    /** Next per-client sequence number (starts at 1). */
    private nextSeq(): SequenceNumber {
        this.clientSeq += 1;
        return this.clientSeq as SequenceNumber;
    }

    /**
     * Build, stamp, and transmit an envelope of the given kind.
     */
    private put(type: MessageKind, payload: NetworkPayload): ProtocolEnvelope<NetworkPayload> {
        const envelope: ProtocolEnvelope<NetworkPayload> = {
            type,
            version: NETWORK_API_VERSION,
            seq: this.nextSeq(),
            payload,
        };
        this.socket.receiveInbound(encodeFrame(envelope));
        return envelope;
    }

    /**
     * Send the initial handshake.
     *
     * @param protocolVersion Version to claim. Defaults to the current
     *                        `NETWORK_API_VERSION`; pass a drifted
     *                        version to test FR-004 rejection paths.
     */
    hello(protocolVersion: string = NETWORK_API_VERSION): ProtocolEnvelope<NetworkPayload> {
        return this.put('hello', { protocolVersion });
    }

    /**
     * Request a seat (or spectator attach).
     *
     * @param matchId Target match.
     * @param role    Player or spectator. Default `'player'`.
     * @param opts    Optional reconnect token, requested seat, and
     *                display name (default `'Player'`).
     */
    joinMatch(
        matchId: MatchId,
        role: ConnectionRole = 'player',
        opts: {
            readonly reconnectToken?: SessionToken;
            readonly requestedSeat?: number;
            readonly displayName?: string;
        } = {},
    ): ProtocolEnvelope<NetworkPayload> {
        const payload: {
            readonly matchId: MatchId;
            readonly role: ConnectionRole;
            readonly displayName: string;
            readonly reconnectToken?: SessionToken;
            readonly requestedSeat?: number;
        } = {
            matchId,
            role,
            displayName: opts.displayName ?? 'Player',
        };
        if (opts.reconnectToken !== undefined) {
            payload.reconnectToken = opts.reconnectToken;
        }
        if (opts.requestedSeat !== undefined) {
            payload.requestedSeat = opts.requestedSeat;
        }
        return this.put('joinMatch', payload);
    }

    /**
     * Submit an engine order for the claimed seat.
     */
    order(order: Order): ProtocolEnvelope<NetworkPayload> {
        return this.put('order', { order });
    }

    /**
     * Send a heartbeat ping.
     *
     * @param clientTimeMs Sender wall-clock ms (informational only).
     */
    ping(clientTimeMs = 0): ProtocolEnvelope<NetworkPayload> {
        return this.put('ping', { clientTimeMs });
    }

    /**
     * Await the next outbound frame, optionally filtered by message
     * kind. Frames already observed by earlier `nextMessage` calls are
     * never replayed (per-client read cursor).
     *
     * @param type      Message kind to wait for; omit for any frame.
     * @param timeoutMs Max wall-clock ms to wait. Default `1000`.
     * @returns The matching envelope.
     * @throws If the deadline elapses before a matching frame arrives.
     */
    async nextMessage(type?: MessageKind, timeoutMs = 1000): Promise<ProtocolEnvelope<NetworkPayload>> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            while (this.readCursor < this.socket.sentFrames.length) {
                const frame = this.socket.sentFrames[this.readCursor];
                this.readCursor += 1;
                if (frame && (type === undefined || frame.type === type)) {
                    return frame;
                }
            }
            if (Date.now() >= deadline) {
                throw new Error(
                    `ScriptedClient.nextMessage: timed out after ${String(timeoutMs)}ms waiting for ${type ?? 'any message'}`,
                );
            }
            await sleep(5);
        }
    }
}
