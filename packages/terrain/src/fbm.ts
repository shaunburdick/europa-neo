/**
 * fBm (Fractal Brownian Motion) — Feature 003
 *
 * Sums `valueNoise` at increasing frequencies with decreasing
 * amplitude to build the elevation field (FR-002 / INV-14). The
 * "fractal" character — the rolling-hills look — comes from the
 * geometric series of contributions.
 *
 * **Formula**:
 *   fbm(x, y, seed, octaves, persistence) =
 *     sum_{i=0..octaves-1} persistence^i * valueNoise(x * lacunarity^i, y * lacunarity^i, seed)
 *   then normalized to [0, 255].
 *
 * **Default lacunarity** is 2 (standard fBm). The integer step
 * count is `(octaves - 1)`, matching the spec.
 *
 * **Normalization**: the raw sum is divided by the maximum possible
 * sum (`(1 - persistence^octaves) / (1 - persistence)`) and scaled
 * to `[0, 255]`. This keeps the output range stable across
 * `octaves` and `persistence` choices (otherwise doubling octaves
 * would saturate to 255).
 *
 * **Determinism invariants** (constitution Principle II):
 *   - No `Math.random`, no `Date.now`, no `Math.sin` / `Math.cos`.
 *   - All math is `Math.imul` / `>>> 0` / `| 0`.
 *   - Same inputs → same output on every platform, every run.
 *
 * **Persistence ≤ 0 or ≥ 1** would make the geometric series
 * degenerate (zero or unbounded). The caller is expected to pass
 * a sensible value (`DEFAULT_GENERATION_SETTINGS.roughness = 0.5`).
 * We do not validate here — the shape contract is enforced by
 * `validateSettings` and the clamp in US3.
 */

import { valueNoise } from './value-noise';

/**
 * Default frequency multiplier between consecutive octaves.
 * Standard fBm value (see `research.md` §1).
 */
const DEFAULT_LACUNARITY = 2;

/**
 * Starting frequency for the base octave. The first octave is
 * sampled at `(x * BASE_FREQUENCY, y * BASE_FREQUENCY)` so the
 * output has a larger "feature size" than a per-cell sample.
 *
 * **Why < 1**: hash-based value noise is high-frequency (essentially
 * random per lattice point). At `frequency=1`, a 32×32 board samples
 * the noise at 32 distinct lattice points per axis — enough
 * resolution for hash values to dominate the cell-to-cell variation.
 * At `frequency=0.25`, the same 32×32 board samples only 8 distinct
 * lattice points per axis (with bilinear interpolation between),
 * producing smoother basins. The 4 octaves then add progressively
 * finer detail. The result is a fBm field that is smooth at the
 * basin scale and only adds noise at the detail scale, which is
 * what FR-003 ("contiguous water pools") requires.
 */
const BASE_FREQUENCY = 0.25;

/**
 * Build the elevation field via fractal Brownian motion.
 *
 * @param x           x-coordinate of the sample point (any finite number).
 * @param y           y-coordinate of the sample point (any finite number).
 * @param seed        uint32 seed (typically from the engine PRNG).
 * @param octaves     Number of octaves to sum (integer ≥ 1; the
 *                    default `DEFAULT_GENERATION_SETTINGS.octaves` is 4).
 * @param persistence Amplitude decay per octave (typically in `[0, 1)`;
 *                    default 0.5).
 * @returns Integer in `[0, 255]`.
 */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  persistence: number,
): number {
  // Octave loop. `frequency` doubles each step; `amplitude` decays
  // by `persistence`. The first octave uses a sub-unity frequency
  // so the base noise is smooth (see `BASE_FREQUENCY`).
  let frequency = BASE_FREQUENCY;
  let amplitude = 1;
  let sum = 0;
  // Max possible sum (geometric series) is used for normalization.
  // We compute it inline to keep the function pure and self-contained.
  let maxSum = 0;
  for (let i = 0; i < octaves; i++) {
    const contribution = valueNoise(x * frequency, y * frequency, seed) * amplitude;
    sum += contribution;
    maxSum += 255 * amplitude;
    frequency = frequency * DEFAULT_LACUNARITY;
    amplitude *= persistence;
  }
  // Normalize: if maxSum is 0 (octaves=0, which we don't allow
  // per the shape contract, but be defensive), return 0.
  if (maxSum <= 0) {
    return 0;
  }
  // Scale to [0, 255] via ratio. `| 0` floors to int32.
  return ((sum / maxSum) * 255) | 0;
}
