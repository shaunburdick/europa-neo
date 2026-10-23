/**
 * Balance Integration Test — Feature 003
 *
 * SC-002 / SC-004 statistical suite. 100 trials using `goldenSeeds(100)`,
 * asserting the full invariant union defined in
 * `tests/helpers/balance-harness.ts`: elevation variance (INV-14), water
 * ratio (INV-13), 180° symmetry (INV-5/6), city count (INV-7), city
 * spacing (INV-11), city-water distance (INV-10), and largest water pool
 * (INV-15). The 200-trial SC-002 suite runs the same harness.
 */

import { describe, expect, it } from 'vitest';
import { findBalanceFailures } from '../helpers/balance-harness';

const TRIALS = 100;

describe('balance (SC-002 / SC-004)', () => {
    // 100 generations + per-board symmetry scan and BFS flood fill can
    // exceed the default 5s timeout under coverage instrumentation on CI.
    it('100 trials: every generated Board satisfies the balance invariants', { timeout: 30_000 }, () => {
        expect(findBalanceFailures(TRIALS)).toEqual([]);
    });
});
