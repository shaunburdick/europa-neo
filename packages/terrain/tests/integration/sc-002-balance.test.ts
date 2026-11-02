/**
 * SC-002 Balance Integration Test — Feature 003 (T050)
 *
 * 200-map balance suite. Runs every invariant in
 * `tests/helpers/balance-harness.ts` on each generated Board: water ratio
 * (INV-13), elevation variance (INV-14), 180° point symmetry (INV-5/6),
 * city count (INV-7), city spacing (INV-11), city-water distance
 * (INV-10), and the largest water pool (INV-15).
 *
 * Covers SC-002 (100% valid maps) and SC-004 (statistical suite).
 */

import { describe, expect, it } from 'vitest';

import { findBalanceFailures } from '../helpers/balance-harness';

const TRIALS = 200;

describe('SC-002 / SC-004 balance (200 maps, every invariant must pass)', () => {
    it('all invariants hold on every trial', { timeout: 20_000 }, () => {
        expect(findBalanceFailures(TRIALS)).toEqual([]);
    });
});
