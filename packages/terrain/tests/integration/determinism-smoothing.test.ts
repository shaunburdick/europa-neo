/**
 * Smoothing Determinism Integration Test — Feature 003 (US4 AC-3/AC-4, FR-010)
 *
 * Pins determinism across the smoothing range and the k=0 backward-
 * compatibility guarantee:
 *
 *   - **AC-4 (determinism across the range)**: for every k in
 *     {0,1,2,3,4,5,8} × 10 sampled seeds × 32×32, regenerating with
 *     the same seed produces a byte-identical Board (`hashBoard`).
 *   - **AC-3 (k=0 byte-identity)**: `terrainSmoothing: 0` reproduces
 *     pre-smoothing output exactly. The reference is a set of golden
 *     hashes captured from the generator BEFORE the smoothing pass was
 *     wired into the pipeline (commit `ebd8021`); any change that
 *     alters pre-smoothing output fails loudly here.
 *   - **FR-008 (clamping surfaced)**: `effectiveSettings.terrainSmoothing`
 *     reports the clamped value actually used (in-range values pass
 *     through; out-of-range values are clamped to `[0, 8]`).
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const BOARD_SIZE = 32;
const SMOOTHING_VALUES = [0, 1, 2, 3, 4, 5, 8] as const;

/**
 * Golden pre-smoothing Board hashes, captured from the generator
 * BEFORE the smoothing pass was wired in (T015, commit `ebd8021`).
 * Keyed by the first 10 `goldenSeeds(10)` values. `terrainSmoothing: 0`
 * must reproduce these byte-identically (spec 003 US4 AC-3).
 */
const PRE_SMOOTHING_GOLDEN_HASHES: Readonly<Record<number, string>> = {
    0: '3cff578b37bc4f59',
    2654435761: '27d14454ed2edb53',
    1013904226: '2d7c854fa08c9ea5',
    3668339987: '25c6db3f3c6250af',
    2027808452: '388154fdca1f62e9',
    387276917: '33f8b5e5c8857eb5',
    3041712678: '7f728c48aac29745',
    1401181143: '7344eaf1b88ffff1',
    4055616904: '3208f6559e6274fd',
    2415085369: '6efdcbe346dfa18d',
};

function makeRequest(seed: number, terrainSmoothing: number) {
    return {
        boardSize: BOARD_SIZE,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: { ...DEFAULT_GENERATION_SETTINGS, terrainSmoothing },
    };
}

describe('smoothing determinism (US4 AC-3/AC-4, FR-010)', () => {
    it('AC-4: same-seed regeneration is byte-identical for every k in the safe range', {
        timeout: 60_000,
    }, () => {
        const seeds = goldenSeeds(10);
        for (const k of SMOOTHING_VALUES) {
            for (const seed of seeds) {
                const a = generateBoard(makeRequest(seed, k));
                const b = generateBoard(makeRequest(seed, k));
                expect(hashBoard(a.board)).toBe(hashBoard(b.board));
                expect(a.effectiveSeed).toBe(b.effectiveSeed);
            }
        }
    });

    it('AC-3: terrainSmoothing 0 reproduces pre-smoothing output byte-identically', {
        timeout: 30_000,
    }, () => {
        const seeds = goldenSeeds(10);
        for (const seed of seeds) {
            const result = generateBoard(makeRequest(seed, 0));
            const golden = PRE_SMOOTHING_GOLDEN_HASHES[seed];
            expect(golden, `missing golden hash for seed ${String(seed)}`).toBeDefined();
            expect(hashBoard(result.board)).toBe(golden);
        }
    });

    it('FR-008: effectiveSettings.terrainSmoothing reports the clamped value', () => {
        // In-range values pass through unchanged.
        for (const k of SMOOTHING_VALUES) {
            const result = generateBoard(makeRequest(42, k));
            expect(result.effectiveSettings.terrainSmoothing).toBe(k);
        }
        // Out-of-range values are clamped to the safe range and surfaced.
        const clampedHigh = generateBoard(makeRequest(42, 99));
        expect(clampedHigh.effectiveSettings.terrainSmoothing).toBe(8);
        const clampedLow = generateBoard(makeRequest(42, -3));
        expect(clampedLow.effectiveSettings.terrainSmoothing).toBe(0);
    });
});