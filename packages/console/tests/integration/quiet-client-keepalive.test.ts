/**
 * Quiet-client keepalive integration — Bug 2 regression guard ("ticks
 * freeze until refresh").
 *
 * Pins the composition that keeps a quiet-but-alive player under the
 * server's idle-client staleness sweep (FR-002 / FR-009 first clause):
 *
 *   - the browser client sends APP-LEVEL `ping` envelopes at half the
 *     advertised heartbeat interval (bounded below by 1 s);
 *   - the server counts EVERY inbound frame as activity
 *     (`Connection.handleInbound` marks traffic before decode) and
 *     force-closes only when `nowMs − lastSeenAtMs ≥ wsIdleTimeoutMs`.
 *
 * Diagnosis note (2026-08 live-wire defects): the reported freeze was
 * NOT the sweep misfiring — both halves above were already correct and
 * individually test-pinned (client cadence: ws-match-client.test.ts;
 * server control: networking server.test.ts "review S1 control"). The
 * freeze was the Bug-1 render crash unmounting React while the socket
 * stayed open. THIS test guards the remaining composition risk on the
 * real wire: real sockets, real timers, and the client's 1 s ping
 * floor interacting with a short idle window. A change that switches
 * the client to transport-level pings, drops the heartbeat, or tightens
 * the sweep accounting makes the survival assertions fail.
 *
 * Short-config design (`heartbeatIntervalMs: 2000`, `wsIdleTimeoutMs:
 * 1600`, tick 50 ms): the client pings every max(1000, 2000/2) =
 * 1000 ms, so worst-case observed staleness ≈ 1050 ms — comfortably
 * inside the 1600 ms window, while the 5200 ms observation horizon
 * crosses BOTH 2× heartbeat (4 s) and 3× the idle window (4.8 s).
 * The negative control (a seat that never pings) is reaped promptly,
 * proving the harness can detect failure.
 */

import { computePlayerView } from '@europa/fog';
import { createMatchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type ServerDeps,
} from '@europa/networking';
import { afterEach, describe, expect, test } from 'vitest';
import { createWsMatchClient } from '../../src/net/ws-match-client';
import type { NetworkPayload, ProtocolEnvelope } from '../../src/state/types';

/** Tick cadence for this fixture server (fast ticks, real timers). */
const TICK_MS = 50;

/** Advertised heartbeat; the client pings at max(1000, half) = 1000 ms. */
const HEARTBEAT_MS = 2000;

/** Idle window: > ping cadence, crossed 3× by the observation horizon. */
const IDLE_TIMEOUT_MS = 1600;

/** How long the quiet seat must survive while receiving ticks. */
const OBSERVE_MS = 5200;

/**
 * Boot the production stack on an ephemeral port with the short idle
 * config and auto-start a public 2p match (the host.ts recipe).
 */
async function bootStack(): Promise<{
    url: string;
    matchId: string;
    seatTokens: [string, string];
    server: ReturnType<typeof createMatchServer>;
    matchmaker: ReturnType<typeof createMatchmaker>;
}> {
    const deps: ServerDeps = {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used (matchmaker pre-builds sessions)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {} as MatchmakerBridge,
        logger: NULL_LOGGER as Logger,
    };
    const server = createMatchServer(
        {
            ...NETWORK_DEFAULT_CONFIG,
            host: '127.0.0.1',
            port: 0,
            tickRateMs: TICK_MS,
            heartbeatIntervalMs: HEARTBEAT_MS,
            wsIdleTimeoutMs: IDLE_TIMEOUT_MS,
        },
        deps,
    );
    let bound: MatchmakerBridge = {};
    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });
    await server.listen();
    const matchmaker = createMatchmaker({}, { server: bindable });
    const created = matchmaker.createMatch({
        visibility: 'public',
        displayName: 'P1',
        settings: { playerCount: 2, boardSize: 32, tickIntervalMs: TICK_MS },
    });
    if (!created.ok) {
        throw new Error(`createMatch failed: ${created.error.message}`);
    }
    const filled = matchmaker.joinMatch({
        matchId: created.data.matchId,
        displayName: 'P2',
    });
    if (!filled.ok) {
        throw new Error(`joinMatch failed: ${filled.error.message}`);
    }
    const port = server.__boundPortForTest();
    if (port === undefined) {
        throw new Error('server did not report a bound port');
    }
    return {
        url: `ws://127.0.0.1:${String(port)}`,
        matchId: created.data.matchId,
        seatTokens: [created.data.seatAssignment.sessionToken, filled.data.seatAssignment.sessionToken],
        server,
        matchmaker,
    };
}

/** One raw WebSocket seat that speaks the handshake by hand. */
class RawSeat {
    readonly socket: WebSocket;
    readonly closes: Array<{ code: number }> = [];
    private nextResolve: ((frame: ProtocolEnvelope<NetworkPayload>) => void) | null = null;

    constructor(url: string) {
        this.socket = new WebSocket(url);
        this.socket.addEventListener('message', (event: MessageEvent<string>) => {
            const resolve = this.nextResolve;
            this.nextResolve = null;
            if (resolve !== null) {
                resolve(JSON.parse(event.data) as ProtocolEnvelope<NetworkPayload>);
            }
        });
        this.socket.addEventListener('close', (event: CloseEvent) => {
            this.closes.push({ code: event.code });
            const resolve = this.nextResolve;
            this.nextResolve = null;
            if (resolve !== null) {
                resolve({ type: 'closed', version: '', seq: 0 as never, payload: {} } as never);
            }
        });
    }

    open(): Promise<void> {
        return new Promise((resolve) => {
            this.socket.addEventListener('open', () => resolve(), { once: true });
        });
    }

    send(type: string, payload: Record<string, unknown>): void {
        this.socket.send(JSON.stringify({ type, version: '0.1.0', seq: 1, payload }));
    }

    /** Next inbound envelope (or a synthetic 'closed' marker on close). */
    next(): Promise<ProtocolEnvelope<NetworkPayload>> {
        return new Promise((resolve) => {
            this.nextResolve = resolve;
        });
    }
}

let teardown: (() => Promise<void>) | null = null;

afterEach(async () => {
    await teardown?.();
    teardown = null;
});

describe('quiet-but-alive clients survive the idle sweep (Bug 2 guard)', () => {
    test('a joined seat sending no orders keeps receiving ticks past 2× heartbeat', async () => {
        const stack = await bootStack();
        teardown = async () => {
            await stack.matchmaker.close();
            await stack.server.close();
        };

        // The REAL browser client over a REAL socket: its heartbeat loop
        // (app-level pings at the 1 s floor) is what must hold the seat.
        const client = createWsMatchClient({});
        const ticks: number[] = [];
        let closed = false;
        client.onMessage((envelope) => {
            if (envelope.type === 'tick') {
                ticks.push((envelope.payload as { tick: number }).tick);
            }
        });
        client.onConnectionChanged((state) => {
            if (state === 'disconnected' || state === 'closed') {
                closed = true;
            }
        });

        await client.connect(stack.url);
        // Token reclaim of a never-disconnected seat → normal joinAck path.
        await client.joinMatch({
            matchId: stack.matchId as never,
            role: 'player',
            reconnectToken: stack.seatTokens[0] as never,
            displayName: 'P1',
        });
        expect(client.state().connection).toBe('joined');

        // Observe QUIETLY (no orders) past 2× heartbeat AND 3× the idle
        // window. Liveness signal: the server answers EVERY ping with a
        // pong, so `lastSeenServerSeq` must grow steadily throughout the
        // window (tick frames themselves are legitimately sparse on a
        // quiet board — skip-send deltas suppress unchanged views).
        const startedAt = Date.now();
        let seqAtMid = 0;
        let sampledMid = false;
        while (Date.now() - startedAt < OBSERVE_MS) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (!sampledMid && Date.now() - startedAt >= OBSERVE_MS / 2) {
                seqAtMid = client.state().lastSeenServerSeq;
                sampledMid = true;
            }
        }
        const seqAtEnd = client.state().lastSeenServerSeq;

        expect(closed).toBe(false);
        expect(client.state().connection).toBe('joined');
        // Pong traffic proves bidirectional liveness early, midway, and at
        // the end of the window (≥ 1 ping/second ⇒ several exchanges).
        expect(seqAtMid).toBeGreaterThan(0);
        expect(seqAtEnd).toBeGreaterThan(seqAtMid);
        // At least one tick broadcast landed after the join snapshot.
        expect(ticks.length).toBeGreaterThan(0);

        // Still fully alive after the window: an order round-trips.
        const { playerId } = client.state();
        expect(playerId).not.toBeNull();
        const ack = await client.sendOrder({
            kind: 'setReserves',
            player: playerId as never,
            cell: { x: 1, y: 1 },
            percent: 5 as never,
        });
        expect(ack).toHaveProperty('ok');
        client.disconnect();
    }, 20_000);

    test('negative control: a seat that never pings IS reaped by the sweep', async () => {
        const stack = await bootStack();
        teardown = async () => {
            await stack.matchmaker.close();
            await stack.server.close();
        };

        // Hand-rolled seat: handshake then TOTAL silence (no pings, no
        // orders). The sweep must force-close it shortly after the idle
        // window — proving this fixture detects a broken keepalive.
        const seat = new RawSeat(stack.url);
        await seat.open();
        seat.send('hello', { protocolVersion: '0.1.0' });
        const helloAck = await seat.next();
        expect(helloAck.type).toBe('helloAck');
        seat.send('joinMatch', {
            matchId: stack.matchId,
            role: 'player',
            reconnectToken: stack.seatTokens[1],
            displayName: 'P2',
        });
        const joinReply = await seat.next();
        expect(joinReply.type).toBe('joinAck');

        const closedCode = await new Promise<number>((resolve) => {
            const startedAt = Date.now();
            const poll = (): void => {
                if (seat.closes.length > 0) {
                    resolve(seat.closes[0]?.code ?? 0);
                    return;
                }
                if (Date.now() - startedAt > 5000) {
                    resolve(-1); // never closed: keepalive semantics regressed
                    return;
                }
                setTimeout(poll, 50);
            };
            poll();
        });
        expect(closedCode).toBe(1013);
    }, 15_000);
});
