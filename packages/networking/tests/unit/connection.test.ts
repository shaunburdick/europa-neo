/**
 * Connection Unit Tests — Feature 004 US1 (T021)
 *
 * Covers FR-001 (envelope framing), FR-002 (per-connection sequence
 * numbers + heartbeat timestamps), FR-004 (version major-mismatch →
 * error + close 1008), FR-008 (protocol-level error routing: malformed
 * JSON and unknown message kinds reply `error` and stay open).
 */

import { describe, expect, it } from 'vitest';
import { Connection } from '../../src/connection';
import { NETWORK_API_VERSION } from '../../src/constants';
import { encodeFrame } from '../../src/frame';
import { toBranded } from '../../src/ids';
import type {
  MatchId,
  NetworkPayload,
  PlayerId,
  ProtocolEnvelope,
  SequenceNumber,
  SessionToken,
} from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';

/** Build a well-formed outbound envelope with a placeholder seq. */
function envelopeOf(
  type: ProtocolEnvelope<NetworkPayload>['type'],
  payload: NetworkPayload,
): ProtocolEnvelope<NetworkPayload> {
  return { type, version: NETWORK_API_VERSION, seq: 0 as SequenceNumber, payload };
}

describe('Connection', () => {
  it('send-then-recv round-trip preserves envelope shape byte-for-byte', () => {
    const socket = new MockWebSocket();
    const conn = new Connection({
      socket,
      role: 'player',
      nowMs: 1_000,
    });

    const original = envelopeOf('helloAck', {
      protocolVersion: NETWORK_API_VERSION,
      connectionId: conn.id,
      heartbeatIntervalMs: 5_000,
    });
    conn.send(original, 1_001);

    expect(socket.sentRaw).toHaveLength(1);
    const raw = socket.sentRaw[0] ?? '';
    // Byte-for-byte: re-encoding the decoded frame reproduces the wire text.
    const decoded = JSON.parse(raw) as ProtocolEnvelope<NetworkPayload>;
    expect(JSON.stringify(decoded)).toBe(raw);
    expect(decoded.type).toBe('helloAck');
    expect(decoded.version).toBe(NETWORK_API_VERSION);
    expect(decoded.payload).toEqual(original.payload);
  });

  it('multiple send calls increment serverSeq monotonically from 1', () => {
    const socket = new MockWebSocket();
    const conn = new Connection({ socket, role: 'player', nowMs: 0 });

    conn.send(envelopeOf('pong', { clientTimeMs: 1, serverTimeMs: 1 }), 1);
    conn.send(envelopeOf('pong', { clientTimeMs: 2, serverTimeMs: 2 }), 2);
    conn.send(envelopeOf('pong', { clientTimeMs: 3, serverTimeMs: 3 }), 3);

    const seqs = socket.sentFrames.map((frame) => frame.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('receiving an envelope with a major-version drift replies version_mismatch and closes with 1008', () => {
    const socket = new MockWebSocket();
    let sawError = false;
    const conn = new Connection({
      socket,
      role: 'player',
      nowMs: 0,
      onEnvelope: () => {
        sawError = true;
      },
    });

    socket.receiveInbound(
      encodeFrame({
        type: 'ping',
        version: '0.2.0',
        seq: 1 as SequenceNumber,
        payload: { clientTimeMs: 0 },
      }),
    );

    expect(sawError).toBe(false);
    const errorFrame = socket.sentFrames.find((frame) => frame.type === 'error');
    expect(errorFrame).toBeDefined();
    expect(errorFrame?.payload).toMatchObject({ code: 'version_mismatch' });
    expect(socket.closes).toEqual([{ code: 1008, reason: 'policy violation' }]);
    expect(conn.state()).toBe('closed');
  });

  it('receiving a non-JSON string replies malformed_payload and stays open', () => {
    const socket = new MockWebSocket();
    const conn = new Connection({ socket, role: 'player', nowMs: 0 });

    socket.receiveInbound('this is not json');

    const errorFrame = socket.sentFrames.find((frame) => frame.type === 'error');
    expect(errorFrame).toBeDefined();
    expect(errorFrame?.payload).toMatchObject({ code: 'malformed_payload' });
    expect(socket.closes).toHaveLength(0);
    expect(conn.state()).toBe('pending');
  });

  it('receiving an unknown message kind replies unknown_message_kind and stays open', () => {
    const socket = new MockWebSocket();
    const conn = new Connection({ socket, role: 'player', nowMs: 0 });

    socket.receiveInbound(
      encodeFrame({
        type: 'teleport' as never,
        version: NETWORK_API_VERSION,
        seq: 1 as SequenceNumber,
        payload: {},
      }),
    );

    const errorFrame = socket.sentFrames.find((frame) => frame.type === 'error');
    expect(errorFrame).toBeDefined();
    expect(errorFrame?.payload).toMatchObject({ code: 'unknown_message_kind' });
    expect(socket.closes).toHaveLength(0);
    expect(conn.state()).toBe('pending');
  });

  it('close() is idempotent and emits a single close event', () => {
    const socket = new MockWebSocket();
    const closeEvents: Array<[number, string]> = [];
    const conn = new Connection({
      socket,
      role: 'player',
      nowMs: 0,
      onClose: (c) => {
        closeEvents.push([socket.closes.length, c.id === conn.id ? 'self' : 'other']);
      },
    });

    conn.close(1000, 'bye');
    conn.close(1000, 'bye again');

    expect(socket.closes).toEqual([{ code: 1000, reason: 'bye' }]);
    expect(closeEvents).toHaveLength(1);
    expect(conn.state()).toBe('closed');
  });

  it('routes valid inbound envelopes to the registered handler and stamps lastSeenAtMs via sweep', () => {
    const socket = new MockWebSocket();
    const seen: Array<ProtocolEnvelope<NetworkPayload>> = [];
    const conn = new Connection({
      socket,
      role: 'player',
      nowMs: 0,
      onEnvelope: (_c, env) => {
        seen.push(env);
      },
    });

    socket.receiveInbound(
      encodeFrame({
        type: 'ping',
        version: NETWORK_API_VERSION,
        seq: 7 as SequenceNumber,
        payload: { clientTimeMs: 5 },
      }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.seq).toBe(7);
    // Heartbeat timestamps advance only when the scheduler sweeps.
    expect(conn.lastSeenAtMs).toBe(0);
    conn.sweep(1_500);
    expect(conn.lastSeenAtMs).toBe(1_500);
  });

  it('closeIdleTimeout mirrors transport-loss lifecycle: joined → disconnected, greeted → closed (review S1)', () => {
    // A JOINED session enters the reconnect lifecycle — the seat's
    // token must stay reclaimable after an idle reap.
    const joinedSocket = new MockWebSocket();
    let joinedClosed = 0;
    const joined = new Connection({
      socket: joinedSocket,
      role: 'player',
      nowMs: 0,
      onClose: () => {
        joinedClosed += 1;
      },
    });
    joined.markJoined(toBranded<SessionToken>('token'), 1 as PlayerId, toBranded<MatchId>('match'));

    joined.closeIdleTimeout();

    expect(joinedSocket.closes).toEqual([{ code: 1013, reason: 'idle timeout' }]);
    expect(joinedClosed).toBe(1);
    expect(joined.state()).toBe('disconnected');

    // Idempotent: a second reap is a no-op.
    joined.closeIdleTimeout();
    expect(joinedSocket.closes).toHaveLength(1);
    expect(joinedClosed).toBe(1);

    // A GREETED (unseated) session terminates outright.
    const greetedSocket = new MockWebSocket();
    const greeted = new Connection({ socket: greetedSocket, role: 'player', nowMs: 0 });
    greeted.markGreeted();
    greeted.closeIdleTimeout();
    expect(greeted.state()).toBe('closed');
    expect(greetedSocket.closes).toEqual([{ code: 1013, reason: 'idle timeout' }]);
  });
});
