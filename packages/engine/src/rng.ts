/**
 * Deterministic Pseudorandom Number Generator — Feature 001
 *
 * The canonical sfc32 + xmur3 implementation lives in `@europa/core`
 * (`packages/core/src/rng.ts`). This module re-exports the engine's
 * public PRNG API for backward compatibility — consumers of
 * `@europa/engine` can `import { createRng } from '@europa/engine'`
 * without a direct dependency on `@europa/core`.
 *
 * See `@europa/core` for the full implementation, determinism invariants,
 * and branch-coverage rationale.
 */

export { createRng, createRngFromString, hashSeed } from '@europa/core';
