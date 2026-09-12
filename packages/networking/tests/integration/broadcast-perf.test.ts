/**
 * Broadcast Performance Test — Feature 004 (Issue #135, T027)
 *
 * SC-005: broadcast phase (fog computation + delta encoding +
 * serialization for all connections) completes in under 5 ms per tick
 * on a 32×32 2-player board with 4 connections (2 players + 2
 * spectators).
 *
 * Methodology (shared-CI hardening, issue #74 follow-up): the original
 * test timed a SINGLE tick, so any JIT/GC/scheduler stall on a
 * contended runner was captured verbatim (observed CI readings of
 * 5.5–6.5 ms against a ~0.4 ms local median). Following the feature 002
 * SC-004 remediation — see `packages/fog/tests/quickstart/
 * q-f07-performance.test.ts` — each round measures `TRIALS_PER_ROUND`
 * ticks and reports their MEDIAN; the assertion carries the MINIMUM of
 * the per-round medians. Best-of-rounds absorbs runner contention while
 * a genuine regression raises every round's median and still fails.
 * The 5 ms SC-005 budget is unchanged.
 *
 * Every measured tick clears `channel.lastSentView` first, forcing the
 * full fog + encode + send recompute (never the `'skip'` delta path) —
 * the same work production performs whenever a view changes. A final
 * un-cleared build asserts the skip path still collapses unchanged
 * views, proving the measurement genuinely exercised recomputation.
 *
 * Includes a determinism assertion (output identical across runs).
 * Issue #74: identity is the canonical string `PlayerId`.
 */

import { describe, expect, it } from 'vitest';

import { buildTickBroadcast, sendTickBroadcast } from '../../src/broadcast';
import { Connection } from '../../src/connection';
import type { FogFactory } from '../../src/contracts/network-api';
import { MatchChannel } from '../../src/match-channel';
import { SPECTATOR_VIEW_PLAYER_ID } from '../../src/spectator';
import type { PlayerId, PlayerView } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/** The budget: broadcast phase must complete within this (ms). */
const BROADCAST_BUDGET_MS = 5;

/** Connections per match under test: 2 players + 2 spectators. */
const CONNECTIONS_PER_TICK = 4;

/** Unmeasured warm-up ticks (JIT + allocator steady state) before timing. */
const WARMUP_TICKS = 5;

/** Measured ticks per round; larger samples stabilize the median (≥ 15). */
const TRIALS_PER_ROUND = 21;

/**
 * Measurement rounds. The full networking suite runs files in parallel,
 * so any single round can be inflated by scheduler contention — a
 * property of the runner, not the broadcast path. Best-of-rounds
 * absorbs that noise (feature 002 SC-004 precedent).
 */
const ROUNDS = 3;

/**
 * Regression-guard ceiling for the per-round p95. Raw high percentiles
 * over small samples are dominated by shared-runner stalls, so this
 * carries no spec budget — a genuine pipeline blowup exceeds it by
 * orders of magnitude, keeping the guard useful.
 */
const P95_GUARD_MS = 20;

/** Slot identities used by the 32×32 fixture. */
const P1 = 'Player000001' as PlayerId;
const P2 = 'Player000002' as PlayerId;

/**
 * Nearest-rank percentile over a pre-sorted sample array. Mirrors the
 * helper in `tests/integration/perf.test.ts`.
 *
 * @param sorted Ascending sample array (must be non-empty).
 * @param p      Percentile in `[0, 1]`.
 * @returns The sample at the nearest-rank position.
 */
function percentile(sorted: readonly number[], p: number): number {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

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
                    troopOwner: (x + y) % 2 === 0 ? player : null,
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
            playerIds: [P1, P2],
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
            return spectator ? stubView32(SPECTATOR_VIEW_PLAYER_ID, world.tick) : stubView32(playerId, world.tick);
        },
    };
}

/** Build a 4-connection channel: 2 players + 2 spectators. */
function channelWithFourConnections(): {
    channel: MatchChannel;
    connections: Connection[];
    ids: [PlayerId, PlayerId];
    sockets: MockWebSocket[];
} {
    const match = scriptedMatch({ boardSize: 32 });
    const channel = new MatchChannel({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    channel.spectatorsAllowed = true;

    const [p1, p2] = match.playerIds;
    if (p1 === undefined || p2 === undefined) {
        throw new Error('channelWithFourConnections: fixture missing player ids');
    }

    const sockets: MockWebSocket[] = [];
    const connections: Connection[] = [];

    // Player 1
    const socketA = new MockWebSocket();
    const connA = new Connection({ socket: socketA, role: 'player', nowMs: 0 });
    connA.markJoined('token-a', p1, match.matchId);
    channel.attachSeat(p1, 'token-a', connA);
    sockets.push(socketA);
    connections.push(connA);

    // Player 2
    const socketB = new MockWebSocket();
    const connB = new Connection({ socket: socketB, role: 'player', nowMs: 0 });
    connB.markJoined('token-b', p2, match.matchId);
    channel.attachSeat(p2, 'token-b', connB);
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

    return { channel, connections, ids: [p1, p2], sockets };
}

describe('Broadcast performance (T027)', () => {
    it(`broadcast phase < ${String(BROADCAST_BUDGET_MS)} ms on 32×32 2p with 4 connections`, () => {
        const { channel, connections } = channelWithFourConnections();
        const fog = stubFog32();

        // Warm up: several ticks to populate JIT caches and the allocator
        // before any measurement (unmeasured).
        for (let i = 0; i < WARMUP_TICKS; i++) {
            channel.recordTick();
            channel.lastSentView.clear();
            const warmup = buildTickBroadcast(channel, { fog }, i);
            sendTickBroadcast(channel, connections, warmup.broadcast, i + 1);
        }

        const roundMedians: number[] = [];
        const roundP95s: number[] = [];
        const summaries: string[] = [];
        // Number of measured ticks that did NOT reach all four connections —
        // must stay zero (proves each measurement forced a full recompute).
        let nonFullRecomputes = 0;

        for (let round = 0; round < ROUNDS; round++) {
            const samples: number[] = [];
            for (let i = 0; i < TRIALS_PER_ROUND; i++) {
                // Clear lastSentView to force a full recompute on the
                // measured tick (never the 'skip' delta path).
                channel.lastSentView.clear();
                channel.recordTick();
                const startMs = performance.now();
                const result = buildTickBroadcast(channel, { fog }, 1000 + round * TRIALS_PER_ROUND + i);
                const sentCount = sendTickBroadcast(
                    channel,
                    connections,
                    result.broadcast,
                    1001 + round * TRIALS_PER_ROUND + i,
                );
                samples.push(performance.now() - startMs);
                if (sentCount !== CONNECTIONS_PER_TICK) {
                    nonFullRecomputes += 1;
                }
            }

            samples.sort((a, b) => a - b);
            const min = samples[0] ?? 0;
            const median = percentile(samples, 0.5);
            const p95 = percentile(samples, 0.95);
            const max = samples[samples.length - 1] ?? 0;
            roundMedians.push(median);
            roundP95s.push(p95);
            summaries.push(
                `round ${String(round)}: min=${min.toFixed(3)}ms median=${median.toFixed(3)}ms ` +
                    `p95=${p95.toFixed(3)}ms max=${max.toFixed(3)}ms`,
            );
        }

        const summary = summaries.join(' | ');

        // Sanity: every measured tick performed the full 4-connection send.
        expect(nonFullRecomputes).toBe(0);

        // Budget gate: the best (least-contended) round median must be under
        // the 5 ms SC-005 budget. A genuine regression raises every round's
        // median, so the minimum-of-medians still fails.
        expect(Math.min(...roundMedians), summary).toBeLessThan(BROADCAST_BUDGET_MS);

        // Regression guard (no spec budget): catch a genuine pipeline blowup.
        expect(Math.min(...roundP95s), summary).toBeLessThan(P95_GUARD_MS);

        // Cross-tick delta behavior still holds: an unchanged view built
        // WITHOUT clearing the cache collapses to 'skip' for every
        // connection — the contrast proving the measured ticks above were
        // genuine recomputes, not cached skips.
        channel.recordTick();
        const skipped = buildTickBroadcast(channel, { fog }, 99_999);
        for (const conn of connections) {
            expect(skipped.broadcast.get(conn.id)).toBe('skip');
        }
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
        const { channel, ids } = channelWithFourConnections();
        const fog = stubFog32();

        channel.recordTick();
        const result = buildTickBroadcast(channel, { fog }, 100);

        // Player ids plus 'spectator'.
        expect(result.viewCache[ids[0]]).toBeDefined();
        expect(result.viewCache[ids[1]]).toBeDefined();
        expect(result.viewCache.spectator).toBeDefined();
    });
});
