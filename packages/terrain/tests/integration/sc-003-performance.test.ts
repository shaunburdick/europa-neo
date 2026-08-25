/**
 * SC-003 Performance Integration Test — Feature 003 (T051)
 *
 * Asserts that the default 32×32 / 2-player map generates in under
 * 1000 ms (p99 over 100 trials) per committed `spec.md` SC-003 and
 * `quickstart.md` Q-T07.
 *
 * Uses the standard `performance.now()` (no wall-clock in the
 * generator; the timer is purely a measurement instrument, not part
 * of the algorithm).
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const SC_003_P99_BUDGET_MS = 1000;
const SC_003_TRIALS = 100;

describe('SC-003 performance (p99 < 1000 ms over 100 trials)', () => {
    // 100 timed generations under coverage instrumentation on a loaded
    // runner can push total wall time past the default 5s timeout even
    // when the per-sample p99 budget holds.
    it('32x32 / 2-player / DEFAULT_GENERATION_SETTINGS generation completes within budget', { timeout: 30_000 }, () => {
        const seeds = goldenSeeds(SC_003_TRIALS);
        const samples: number[] = [];
        for (const seed of seeds) {
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed,
                rng: engineSfc32(seed),
                settings: DEFAULT_GENERATION_SETTINGS,
            };
            const start = performance.now();
            generateBoard(req);
            samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        // p99 = sample at index floor(n * 0.99). For n=100, that's index 99.
        const p99 = samples[Math.floor(samples.length * 0.99)] ?? Number.POSITIVE_INFINITY;
        // Surface p99 in test output for diagnostics (visible on
        // verbose runs). We don't `console.log` because the constitution
        // bans `console.log` from `src/` — but tests/ is allowed to
        // surface diagnostic info.
        if (p99 > SC_003_P99_BUDGET_MS) {
            // Provide a useful failure message with the actual p99.
            const median = samples[Math.floor(samples.length / 0.5)] ?? 0;
            throw new Error(
                `SC-003 perf budget exceeded: p99=${p99.toFixed(1)}ms (budget ${String(SC_003_P99_BUDGET_MS)}ms), median=${median.toFixed(1)}ms`,
            );
        }
        expect(p99).toBeLessThan(SC_003_P99_BUDGET_MS);
    });
});
