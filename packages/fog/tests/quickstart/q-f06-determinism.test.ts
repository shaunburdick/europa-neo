/**
 * Quickstart Q-F06 — Determinism (Feature 002, FR-007 + SC-001, T030)
 *
 * Per quickstart.md §2 Q-F06:
 *   - 100 runs produce byte-identical `PlayerView` hashes.
 *   - Cross-player determinism: each player's hash is stable across
 *     runs, and player views differ from each other when their
 *     horizons differ.
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView, hashPlayerView } from '../../src/index';
import { SEED_C0FFEE } from '../fixtures/seeds';
import { buildWorldWithTroops, TEST_PLAYER_IDS, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/** Trial count per the user's speed directive (≤ 200 property loops). */
const TRIALS = 100;

const P1 = TEST_PLAYER_IDS[1];
const P2 = TEST_PLAYER_IDS[2];

describe('Q-F06 — determinism', () => {
    it('100 runs produce byte-identical PlayerView hashes', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(
                16,
                [
                    [8, 8, P1, 5],
                    [3, 3, P1, 2],
                    [12, 12, P2, 4],
                ],
                2,
                SEED_C0FFEE,
            ),
            RADIUS,
        );

        const baseline = hashPlayerView(computePlayerView(world, P1));
        for (let i = 0; i < TRIALS; i++) {
            expect(hashPlayerView(computePlayerView(world, P1))).toBe(baseline);
        }
    });

    it('cross-player determinism: stable per player, distinct across players', () => {
        const world = withVisibilityRadius(
            buildWorldWithTroops(
                16,
                [
                    [8, 8, P1, 5],
                    [13, 13, P2, 4],
                ],
                2,
                SEED_C0FFEE,
            ),
            RADIUS,
        );

        const p1 = hashPlayerView(computePlayerView(world, P1));
        const p2 = hashPlayerView(computePlayerView(world, P2));

        for (let i = 0; i < TRIALS; i++) {
            expect(hashPlayerView(computePlayerView(world, P1))).toBe(p1);
            expect(hashPlayerView(computePlayerView(world, P2))).toBe(p2);
        }

        // Disjoint horizons → different payloads → different hashes.
        expect(p1).not.toBe(p2);
    });
});
