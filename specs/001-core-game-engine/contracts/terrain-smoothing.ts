/**
 * Informational mirror — terrain smoothing pass (spec 003 FR-010, Clarifications v1.3)
 *
 * The deterministic post-process heightmap pass that reduces
 * adjacent-cell elevation differences so pipe networks gain multiple
 * viable cross-map routes. The real implementation lives in
 * `packages/terrain/src/smoothing.ts`; this file is informational.
 *
 * Kernel (the spec's reference kernel — the empirical numbers in spec
 * 003 v1.3 were computed with exactly this): 3×3 box mean, divisor 9,
 * coordinates clamped to `[0, size-1]` (edge cells replicate their
 * edge), round-half-up via `Math.floor((sum + 4) / 9)`.
 *
 * Invariants (FR-010): pure (no RNG, no wall-clock); integer-safe;
 * preserves 180° point symmetry exactly; `passes === 0` is the
 * identity (byte-identical to pre-smoothing output).
 */

/**
 * Apply `passes` box-mean smoothing passes to an elevation field.
 *
 * @param elev   Elevation `Uint8Array` of length `size * size`
 *               (already point-symmetric). NOT mutated — a fresh
 *               array is returned.
 * @param size   Square board dimension (`width === height === size`).
 * @param passes Number of passes (0..8 after clamping; 0 = identity).
 * @returns A new `Uint8Array` with the smoothed field.
 */
export declare function smoothElevation(elev: Uint8Array, size: number, passes: number): Uint8Array;

/**
 * The `terrainSmoothing` setting (additive `GenerationSettings` field).
 *
 * - Default: `4`
 * - Safe range: `[0, 8]` (clamped per FR-008)
 * - `0` reproduces pre-smoothing output byte-identically
 * - Surfaced via `effectiveSettings` in `TerrainGenerationResult` and
 *   `MapStats` (mirroring the `citiesPerPlayer` normalization pattern)
 */
export declare const TERRAIN_SMOOTHING_DEFAULT = 4;
export declare const TERRAIN_SMOOTHING_MIN = 0;
export declare const TERRAIN_SMOOTHING_MAX = 8;