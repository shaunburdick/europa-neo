/**
 * SC-004 Performance Benchmark — Feature 001, Polish-phase (T054)
 *
 * Per spec SC-004: "Median tick duration < 10 ms on a default 32×32
 * board, 2 players, headless."
 *
 * Implementation:
 *   1. Build a default 32×32 board, 2 players, no scripted orders.
 *   2. Run `tick()` 1000 times.
 *   3. Measure wall-clock durations.
 *   4. Assert median < 10 ms; report min/median/p95/max in the test
 *      summary for CI trend monitoring.
 *
 * This test does NOT fail on the upper-bound metrics (p95, max) — only
 * the median is the SC-004 acceptance gate. Other percentiles are
 * reported via `console.log` so they show up in CI logs and can be
 * alerted on if they trend upward over time.
 *
 * Note: We use `performance.now()` for timing. This is a wall-clock
 * read; the engine itself NEVER reads `performance.now()` — only
 * this benchmark does, for measurement purposes.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import { tick } from '../../src/tick';
import type { MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

const cfg: MatchConfig = {
    boardSize: 32,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 0xc0ffee,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

const ITERATIONS = 1000;
const SIZE = 32;
const WARMUP_ITERATIONS = 50;

describe('SC-004 — tick performance', () => {
    it('median tick duration < 10 ms on a default 32x32 board', () => {
        const board = buildSmallBoard(SIZE, [
            [5, 5, 1 as PlayerId],
            [26, 26, 2 as PlayerId],
        ]);
        let world = createWorld(cfg, board);

        // Warmup: run a few ticks to amortize V8 optimization costs.
        for (let i = 0; i < WARMUP_ITERATIONS; i++) {
            const r = tick(world);
            world = r.world;
        }

        // Measure.
        const durations: number[] = new Array(ITERATIONS);
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();
            const r = tick(world);
            world = r.world;
            durations[i] = performance.now() - start;
        }

        // Compute statistics.
        const sorted = [...durations].sort((a, b) => a - b);
        const median = sorted[Math.floor(ITERATIONS / 2)] ?? 0;
        const min = sorted[0] ?? 0;
        const max = sorted[ITERATIONS - 1] ?? 0;
        const p95 = sorted[Math.floor(ITERATIONS * 0.95)] ?? 0;
        const mean = durations.reduce((acc, d) => acc + d, 0) / ITERATIONS;

        // Surface the metrics so CI logs capture them for trend monitoring.
        // Use console.warn so it isn't suppressed by biome's noConsole rule
        // (which permits warn/error but warns on log). This is the
        // conventional pattern for benchmark output.
        console.warn(
            `[tick-perf] board=${String(SIZE)}x${String(SIZE)} players=${String(cfg.playerCount)} iters=${String(ITERATIONS)} ` +
                `min=${min.toFixed(2)}ms median=${median.toFixed(2)}ms mean=${mean.toFixed(2)}ms ` +
                `p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
        );

        // SC-004 acceptance: median < 10 ms.
        expect(median).toBeLessThan(10);
    });
});
