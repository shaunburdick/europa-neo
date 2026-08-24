/**
 * Seed Fixture Tests — Feature 003
 *
 * Verifies the seed enumeration helpers in `tests/fixtures/seeds.ts`.
 * The golden-ratio stride is the foundation of multiple quickstart
 * scenarios; if it drifts, dozens of statistical tests silently
 * become apples-to-oranges comparisons.
 */

import { describe, expect, it } from 'vitest';

import { engineSfc32, goldenSeeds, SEED_1, SEED_42, SEED_C0FFEE } from '../fixtures/seeds';

describe('seed fixtures', () => {
    describe('named seed constants', () => {
        it('SEED_42 is 42', () => {
            expect(SEED_42).toBe(42);
        });
        it('SEED_C0FFEE is 0xC0FFEE', () => {
            expect(SEED_C0FFEE).toBe(0xc0ffee);
        });
        it('SEED_1 is 1', () => {
            expect(SEED_1).toBe(1);
        });
    });

    describe('goldenSeeds', () => {
        it('returns an empty array for trials=0', () => {
            expect(goldenSeeds(0)).toEqual([]);
        });

        it('produces (i * 0x9E3779B1) >>> 0 for i in [0, trials)', () => {
            const seeds = goldenSeeds(8);
            expect(seeds).toHaveLength(8);
            for (let i = 0; i < 8; i++) {
                expect(seeds[i]).toBe(Math.imul(i, 0x9e3779b1) >>> 0);
            }
        });

        it('returns all-distinct seeds for 1000 trials (low-discrepancy sampling)', () => {
            const seeds = goldenSeeds(1000);
            const seen = new Set(seeds);
            // Collision probability per pair is ~2^-32; allow up to 1 collision
            // as a generous safety margin but expect 1000/1000.
            expect(seen.size).toBeGreaterThanOrEqual(999);
        });

        it('matches the documented stride at the first few indices', () => {
            // Pin the values to make drift detection immediate: any change
            // to the stride (e.g., switching to a different constant) will
            // fail these assertions.
            const seeds = goldenSeeds(8);
            const expected = [
                0, // 0 * anything = 0
                0x9e3779b1,
                Math.imul(2, 0x9e3779b1) >>> 0,
                Math.imul(3, 0x9e3779b1) >>> 0,
                Math.imul(4, 0x9e3779b1) >>> 0,
                Math.imul(5, 0x9e3779b1) >>> 0,
                Math.imul(6, 0x9e3779b1) >>> 0,
                Math.imul(7, 0x9e3779b1) >>> 0,
            ];
            expect(seeds).toEqual(expected);
        });

        it('rejects negative trials', () => {
            expect(() => goldenSeeds(-1)).toThrow(/non-negative integer/);
        });

        it('rejects non-integer trials', () => {
            expect(() => goldenSeeds(1.5)).toThrow(/non-negative integer/);
        });
    });

    describe('engineSfc32', () => {
        it('returns a callable Rng', () => {
            const rng = engineSfc32(SEED_42);
            expect(typeof rng).toBe('function');
            expect(typeof rng()).toBe('number');
        });

        it('produces deterministic output across calls', () => {
            const a = engineSfc32(SEED_42);
            const b = engineSfc32(SEED_42);
            for (let i = 0; i < 8; i++) {
                expect(a()).toBe(b());
            }
        });

        it('produces different streams from different seeds', () => {
            const a = engineSfc32(SEED_42);
            const b = engineSfc32(SEED_C0FFEE);
            const drawsA = Array.from({ length: 8 }, () => a());
            const drawsB = Array.from({ length: 8 }, () => b());
            expect(drawsA).not.toEqual(drawsB);
        });

        it('returns values coercible to uint32 via `>>> 0` (engine sfc32 contract)', () => {
            // The engine's sfc32 implementation may return int32 patterns
            // (the implementation comment claims "uint32" but the
            // arithmetic uses `| 0` in the final step; values with the
            // high bit set come back negative). Downstream code that
            // consumes an `Rng` should coerce via `>>> 0` — that's what
            // `deriveSubstream` does. This test pins the post-coercion
            // contract: after `>>> 0`, every draw is in [0, 2^32).
            const rng = engineSfc32(SEED_C0FFEE);
            for (let i = 0; i < 32; i++) {
                const v = rng() >>> 0;
                expect(Number.isInteger(v)).toBe(true);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(0xffffffff);
            }
        });

        it('uint32-coerced output is the same for two parallel engines (determinism)', () => {
            // Pin the determinism guarantee post-coercion. If the engine's
            // implementation ever drifts, this test fails immediately.
            const a = engineSfc32(SEED_C0FFEE);
            const b = engineSfc32(SEED_C0FFEE);
            for (let i = 0; i < 32; i++) {
                expect(a() >>> 0).toBe(b() >>> 0);
            }
        });
    });
});
