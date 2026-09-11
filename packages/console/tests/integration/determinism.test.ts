/**
 * Determinism integration test — Feature 005 (T090, SC-002) / Issue #131 (T-010).
 *
 * Re-runs the scripted 1000-tick scenario through the REAL pipeline
 * (tick NetEvent → reducer → PlayerAction → reducer → buildMapView)
 * and asserts the SHA-256 hash of the serialized output matches the
 * committed golden constant.
 *
 * The golden hash replaces the former 1.7 MB JSON blob: same
 * zero-divergence guarantee, ~700x smaller diff footprint.
 *
 * Zero divergence is the spec bar: any intentional change to the
 * render pipeline requires regenerating the hash via
 * `scripts/generate-determinism-golden.ts`.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { runDeterminismScenario, SCENARIO_TICKS } from '../fixtures/determinism-scenario';
import { GOLDEN_HASH, GOLDEN_TICKS } from '../fixtures/determinism-golden-hash';

describe('determinism: 1000-tick scripted match (T090 / SC-002)', () => {
    it('produces a deterministic hash matching the golden constant', () => {
        expect(GOLDEN_TICKS).toBe(SCENARIO_TICKS);

        const run = runDeterminismScenario();
        expect(run.frames.length).toBe(SCENARIO_TICKS);

        const hash = createHash('sha256')
            .update(JSON.stringify(run.frames))
            .update(JSON.stringify(run.finalState))
            .digest('hex');

        expect(hash).toBe(GOLDEN_HASH);
    });
});
