/**
 * Frame-Size Cap Integration Test — Feature 004 review fix B1
 *
 * Proves the server's `WebSocketServer` enforces
 * `NETWORK_CONSTANTS.defaultMaxFrameBytes` (16 KiB) at the TRANSPORT
 * layer: a frame larger than the cap is rejected by `ws` itself
 * (connection closed with 1009 "message too big") and never reaches
 * the protocol layer — the oversized bytes are not buffered, not
 * JSON.parsed, and not answered with any error envelope.
 *
 * Unlike every other suite (which rides the MockWebSocket injection
 * seam and therefore bypasses `WebSocketServer` entirely), this test
 * opens a REAL TCP connection against the server's bound port — which
 * is exactly where the unauthenticated-buffer DoS the review flagged
 * would live. A small control frame first proves the real-socket path
 * processes legitimate traffic normally under the cap.
 */

import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { NETWORK_API_VERSION, NETWORK_CONSTANTS } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ProtocolEnvelope, SequenceNumber, ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';

/** Real engine/fog deps (fog unused by hello traffic but required). */
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

/** Everything the probe observes on one real client socket. */
interface WireLog {
    /** Inbound text frames in arrival order. */
    readonly messages: string[];
    /** First close observation (code + reason), or null while open. */
    close: { code: number; reason: string } | null;
    /** Error events (expected: the client flags a 1009 rejection). */
    readonly errors: string[];
}

/**
 * Attach recording listeners to a client socket immediately (no event
 * can slip past between connect and assertion). The error listener is
 * mandatory, not decorative: `ws` emits an unhandled 'error' when the
 * peer closes with 1009, which would crash the run if unobserved.
 *
 * @param socket The live client socket.
 * @returns The log the listeners append to.
 */
function observe(socket: WebSocket): WireLog {
    const log: WireLog = { messages: [], close: null, errors: [] };
    socket.on('message', (data) => {
        log.messages.push(data.toString());
    });
    socket.on('close', (code, reason) => {
        log.close = { code, reason: reason.toString() };
    });
    socket.on('error', (error: Error) => {
        log.errors.push(error.message);
    });
    return log;
}

/** Build a schema-valid hello envelope with an optional padding blob. */
function helloEnvelope(padBytes: number): string {
    const envelope: ProtocolEnvelope<never> = {
        type: 'hello',
        version: NETWORK_API_VERSION,
        seq: 1 as SequenceNumber,
        payload: {
            protocolVersion: NETWORK_API_VERSION,
            // Padding rides the optional cosmetic clientInfo field so the
            // frame stays a VALID hello — proving rejection is purely
            // size-based, not schema-based.
            clientInfo: padBytes > 0 ? { name: 'a'.repeat(padBytes) } : undefined,
        },
    };
    return JSON.stringify(envelope);
}

describe('B1: WebSocketServer maxPayload frame cap', () => {
    it('closes a real connection with 1009 on an oversized frame and never processes its payload', {
        timeout: 10_000,
    }, async () => {
        const server = createMatchServer(
            // Loopback bind + ephemeral port: this suite is the one place a
            // REAL TCP connection is required (the mock seam bypasses
            // WebSocketServer, which is exactly the layer under test).
            { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0 },
            realDeps(),
        );
        await server.listen();
        try {
            const port = server.__boundPortForTest();
            expect(port).toBeDefined();

            const socket = new WebSocket(`ws://127.0.0.1:${String(port)}`);
            const log = observe(socket);
            await waitForCondition(() => socket.readyState === WebSocket.OPEN);

            // Control: a small, valid hello IS processed over the same
            // capped transport (the cap does not break legitimate traffic).
            socket.send(helloEnvelope(0));
            await waitForCondition(() => log.messages.length === 1);
            expect(JSON.parse(log.messages[0] ?? '')).toMatchObject({ type: 'helloAck' });

            // Oversized valid hello: one byte past the documented cap.
            socket.send(helloEnvelope(NETWORK_CONSTANTS.defaultMaxFrameBytes));

            // The transport itself rejects it: closed with 1009…
            await waitForCondition(() => log.close !== null);
            expect(log.close?.code).toBe(1009);

            // …and the protocol layer NEVER saw the payload: no
            // malformed_payload/error reply, no second helloAck — the only
            // frame ever received is the control helloAck above.
            expect(log.messages).toHaveLength(1);

            // The client observed a clean transport close: no error event of
            // its own. (The oversized-frame error fires on the SERVER-side
            // socket; the server observes + logs it instead of leaving an
            // unhandled 'error' event that would crash the process.)
            expect(log.errors).toEqual([]);

            socket.terminate();
        } finally {
            await server.close();
        }
    });
});
