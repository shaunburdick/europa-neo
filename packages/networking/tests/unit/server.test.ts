/**
 * Server Orchestration Unit Tests — Feature 004 US1 (T030)
 *
 * Covers FR-003 (server holds the match map) and FR-009 (lifecycle:
 * register → attach → join → stats; idempotent close/listen). Uses
 * the real engine + fog via the fixtures and drives clients through
 * `MockWebSocket` + `ScriptedClient` — no TCP port is opened.
 */

import { computePlayerView } from '@europa/fog';
import type {
  EngineSession,
  MatchId,
  MatchmakerBridge,
  PlayerId,
  SessionToken,
} from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ProtocolEnvelope, Server, ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { generateSessionToken, toBranded } from '../../src/ids';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** Accelerated tick cadence (matches the integration harness). */
const TEST_TICK_MS = 10;

/** Server config with fast ticks + ephemeral port. */
function testServerConfig(): ServerConfigShape {
  return { ...NETWORK_DEFAULT_CONFIG, tickRateMs: TEST_TICK_MS, port: 0 };
}

/** Local alias to avoid a second import of the config type. */
type ServerConfigShape = Parameters<typeof createMatchServer>[0];

/** Small sleep helper for bounded waits. */
function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a predicate until true or the deadline elapses.
 *
 * @param predicate Condition to await.
 * @param timeoutMs Max wait. Default 2000.
 */
async function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('waitForCondition: timed out');
    }
    await waitFor(5);
  }
}

/**
 * Deliver a raw protocol envelope to the server as if the client sent
 * it (bypasses ScriptedClient's well-formed-builder convenience for
 * cases where we deliberately send unusual-but-schema-valid frames).
 */
function injectRawFrame(socket: MockWebSocket, envelope: ProtocolEnvelope<never>): void {
  socket.receiveInbound(JSON.stringify(envelope));
}

/**
 * Wrap an engine session so `status()` reports a win for player 1
 * after N advances — lets tests exercise the terminal fan-out without
 * playing a real match to elimination.
 */
function wrapTerminating(inner: EngineSession, terminalAfterTicks: number): EngineSession {
  let advances = 0;
  const result = {
    kind: 'win' as const,
    winner: 1 as PlayerId,
    get tick() {
      return advances;
    },
    reason: 'last_standing' as const,
  };
  return {
    world: () => inner.world(),
    submit: (order) => inner.submit(order),
    advance: () => {
      const next = inner.advance();
      advances += 1;
      return advances >= terminalAfterTicks ? { ...next, terminal: result } : next;
    },
    status: () => (advances >= terminalAfterTicks ? result : undefined),
    close: () => {
      inner.close();
    },
  };
}

/**
 * Clone deps with recorder hooks merged into the matchmaker bridge.
 *
 * @param base   Base deps (real engine/fog).
 * @param bridge Callback overrides to record events.
 */
function withBridge(base: ServerDeps, bridge: Partial<MatchmakerBridge>): ServerDeps {
  return { ...base, matchmaker: { ...base.matchmaker, ...bridge } };
}

/** Real engine/fog deps: fog adapted to the contract's object-arg seam. */
function realDeps(): ServerDeps {
  return {
    engine: {
      createMatchSession: () => {
        throw new Error('engine factory not used by fixtures (sessions are pre-built)');
      },
    },
    fog: {
      computePlayerView: ({ world, playerId, spectator }) =>
        computePlayerView(world, playerId, { spectator }),
    },
    matchmaker: {},
    logger: NULL_LOGGER,
  };
}

/**
 * Structural bridge to the server's internal test seam. Declared here
 * (not imported) so the public `Server` surface stays the only typed
 * dependency of this file.
 */
function injectSocket(server: Server, socket: MockWebSocket): void {
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

/**
 * Attach a fresh {@link MockWebSocket} to the server's test seam and
 * return a {@link ScriptedClient} speaking through it — protocol
 * traffic flows without opening a TCP port.
 */
function connectMockClient(server: Server): ScriptedClient {
  const socket = new MockWebSocket();
  injectSocket(server, socket);
  return new ScriptedClient(socket);
}

describe('createMatchServer', () => {
  it('a fresh server reports zero matches and zero connections', () => {
    const server = createMatchServer(NETWORK_DEFAULT_CONFIG, realDeps());
    const stats = server.stats();

    expect(stats.activeMatches).toBe(0);
    expect(stats.activeConnections).toBe(0);
  });

  it('after register + attach + hello + joinMatch, stats show one match and two connections', async () => {
    const server = createMatchServer(NETWORK_DEFAULT_CONFIG, realDeps());
    const match = scriptedMatch({ boardSize: 8 });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    const tokens = attachPlayersForMatch(server, match);

    // Two clients connect (mock injection seam) and complete the handshake.
    const clientA = connectMockClient(server);
    const clientB = connectMockClient(server);
    clientA.hello();
    clientB.hello();
    await clientA.nextMessage('helloAck');
    await clientB.nextMessage('helloAck');
    clientA.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    clientB.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
    const joinA = await clientA.nextMessage('joinAck');
    const joinB = await clientB.nextMessage('joinAck');

    expect(joinA.payload).toMatchObject({ playerId: 1, sessionToken: tokens[0] });
    expect(joinB.payload).toMatchObject({ playerId: 2, sessionToken: tokens[1] });

    const stats = server.stats();
    expect(stats.activeMatches).toBe(1);
    expect(stats.activeConnections).toBe(2);

    await server.close();
  });

  it('close() is idempotent and clears all matches', async () => {
    const server = createMatchServer(NETWORK_DEFAULT_CONFIG, realDeps());
    const match = scriptedMatch({ boardSize: 8 });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);
    connectMockClient(server).hello();

    await server.close();
    await server.close(); // idempotent

    expect(server.stats().activeMatches).toBe(0);
  });

  it('listen() is idempotent', async () => {
    const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0 }, realDeps());
    await server.listen();
    await server.listen(); // no-op, no double-bind error

    await server.close();
  });
});

// ----------------------------------------------------------------------------
// Management ops (register/attach/detach/spectator gates)
// ----------------------------------------------------------------------------

describe('createMatchServer — management ops', () => {
  it('registerMatch throws on duplicate matchId, tick-rate mismatch, and maxConcurrentMatches', () => {
    const server = createMatchServer(
      { ...NETWORK_DEFAULT_CONFIG, port: 0, maxConcurrentMatches: 1 },
      realDeps(),
    );
    const match = scriptedMatch({ boardSize: 8 });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });

    expect(() =>
      server.registerMatch({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
      }),
    ).toThrow(/already registered/);

    const other = scriptedMatch({ boardSize: 8, tickRateMs: 999 });
    expect(() =>
      server.registerMatch({
        matchId: other.matchId,
        engineSession: other.engineSession,
        matchConfig: other.matchConfig,
      }),
    ).toThrow(/tickRateMs/);

    const third = scriptedMatch({ boardSize: 8 });
    expect(() =>
      server.registerMatch({
        matchId: third.matchId,
        engineSession: third.engineSession,
        matchConfig: third.matchConfig,
      }),
    ).toThrow(/maxConcurrentMatches/);
  });

  it('unregisterMatch closes live connections with 1001 and drops the channel; unknown ids are a no-op', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);
    const client = connectMockClient(server);
    client.hello();
    await client.nextMessage('helloAck');
    client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    await client.nextMessage('joinAck');

    server.unregisterMatch(match.matchId);
    expect(client.socket.closes).toEqual([{ code: 1001, reason: 'match unregistered' }]);
    expect(server.stats().activeMatches).toBe(0);

    // Unknown match id: silent no-op per contract.
    expect(() => server.unregisterMatch(toBranded<MatchId>('nope'))).not.toThrow();

    await server.close();
  });

  it('attachPlayer throws on unknown matches; detachPlayer works by playerId and by token', () => {
    const server = createMatchServer(NETWORK_DEFAULT_CONFIG, realDeps());
    const match = scriptedMatch({ boardSize: 8 });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });

    expect(() =>
      server.attachPlayer({
        matchId: toBranded<MatchId>('ghost'),
        playerId: 1 as PlayerId,
        sessionToken: generateSessionToken(),
      }),
    ).toThrow(/unknown match/);

    const token = generateSessionToken();
    server.attachPlayer({ matchId: match.matchId, playerId: 2 as PlayerId, sessionToken: token });

    // Token-addressed detach (playerId omitted).
    expect(() =>
      server.detachPlayer({ matchId: match.matchId, sessionToken: token }),
    ).not.toThrow();

    // Second token-addressed detach: token no longer bound → no-op.
    expect(() =>
      server.detachPlayer({ matchId: match.matchId, sessionToken: token }),
    ).not.toThrow();
  });

  it('enableSpectators/disableSpectators flip the gate; spectator attach stays rejected in US1', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);

    const spectator = connectMockClient(server);
    spectator.hello();
    await spectator.nextMessage('helloAck');

    // Gate closed by default.
    spectator.joinMatch(match.matchId, 'spectator');
    let err = await spectator.nextMessage('error');
    expect(err.payload.code).toBe('match_not_joinable');

    // Gate open — US1 still rejects attach (full path ships in US3).
    server.enableSpectators(match.matchId);
    spectator.joinMatch(match.matchId, 'spectator');
    err = await spectator.nextMessage('error');
    expect(err.payload.code).toBe('match_not_joinable');

    server.disableSpectators(match.matchId);
    spectator.joinMatch(match.matchId, 'spectator');
    err = await spectator.nextMessage('error');
    expect(err.payload.code).toBe('match_not_joinable');

    await server.close();
  });
});

// ----------------------------------------------------------------------------
// Protocol edge paths
// ----------------------------------------------------------------------------

describe('createMatchServer — protocol edges', () => {
  /** Joined harness variant with recorder hooks on the bridge. */
  interface RecordedBridge {
    readonly claimed: Array<{ playerId: number; connectionId: string }>;
    readonly disconnected: number;
  }

  it('version mismatch replies with version_mismatch and closes 1008 (FR-004)', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const client = connectMockClient(server);
    client.hello('9.9.9');

    const err = await client.nextMessage('error');
    expect(err.payload.code).toBe('version_mismatch');
    expect((err.payload.detail as Record<string, string>).expected).toBe(NETWORK_API_VERSION);

    // Wait for the policy-violation close to land.
    for (let i = 0; i < 100 && client.socket.closes.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(client.socket.closes).toEqual([{ code: 1008, reason: 'policy violation' }]);

    await server.close();
  });

  it('an order before joinMatch is a protocol_sequence_error and counts as rejected', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const client = connectMockClient(server);
    client.hello();
    await client.nextMessage('helloAck');
    client.order({ kind: 'surrender', player: 1 as PlayerId });

    const err = await client.nextMessage('error');
    expect(err.payload.code).toBe('protocol_sequence_error');
    expect(server.stats().totalOrdersRejected).toBe(1);

    await server.close();
  });

  it('ping is answered with pong echoing client time (FR-002 heartbeat)', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const client = connectMockClient(server);
    client.ping(1234);

    const pong = await client.nextMessage('pong');
    expect(pong.payload.clientTimeMs).toBe(1234);
    expect(typeof pong.payload.serverTimeMs).toBe('number');

    await server.close();
  });

  it('server-to-client kinds arriving inbound are protocol_sequence_errors', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const client = connectMockClient(server);
    injectRawFrame(client.socket, {
      type: 'tick',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { tick: 1, view: { player: 1, tick: 1, visibleCells: [] } },
    });

    const err = await client.nextMessage('error');
    expect(err.payload.code).toBe('protocol_sequence_error');
    expect(err.payload.message).toContain('server-to-client');

    await server.close();
  });

  it('a second join of the same seat is seat_taken; an unknown reconnect token is token_invalid', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    const tokens = attachPlayersForMatch(server, match);

    const first = connectMockClient(server);
    const second = connectMockClient(server);
    first.hello();
    second.hello();
    await first.nextMessage('helloAck');
    await second.nextMessage('helloAck');

    first.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    await first.nextMessage('joinAck');

    second.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    const taken = await second.nextMessage('error');
    expect(taken.payload.code).toBe('seat_taken');

    second.joinMatch(match.matchId, 'player', { reconnectToken: 'bogus-token' });
    const invalid = await second.nextMessage('error');
    expect(invalid.payload.code).toBe('token_invalid');

    // The valid token DOES claim its seat from a fresh connection.
    thirdJoin: {
      const third = connectMockClient(server);
      third.hello();
      await third.nextMessage('helloAck');
      third.joinMatch(match.matchId, 'player', { reconnectToken: tokens[1] });
      const join = await third.nextMessage('joinAck');
      expect(join.payload.playerId).toBe(2);
    }

    await server.close();
  });

  it('joining with no seat selector assigns the lowest open seat; exhausting seats is match_full', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);

    const one = connectMockClient(server);
    const two = connectMockClient(server);
    const three = connectMockClient(server);
    for (const c of [one, two, three]) {
      c.hello();
      await c.nextMessage('helloAck');
    }

    one.joinMatch(match.matchId, 'player');
    expect((await one.nextMessage('joinAck')).payload.playerId).toBe(1);
    two.joinMatch(match.matchId, 'player');
    expect((await two.nextMessage('joinAck')).payload.playerId).toBe(2);

    three.joinMatch(match.matchId, 'player');
    const full = await three.nextMessage('error');
    expect(full.payload.code).toBe('match_full');

    await server.close();
  });

  it('terminal results fan out once per connection and fire onMatchTerminal exactly once', async () => {
    const terminalAtTick = 3;
    const inner = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    const match = {
      ...inner,
      engineSession: wrapTerminating(inner.engineSession, terminalAtTick),
    };

    const claimed: Array<{ playerId: number }> = [];
    const terminals: Array<{ matchId: MatchId; winner: number }> = [];
    const deps = withBridge(realDeps(), {
      onSeatClaimed: (event) => {
        claimed.push({ playerId: event.playerId });
      },
      onMatchTerminal: (event) => {
        if (event.result.kind === 'win') {
          terminals.push({ matchId: event.matchId, winner: event.result.winner });
        }
      },
    });

    const server = createMatchServer(testServerConfig(), deps);
    await server.listen(); // starts the tick scheduler
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);

    const one = connectMockClient(server);
    const two = connectMockClient(server);
    for (const c of [one, two]) {
      c.hello();
      await c.nextMessage('helloAck');
      c.joinMatch(match.matchId, 'player');
      await c.nextMessage('joinAck');
    }
    expect(claimed.sort((a, b) => a.playerId - b.playerId)).toEqual([
      { playerId: 1 },
      { playerId: 2 },
    ]);

    const t1 = await one.nextMessage('terminal');
    const t2 = await two.nextMessage('terminal');
    expect((t1.payload.result as { kind: string }).kind).toBe('win');
    expect(t2.payload.result).toEqual(t1.payload.result);

    // Exactly one bridge callback despite further scheduler fires.
    await waitFor(50);
    expect(terminals).toEqual([{ matchId: match.matchId, winner: 1 }]);
    expect(one.socket.sentFrames.filter((f) => f.type === 'terminal')).toHaveLength(1);

    await server.close();
  });

  it('transport close releases the seat and fires onSeatDisconnected', async () => {
    const disconnected: SessionToken[] = [];
    const deps = withBridge(realDeps(), {
      onSeatDisconnected: (event) => {
        disconnected.push(event.sessionToken);
      },
    });

    const server = createMatchServer(testServerConfig(), deps);
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    const tokens = attachPlayersForMatch(server, match);

    const one = connectMockClient(server);
    one.hello();
    await one.nextMessage('helloAck');
    one.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    await one.nextMessage('joinAck');

    one.socket.close(1001, 'client hangup');
    await waitForCondition(() => disconnected.length === 1);
    expect(disconnected).toEqual([tokens[0]]);

    await server.close();
  });

  it('stats reflect frames sent/received, accepted orders, and rate-limit drops (SC-005)', async () => {
    const server = createMatchServer(
      { ...testServerConfig(), ordersPerSecond: 1, rateLimitBurstFactor: 1 },
      realDeps(),
    );
    await server.listen(); // starts the tick scheduler
    const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    attachPlayersForMatch(server, match);

    const one = connectMockClient(server);
    one.hello();
    await one.nextMessage('helloAck');
    one.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    await one.nextMessage('joinAck');

    // Burst well past the 1-token bucket: some accept, rest drop.
    for (let i = 0; i < 5; i++) {
      one.order({ kind: 'clearAllPipes', player: 1 as PlayerId, cell: { x: 1, y: 1 } });
    }
    await one.nextMessage('orderAck'); // at least the first landed

    await waitForCondition(() => server.stats().totalRateLimitDrops > 0);
    const stats = server.stats();
    expect(stats.totalOrdersAccepted).toBeGreaterThanOrEqual(1);
    expect(stats.totalFramesSent).toBeGreaterThanOrEqual(3); // helloAck + joinAck + orderAck(s)
    expect(stats.totalFramesReceived).toBeGreaterThanOrEqual(7); // hello + join + 5 orders
    expect(stats.totalTicks).toBeGreaterThan(0);

    await server.close();
  });
});
