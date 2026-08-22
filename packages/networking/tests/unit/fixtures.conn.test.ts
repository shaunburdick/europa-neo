/**
 * Mock WebSocket + Scripted Client Smoke Tests — Feature 004 (Phase 2)
 *
 * Verifies the transport double's directional conventions: outbound
 * recording, inbound driving, close semantics, and the Scripted
 * Client's envelope building + nextMessage awaiting.
 */

import type { Order } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { NETWORK_API_VERSION } from '../../src/constants';
import { encodeFrame } from '../../src/frame';
import type { MatchId, SessionToken } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';

describe('MockWebSocket', () => {
  it('records valid outbound frames decoded into sentFrames', () => {
    const socket = new MockWebSocket();
    const frame = encodeFrame({
      type: 'hello',
      version: NETWORK_API_VERSION,
      seq: 1 as never,
      payload: { protocolVersion: NETWORK_API_VERSION },
    });

    socket.send(frame);

    expect(socket.sentRaw).toEqual([frame]);
    expect(socket.sentFrames).toHaveLength(1);
    expect(socket.sentFrames[0]?.type).toBe('hello');
  });

  it('records invalid outbound JSON raw-only without crashing', () => {
    const socket = new MockWebSocket();
    socket.send('garbage-not-json');
    expect(socket.sentRaw).toEqual(['garbage-not-json']);
    expect(socket.sentFrames).toHaveLength(0);
  });

  it('delivers driven frames to message handlers', () => {
    const socket = new MockWebSocket();
    const received: string[] = [];
    socket.on('message', (data) => {
      received.push(data);
    });

    socket.receiveInbound('frame-1');
    socket.receiveInbound('frame-2');

    expect(received).toEqual(['frame-1', 'frame-2']);
  });

  it('close records once, emits close, and blocks further sends', () => {
    const socket = new MockWebSocket();
    const closeEvents: Array<[number, string]> = [];
    socket.on('close', (code, reason) => {
      closeEvents.push([code, reason]);
    });

    socket.close(1008, 'policy violation');
    socket.close(1000, 'again'); // idempotent

    expect(socket.isOpen).toBe(false);
    expect(socket.closes).toEqual([{ code: 1008, reason: 'policy violation' }]);
    expect(closeEvents).toEqual([[1008, 'policy violation']]);
    expect(() => socket.send('{}')).toThrow(/closed/);
  });
});

describe('ScriptedClient', () => {
  it('stamps envelopes with the current protocol version and monotonic seq', () => {
    const client = new ScriptedClient(new MockWebSocket());

    const hello = client.hello();
    const ping = client.ping(42);

    expect(hello.type).toBe('hello');
    expect(hello.version).toBe(NETWORK_API_VERSION);
    expect(hello.seq).toBe(1);
    expect(hello.payload).toEqual({ protocolVersion: NETWORK_API_VERSION });

    expect(ping.seq).toBe(2);
    expect(ping.payload).toEqual({ clientTimeMs: 42 });
  });

  it('builds joinMatch with role and optional fields', () => {
    const client = new ScriptedClient(new MockWebSocket());
    const matchId = 'match-x' as MatchId;
    const token = 'tok' as SessionToken;

    client.hello();
    const join = client.joinMatch(matchId, 'player', { reconnectToken: token, requestedSeat: 1 });

    expect(join.type).toBe('joinMatch');
    expect(join.payload).toMatchObject({
      matchId: matchId,
      role: 'player',
      displayName: 'Player',
      reconnectToken: token,
      requestedSeat: 1,
    });
  });

  it('wraps engine orders in order envelopes', () => {
    const client = new ScriptedClient(new MockWebSocket());
    const order: Order = { kind: 'surrender', player: 2 };

    const envelope = client.order(order);

    expect(envelope.type).toBe('order');
    expect(envelope.payload).toEqual({ order });
  });

  it('nextMessage awaits new frames by kind without replaying old ones', async () => {
    const client = new ScriptedClient(new MockWebSocket());

    // Server → client frame #1 arrives immediately.
    client.socket.send(
      encodeFrame({
        type: 'helloAck',
        version: NETWORK_API_VERSION,
        seq: 1 as never,
        payload: {
          protocolVersion: NETWORK_API_VERSION,
          connectionId: 'conn-1',
          heartbeatIntervalMs: 5000,
        },
      }),
    );

    const first = await client.nextMessage(undefined, 50);
    expect(first.type).toBe('helloAck');

    // Server → client frame #2 arrives later; nextMessage must skip
    // ahead, not replay helloAck. (Client → server sends like
    // client.hello() are consumed by the server side, never by
    // nextMessage — that direction is asserted in the seq test above.)
    setTimeout(() => {
      client.socket.send(
        encodeFrame({
          type: 'pong',
          version: NETWORK_API_VERSION,
          seq: 99 as never,
          payload: { clientTimeMs: 1, serverTimeMs: 2 },
        }),
      );
    }, 10);

    const second = await client.nextMessage('pong', 500);
    expect(second.type).toBe('pong');
    expect(second.seq).toBe(99);
  });

  it('nextMessage times out when no matching frame arrives', async () => {
    const client = new ScriptedClient(new MockWebSocket());
    client.hello();

    await expect(client.nextMessage('terminal', 30)).rejects.toThrow(/timed out.*terminal/);
  });
});
