/**
 * Determinism Integration Test — Feature 002, FR-007 + SC-001 micro-check (T029)
 *
 * Per quickstart.md §2 Q-F06: 100 trials on a 32×32 world with three
 * friendly stacks; `hashPlayerView(computePlayerView(world, 1))` is
 * byte-identical across all 100 runs. Cross-player determinism: each
 * player's hash is stable across runs even though it differs from the
 * other player's hash (disjoint horizons).
 *
 * No `console.log` — stability is asserted, not printed.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView, hashPlayerView } from '../src/index';
import { SEED_C0FFEE } from './fixtures/seeds';
import { buildWorldWithTroops, withVisibilityRadius } from './fixtures/world';

/** Trial count per the user's speed directive (≤ 200 loops). */
const TRIALS = 100;

describe('fog determinism (FR-007, SC-001)', () => {
    it('hashes are byte-identical across 100 runs on a 32×32 three-stack world', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(
                32,
                [
                    [8, 8, 1, 5],
                    [16, 16, 1, 3],
                    [24, 24, 2, 7],
                ],
                2,
                SEED_C0FFEE,
            ),
            4,
        );

        const baseline = hashPlayerView(computePlayerView(world, 1));
        expect(baseline).toMatch(/^[0-9a-f]{16}$/);
        for (let i = 0; i < TRIALS; i++) {
            const hash = hashPlayerView(computePlayerView(world, 1));
            expect(hash, `run ${String(i)} diverged`).toBe(baseline);
        }
    });

    it('cross-player determinism: stable per player, distinct between players', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(
                32,
                [
                    [8, 8, 1, 5],
                    [24, 24, 2, 7],
                ],
                2,
                SEED_C0FFEE,
            ),
            4,
        );

        const p1Baseline = hashPlayerView(computePlayerView(world, 1));
        const p2Baseline = hashPlayerView(computePlayerView(world, 2));
        expect(p1Baseline).not.toBe(p2Baseline);

        for (let i = 0; i < TRIALS; i++) {
            expect(hashPlayerView(computePlayerView(world, 1))).toBe(p1Baseline);
            expect(hashPlayerView(computePlayerView(world, 2))).toBe(p2Baseline);
        }
    });
});
