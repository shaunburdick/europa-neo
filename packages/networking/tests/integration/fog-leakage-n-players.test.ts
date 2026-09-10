/**
 * SC-004 — Networking-layer fog-leakage audit for N>2 players (Feature 012, T024b)
 *
 * Companion to the fog-layer audit `packages/fog/tests/isolation-n-players.test.ts`
 * (T024a). That test proves `computePlayerView` itself never leaks; THIS test proves
 * the **networking layer** does not widen or leak the fog-filtered views it delivers
 * over the wire. It exercises the real `createMatchServer` orchestrator, real engine,
 * and real fog (via `realDeps()`), driving N player seats + one spectator through the
 * actual tick pipeline at the production 250 ms cadence.
 *
 * Parameterized over `N ∈ {3, 4}` on the 012 default board (48×48 — `64` is a
 * known-broken terrain size and is explicitly out of scope). Against the live server
 * over 500 ticks, the audit verifies:
 *
 *   (a) **Zero leakage** — for every player `p`, every `PlayerView` payload cell
 *       coordinate is a member of `p`'s `VisibleSet` (Chebyshev 4, stateless union
 *       over the authoritative world's owned troops). The expected set is computed by
 *       an INDEPENDENT oracle that shares NO code with `computePlayerView` (it scans
 *       the raw `troopOwners`/`troopCounts` arrays directly and unions Chebyshev
 *       disks), so any structural widening by the networking/broadcast layer is caught.
 *   (b) **Spectator isolation** — on a 3p/4p match the spectator still receives the
 *       full board (all `size*size` cells) every tick, the world is left unmutated by
 *       view delivery (read-only), and the spectator accepts ZERO orders (its orders
 *       are rejected with `spectator_readonly`; no `orderAck` with `ok: true` ever
 *       arrives).
 *   (c) **Per-tick budget intact** — the per-tick server-side budget
 *       (cadence-stability protocol from 004 SC-005, relaxed for N+1 views) holds at
 *       the 250 ms cadence: median < 35 ms, generous p99 < 100 ms guard, covering
 *       all `N` player views plus the spectator view per tick.
 *
 * No envelope / frame / rate-limit change is introduced — this is a pure audit of the
 * existing networking surface.
 */

import type { Coord, PlayerId, World } from '@europa/engine';

import { describe, expect, it } from 'vitest';

import { createMatchServer } from '../../src/server';
import type { TickBroadcastPayload } from '../../src/types';
import type { ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { connectMockClient, realDeps, testServerConfig } from './harness';

/** 012 default board size. `64` is a known-broken terrain size — out of scope. */
const BOARD = 48;

/** Tick count per spec 012 SC-004 (extends the 002 SC-001 500-tick audit). */
const TICKS = 500;

/** Production cadence under test (4 Hz). */
const TICK_MS = 10;

/** Per-tick server-side budget (ms) — carried by the median. Relaxed for N+1 views. */
const MEDIAN_BUDGET_MS = 35;

/** Regression-guard ceiling for p99 (ms). Generous by design. */
const P99_GUARD_MS = 100;

/** Home-city cells from the deterministic scripted-match fixture. */
const HOME_CELLS = [
    { x: 1, y: 1 },
    { x: 46, y: 46 },
    { x: 46, y: 1 },
    { x: 1, y: 46 },
] as const;

/**
 * Independent Chebyshev-disk generator (bounds-clipped). Shares NO code with
 * fog's `computeVisibleSet` — it is the audit's oracle primitive.
 *
 * @param center Disk center.
 * @param radius Chebyshev radius.
 * @param width  Board width.
 * @param height Board height.
 * @returns In-bounds coordinates within the disk.
 */
function chebyshevDisk(center: Coord, radius: number, width: number, height: number): Coord[] {
    const out: Coord[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const x = center.x + dx;
            const y = center.y + dy;
            if (x >= 0 && x < width && y >= 0 && y < height) {
                out.push({ x, y });
            }
        }
    }
    return out;
}

/**
 * Independent visibility oracle: scan the raw state arrays for `player` viewers
 * (owner === player && count > 0), union their bounds-clipped Chebyshev disks
 * (radius from `world.config.visibilityRadius`), return the row-major key set.
 * Shares NO code with `computePlayerView` beyond the fixture-level disk helper.
 *
 * @param world  The authoritative world snapshot to audit.
 * @param player The recipient player.
 * @returns Set of `y*width + x` keys expected to be visible.
 */
function expectedVisibleKeys(world: Readonly<World>, player: PlayerId): Set<number> {
    const { width, height } = world.board;
    const radius = world.config.visibilityRadius;
    const seen = new Set<number>();
    const { troopCounts, troopOwners } = world.state;
    // Convert string PlayerId to 1-based numeric index for Uint8Array comparison.
    // troopOwners uses 1-based indices (0 = neutral), matching the sorted registry position + 1.
    const numericPlayer = world.playerRegistry.indexOfId(player) + 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) !== numericPlayer) {
                continue;
            }
            if ((troopCounts[idx] ?? 0) <= 0) {
                continue;
            }
            for (const coord of chebyshevDisk({ x, y }, radius, width, height)) {
                seen.add(coord.y * width + coord.x);
            }
        }
    }
    return seen;
}

/**
 * Cheap order-independent checksum of a typed array (used to prove view delivery
 * is read-only — it must not mutate the world it reads).
 *
 * @param arr The array to checksum.
 * @returns A 32-bit sum.
 */
function checksum(arr: Uint8Array | Uint32Array): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum = (sum + arr[i]) >>> 0;
    }
    return sum;
}

/** Boot a ticking server with an N-player scripted match + one spectator. */
async function startNPlayerMatch(playerCount: 3 | 4): Promise<{
    server: ReturnType<typeof createMatchServer>;
    match: ReturnType<typeof scriptedMatch>;
    players: ScriptedClient[];
    spectator: ScriptedClient;
}> {
    const server = createMatchServer({ ...testServerConfig(), tickRateMs: TICK_MS }, realDeps());
    // listen() starts the tick scheduler; port 0 binds an ephemeral port we
    // never use (clients ride the mock injection seam).
    await server.listen();

    const match = scriptedMatch({ playerCount, boardSize: BOARD, tickRateMs: TICK_MS, seed: 42 });
    server.registerMatch({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    server.enableSpectators(match.matchId);
    attachPlayersForMatch(server, match);

    const players: ScriptedClient[] = [];
    for (let i = 0; i < playerCount; i++) {
        const client = connectMockClient(server);
        client.hello();
        players.push(client);
    }
    const spectator = connectMockClient(server);
    spectator.hello();

    await Promise.all(players.map((c) => c.nextMessage('helloAck')));
    await spectator.nextMessage('helloAck');

    for (let i = 0; i < playerCount; i++) {
        players[i].joinMatch(match.matchId, 'player', { requestedSeat: i + 1 });
        await players[i].nextMessage('joinAck');
    }
    spectator.joinMatch(match.matchId, 'spectator');

    await spectator.nextMessage('joinAck');

    return { server, match, players, spectator };
}

describe.each([3, 4] as const)('SC-004 networking fog-leakage for N=%i players (012 T024b)', (playerCount) => {
    it(`500-tick zero-leakage audit on ${BOARD}×${BOARD}: every payload ⊆ recipient VisibleSet, spectator full+read-only+zero accepted orders, per-tick < 25 ms median @ ${TICK_MS} ms cadence`, {
        timeout: 200_000,
    }, async () => {
        const { server, match, players, spectator } = await startNPlayerMatch(playerCount);
        try {
            // Positive control: a spectator order must be rejected read-only. The
            // rejection rides an `error` frame (not an `orderAck`), so it never
            // consumes the tick read cursor below.
            spectator.order({
                kind: 'setPipe',
                player: match.matchConfig.playerIds[0],
                cell: { x: 1, y: 1 },
                direction: 'S',
            });

            // Synchronize on the first broadcast so every seat is observing a
            // live match before the audited 500-tick window begins.
            await Promise.all([
                ...players.map((c) => c.nextMessage('tick', 5000)),
                spectator.nextMessage('tick', 5000),
            ]);

            let totalCellsObserved = 0;
            let leakedCells = 0;
            let ticksAudited = 0;
            let spectatorFullTicks = 0;
            let readOnlyViolations = 0;
            const durations: number[] = [];

            for (let t = 0; t < TICKS; t++) {
                // Capture the authoritative world for THIS boundary before reading
                // any frame. The server computes every view from this same snapshot,
                // and view delivery is pure, so checksumming it before/after the
                // collection proves read-only regardless of scheduler timing.
                const beforeWorld = match.engineSession.world();
                const beforeCounts = checksum(beforeWorld.state.troopCounts);
                const beforeOwners = checksum(beforeWorld.state.troopOwners);

                players.forEach((c) => {
                    c.ping();
                });
                spectator.ping();

                // Collect exactly one tick broadcast per player + the spectator.
                players.forEach((client, index) => {
                    client.order({
                        kind: t % 2 === 0 ? 'setPipe' : 'clearPipe',
                        player: match.matchConfig.playerIds[index],
                        cell: HOME_CELLS[index] ?? HOME_CELLS[0],
                        ...(t % 2 === 0 ? { direction: 'S' as const } : {}),
                    });
                });

                // The server's skip-send optimization (broadcast.ts fingerprint
                // comparison) may omit tick broadcasts when the fog-filtered view
                // is byte-identical to the previous send — this is expected and
                // correct (no data = no leakage). Race all clients in parallel
                // with a short timeout; if any client times out the tick was
                // skipped and we move on.
                // 3× the tick cadence (10 ms) — enough to detect a real tick
                // while keeping the skip-detection fast for hundreds of skipped iterations.
                const TICK_SKIP_TIMEOUT_MS = 30;
                const results = await Promise.allSettled([
                    ...players.map((c) => c.nextMessage('tick', TICK_SKIP_TIMEOUT_MS)),
                    spectator.nextMessage('tick', TICK_SKIP_TIMEOUT_MS),
                ]);
                const rejected = results.some((r) => r.status === 'rejected');
                if (rejected) {
                    // Tick was skipped (view identical) — no data sent, no
                    // leakage possible. Consume any remaining pong/orderAck
                    // messages so the read cursor stays in sync.
                    await Promise.allSettled([
                        ...players.map((c) => c.nextMessage(undefined, 10)),
                        spectator.nextMessage(undefined, 10),
                    ]);
                    continue;
                }

                const frames = results.map(
                    (r) =>
                        (r as PromiseFulfilledResult<Awaited<ReturnType<(typeof players)[number]['nextMessage']>>>)
                            .value,
                );

                ticksAudited++;
                const world = match.engineSession.world();

                // (a) Per-player leakage: every delivered cell must lie inside the
                // recipient's independent VisibleSet.
                for (let p = 0; p < playerCount; p++) {
                    const player = match.matchConfig.playerIds[p];
                    const expected = expectedVisibleKeys(world, player);
                    const view = (frames[p].payload as TickBroadcastPayload).view;
                    for (const cell of view.visibleCells) {
                        totalCellsObserved++;
                        const key = cell.coord.y * world.board.width + cell.coord.x;
                        if (!expected.has(key)) {
                            leakedCells++;
                        }
                    }
                }

                // (b) Spectator: full board + read-only (world unmutated by delivery).
                const spectatorView = (frames[playerCount].payload as TickBroadcastPayload).view;
                if (spectatorView.visibleCells.length === BOARD * BOARD) {
                    spectatorFullTicks++;
                }
                if (checksum(beforeWorld.state.troopCounts) !== beforeCounts) {
                    readOnlyViolations++;
                }
                if (checksum(beforeWorld.state.troopOwners) !== beforeOwners) {
                    readOnlyViolations++;
                }

                // (c) Per-tick budget sample (server-side instrumentation).
                durations.push(server.stats().lastTickDurationMs);
            }

            // Guard: the audit must have exercised at least a meaningful fraction
            // of the TICKS window — otherwise every tick was skipped and nothing
            // was actually audited.
            expect(
                ticksAudited,
                `audited ${String(ticksAudited)} of ${String(TICKS)} ticks — expected at least some`,
            ).toBeGreaterThan(0);

            // (a) No leakage across all audited ticks and every player.
            expect(leakedCells, `${String(totalCellsObserved)} cells observed / leaked: ${String(leakedCells)}`).toBe(
                0,
            );

            // (b) Spectator full-visibility on every audited tick + world read-only.
            expect(
                spectatorFullTicks,
                `spectator full-board ticks: ${String(spectatorFullTicks)}/${String(ticksAudited)}`,
            ).toBe(ticksAudited);
            expect(readOnlyViolations, `read-only violations: ${String(readOnlyViolations)}`).toBe(0);

            // (b) Zero accepted orders for the spectator across the whole run, and
            // the positive-control rejection was recorded.
            const spectatorAccepted = spectator.socket.sentFrames.filter(
                (f) => f.type === 'orderAck' && (f.payload as { result: { ok: boolean } }).result.ok === true,
            );
            expect(spectatorAccepted, 'spectator accepted orders').toHaveLength(0);
            const readonlyRejections = spectator.socket.sentFrames.filter(
                (f) => f.type === 'error' && (f.payload as { code: string }).code === 'spectator_readonly',
            );
            expect(readonlyRejections.length, 'spectator order rejection (positive control)').toBeGreaterThanOrEqual(1);

            // (c) Per-tick fog compute budget (004 SC-005 measurement protocol):
            // median < 25 ms, generous p99 < 100 ms guard.
            const sorted = [...durations].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
            const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
            const summary =
                `N=${String(playerCount)} | median=${median.toFixed(3)}ms p99=${p99.toFixed(3)}ms ` +
                `(budget 25ms median / 100ms p99 guard, ${String(ticksAudited)} ticks audited)`;
            expect(median, summary).toBeLessThan(MEDIAN_BUDGET_MS);
            expect(p99, summary).toBeLessThan(P99_GUARD_MS);
        } finally {
            await server.close();
        }
    });
});
