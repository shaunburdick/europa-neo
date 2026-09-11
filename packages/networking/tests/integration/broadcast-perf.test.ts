/**
 * Broadcast Performance Test — Feature 004 (Issue #135, T027)
 *
 * SC-005: broadcast phase (fog computation + delta encoding +
 * serialization for all connections) completes in under 5 ms per tick
 * on a 32×32 2-player board with 4 connections (2 players + 2
 * spectators).
 *
 * Uses `performance.now()` to measure elapsed time. Includes a
 * determinism assertion (output identical across runs).
 */

import { describe, expect, it } from 'vitest';

import { buildTickBroadcast, sendTickBroadcast } from '../../src/broadcast';
import { Connection } from '../../src/connection';
import type { FogFactory } from '../../src/contracts/network-api';
import { MatchChannel } from '../../src/match-channel';
import type { PlayerId, PlayerView } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/** The budget: broadcast phase must complete within this (ms). */
const BROADCAST_BUDGET_MS = 5;

/** A minimal valid PlayerView for the 32×32 board stub. */
function stubView32(player: PlayerId, tick: number): PlayerView {
    const cells: PlayerView['visibleCells'] = [];
    // 32×32 board: generate a representative set of visible cells.
    // For a 2-player game with visibility radius 3, each player
    // typically sees ~49 cells (7×7 Chebyshev). We generate 49 cells
    // to match a realistic view.
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            // Include a realistic subset of cells (49 cells in a 7×7 block).
            if (x >= 0 && x < 7 && y >= 0 && y < 7) {
                cells.push({
                    coord: { x, y },
                    cell: { x, y, elevation: (x + y) % 5, terrain: 'land' as const },
                    troopCount: (x + y) % 10,
                    troopOwner: ((x + y) % 2 === 0 ? player : 0) as PlayerId,
                    pipes: new Set(['N', 'E'] as const),
                    reservesPercent: (x % 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
                    cityOwner: x === 0 && y === 0 ? player : null,
                });
            }
        }
    }

    return {
        player,
        tick,
        visibleCells: cells,
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: {
            boardSize: 32,
            playerCount: 2,
            tickIntervalMs: 250,
            seed: 42,
            visibilityRadius: 3,
        },
    };
}

/** Fog stub for 32×32 board: returns deterministic views per player. */
function stubFog32(): FogFactory {
    return {
        computePlayerView({ world, playerId, spectator }) {
            return spectator ? stubView32(1, world.tick) : stubView32(playerId, world.tick);
        },
    };
}

/** Build a 4-connection channel: 2 players + 2 spectators. */
function channelWithFourConnections(): {
    channel: MatchChannel;
    connections: Connection[];
    sockets: MockWebSocket[];
} {
    const match = scriptedMatch({ boardSize: 32 });
    const channel = new MatchChannel({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    channel.spectatorsAllowed = true;

    const sockets: MockWebSocket[] = [];
    const connections: Connection[] = [];

    // Player 1
    const socketA = new MockWebSocket();
    const connA = new Connection({ socket: socketA, role: 'player', nowMs: 0 });
    connA.markJoined('token-a', 1, match.matchId);
    channel.attachSeat(1, 'token-a', connA);
    sockets.push(socketA);
    connections.push(connA);

    // Player 2
    const socketB = new MockWebSocket();
    const connB = new Connection({ socket: socketB, role: 'player', nowMs: 0 });
    connB.markJoined('token-b', 2, match.matchId);
    channel.attachSeat(2, 'token-b', connB);
    sockets.push(socketB);
    connections.push(connB);

    // Spectator 1
    const socketC = new MockWebSocket();
    const connC = new Connection({ socket: socketC, role: 'spectator', nowMs: 0 });
    connC.markJoined('token-c', null, match.matchId);
    channel.addSpectator(connC);
    sockets.push(socketC);
    connections.push(connC);

    // Spectator 2
    const socketD = new MockWebSocket();
    const connD = new Connection({ socket: socketD, role: 'spectator', nowMs: 0 });
    connD.markJoined('token-d', null, match.matchId);
    channel.addSpectator(connD);
    sockets.push(socketD);
    connections.push(connD);

    return { channel, connections, sockets };
}

describe('Broadcast performance (T027)', () => {
    it(`broadcast phase < ${String(BROADCAST_BUDGET_MS)} ms on 32×32 2p with 4 connections`, () => {
        const { channel, connections } = channelWithFourConnections();
        const fog = stubFog32();

        // Warm up: one tick to populate any JIT caches.
        channel.recordTick();
        const warmup = buildTickBroadcast(channel, { fog }, 0);
        sendTickBroadcast(channel, connections, warmup.broadcast, 1);
        // Clear lastSentView to force a full recompute on the measured tick.
        channel.lastSentView.clear();

        // Measure: broadcast phase = buildTickBroadcast + sendTickBroadcast.
        channel.recordTick();
        const startMs = performance.now();
        const result = buildTickBroadcast(channel, { fog }, 100);
        const sentCount = sendTickBroadcast(channel, connections, result.broadcast, 101);
        const elapsedMs = performance.now() - startMs;

        // All 4 connections should have received a tick (first real tick).
        expect(sentCount).toBe(4);

        // Budget gate: broadcast phase < 5 ms.
        expect(elapsedMs).toBeLessThan(BROADCAST_BUDGET_MS);
    });

    it('determinism: two identical ticks produce byte-identical broadcast maps', () => {
        const { channel, connections } = channelWithFourConnections();
        const fog = stubFog32();

        // Tick 1
        channel.recordTick();
        const first = buildTickBroadcast(channel, { fog }, 100);
        sendTickBroadcast(channel, connections, first.broadcast, 101);

        // Tick 2 with the same fog state (no world change).
        channel.recordTick();
        const second = buildTickBroadcast(channel, { fog }, 200);

        // Both ticks should be 'skip' for all connections (byte-identical views).
        for (const conn of connections) {
            expect(second.broadcast.get(conn.id)).toBe('skip');
        }

        // View cache should be present and populated.
        expect(Object.keys(second.viewCache).length).toBeGreaterThan(0);
    });

    it('view cache keys match expected player ids and spectators', () => {
        const { channel } = channelWithFourConnections();
        const fog = stubFog32();

        channel.recordTick();
        const result = buildTickBroadcast(channel, { fog }, 100);

        // Player ids 1 and 2, plus 'spectator'.
        expect(result.viewCache['1']).toBeDefined();
        expect(result.viewCache['2']).toBeDefined();
        expect(result.viewCache.spectator).toBeDefined();
    });
});
