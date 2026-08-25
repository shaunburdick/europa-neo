/**
 * fBm (Fractal Brownian Motion) Tests — Feature 003
 *
 * Verifies the fractal character of the elevation generator (FR-002).
 * fBm sums `valueNoise` at increasing frequencies with decreasing
 * amplitude:
 *
 *   fbm(x, y, seed, octaves, persistence) =
 *     sum_{i=0..octaves-1} persistence^i * valueNoise(x * lacunarity^i, y * lacunarity^i, seed)
 *   normalized to [0, 255]
 *
 * The tests cover:
 *   - `octaves=1` returns the base octave only (fractal sum collapses).
 *   - `octaves=4` returns a sum of 4 distinct octaves (output differs
 *     from `octaves=1`).
 *   - The default settings produce a non-flat elevation field
 *     (variance > 0).
 *   - The output is always in `[0, 255]` and integer.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { fbm } from '../../src/fbm';

describe('fbm', () => {
    describe('octaves contract (FR-002)', () => {
        it('octaves=1 returns the base octave only (lacunarity=1, persistence=1)', () => {
            const seed = 42;
            const x = 3.5;
            const y = 7.25;
            // With octaves=1, the only contribution is valueNoise at
            // frequency lacunarity^0 = 1. Persistence doesn't matter
            // (anything^0 = 1).
            const a = fbm(x, y, seed, 1, 0.5);
            const b = fbm(x, y, seed, 1, 0.9);
            // Both should be in [0, 255].
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(255);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(255);
            // With octaves=1, fbm is just the base noise value. The two
            // calls with different persistence must return the same value
            // because persistence^0 = 1 in both cases.
            expect(a).toBe(b);
        });

        it('octaves=4 differs from octaves=1 at non-lattice coords (higher octaves contribute)', () => {
            // fBm with more octaves adds higher-frequency content. The
            // output at a non-lattice coord MUST differ from the
            // single-octave case (otherwise higher octaves are a no-op).
            const seed = 0xc0ffee;
            const samples: ReadonlyArray<readonly [number, number]> = [
                [0.5, 0.5],
                [1.25, 2.75],
                [3.7, 4.1],
                [7.5, 8.5],
                [10.123, 11.456],
            ];
            const oneOctave = samples.map(([x, y]) => fbm(x, y, seed, 1, 0.5));
            const fourOctaves = samples.map(([x, y]) => fbm(x, y, seed, 4, 0.5));
            // At least one sample must differ (otherwise octaves=4 == octaves=1).
            const anyDifferent = oneOctave.some((v, i) => v !== fourOctaves[i]);
            expect(anyDifferent).toBe(true);
        });

        it('default octaves=4 from DEFAULT_GENERATION_SETTINGS produces non-flat output (INV-14)', () => {
            // INV-14: elevation variance > 0 (no fully flat map). With
            // 4 octaves the output must span a non-trivial range.
            const seed = 0xabcdef;
            const values: number[] = [];
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    values.push(
                        fbm(x, y, seed, DEFAULT_GENERATION_SETTINGS.octaves, DEFAULT_GENERATION_SETTINGS.roughness),
                    );
                }
            }
            const min = Math.min(...values);
            const max = Math.max(...values);
            // With 4 octaves, the range is typically 100+; a "flat" output
            // would have max - min < 5. Use a generous-but-meaningful floor.
            expect(max - min).toBeGreaterThan(50);
        });
    });

    describe('range (INV-3)', () => {
        it('output is an integer in [0, 255] for octaves=1..6 at varied (x, y)', () => {
            const seed = 0xdeadbeef;
            for (let octaves = 1; octaves <= 6; octaves++) {
                for (let i = 0; i < 50; i++) {
                    const v = fbm(i * 0.5, i * 0.7, seed, octaves, 0.5);
                    expect(Number.isInteger(v)).toBe(true);
                    expect(v).toBeGreaterThanOrEqual(0);
                    expect(v).toBeLessThanOrEqual(255);
                }
            }
        });
    });

    describe('determinism (FR-006)', () => {
        it('same (x, y, seed, octaves, persistence) → same output across 1000 calls', () => {
            const args: readonly [number, number, number, number, number] = [3.5, 7.25, 42, 4, 0.5];
            const first = fbm(...args);
            for (let i = 0; i < 1000; i++) {
                expect(fbm(...args)).toBe(first);
            }
        });

        it('different seeds produce different elevation fields at the same coords', () => {
            // Sanity: the seed must influence the output.
            const samples: ReadonlyArray<readonly [number, number]> = [
                [0, 0],
                [1, 1],
                [2, 2],
                [3, 3],
                [5, 7],
                [10, 13],
            ];
            const a = samples.map(([x, y]) => fbm(x, y, 1, 4, 0.5));
            const b = samples.map(([x, y]) => fbm(x, y, 2, 4, 0.5));
            const anyDifferent = a.some((v, i) => v !== b[i]);
            expect(anyDifferent).toBe(true);
        });
    });

    describe('amplitude contract (FR-002 / research.md §1)', () => {
        it('higher persistence increases the high-frequency contribution (octave scaling)', () => {
            // fbm is parameterized by `persistence` (amplitude decay per
            // octave). For an octaves=2 case with persistence=0.1 vs 0.9,
            // the second-octave contribution differs substantially.
            // We verify the two outputs differ at non-trivial coords.
            const seed = 42;
            let differences = 0;
            for (let i = 0; i < 16; i++) {
                const x = i * 0.7;
                const y = i * 1.3;
                const low = fbm(x, y, seed, 4, 0.1);
                const high = fbm(x, y, seed, 4, 0.9);
                if (low !== high) {
                    differences++;
                }
            }
            // At least 12 of 16 should differ (a generous threshold for
            // a hash-based fBm — even equal-collisions on individual
            // points are likely rare).
            expect(differences).toBeGreaterThan(12);
        });
    });
});
