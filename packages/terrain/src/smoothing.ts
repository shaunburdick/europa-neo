/**
 * Elevation Smoothing — Feature 003 (FR-010, Clarifications v1.3)
 *
 * Deterministic post-process heightmap pass that reduces adjacent-cell
 * elevation differences so pipe networks gain multiple viable cross-map
 * routes (spec 003 US4 AC-1). Applied in `generateBoard` AFTER point
 * symmetry enforcement (`generateElevationMap`) and BEFORE water
 * classification (`extractWater`) per FR-010.
 *
 * **Kernel** (the spec's reference kernel — the empirical numbers in
 * spec 003 v1.3 were computed with exactly this): each pass replaces
 * every cell's elevation with the round-half-up mean of its 3×3
 * neighborhood, divisor 9, coordinates clamped to `[0, size-1]` so
 * edge cells replicate their edge:
 *
 *   `next[y*size+x] = Math.floor((sum + 4) / 9)`
 *
 * `Math.floor((sum + 4) / 9)` is `Math.round(sum / 9)` for non-negative
 * sums, expressed in integer-only arithmetic (constitution Principle II
 * — no floats in the simulation path).
 *
 * **Invariants** (FR-010):
 *   - Pure: no RNG consumption, no wall-clock. Same input + passes →
 *     identical output on every platform.
 *   - `passes === 0` is the identity: returns a copy of the input
 *     unchanged (byte-identical to pre-smoothing output; backward
 *     compatible — existing seeds and fixtures are unaffected).
 *   - Symmetry-preserving: a symmetric kernel with symmetric clamping
 *     commutes with 180° rotation, so point symmetry (FR-004) holds
 *     exactly after every pass.
 *   - Never mutates the input; a fresh `Uint8Array` is returned.
 *   - Integer-safe: max sum is 9 × 255 = 2295, so the rounded mean
 *     stays within the uint8 range `[0, 255]`.
 *
 * @param elev   Elevation `Uint8Array` of length `size * size`
 *               (already point-symmetric). NOT mutated.
 * @param size   Square board dimension (`width === height === size`).
 * @param passes Number of smoothing passes (0..8 after clamping per
 *               FR-008; `0` = identity).
 * @returns A new `Uint8Array` with the smoothed elevation field.
 */
export function smoothElevation(elev: Uint8Array, size: number, passes: number): Uint8Array {
    // Copy the input so `passes === 0` returns a fresh, unchanged array
    // and every pass reads from the previous pass's output (never the
    // caller's buffer).
    let current = new Uint8Array(elev);
    for (let pass = 0; pass < passes; pass++) {
        const next = new Uint8Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    // Clamp the neighborhood row to [0, size-1]: edge
                    // cells replicate their edge (spec v1.3 kernel).
                    const ny = Math.min(size - 1, Math.max(0, y + dy));
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = Math.min(size - 1, Math.max(0, x + dx));
                        sum += current[ny * size + nx] ?? 0;
                    }
                }
                // Round-half-up integer mean (divisor 9).
                next[y * size + x] = Math.floor((sum + 4) / 9);
            }
        }
        current = next;
    }
    return current;
}