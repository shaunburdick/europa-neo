/**
 * Test Seed Helpers — Feature 002
 *
 * Test-only helpers for deterministic seed enumeration. Mirrors
 * the pattern in
 * `packages/terrain/tests/fixtures/seeds.ts`:
 *
 *   - `goldenSeeds(trials)` — produces `(i * 0x9E3779B1) >>> 0`
 *     for `i ∈ [0, trials)`. The stride is the golden-ratio
 *     fractional-part constant, which gives a well-distributed
 *     sequence of distinct uint32s and matches the convention
 *     used in the engine + terrain tests.
 *   - `SEED_42`, `SEED_C0FFEE`, `SEED_1` — named constants
 *     for snapshot tests. `SEED_C0FFEE` is the conventional
 *     "magic" seed used across packages; using the same value
 *     across packages makes cross-package snapshot diffs
 *     easier.
 *
 * Fog does not use these seeds directly (visibility is a pure
 * function of the `World` snapshot, not a PRNG). They are
 * provided so determinism tests (SC-001, T029/T030) can
 * construct scripted worlds with a known seed without taking
 * a dependency on a hard-coded literal.
 */

/** Named seed used for "magic number" snapshot tests. */
export const SEED_42 = 42;

/** Conventional "coffee"-themed magic seed used across packages. */
export const SEED_C0FFEE = 0xc0ffee;

/** Seed `1` — the simplest non-trivial seed. */
export const SEED_1 = 1;

/**
 * Golden-ratio fractional-part constant (`2^32 / φ`). Used as
 * the stride for `goldenSeeds`; multiplying a uint32 sequence
 * index by this constant and folding via `>>> 0` produces a
 * uniformly distributed sequence of distinct uint32s
 * (Hammersley-style low-discrepancy sampling).
 */
const GOLDEN_RATIO_UINT32 = 0x9e3779b1;

/**
 * Enumerate `trials` well-distributed uint32 seeds via the
 * golden-ratio stride. The output sequence is deterministic
 * and identical across platforms (integer-only math).
 *
 * @param trials Number of seeds to produce (`≥ 0`). Each
 *               returned seed is `(i * 0x9E3779B1) >>> 0` for
 *               `i ∈ [0, trials)`.
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
