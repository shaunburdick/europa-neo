/**
 * Smoothing Unit Tests — Feature 003 (FR-010, Clarifications v1.3)
 *
 * Pins the contract of the deterministic post-process smoothing pass
 * (`smoothElevation`) BEFORE the implementation exists (TDD: this file
 * must FAIL until `src/smoothing.ts` lands in T014).
 *
 * Kernel under test (the spec's reference kernel): each pass replaces
 * every cell's elevation with the round-half-up mean of its 3×3
 * neighborhood — `Math.floor((sum + 4) / 9)` — with coordinates
 * clamped to `[0, size-1]` so edge cells replicate their edge.
 *
 * Invariants pinned here (FR-010):
 *   - `passes === 0` is the identity (byte-identical to pre-smoothing
 *     output) and returns a fresh copy (never aliases the input).
 *   - The function is pure: same input × N runs → identical output.
 *   - 180° point symmetry (FR-004) is preserved exactly.
 *   - Output values stay in `[0, 255]` (uint8 elevation range).
 *   - Edge cells use their clamped neighborhood (hand-computed).
 *   - Max adjacent |Δ| is non-increasing with passes (the observable
 *     effect FR-010 promises: gentler slopes).
 */

import { describe, expect, it } from 'vitest';

import { smoothElevation } from '../../src/smoothing';

/**
 * Compute the maximum absolute elevation difference between adjacent
 * cells (right and down neighbors only — covers every edge once).
 */
function maxAdjacentDelta(elev: Uint8Array, size: number): number {
    let max = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const v = elev[y * size + x] ?? 0;
            if (x + 1 < size) {
                const d = Math.abs(v - (elev[y * size + x + 1] ?? 0));
                if (d > max) {
                    max = d;
                }
            }
            if (y + 1 < size) {
                const d = Math.abs(v - (elev[(y + 1) * size + x] ?? 0));
                if (d > max) {
                    max = d;
                }
            }
        }
    }
    return max;
}

/**
 * Assert 180° point symmetry: every cell equals its rotated partner.
 */
function expectPointSymmetric(elev: Uint8Array, size: number): void {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const partner = elev[(size - 1 - y) * size + (size - 1 - x)] ?? 0;
            expect(elev[y * size + x]).toBe(partner);
        }
    }
}

describe('smoothElevation (FR-010)', () => {
    it('(a) k=0 is the identity: deep-equals the input and returns a fresh copy', () => {
        const input = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);
        const out = smoothElevation(input, 3, 0);
        expect(out).toEqual(input);
        // Never aliases the input — callers may keep using the original.
        expect(out).not.toBe(input);
    });

    it('(b) determinism: same input × 100 runs → identical output', () => {
        const input = new Uint8Array(64);
        for (let i = 0; i < input.length; i++) {
            input[i] = (i * 37 + 11) % 256;
        }
        const first = smoothElevation(input, 8, 4);
        for (let run = 0; run < 100; run++) {
            expect(smoothElevation(input, 8, 4)).toEqual(first);
        }
    });

    it('(c) preserves 180° point symmetry at k=1,2,4,8', () => {
        // 180°-symmetric 4×4 field (each cell equals its rotated partner).
        const symmetric = new Uint8Array([
            10, 20, 30, 40,
            50, 60, 70, 80,
            80, 70, 60, 50,
            40, 30, 20, 10,
        ]);
        for (const k of [1, 2, 4, 8]) {
            expectPointSymmetric(smoothElevation(symmetric, 4, k), 4);
        }
    });

    it('(d) value bounds: output stays within [0, 255]', () => {
        // Extreme input: full 255 field and a mixed 0/255 checkerboard.
        const full = new Uint8Array(25).fill(255);
        const outFull = smoothElevation(full, 5, 8);
        for (const v of outFull) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
        }
        const mixed = new Uint8Array(25);
        for (let i = 0; i < mixed.length; i++) {
            mixed[i] = i % 2 === 0 ? 255 : 0;
        }
        const outMixed = smoothElevation(mixed, 5, 8);
        for (const v of outMixed) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
        }
    });

    it('(e) edge clamping: corner cell mean uses the clamped 2×2 neighborhood', () => {
        // 3×3 field; the (0,0) corner's clamped neighborhood is
        // (0,0)=100, (0,1)=100, (1,0)=100, (1,1)=200 → sum 500.
        // round-half-up mean = floor((500 + 4) / 9) = floor(504/9) = 56.
        const input = new Uint8Array([
            100, 100, 100,
            100, 200, 100,
            100, 100, 100,
        ]);
        const out = smoothElevation(input, 3, 1);
        expect(out[0]).toBe(56);
    });

    it('(f) monotone smoothing: max adjacent |Δ| is non-increasing with passes on a ridge', () => {
        // A vertical ridge of 100 through a field of 0s. Each pass must
        // not increase the steepest adjacent elevation difference.
        const ridge = new Uint8Array(25);
        for (let y = 0; y < 5; y++) {
            ridge[y * 5 + 2] = 100;
        }
        let prev = maxAdjacentDelta(ridge, 5);
        for (let k = 1; k <= 4; k++) {
            const cur = maxAdjacentDelta(smoothElevation(ridge, 5, k), 5);
            expect(cur).toBeLessThanOrEqual(prev);
            prev = cur;
        }
    });

    it('never mutates the input array', () => {
        const input = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);
        const snapshot = new Uint8Array(input);
        smoothElevation(input, 3, 4);
        expect(input).toEqual(snapshot);
    });
});