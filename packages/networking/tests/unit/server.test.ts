/**
 * Server Orchestration Unit Tests — Feature 004 US1 (T030)
 *
 * Covers FR-003 (server holds the match map) and FR-009 (lifecycle:
 * register → attach → join → stats; idempotent close/listen). Uses
 * the real engine + fog via the fixtures and drives clients through
 * `MockWebSocket` + `ScriptedClient` — no TCP port is opened.
 *
 * Issue #74: seats are keyed by canonical 12-character `PlayerId`
 * strings; a client never names a seat. Admission resolves the bound
 * bearer token, or the server assigns the lowest open seat.
 */

import { computePlayerView } from '@europa/fog';
import type {
    EngineSession,
    JoinAckPayload,
    MatchId,
    MatchmakerBridge,
    PlayerId,
    SessionToken,
} from '@europa/networking';
import { describe, expect, it, vi } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { generateSessionToken, toBranded } from '../../src/ids';
import { createMatchServer } from '../../src/server';
import type { ProtocolEnvelope, Server, ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
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

/** Resolve a placement slot's bound token, failing loudly when absent. */
function tokenFor(tokens: readonly SessionToken[], slot: number): SessionToken {
    const token = tokens[slot - 1];
    if (token === undefined) {
        throw new Error(`tokenFor: no token for slot ${String(slot)}`);
    }
    return token;
}

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
 * Wrap an engine session so `status()` reports a win for the slot-1
 * identity after N advances — lets tests exercise the terminal fan-out
 * without playing a real match to elimination.
 */
function wrapTerminating(inner: EngineSession, terminalAfterTicks: number, winner: PlayerId): EngineSession {
    let advances = 0;
    const result = {
        kind: 'win' as const,
        winner,
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
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
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
        const [p1, p2] = match.playerIds;

        // Two clients connect (mock injection seam) and complete the handshake.
        const clientA = connectMockClient(server);
        const clientB = connectMockClient(server);
        clientA.hello();
        clientB.hello();
        await clientA.nextMessage('helloAck');
        await clientB.nextMessage('helloAck');
        clientA.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        clientB.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 2) });
        const joinA = await clientA.nextMessage('joinAck');
        const joinB = await clientB.nextMessage('joinAck');

        expect(joinA.payload).toMatchObject({ playerId: p1, sessionToken: tokenFor(tokens, 1) });
        expect(joinB.payload).toMatchObject({ playerId: p2, sessionToken: tokenFor(tokens, 2) });

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
        const server = createMatchServer({ ...NETWORK_DEFAULT_CONFIG, port: 0, maxConcurrentMatches: 1 }, realDeps());
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
        const tokens = attachPlayersForMatch(server, match);
        const client = connectMockClient(server);
        client.hello();
        await client.nextMessage('helloAck');
        client.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
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
        const p2 = match.playerIds[1] as PlayerId;

        expect(() =>
            server.attachPlayer({
                matchId: toBranded<MatchId>('ghost'),
                playerId: match.playerIds[0] as PlayerId,
                sessionToken: generateSessionToken(),
            }),
        ).toThrow(/unknown match/);

        const token = generateSessionToken();
        server.attachPlayer({ matchId: match.matchId, playerId: p2, sessionToken: token });

        // Token-addressed detach (playerId omitted).
        expect(() => server.detachPlayer({ matchId: match.matchId, sessionToken: token })).not.toThrow();

        // Second token-addressed detach: token no longer bound → no-op.
        expect(() => server.detachPlayer({ matchId: match.matchId, sessionToken: token })).not.toThrow();
    });

    it('enableSpectators/disableSpectators flip the gate: closed gates refuse spectator attach, open gates admit it (US3)', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        attachPlayersForMatch(server, match);

        // Gate closed by default.
        const closedGate = connectMockClient(server);
        closedGate.hello();
        await closedGate.nextMessage('helloAck');
        closedGate.joinMatch(match.matchId, 'spectator');
        let err = await closedGate.nextMessage('error');
        expect(err.payload.code).toBe('match_not_joinable');

        // Gate open — US3 attach succeeds: null seat + full-board view.
        server.enableSpectators(match.matchId);
        const watcher = connectMockClient(server);
        watcher.hello();
        await watcher.nextMessage('helloAck');
        watcher.joinMatch(match.matchId, 'spectator');
        const joinAck = await watcher.nextMessage('joinAck');
        const ack = joinAck.payload as unknown as JoinAckPayload;
        expect(ack.playerId).toBeNull();
        expect(ack.view.visibleCells).toHaveLength(8 * 8);

        // Gate closed again — further attaches are refused.
        server.disableSpectators(match.matchId);
        const latecomer = connectMockClient(server);
        latecomer.hello();
        await latecomer.nextMessage('helloAck');
        latecomer.joinMatch(match.matchId, 'spectator');
        err = await latecomer.nextMessage('error');
        expect(err.payload.code).toBe('match_not_joinable');

        await server.close();
    });
});

// ----------------------------------------------------------------------------
// Protocol edge paths
// ----------------------------------------------------------------------------

describe('createMatchServer — protocol edges', () => {
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
        client.order({ kind: 'surrender', player: 'Player000001' as PlayerId });

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
            payload: { tick: 1, view: { player: 'Player000001', tick: 1, visibleCells: [] } },
        });

        const err = await client.nextMessage('error');
        expect(err.payload.code).toBe('protocol_sequence_error');
        expect(err.payload.message).toContain('server-to-client');

        await server.close();
    });

    it('a second join of the same seat is match_not_joinable; an unknown reconnect token is token_invalid', async () => {
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

        first.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        await first.nextMessage('joinAck');

        // A second connection presenting the SAME bound token cannot displace
        // the live seat holder.
        second.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        const taken = await second.nextMessage('error');
        expect(taken.payload.code).toBe('match_not_joinable');

        second.joinMatch(match.matchId, 'player', { reconnectToken: 'bogus-token' as SessionToken });
        const invalid = await second.nextMessage('error');
        expect(invalid.payload.code).toBe('token_invalid');

        // The valid token DOES claim its seat from a fresh connection.
        {
            const third = connectMockClient(server);
            third.hello();
            await third.nextMessage('helloAck');
            third.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 2) });
            const join = await third.nextMessage('joinAck');
            expect(join.payload.playerId).toBe(match.playerIds[1]);
        }

        await server.close();
    });

    it('joining with no seat selector assigns the lowest open seat; exhausting seats is match_not_joinable', async () => {
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
        expect((await one.nextMessage('joinAck')).payload.playerId).toBe(match.playerIds[0]);
        two.joinMatch(match.matchId, 'player');
        expect((await two.nextMessage('joinAck')).payload.playerId).toBe(match.playerIds[1]);

        three.joinMatch(match.matchId, 'player');
        const full = await three.nextMessage('error');
        expect(full.payload.code).toBe('match_not_joinable');

        await server.close();
    });

    it('an out-of-union joinMatch role is rejected as malformed_payload and claims nothing (review N5)', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
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

        // Wire-level validation only checks that `role` is a string, so an
        // arbitrary value reaches the dispatcher (ScriptedClient cannot
        // type this — raw frame injection is the point).
        injectRawFrame(one.socket, {
            type: 'joinMatch',
            version: NETWORK_API_VERSION,
            seq: 2,
            payload: { matchId: match.matchId, role: 'wizard', displayName: 'Wizard' },
        });

        const err = await one.nextMessage('error');
        expect(err.payload.code).toBe('malformed_payload');
        expect(err.payload.message).toContain('role');
        // The malformed attempt claimed no seat…
        expect(server.stats().activeConnections).toBe(0);

        // …and the connection is unpoisoned: a valid token join still works.
        one.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        const ack = await one.nextMessage('joinAck');
        expect(ack.payload.playerId).toBe(match.playerIds[0]);

        await server.close();
    });

    it('terminal results fan out once per connection and fire onMatchTerminal exactly once', async () => {
        const terminalAtTick = 3;
        const inner = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
        const winner = inner.playerIds[0] as PlayerId;
        const match = {
            ...inner,
            engineSession: wrapTerminating(inner.engineSession, terminalAtTick, winner),
        };

        const claimed: Array<{ playerId: PlayerId | null }> = [];
        const terminals: Array<{ matchId: MatchId; winner: PlayerId | null }> = [];
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
        expect(claimed.map((c) => c.playerId).sort()).toEqual([...match.playerIds].sort());

        const t1 = await one.nextMessage('terminal');
        const t2 = await two.nextMessage('terminal');
        expect((t1.payload.result as { kind: string }).kind).toBe('win');
        expect(t2.payload.result).toEqual(t1.payload.result);

        // Exactly one bridge callback despite further scheduler fires.
        await waitFor(50);
        expect(terminals).toEqual([{ matchId: match.matchId, winner }]);
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
        one.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        await one.nextMessage('joinAck');

        one.socket.close(1001, 'client hangup');
        await waitForCondition(() => disconnected.length === 1);
        expect(disconnected).toEqual([tokenFor(tokens, 1)]);

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
        const tokens = attachPlayersForMatch(server, match);

        const one = connectMockClient(server);
        one.hello();
        await one.nextMessage('helloAck');
        one.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        await one.nextMessage('joinAck');

        // Burst well past the 1-token bucket: some accept, rest drop.
        const p1 = match.playerIds[0] as PlayerId;
        for (let i = 0; i < 5; i++) {
            one.order({ kind: 'clearAllPipes', player: p1, cell: { x: 1, y: 1 } });
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

// ----------------------------------------------------------------------------
// Issue #123 P0: seat admission gate — tokenless joins must not claim
// grace-window seats. Issue #74: a client-supplied identity never
// selects or claims a seat at all.
// ----------------------------------------------------------------------------

describe('createMatchServer — seat admission (issue #123 P0)', () => {
    /**
     * Disconnect a joined client by closing its mock socket. The
     * server's close handler registers the seat in the reconnect
     * registry and nulls the seat's connection — placing it inside the
     * grace window.
     */
    function disconnectClient(client: ScriptedClient): void {
        client.socket.close(1000, 'test disconnect');
    }

    /** Boot a 2-player match with both seats attached; returns tokens. */
    async function startTwoSeatMatch(
        server: Server,
    ): Promise<{ matchId: MatchId; tokens: readonly SessionToken[]; playerIds: readonly PlayerId[] }> {
        const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        const tokens = attachPlayersForMatch(server, match);
        return { matchId: match.matchId, tokens, playerIds: match.playerIds };
    }

    it('tokenless join against a grace-window seat returns match_not_joinable, not joinAck', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        const { matchId, tokens, playerIds } = await startTwoSeatMatch(server);

        // Client A joins slot 1, then disconnects — seat enters grace window.
        const alice = connectMockClient(server);
        alice.hello();
        await alice.nextMessage('helloAck');
        alice.joinMatch(matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        await alice.nextMessage('joinAck');
        disconnectClient(alice);

        // Wait for close handler to propagate.
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Client B tries tokenless join — slot 1 is in the grace window but
        // slot 2 is genuinely unclaimed, so Bob claims slot 2.
        const bob = connectMockClient(server);
        bob.hello();
        await bob.nextMessage('helloAck');
        bob.joinMatch(matchId, 'player');
        const ack = await bob.nextMessage('joinAck');
        expect(ack.payload.playerId).toBe(playerIds[1]);

        // Now both seats are occupied. Disconnect Bob too → both in grace window.
        disconnectClient(bob);
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Client C tries tokenless — no open seats (both in grace window).
        const carol = connectMockClient(server);
        carol.hello();
        await carol.nextMessage('helloAck');
        carol.joinMatch(matchId, 'player');
        const err = await carol.nextMessage('error');
        expect(err.payload.code).toBe('match_not_joinable');

        // A bare canonical ID offered as a token is NOT a credential: the
        // server rejects it (FR-022 credential separation).
        carol.joinMatch(matchId, 'player', { reconnectToken: playerIds[0] as unknown as SessionToken });
        const forged = await carol.nextMessage('error');
        expect(forged.payload.code).toBe('token_invalid');

        // Legitimate reconnect with Alice's original token still works.
        const aliceReturn = connectMockClient(server);
        aliceReturn.hello();
        await aliceReturn.nextMessage('helloAck');
        aliceReturn.joinMatch(matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        const snapshot = await aliceReturn.nextMessage('snapshot');
        expect(snapshot.type).toBe('snapshot');

        await server.close();
    });

    it('tokenless join skips all grace-window seats; only truly open seats are claimed', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        const { matchId, tokens } = await startTwoSeatMatch(server);

        // Both seats have tokens bound but no connection — this is the
        // pre-join state. Seats without active reconnect bindings ARE open.
        const alice = connectMockClient(server);
        alice.hello();
        await alice.nextMessage('helloAck');
        alice.joinMatch(matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        await alice.nextMessage('joinAck');

        const bob = connectMockClient(server);
        bob.hello();
        await bob.nextMessage('helloAck');
        bob.joinMatch(matchId, 'player', { reconnectToken: tokenFor(tokens, 2) });
        await bob.nextMessage('joinAck');

        // Both disconnect — both seats enter grace window.
        disconnectClient(alice);
        disconnectClient(bob);

        // Wait for close handlers to propagate.
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Client C tries tokenless — both seats are in grace window → match_not_joinable.
        const carol = connectMockClient(server);
        carol.hello();
        await carol.nextMessage('helloAck');
        carol.joinMatch(matchId, 'player');
        const err = await carol.nextMessage('error');
        expect(err.payload.code).toBe('match_not_joinable');

        // Legitimate reconnect still works for slot 1.
        const aliceReturn = connectMockClient(server);
        aliceReturn.hello();
        await aliceReturn.nextMessage('helloAck');
        aliceReturn.joinMatch(matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
        const snap = await aliceReturn.nextMessage('snapshot');
        expect(snap.type).toBe('snapshot');

        await server.close();
    });

    it('a tokenless join against a single grace-window seat is match_not_joinable (grace protection)', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        const token = generateSessionToken();
        server.attachPlayer({ matchId: match.matchId, playerId: match.playerIds[0] as PlayerId, sessionToken: token });

        // Client A joins the only seat, then disconnects.
        const alice = connectMockClient(server);
        alice.hello();
        await alice.nextMessage('helloAck');
        alice.joinMatch(match.matchId, 'player', { reconnectToken: token });
        await alice.nextMessage('joinAck');
        disconnectClient(alice);

        // Wait for close handler to propagate.
        await new Promise((resolve) => setTimeout(resolve, 5));

        // A tokenless attacker cannot claim the grace-window seat.
        const attacker = connectMockClient(server);
        attacker.hello();
        await attacker.nextMessage('helloAck');
        attacker.joinMatch(match.matchId, 'player');
        const err = await attacker.nextMessage('error');
        expect(err.payload.code).toBe('match_not_joinable');

        await server.close();
    });
});

// ----------------------------------------------------------------------------
// Idle-client staleness sweep (FR-009 first clause — review S1)
// ----------------------------------------------------------------------------

describe('createMatchServer — idle-client staleness (FR-009)', () => {
    /**
     * Boot a ticking server under FAKE timers: the scheduler interval
     * and `Date.now()` are both injected, so the idle-threshold math is
     * exercised deterministically with zero wall-clock waits. Every
     * awaited frame below is already in the mock's outbound buffer when
     * `nextMessage` runs (inbound handling is synchronous), so the fake
     * timer never starves the test's own polling.
     */
    async function startIdleSweepServer(bridge: Partial<MatchmakerBridge>): Promise<{
        server: ReturnType<typeof createMatchServer>;
        match: ReturnType<typeof scriptedMatch>;
        tokens: readonly SessionToken[];
    }> {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        const deps = withBridge(realDeps(), bridge);
        // Idle window 30 ms at a 10 ms cadence: the first fire after a
        // client's inbound burst re-anchors its lastSeenAtMs, so a silent
        // client is reaped on the third subsequent fire (diff ≥ 30 ms).
        const server = createMatchServer(
            { ...NETWORK_DEFAULT_CONFIG, tickRateMs: TEST_TICK_MS, port: 0, wsIdleTimeoutMs: 30 },
            deps,
        );
        await server.listen();
        const match = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        const tokens = attachPlayersForMatch(server, match);
        return { server, match, tokens };
    }

    it('a client silent past wsIdleTimeoutMs is force-closed through the reconnect lifecycle (review S1)', async () => {
        const disconnected: SessionToken[] = [];
        const { server, match, tokens } = await startIdleSweepServer({
            onSeatDisconnected: (event) => {
                disconnected.push(event.sessionToken);
            },
        });
        try {
            const one = connectMockClient(server);
            one.hello();
            await one.nextMessage('helloAck');
            one.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
            await one.nextMessage('joinAck');

            // Sweep-anchor semantics: the FIRST sweep after inbound traffic
            // re-anchors lastSeenAtMs (hello + join landed since the previous
            // fire), so the staleness clock effectively starts at t+10.
            // Fires @t+20/t+30 see diffs of 10/20 ms — still alive.
            vi.advanceTimersByTime(TEST_TICK_MS * 3);
            expect(one.socket.closes).toHaveLength(0);

            // Fire @t+40 crosses the 30 ms threshold: force-closed with the
            // idle-timeout code.
            vi.advanceTimersByTime(TEST_TICK_MS);
            expect(one.socket.closes).toEqual([{ code: 1013, reason: 'idle timeout' }]);

            // The close rode the TRANSPORT-LOSS lifecycle: matchmaking heard
            // onSeatDisconnected…
            expect(disconnected).toEqual([tokenFor(tokens, 1)]);

            // …and the token entered the reconnect registry — a fresh client
            // presenting it gets the full US2 resync (snapshot), proving the
            // disconnect → grace-expiry wiring engaged.
            const returning = connectMockClient(server);
            returning.hello();
            await returning.nextMessage('helloAck');
            returning.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
            const snapshot = await returning.nextMessage('snapshot');
            expect(snapshot.type).toBe('snapshot');
        } finally {
            vi.useRealTimers();
            await server.close();
        }
    });

    it('a client sending heartbeats within the idle window is not reaped (review S1 control)', async () => {
        const { server, match, tokens } = await startIdleSweepServer({});
        try {
            const one = connectMockClient(server);
            one.hello();
            await one.nextMessage('helloAck');
            one.joinMatch(match.matchId, 'player', { reconnectToken: tokenFor(tokens, 1) });
            await one.nextMessage('joinAck');

            // Ping every fire: each inbound frame marks the connection live,
            // so the sweep keeps advancing lastSeenAtMs and the threshold is
            // never crossed — even well past the window (60 ms elapsed).
            for (let i = 0; i < 6; i++) {
                one.ping(i);
                vi.advanceTimersByTime(TEST_TICK_MS);
            }
            expect(one.socket.closes).toHaveLength(0);
        } finally {
            vi.useRealTimers();
            await server.close();
        }
    });
});
