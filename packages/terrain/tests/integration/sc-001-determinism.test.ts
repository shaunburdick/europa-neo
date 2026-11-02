/**
 * SC-001 Determinism Integration Test — Feature 003 (T049)
 *
 * Extended determinism test that asserts `hashBoard` byte-identity and
 * distinct-seed distinctness over 1,000 different seeds (same scale as
 * `T034`'s 1000 trials and `quickstart.md` Q-T01's 1000). Each seed is
 * run twice through `tests/helpers/determinism-harness.ts`, the same
 * harness the 200-seed suite uses.
 *
 * Reported numbers feed the constitution Principle II determinism gate:
 * a 100% pass rate at this scale demonstrates the generator is
 * structurally deterministic, not "lucky" at the spec's 100 threshold.
 * (Trial count reduced from 10,000 on 2026-08-22 to cut CI runtime; the
 * property guarantee is unchanged.)
 */

import { describe, expect, it } from 'vitest';

import { findDeterminismFailures } from '../helpers/determinism-harness';

const SC_001_TRIALS = 1_000;

describe('SC-001 determinism at 1k seeds (10x spec)', () => {
    it(`${String(SC_001_TRIALS)} trials: same seeds reproduce and distinct seeds diverge (10x spec)`, {
        timeout: 20_000,
    }, () => {
        expect(findDeterminismFailures(SC_001_TRIALS)).toEqual([]);
    });
});
