/**
 * Network layer unit tests — Feature 005 (T097 coverage).
 *
 * Covers the three net modules headlessly:
 *   - `netEventFromEnvelope` (T031): every inbound wire kind maps to
 *     its NetEvent (or null for ignored/client-only kinds), with seq
 *     correlation and tick-monotonicity filtering.
 *   - `consoleStatusFromConnectionState`: ConnectionState → UI status.
 *   - `createConsoleClient` adapter (T029): construction guard,
 *     handshake delegation, sendOrder seq↔ActionId correlation,
 *     envelope passthrough, state snapshotting, close semantics.
 */

import { describe, expect, it } from 'vitest';

import { createConsoleClient } from '../../../src/net/client';
import { consoleStatusFromConnectionState } from '../../../src/net/connection';
import { netEventFromEnvelope } from '../../../src/net/envelope-to-event';
import type { NetworkPayload, ProtocolEnvelope, SequenceNumber } from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an envelope of a given kind with a loose payload. */
function envelope(
  type: string,
  payload: Record<string, unknown>,
): ProtocolEnvelope<NetworkPayload> {
  return {
    type,
    version: '',
    seq: 1 as SequenceNumber,
    payload,
  } as unknown as ProtocolEnvelope<NetworkPayload>;
}

const CTX = {
  seqToActionId: new Map<SequenceNumber, number>([[7, 42]]),
  connectedAtMs: 1000,
  lastAppliedTick: 50,
};

// ---------------------------------------------------------------------------
// envelope → NetEvent
// ---------------------------------------------------------------------------

describe('netEventFromEnvelope (T031)', () => {
  it('helloAck carries connectionId + heartbeat interval', () => {
    expect(
      netEventFromEnvelope(
        envelope('helloAck', { connectionId: 'c-1', heartbeatIntervalMs: 4000 }),
        CTX,
      ),
    ).toEqual({ kind: 'helloAck', connectionId: 'c-1', heartbeatIntervalMs: 4000 });
  });

  it('joinAck with a seat becomes joined; spectator joins are ignored', () => {
    const joined = netEventFromEnvelope(
      envelope('joinAck', {
        sessionToken: 't',
        playerId: 2,
        view: { tick: 1 },
        players: [],
      }),
      CTX,
    );
    expect(joined).toMatchObject({ kind: 'joined', playerId: 2 });
    expect(
      netEventFromEnvelope(
        envelope('joinAck', { sessionToken: 't', playerId: null, view: null, players: [] }),
        CTX,
      ),
    ).toBeNull();
  });

  it('snapshot resyncs; stale ticks are dropped; fresh ticks pass', () => {
    expect(
      netEventFromEnvelope(envelope('snapshot', { view: { tick: 77 }, tick: 77 }), CTX),
    ).toEqual({
      kind: 'reconnected',
      view: { tick: 77 },
    });
    expect(
      netEventFromEnvelope(envelope('tick', { view: { tick: 49 }, tick: 49 }), CTX),
    ).toBeNull();
    expect(netEventFromEnvelope(envelope('tick', { view: { tick: 50 }, tick: 50 }), CTX)).toEqual({
      kind: 'tick',
      view: { tick: 50 },
    });
  });

  it('orderAck correlates seq→ActionId; unknown seqs are ignored', () => {
    expect(
      netEventFromEnvelope(envelope('orderAck', { seq: 7, result: { ok: true } }), CTX),
    ).toEqual({ kind: 'orderAck', actionId: 42, result: { ok: true } });
    expect(
      netEventFromEnvelope(envelope('orderAck', { seq: 999, result: { ok: true } }), CTX),
    ).toBeNull();
  });

  it('terminal and error map through; pong is informational', () => {
    expect(
      netEventFromEnvelope(envelope('terminal', { result: { winner: 1 } }), CTX),
    ).toMatchObject({
      kind: 'terminal',
    });
    expect(
      netEventFromEnvelope(envelope('error', { code: 'match_full', message: 'full' }), CTX),
    ).toEqual({ kind: 'error', code: 'match_full', message: 'full' });
    expect(netEventFromEnvelope(envelope('pong', {}), CTX)).toBeNull();
  });

  it('client→server kinds can never arrive inbound', () => {
    for (const kind of ['hello', 'joinMatch', 'order', 'ping']) {
      expect(netEventFromEnvelope(envelope(kind, {}), CTX)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Connection status mapping
// ---------------------------------------------------------------------------

describe('consoleStatusFromConnectionState', () => {
  it('maps each ConnectionState to the UI-facing status', () => {
    expect(consoleStatusFromConnectionState('pending')).toBe('connecting');
    expect(consoleStatusFromConnectionState('greeted')).toBe('connecting');
    expect(consoleStatusFromConnectionState('joined')).toBe('live');
    expect(consoleStatusFromConnectionState('rejoined')).toBe('live');
    expect(consoleStatusFromConnectionState('disconnected')).toBe('reconnecting');
    expect(consoleStatusFromConnectionState('expired')).toBe('expired');
    expect(consoleStatusFromConnectionState('terminal')).toBe('game_over');
    expect(consoleStatusFromConnectionState('closed')).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

describe('createConsoleClient (T029)', () => {
  /** Minimal MatchClient stand-in satisfying the structural guard. */
  function makeInner() {
    const handlers = new Set<(envelope: ProtocolEnvelope<NetworkPayload>) => void>();
    return {
      connectCalls: 0,
      joinRequests: [] as Array<Record<string, unknown>>,
      sentOrders: [] as unknown[],
      closed: false,
      async connect(url: string): Promise<void> {
        this.connectCalls += 1;
        if (url === '') {
          throw new Error('bad url');
        }
      },
      disconnect(): void {
        this.closed = true;
      },
      async joinMatch(req: Record<string, unknown>): Promise<void> {
        this.joinRequests.push(req);
      },
      async sendOrder(order: unknown): Promise<{ ok: true }> {
        this.sentOrders.push(order);
        return { ok: true };
      },
      onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      emit(env: ProtocolEnvelope<NetworkPayload>): void {
        for (const handler of handlers) {
          handler(env);
        }
      },
      state() {
        return {
          connection: 'joined' as const,
          sessionToken: 'tok-9',
          matchId: 'm-1',
          playerId: 3,
          lastTick: 12,
          lastSeenServerSeq: 4,
        };
      },
    };
  }

  const CONFIG = {
    url: 'ws://localhost:8080',
    displayName: 'Alice',
    matchId: 'm-1' as never,
  };

  it('defaults to the shipped browser WebSocket client when no factory is injected', () => {
    // Integration wave: the documented evolution of the T029 adapter —
    // the default factory now wires to createWsMatchClient (real
    // browser client). Construction must succeed and produce a
    // MatchClient-shaped adapter in the pre-connect 'pending' state,
    // with no socket opened until connect().
    const client = createConsoleClient(CONFIG);
    const snapshot = client.state();
    expect(snapshot.connection).toBe('pending');
    expect(snapshot.consoleStatus).toBe('connecting');
    expect(client.sessionToken()).toBeNull();
    expect(client.playerId()).toBeNull();
  });

  it('rejects factories producing non-client shapes (fail-fast)', () => {
    expect(() => createConsoleClient(CONFIG, { matchClientFactory: () => ({}) })).toThrow(
      /does not implement the MatchClient surface/,
    );
  });

  it('delegates handshake and presents reconnectToken when configured', async () => {
    const inner = makeInner();
    const client = createConsoleClient(CONFIG, { matchClientFactory: () => inner });
    await client.connect();
    await client.joinMatch();
    expect(inner.connectCalls).toBe(1);
    expect(inner.joinRequests[0]).toMatchObject({
      matchId: 'm-1',
      role: 'player',
      displayName: 'Alice',
    });

    const withToken = createConsoleClient(
      { ...CONFIG, reconnectToken: 'r-1' as never },
      { matchClientFactory: () => inner },
    );
    await withToken.joinMatch();
    expect(inner.joinRequests[1]).toMatchObject({ reconnectToken: 'r-1' });
  });

  it('joinMatch without a configured matchId rejects', async () => {
    const client = createConsoleClient(
      { url: 'ws://x', displayName: 'A' },
      { matchClientFactory: () => makeInner() },
    );
    await expect(client.joinMatch()).rejects.toThrow(/no matchId configured/);
  });

  it('sendOrder assigns monotonic wire seqs correlated to ActionIds', async () => {
    const inner = makeInner();
    const client = createConsoleClient(CONFIG, { matchClientFactory: () => inner });
    await client.sendOrder(10, { kind: 'surrender', player: 1 });
    await client.sendOrder(11, { kind: 'surrender', player: 1 });
    expect(client.seqToActionId.size).toBe(2);
    const seqs = [...client.seqToActionId.keys()];
    expect(seqs[0]).toBeLessThan(seqs[1] ?? 0);
    expect(inner.sentOrders).toHaveLength(2);
    client.close();
    expect(client.seqToActionId.size).toBe(0); // correlation wiped
    expect(inner.closed).toBe(true);
  });

  it('onEnvelope subscribes through to the inner client', () => {
    const inner = makeInner();
    const client = createConsoleClient(CONFIG, { matchClientFactory: () => inner });
    const received: ProtocolEnvelope<NetworkPayload>[] = [];
    const unsubscribe = client.onEnvelope((env) => {
      received.push(env);
    });
    inner.emit(envelope('pong', {}));
    expect(received).toHaveLength(1);
    unsubscribe();
    inner.emit(envelope('pong', {}));
    expect(received).toHaveLength(1);
  });

  it('state() snapshots the inner client plus the UI status', () => {
    const client = createConsoleClient(CONFIG, { matchClientFactory: () => makeInner() });
    const snapshot = client.state();
    expect(snapshot).toMatchObject({
      connection: 'joined',
      sessionToken: 'tok-9',
      playerId: 3,
      consoleStatus: 'live',
    });
    expect(client.sessionToken()).toBe('tok-9');
    expect(client.playerId()).toBe(3);
  });
});
