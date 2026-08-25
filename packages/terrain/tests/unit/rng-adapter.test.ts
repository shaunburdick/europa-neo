/**
 * RNG Adapter Tests — Feature 003
 *
 * Verifies the determinism invariants of `deriveSubstream` and
 * `mixSeed`:
 *
 *   - `deriveSubstream`: same parent state at entry → identical
 *     sub-stream output. Two different parent states → two different
 *     sub-streams. The parent is advanced exactly once per call.
 *   - `mixSeed`: pure function (same inputs → same output). Across
 *     1000 distinct `attempt` values, all outputs are distinct.
 *
 * These are the foundation of FR-006 determinism and FR-007
 * retry-derivation. If any of these invariants break, every downstream
 * test is suspect.
 */

import { createRng } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import { deriveSubstream, mixSeed } from '../../src/rng-adapter';

describe('rng-adapter', () => {
    describe('deriveSubstream', () => {
        it('produces the same sub-stream when called twice with the same parent state', () => {
            // Two parents with identical sfc32 state will produce identical
            // substreams. We construct them from the same seed.
            const parentA = createRng(42);
            const parentB = createRng(42);

            const subA = deriveSubstream(parentA);
            const subB = deriveSubstream(parentB);

            // Draw a few uint32s from each; they must match byte-for-byte.
            for (let i = 0; i < 8; i++) {
                expect(subA()).toBe(subB());
            }
        });

        it('produces different sub-streams when called on different parent states', () => {
            const parentA = createRng(42);
            const parentB = createRng(99);

            const subA = deriveSubstream(parentA);
            const subB = deriveSubstream(parentB);

            // At least one of the first 8 draws must differ. With sfc32
            // and distinct seeds, a collision in all 8 is astronomically
            // unlikely.
            const drawsA = Array.from({ length: 8 }, () => subA());
            const drawsB = Array.from({ length: 8 }, () => subB());
            const anyDifferent = drawsA.some((v, i) => v !== drawsB[i]);
            expect(anyDifferent).toBe(true);
        });

        it('advances the parent by exactly one step', () => {
            const parent = createRng(42);
            // Snapshot parent state before the call.
            const stateBefore = new Uint32Array(parent.state);

            // We expect the parent's state to differ by exactly one sfc32
            // step. We can detect "more than zero steps" trivially; to
            // detect "exactly one step" we compare against a manual call.
            parent(); // one manual step — value intentionally discarded
            const manualExpectedState = new Uint32Array(parent.state);

            // Reset by reconstructing from same seed.
            const parent2 = createRng(42);
            deriveSubstream(parent2);
            const derivedState = new Uint32Array(parent2.state);

            // After one manual step + one derive, the parents' state arrays
            // should match — both have advanced by exactly one sfc32 step
            // from the same starting point.
            expect(derivedState).toEqual(manualExpectedState);
            // (And `stateBefore` is just a sanity reference; it must differ
            //  from `manualExpectedState` because the manual step advanced
            //  the state.)
            expect(derivedState).not.toEqual(stateBefore);
        });

        it('returns a sub-stream disjoint from the parent (subsequent parent advances do not affect sub)', () => {
            const parent = createRng(42);
            const sub = deriveSubstream(parent);

            // Snapshot the sub-stream's first 8 outputs.
            const subOutputsBefore = Array.from({ length: 8 }, () => sub());

            // Advance the parent many times. Sub-stream must be unaffected.
            for (let i = 0; i < 64; i++) {
                parent();
            }

            // Snapshot the sub-stream's next 8 outputs (continued from
            // where we left off). They must match what a fresh sub-stream
            // (not perturbed by parent advances) would produce.
            const subOutputsAfter = Array.from({ length: 8 }, () => sub());

            // For comparison: reconstruct a fresh parent + sub and capture
            // the same draws. They must match byte-for-byte.
            const parentFresh = createRng(42);
            const subFresh = deriveSubstream(parentFresh);
            Array.from({ length: 8 }, () => subFresh()); // skip first 8
            const expectedAfter = Array.from({ length: 8 }, () => subFresh());

            expect(subOutputsBefore).toHaveLength(8);
            expect(subOutputsAfter).toEqual(expectedAfter);
        });
    });

    describe('mixSeed', () => {
        it('is pure (same inputs → same output)', () => {
            const a = mixSeed(42, 0);
            const b = mixSeed(42, 0);
            expect(a).toBe(b);
            expect(a).toBe(mixSeed(42, 0));

            const c = mixSeed(0xc0ffee, 7);
            const d = mixSeed(0xc0ffee, 7);
            expect(c).toBe(d);
        });

        it('returns a uint32 in [0, 2^32)', () => {
            for (const seed of [0, 1, 42, 0xc0ffee, 0xdeadbeef, 0xffffffff]) {
                for (const attempt of [0, 1, 2, 3, 7, 15, 127, 255]) {
                    const v = mixSeed(seed, attempt);
                    expect(Number.isInteger(v)).toBe(true);
                    expect(v).toBeGreaterThanOrEqual(0);
                    expect(v).toBeLessThanOrEqual(0xffffffff);
                    // Must already be a uint32 — `>>> 0` is idempotent.
                    expect(v).toBe(v >>> 0);
                }
            }
        });

        it('produces distinct outputs across 1000 attempts (no trivial collisions)', () => {
            const seed = 42;
            const seen = new Set<number>();
            for (let attempt = 0; attempt < 1000; attempt++) {
                const v = mixSeed(seed, attempt);
                seen.add(v);
            }
            // With a 32-bit mixer and 1000 attempts, distinctness is
            // overwhelmingly likely (collision probability per pair is
            // ~2^-32). We allow up to 1 collision as a generous safety
            // margin but in practice expect 1000/1000.
            expect(seen.size).toBeGreaterThanOrEqual(999);
        });

        it('is sensitive to both seed and attempt', () => {
            // Vary seed → different output.
            expect(mixSeed(1, 5)).not.toBe(mixSeed(2, 5));
            // Vary attempt → different output.
            expect(mixSeed(42, 1)).not.toBe(mixSeed(42, 2));
        });

        it('folds out-of-range seed to uint32', () => {
            // Negative numbers and > uint32 values are folded via `>>> 0`
            // to the [0, 2^32) range. Spot-check that the folded form
            // equals the explicit uint32 form.
            expect(mixSeed(-1, 0)).toBe(mixSeed(0xffffffff, 0));
            expect(mixSeed(0x1_0000_0000, 0)).toBe(mixSeed(0, 0));
        });
    });
});
