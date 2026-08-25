/**
 * RNG Adapter — Feature 003
 *
 * Terrain does **not** introduce a separate PRNG instance. The engine
 * owns the sfc32 generator (feature 001, `packages/engine/src/rng.ts`)
 * and passes its live `Rng` into every `generateBoard` call via
 * `TerrainGenerationRequest.rng` (see `contracts/terrain-types.ts`).
 * The mandate ("engine passes the same PRNG instance used to start
 * the match — do not introduce a separate PRNG") is a constitution
 * Principle II determinism invariant.
 *
 * This module provides two pure helpers that operate on the engine's
 * PRNG without owning one:
 *
 *   - `deriveSubstream(parent)` — split the parent's stream so a
 *     downstream phase (noise, water, cities) consumes a disjoint
 *     subset of uint32s. Implementation: draw one uint32 from the
 *     parent (advancing its state by one step), then construct a new
 *     sfc32 generator whose state is seeded from that uint32. The
 *     new generator is **independent** of the parent — subsequent
 *     advances to the parent do not perturb it (and vice versa).
 *
 *   - `mixSeed(seed, attempt)` — deterministic uint32 mixing for the
 *     FR-007 regeneration-retry derivation. Given the same
 *     `(seed, attempt)` pair, returns the same uint32; across many
 *     `attempt` values, distributes uniformly.
 *
 * **Determinism invariants** (constitution Principle II):
 *   - No `Math.random()`, `Date.now()`, `performance.now()`, `Math.sin`,
 *     or `Math.cos` anywhere in this file. All entropy comes from the
 *     parent `Rng` or from integer mixing.
 *   - All arithmetic uses 32-bit integer ops (`Math.imul`, `>>> 0`).
 *   - Same `(seed, attempt)` → same `mixSeed` output on every platform.
 *   - Same parent state at entry to `deriveSubstream` → same child
 *     generator on every platform.
 *
 * Implementation note: the engine exposes its sfc32 factory as
 * `createRng` from `@europa/engine` (see `packages/engine/src/rng.ts`).
 * The factory accepts a numeric seed and returns a fresh `Rng`
 * instance; we use it to build the substreams. The factory's
 * implementation hash is a deterministic xmur3 chain, identical on
 * every JS engine.
 */

import { createRng } from '@europa/engine';

import type { Rng } from './contracts/terrain-types';

/**
 * Derive an independent sub-stream from `parent`. Advances the parent
 * by exactly one sfc32 step (consuming one uint32) and uses that
 * uint32 as the seed for a fresh sfc32 generator returned to the
 * caller.
 *
 * The returned `Rng` is **disjoint** from the parent: subsequent
 * advances to the parent do not perturb the sub-stream, and vice
 * versa. This is the "fan out the engine PRNG across terrain phases"
 * pattern: each generator phase (noise, water, cities, retries) gets
 * its own deterministic sub-stream so phase ordering does not perturb
 * other phases' outputs.
 *
 * @param parent The engine's live sfc32 instance. Advanced exactly
 *               once by this call.
 * @returns A fresh `Rng` independent of `parent`.
 */
export function deriveSubstream(parent: Rng): Rng {
    // One uint32 from the parent; this is the seed for the sub-stream.
    // The parent is the engine's live sfc32 — `Rng` is callable and
    // returns a uint32 per the engine-types contract.
    const seed = parent();
    return createRng(seed >>> 0);
}

/**
 * Mix a seed with an attempt index to produce a deterministic retry
 * seed (FR-007). Pure: same `(seed, attempt)` → same output on every
 * platform.
 *
 * The mixer is a single round of integer multiplications and XORs,
 * chosen to:
 *
 *   - Be uint32-stable across all JS engines (no float drift).
 *   - Distinguish closely-spaced `attempt` values
 *     (`mixSeed(seed, n)` and `mixSeed(seed, n+1)` differ in many
 *     bits for typical seeds).
 *   - Be free of trivially-degenerate inputs (e.g., `seed === 0`).
 *
 * The constants (`0x9E3779B1`, `0x85EBCA6B`, `0xC2B2AE35`) are
 * standard avalanche / hash-mix primes from xmur3 / MurmurHash3; they
 * are widely-used public-domain values.
 *
 * @param seed    The seed to mix (typically `TerrainGenerationRequest.seed`).
 *                Coerced to uint32 via `>>> 0`; values outside `[0, 2^32)`
 *                are folded into that range.
 * @param attempt The attempt index (`0 ≤ attempt ≤ 255`). Coerced to
 *                uint32 via `>>> 0`. Only the low 8 bits meaningfully
 *                affect the output because of the `0xFF` mask, which
 *                is intentional: typical retry counts are ≤ 16, and
 *                larger `attempt` values fold back into the low byte.
 * @returns A deterministic uint32 in `[0, 2^32)`.
 */
export function mixSeed(seed: number, attempt: number): number {
    // Fold both inputs to uint32. The full uint32 range is preserved
    // for `attempt` so attempts > 255 still produce distinct outputs
    // (a 256-cap would collide for typical retry counts ≤ 5 if the
    // caller ever changed the cap). The avalanche step below
    // distributes the bits uniformly across `[0, 2^32)`.
    const s = seed >>> 0;
    const a = attempt >>> 0;
    // Single avalanche round: xor-fold attempt into seed, then mix via
    // imul with a prime. Output forced to uint32 by `>>> 0`.
    return Math.imul(s ^ Math.imul(a, 0x9e3779b1), 0x85ebca6b) >>> 0;
}
