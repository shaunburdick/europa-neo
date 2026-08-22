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
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/** Trial count per the user's speed directive (≤ 200 property loops). */
const TRIALS = 100;

describe('Q-F06 — determinism', () => {
  it('100 runs produce byte-identical PlayerView hashes', () => {
    const world = withVisibilityRadius(
      buildWorldWithTroops(
        16,
        [
          [8, 8, 1, 5],
          [3, 3, 1, 2],
          [12, 12, 2, 4],
        ],
        2,
        SEED_C0FFEE,
      ),
      RADIUS,
    );

    const baseline = hashPlayerView(computePlayerView(world, 1));
    for (let i = 0; i < TRIALS; i++) {
      expect(hashPlayerView(computePlayerView(world, 1))).toBe(baseline);
    }
  });

  it('cross-player determinism: stable per player, distinct across players', () => {
    const world = withVisibilityRadius(
      buildWorldWithTroops(
        16,
        [
          [8, 8, 1, 5],
          [13, 13, 2, 4],
        ],
        2,
        SEED_C0FFEE,
      ),
      RADIUS,
    );

    const p1 = hashPlayerView(computePlayerView(world, 1));
    const p2 = hashPlayerView(computePlayerView(world, 2));

    for (let i = 0; i < TRIALS; i++) {
      expect(hashPlayerView(computePlayerView(world, 1))).toBe(p1);
      expect(hashPlayerView(computePlayerView(world, 2))).toBe(p2);
    }

    // Disjoint horizons → different payloads → different hashes.
    expect(p1).not.toBe(p2);
  });
});
