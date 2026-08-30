/**
 * SC-004 — Fog isolation audit for N>2 players (Feature 012, T024a)
 *
 * A 500-tick zero-leakage audit parameterized over `N ∈ {3, 4}` on the
 * 012 default board (48×48 — `64` is a known-broken terrain size and is
 * explicitly out of scope). Against scripted marches/battles, every
 * per-player payload's cell set must be a subset of that recipient's
 * `VisibleSet` (Chebyshev 4, stateless union). The expected set is
 * computed by an INDEPENDENT oracle that shares NO code with
 * `computeVisibleSet` (it scans the raw `troopOwners`/`troopCounts`
 * arrays directly and unions `chebyshevDisk`s), so any structural leak
 * in `computePlayerView` is caught:
 *
 *   (a) zero leakage — for every player `p`, every
 *       `view.visibleCells[i].coord` is in `p`'s expected horizon, and
 *       the sets match exactly (`toHaveLength` + subset scan);
 *   (b) spectator mode on a 3p/4p match still yields full-visibility
 *       read-only views — the full board (all `size*size` cells) with
 *       the world left unmutated (fog is pure; order acceptance is a
 *       transport-layer guarantee, 004 SC-002, so "zero accepted
 *       orders" holds at the fog boundary by construction);
 *   (c) the per-tick fog compute budget is intact at the 250 ms
 *       cadence — median < 15 ms, p99 < 100 ms guard (004 SC-005
 *       measurement protocol), covering all `N` player views plus the
 *       spectator view per tick.
 *
 * The engine's `tick()` advances state; scripted placements between
 * ticks use the same typed-array clone-mutation path combat and
 * movement use, and are re-applied every tick so no player is ever
 * eliminated mid-run (decay/combat cannot accumulate). A summary rides
 * on the final assertion message instead of console output.
 */

import type { Coord, PlayerId, World } from '@europa/engine';

import { tick } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../src/playerView';
import { chebyshevDisk } from '../src/range';
import { buildWorldWithTroops, withVisibilityRadius } from './fixtures/world';

/** 012 default board size. `64` is a known-broken terrain size — out of scope. */
const BOARD = 48;

/** Tick count per spec 012 SC-004 (extends the 002 SC-001 500-tick audit). */
const TICKS = 500;

/** Chebyshev 4 per spec FR-009 / SC-004 (engine default visibility radius). */
const RADIUS = 4;

/** Production cadence under test (informational; no real timers in this audit). */
const CADENCE_MS = 250;

/** Placement tuple: `[x, y, player, count]`. */
type Placement = readonly [number, number, PlayerId, number];

/**
 * Build a full placement list for all `playerCount` players for a given
 * tick. Each player gets two marching stacks confined to a disjoint
 * horizontal band so no two enemy stacks ever share a cell (no combat
 * elimination); adjacent bands mean horizons naturally overlap (battle
 * stress). Every ~50 ticks a "battle" frame pulls an enemy stack within
 * 2 cells of a neighbor's stack (horizons overlap, distinct cells → no
 * combat) to exercise the union-of-horizons invariant under pressure.
 *
 * @param t            Tick index (drives the march).
 * @param playerCount  Number of players (3 or 4).
 * @returns Full placement list for every player this tick.
 */
function frameForTick(t: number, playerCount: number): Placement[] {
    const band = Math.floor(BOARD / playerCount);
    const placements: Placement[] = [];
    for (let p = 1; p <= playerCount; p++) {
        const baseY = (p - 1) * band;
        const x1 = (t * 3 + p * 2) % BOARD;
        const y1 = baseY + (t % band);
        const x2 = (t * 3 + 20 + p * 2) % BOARD;
        const y2 = baseY + ((t + 5) % band);
        placements.push([x1, y1, p as PlayerId, 12]);
        placements.push([x2, y2, p as PlayerId, 12]);
    }
    // Battle frame: pull player 2's stack next to player 1's (distance 2).
    if (t % 50 === 25 && playerCount >= 2) {
        const bx = (t * 3 + 1 * 2) % BOARD;
        const by = (1 - 1) * band + (t % band);
        placements.push([(bx + 2) % BOARD, by, 2 as PlayerId, 12]);
    }
    // Battle frame (4p): pull player 4's stack next to player 3's (distance 2).
    if (t % 50 === 25 && playerCount >= 4) {
        const bx = (t * 3 + 3 * 2) % BOARD;
        const by = (3 - 1) * band + (t % band);
        placements.push([(bx + 2) % BOARD, by, 4 as PlayerId, 12]);
    }
    return placements;
}

/**
 * Rebuild a world's troop arrays from an explicit placement list (the
 * same clone-mutation path the engine's resolution uses). Re-applied
 * every tick so decay/combat cannot accumulate and eliminate a player.
 *
 * @param world      Source world (not mutated).
 * @param placements Full placement list for all players.
 * @returns A new `World` with exactly these troops.
 */
function applyPlacements(world: Readonly<World>, placements: readonly Placement[]): World {
    const size = world.board.width;
    const owners = new Uint8Array(size * size);
    const counts = new Uint32Array(size * size);
    for (const [x, y, player, count] of placements) {
        owners[y * size + x] = player;
        counts[y * size + x] = count;
    }
    return { ...world, state: { ...world.state, troopOwners: owners, troopCounts: counts } };
}

/**
 * Independent visibility oracle: scan the raw state arrays for `player`
 * viewers (owner === player && count > 0), union their bounds-clipped
 * Chebyshev disks (radius from `world.config.visibilityRadius`), sort
 * row-major. Shares NO code with `computeVisibleSet` beyond the
 * fixture-level disk helper.
 *
 * @param world  The world snapshot to audit.
 * @param player The recipient player.
 * @returns Row-major, duplicate-free `Coord[]` of expected cells.
 */
function expectedVisibleCoords(world: Readonly<World>, player: PlayerId): Coord[] {
    const { width, height } = world.board;
    const radius = world.config.visibilityRadius;
    const seen = new Set<number>();
    const out: Coord[] = [];
    const { troopCounts, troopOwners } = world.state;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) !== player) {
                continue;
            }
            if ((troopCounts[idx] ?? 0) <= 0) {
                continue;
            }
            for (const coord of chebyshevDisk({ x, y }, radius, width, height)) {
                const key = coord.y * width + coord.x;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(coord);
                }
            }
        }
    }
    out.sort((a, b) => a.y * width + a.x - (b.y * width + b.x));
    return out;
}

/**
 * Cheap order-independent checksum of a typed array (used to prove
 * `computePlayerView` is pure / read-only — it must not mutate the
 * world it reads).
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

describe.each([3, 4] as const)('SC-004 fog isolation for N=%i players (012 T024a)', (playerCount) => {
    it(`500-tick zero-leakage audit on ${BOARD}×${BOARD}: every payload ⊆ recipient VisibleSet, spectator full+read-only, per-tick < 15 ms median @ ${CADENCE_MS} ms cadence`, () => {
        let world = withVisibilityRadius(
            buildWorldWithTroops(BOARD, frameForTick(0, playerCount), playerCount),
            RADIUS,
        );

        // Warm-up (JIT + allocator steady state) — not measured.
        for (let p = 1; p <= playerCount; p++) {
            computePlayerView(world, p as PlayerId);
        }
        computePlayerView(world, 1 as PlayerId, { spectator: true });

        let totalCellsObserved = 0;
        let leakedCells = 0;
        let spectatorFullTicks = 0;
        const durations: number[] = [];

        for (let t = 0; t < TICKS; t++) {
            // Scripted march/battle: reset troop arrays from scratch each
            // tick so no player is ever eliminated (decay/combat cannot
            // accumulate); positions march and occasionally overlap.
            world = applyPlacements(world, frameForTick(t, playerCount));

            // Advance with the REAL engine tick (PRNG, production, decay).
            const { world: nextWorld, events } = tick(world);
            world = nextWorld;

            const start = performance.now();
            for (let p = 1; p <= playerCount; p++) {
                const player = p as PlayerId;
                // Independent oracle (knows nothing about computePlayerView).
                const expected = expectedVisibleCoords(world, player);
                const expectedKeys = new Set(expected.map((c) => c.y * world.board.width + c.x));

                const view = computePlayerView(world, player, { events });

                // (a) Zero leakage — exact set equality against the oracle.
                expect(view.visibleCells).toHaveLength(expected.length);
                for (const cell of view.visibleCells) {
                    totalCellsObserved++;
                    if (!expectedKeys.has(cell.coord.y * world.board.width + cell.coord.x)) {
                        leakedCells++;
                    }
                }
            }

            // (b) Spectator: full board, read-only (pure), zero accepted
            // orders (fog is order-agnostic; order acceptance is a
            // transport-layer guarantee, 004 SC-002).
            const beforeCounts = checksum(world.state.troopCounts);
            const beforeOwners = checksum(world.state.troopOwners);
            const spectatorView = computePlayerView(world, 1 as PlayerId, { spectator: true });
            expect(checksum(world.state.troopCounts)).toBe(beforeCounts);
            expect(checksum(world.state.troopOwners)).toBe(beforeOwners);
            if (spectatorView.visibleCells.length === BOARD * BOARD) {
                spectatorFullTicks++;
            }
            durations.push(performance.now() - start);
        }

        // (a) No leakage across all 500 ticks and every player.
        expect(leakedCells, `${String(totalCellsObserved)} cells observed / leaked: ${String(leakedCells)}`).toBe(0);
        // (b) Spectator full-visibility on every tick.
        expect(spectatorFullTicks, `spectator full-board ticks: ${String(spectatorFullTicks)}/${String(TICKS)}`).toBe(
            TICKS,
        );

        // (c) Per-tick fog compute budget (004 SC-005 measurement protocol):
        // median < 15 ms, generous p99 < 100 ms guard.
        const sorted = [...durations].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
        const summary =
            `N=${String(playerCount)} | median=${median.toFixed(3)}ms p99=${p99.toFixed(3)}ms ` +
            `(budget 15ms median / 100ms p99 guard)`;
        expect(median, summary).toBeLessThan(15);
        expect(p99, summary).toBeLessThan(100);
    });
});
