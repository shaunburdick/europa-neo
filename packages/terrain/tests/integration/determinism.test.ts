/**
 * Determinism Integration Test — Feature 003
 *
 * SC-001 / FR-006 / US2 acceptance scenarios 1 & 2: same seed →
 * byte-identical Board; distinct seeds → distinct Boards.
 *
 * 200 trials through `tests/helpers/determinism-harness.ts`, which
 * generates each seed twice and checks both properties. The SC-001 suite
 * runs the same harness at 1,000 seeds.
 */

import { describe, expect, it } from 'vitest';
import { findDeterminismFailures } from '../helpers/determinism-harness';

const TRIALS = 200;

describe('determinism (SC-001, FR-006, US2)', () => {
    it('200 trials: same seeds reproduce and distinct seeds diverge', { timeout: 20_000 }, () => {
        expect(findDeterminismFailures(TRIALS)).toEqual([]);
    });
});
