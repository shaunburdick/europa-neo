/**
 * WsMatchClient unit tests — Integration wave (feature 004 ↔ 005).
 *
 * Drives the browser WebSocket client against a scripted fake socket
 * (injected via `webSocketFactory`) so every protocol transition is
 * deterministic — no network, no timers:
 *
 *   - handshake sequencing (hello first, helloAck resolution, version
 *     boundary rejection per FR-004),
 *   - seat claim (joinAck retention; error-envelope rejection),
 *   - token reconnect completion via snapshot (US2 shape),
 *   - order seq stamping + orderAck correlation,
 *   - inbound bookkeeping (lastTick / lastSeenServerSeq / fan-out),
 *   - transport loss vs explicit close semantics,
 *   - malformed-frame tolerance.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsoleClient } from '../../../src/net/client';
import { netEventFromEnvelope } from '../../../src/net/envelope-to-event';
import { createWsMatchClient } from '../../../src/net/ws-match-client';
import type { NetworkPayload, ProtocolEnvelope, SequenceNumber } from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Scripted fake WebSocket
// ---------------------------------------------------------------------------

/** Server-seq counter for fabricated inbound envelopes. */
let serverSeq = 0;

/**
 * Minimal synchronous WebSocket double: records outbound frames and
 * lets tests fire open/message/close events in any order.
 */
class FakeWebSocket {
  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readonly closed: Array<{ code: number; reason: string }> = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  /** Record one outbound frame (the client's encodeFrame output). */
  send(data: string): void {
    this.sent.push(data);
  }

  /** Record the close request; does NOT auto-fire onclose (tests decide). */
  close(code?: number, reason?: string): void {
    this.closed.push({ code: code ?? 1005, reason: reason ?? '' });
  }

  // -- Test drivers ---------------------------------------------------------

  /** Fire the open event (client then sends its hello). */
  open(): void {
    this.onopen?.();
  }

  /** Deliver raw text to the client's onmessage. */
  receive(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  /** Deliver a fabricated server envelope. */
  deliver(type: string, payload: NetworkPayload): void {
    serverSeq += 1;
    const envelope = {
      type,
      version: '0.1.0',
      seq: serverSeq as SequenceNumber,
      payload,
    } as unknown as ProtocolEnvelope<NetworkPayload>;
    this.receive(JSON.stringify(envelope));
  }

  /** Fire a transport close. */
  transportClose(code = 1006): void {
    this.onclose?.({ code });
  }
}

/** Fresh client bound to a fresh fake socket, opened and greeted. */
function greetedClient(): {
  client: ReturnType<typeof createWsMatchClient>;
  socket: FakeWebSocket;
} {
  const socket = new FakeWebSocket('ws://test');
  const client = createWsMatchClient({ webSocketFactory: () => socket });
  void client.connect('ws://test');
  socket.open();
  socket.deliver('helloAck', {
    protocolVersion: '0.1.0',
    connectionId: 'conn-1',
    heartbeatIntervalMs: 5000,
  });
  return { client, socket };
}

/** A greeted client whose joinMatch has been accepted (seat 1). */
async function joinedClient(): Promise<{
  client: ReturnType<typeof createWsMatchClient>;
  socket: FakeWebSocket;
}> {
  const parts = greetedClient();
  const joining = parts.client.joinMatch({
    matchId: 'm-1' as never,
    role: 'player',
    displayName: 'Alice',
  });
  parts.socket.deliver('joinAck', {
    sessionToken: 'tok-1' as never,
    playerId: 1 as never,
    view: { tick: 0, visibleCells: [] } as never,
    tick: 0,
    players: [],
  });
  await joining;
  return parts;
}

/** Parse one outbound frame recorded by the fake socket. */
function sentEnvelope(socket: FakeWebSocket, index: number): ProtocolEnvelope<NetworkPayload> {
  return JSON.parse(socket.sent[index] ?? '') as ProtocolEnvelope<NetworkPayload>;
}

describe('WsMatchClient handshake', () => {
  it('sends hello as the first frame and resolves connect on helloAck', async () => {
    FakeWebSocket.reset();
    const socket = new FakeWebSocket('ws://test:1');
    const client = createWsMatchClient({ webSocketFactory: () => socket });
    expect(client.state().connection).toBe('pending');

    const connecting = client.connect('ws://test:1');
    socket.open();
    await Promise.resolve();
    expect(socket.sent).toHaveLength(1);
    const hello = sentEnvelope(socket, 0);
    expect(hello.type).toBe('hello');
    expect(hello.seq).toBe(1);
    expect(hello.payload).toMatchObject({ protocolVersion: '0.1.0' });

    socket.deliver('helloAck', {
      protocolVersion: '0.1.0',
      connectionId: 'c-77',
      heartbeatIntervalMs: 4000,
    });
    await connecting;
    expect(client.state().connection).toBe('greeted');
  });

  it('rejects connect when the server boundary differs (FR-004)', async () => {
    FakeWebSocket.reset();
    const socket = new FakeWebSocket('ws://test:2');
    const client = createWsMatchClient({ webSocketFactory: () => socket });
    const connecting = client.connect('ws://test:2');
    socket.open();
    socket.deliver('helloAck', {
      protocolVersion: '9.9.9',
      connectionId: 'c-1',
      heartbeatIntervalMs: 4000,
    });
    await expect(connecting).rejects.toThrow(/version/);
    expect(client.state().connection).toBe('closed');
    expect(socket.closed[0]?.code).toBe(1008);
  });

  it('rejects a second connect while a socket is live', async () => {
    const { client } = greetedClient();
    await expect(client.connect('ws://again')).rejects.toThrow(/connect/);
  });
});

describe('WsMatchClient seat claim', () => {
  it('joinMatch requires greeted state', async () => {
    FakeWebSocket.reset();
    const socket = new FakeWebSocket('ws://t');
    const client = createWsMatchClient({ webSocketFactory: () => socket });
    await expect(
      client.joinMatch({ matchId: 'm' as never, role: 'player', displayName: 'A' }),
    ).rejects.toThrow(/greeted/);
  });

  it('sends the join payload and retains token + seat from joinAck', async () => {
    const { client, socket } = greetedClient();
    const joining = client.joinMatch({
      matchId: 'm-9' as never,
      role: 'player',
      displayName: 'Bob',
    });
    const join = sentEnvelope(socket, 1);
    expect(join.type).toBe('joinMatch');
    expect(join.seq).toBe(2);
    expect(join.payload).toMatchObject({ matchId: 'm-9', role: 'player', displayName: 'Bob' });

    socket.deliver('joinAck', {
      sessionToken: 'tok-9' as never,
      playerId: 2 as never,
      view: { tick: 3, visibleCells: [] } as never,
      tick: 3,
      players: [],
    });
    await joining;
    const snapshot = client.state();
    expect(snapshot.connection).toBe('joined');
    expect(snapshot.sessionToken).toBe('tok-9');
    expect(snapshot.playerId).toBe(2);
    expect(snapshot.matchId).toBe('m-9');
    expect(snapshot.lastTick).toBe(3);
  });

  it('carries the reconnect token when present', async () => {
    const { client, socket } = greetedClient();
    const joining = client.joinMatch({
      matchId: 'm-1' as never,
      role: 'player',
      reconnectToken: 'tok-old' as never,
      displayName: 'Alice',
    });
    expect(sentEnvelope(socket, 1).payload).toMatchObject({ reconnectToken: 'tok-old' });
    socket.deliver('joinAck', {
      sessionToken: 'tok-old' as never,
      playerId: 1 as never,
      view: { tick: 0, visibleCells: [] } as never,
      tick: 0,
      players: [],
    });
    await joining;
    expect(client.state().sessionToken).toBe('tok-old');
  });

  it('rejects joinMatch when the server replies with an error envelope', async () => {
    const { client, socket } = greetedClient();
    const joining = client.joinMatch({
      matchId: 'ghost' as never,
      role: 'player',
      displayName: 'Alice',
    });
    socket.deliver('error', { code: 'match_not_found', message: 'unknown match ghost' });
    await expect(joining).rejects.toThrow(/match_not_found/);
  });

  it('completes a token reconnect on snapshot (US2 reply shape)', async () => {
    const { client, socket } = greetedClient();
    const joining = client.joinMatch({
      matchId: 'm-2' as never,
      role: 'player',
      reconnectToken: 'tok-r' as never,
      displayName: 'Alice',
    });
    // Reconnect replies with a snapshot + replay window, not a joinAck.
    socket.deliver('snapshot', { tick: 12, view: { tick: 12, visibleCells: [] } as never });
    await joining;
    const snapshot = client.state();
    expect(snapshot.connection).toBe('rejoined');
    expect(snapshot.sessionToken).toBe('tok-r');
    expect(snapshot.matchId).toBe('m-2');
    expect(snapshot.lastTick).toBe(12);
  });
});

describe('WsMatchClient orders + inbound stream', () => {
  it('stamps monotonic seqs and resolves sendOrder with the correlated ack', async () => {
    const { client, socket } = await joinedClient();
    const first = client.sendOrder({
      kind: 'setReserves',
      player: 1 as never,
      cell: { x: 1, y: 1 },
      percent: 7 as never,
    });
    const second = client.sendOrder({
      kind: 'setReserves',
      player: 1 as never,
      cell: { x: 1, y: 1 },
      percent: 0 as never,
    });
    const orderOne = sentEnvelope(socket, 2);
    const orderTwo = sentEnvelope(socket, 3);
    expect(orderOne.type).toBe('order');
    expect(orderTwo.seq).toBe(orderOne.seq + 1);

    socket.deliver('orderAck', { seq: orderTwo.seq as never, result: { ok: true } });
    socket.deliver('orderAck', {
      seq: orderOne.seq as never,
      result: { ok: false, reason: { kind: 'invalid_percent' } } as never,
    });
    await expect(second).resolves.toEqual({ ok: true });
    await expect(first).resolves.toEqual({ ok: false, reason: { kind: 'invalid_percent' } });
  });

  it('fans inbound envelopes out and tracks lastSeenServerSeq', async () => {
    const { client, socket } = await joinedClient();
    const seen: string[] = [];
    const unsubscribe = client.onMessage((envelope) => {
      seen.push(envelope.type);
    });
    socket.deliver('tick', { tick: 4, view: { tick: 4, visibleCells: [] } as never });
    socket.deliver('pong', { clientTimeMs: 1, serverTimeMs: 2 });
    expect(seen).toEqual(['tick', 'pong']);
    unsubscribe();
    socket.deliver('tick', { tick: 5, view: { tick: 5, visibleCells: [] } as never });
    expect(seen).toEqual(['tick', 'pong']);
    expect(client.state().lastSeenServerSeq).toBeGreaterThan(0);
    expect(client.state().lastTick).toBeGreaterThanOrEqual(4);
  });

  it('drops malformed inbound frames without advancing state', async () => {
    const { client, socket } = await joinedClient();
    const before = client.state();
    socket.receive('not json at all');
    socket.receive(JSON.stringify({ type: 'nope', version: '', seq: 0, payload: {} }));
    expect(client.state()).toEqual(before);
  });

  it('sendOrder requires a joined seat', async () => {
    const { client } = greetedClient();
    await expect(client.sendOrder({ kind: 'surrender', player: 1 as never })).rejects.toThrow(
      /joined/,
    );
  });
});

describe('adapter ↔ wire-seq correlation (integration-wave regression)', () => {
  it('the adapter correlates acks by the TRUE wire seq (orders are seq 3+, not 1)', async () => {
    FakeWebSocket.reset();
    const socket = new FakeWebSocket('ws://corr');
    // Real browser client under the console adapter — the production
    // pairing, no factory injection needed.
    const client = createConsoleClient(
      { url: 'ws://corr', displayName: 'Alice', matchId: 'm-1' as never },
      { matchClientFactory: () => createWsMatchClient({ webSocketFactory: () => socket }) },
    );
    const connecting = client.connect();
    socket.open();
    socket.deliver('helloAck', {
      protocolVersion: '0.1.0',
      connectionId: 'c-1',
      heartbeatIntervalMs: 5000,
    });
    await connecting;
    const joining = client.joinMatch();
    socket.deliver('joinAck', {
      sessionToken: 't' as never,
      playerId: 1 as never,
      view: { tick: 0, visibleCells: [] } as never,
      tick: 0,
      players: [],
    });
    await joining;

    void client.sendOrder(42, {
      kind: 'setReserves',
      player: 1 as never,
      cell: { x: 1, y: 1 },
      percent: 7 as never,
    });
    // Wire frames so far: hello=1, joinMatch=2, order=3. The adapter's
    // correlation map must be keyed by 3 — the seq the server echoes.
    expect([...client.seqToActionId.keys()]).toEqual([3]);

    // The server's orderAck echoes the wire seq; the envelope→NetEvent
    // translation must recover ActionId 42 through the adapter's map.
    const ackEnvelope = JSON.parse(
      socket.sent.find((frame) => frame.includes('"order"')) ?? '',
    ) as ProtocolEnvelope<NetworkPayload>;
    const event = netEventFromEnvelope(
      {
        type: 'orderAck',
        version: '0.1.0',
        seq: 9 as SequenceNumber,
        payload: { seq: ackEnvelope.seq, result: { ok: true } },
      } as ProtocolEnvelope<NetworkPayload>,
      { seqToActionId: client.seqToActionId, connectedAtMs: 0, lastAppliedTick: 0 },
    );
    expect(event).toEqual({ kind: 'orderAck', actionId: 42, result: { ok: true } });
  });
});

describe('WsMatchClient lifecycle end states', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings at half the advertised heartbeat interval while open (FR-002)', () => {
    vi.useFakeTimers();
    FakeWebSocket.reset();
    const socket = new FakeWebSocket('ws://hb');
    const client = createWsMatchClient({ webSocketFactory: () => socket });
    void client.connect('ws://hb');
    socket.open();
    socket.deliver('helloAck', {
      protocolVersion: '0.1.0',
      connectionId: 'c-hb',
      heartbeatIntervalMs: 5000,
    });
    // Half of 5000 ms → first ping at 2500 ms; nothing before.
    vi.advanceTimersByTime(2400);
    expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(1);
    // Three more periods → three more pings.
    vi.advanceTimersByTime(7500);
    expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(4);
    // Explicit disconnect stops the loop.
    client.disconnect();
    vi.advanceTimersByTime(20_000);
    expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(4);
  });

  it('transport loss after join lands in disconnected and rejects pending orders', async () => {
    const { client, socket } = await joinedClient();
    const transitions: string[] = [];
    client.onConnectionChanged((state) => {
      transitions.push(state);
    });
    const pending = client.sendOrder({ kind: 'surrender', player: 1 as never });
    socket.transportClose(1006);
    await expect(pending).rejects.toThrow(/closed/);
    expect(client.state().connection).toBe('disconnected');
    expect(transitions).toContain('disconnected');
  });

  it('transport loss before join lands in closed', () => {
    const { client, socket } = greetedClient();
    socket.transportClose(1006);
    expect(client.state().connection).toBe('closed');
  });

  it('disconnect() is explicit: closed with code 1000', () => {
    const { client, socket } = greetedClient();
    client.disconnect();
    expect(socket.closed[0]).toMatchObject({ code: 1000 });
    expect(client.state().connection).toBe('closed');
  });
});
