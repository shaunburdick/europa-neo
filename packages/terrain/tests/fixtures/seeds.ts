/**
 * Test Seed Helpers — Feature 003
 *
 * Test-only helpers for deterministic seed enumeration. Mirrors the
 * pattern in `packages/engine/tests/fixtures/scenarios.ts` but scoped
 * to the seed-side needs of terrain tests:
 *
 *   - `goldenSeeds(trials)` — produces `(i * 0x9E3779B1) >>> 0` for
 *     `i ∈ [0, trials)`. The stride is the golden-ratio
 *     fractional-part constant, which gives a well-distributed
 *     sequence of distinct uint32s and matches the Q-T01/Q-T02/Q-T05/
 *     Q-T06/Q-T07/Q-T08 scenarios in `quickstart.md`.
 *   - `SEED_42`, `SEED_C0FFEE`, `SEED_1` — named constants for
 *     snapshot tests. `SEED_C0FFEE` is the conventional "magic"
 *     seed used in the engine's tests too; using the same value
 *     across packages makes cross-package snapshot diffs easier.
 *   - `engineSfc32(seed)` — thin wrapper that constructs an sfc32
 *     instance from the engine's exported `createRng` factory.
 *     Terrain tests need this so they can exercise the engine PRNG
 *     without taking a private import on the engine's `src/rng.ts`.
 */

import { createRng } from '@europa/engine';

import type { Rng } from '../../src/types';

/** Named seed used for "magic number" snapshot tests. */
export const SEED_42 = 42;

/** Conventional "coffee"-themed magic seed used across packages. */
export const SEED_C0FFEE = 0xc0ffee;

/** Seed `1` — the simplest non-trivial seed. */
export const SEED_1 = 1;

/**
 * Golden-ratio fractional-part constant (`2^32 / φ`). Used as the
 * stride for `goldenSeeds`; multiplying a uint32 sequence index by
 * this constant and folding via `>>> 0` produces a uniformly
 * distributed sequence of distinct uint32s (Hammersley-style low-
 * discrepancy sampling).
 */
const GOLDEN_RATIO_UINT32 = 0x9e3779b1;

/**
 * Enumerate `trials` well-distributed uint32 seeds via the golden-
 * ratio stride. The output sequence is deterministic and identical
 * across platforms (integer-only math).
 *
 * @param trials Number of seeds to produce (`≥ 0`). Each returned
 *               seed is `(i * 0x9E3779B1) >>> 0` for `i ∈ [0, trials)`.
 * @returns `number[]` of length `trials`.
 * @throws If `trials` is negative or not an integer.
 */
export function goldenSeeds(trials: number): number[] {
  if (!Number.isInteger(trials) || trials < 0) {
    throw new Error(`goldenSeeds: trials must be a non-negative integer (got ${String(trials)})`);
  }
  const out: number[] = new Array(trials);
  for (let i = 0; i < trials; i++) {
    out[i] = Math.imul(i, GOLDEN_RATIO_UINT32) >>> 0;
  }
  return out;
}

/**
 * Construct an sfc32 `Rng` instance from a numeric seed using the
 * engine's exported factory. Thin wrapper to keep tests DRY; the
 * engine's own `createRng` is the single source of truth for PRNG
 * construction.
 *
 * @param seed Integer seed (typically uint32; the engine folds via
 *             `String(seed)` → xmur3 chain).
 * @returns Callable `Rng` matching the engine's `Rng` type.
 */
export function engineSfc32(seed: number): Rng {
  return createRng(seed);
}
