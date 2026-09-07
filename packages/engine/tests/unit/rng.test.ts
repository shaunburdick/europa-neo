/**
 * RNG re-export smoke test — Feature 001
 *
 * The full PRNG test suite lives in `@europa/core` (packages/core).
 * This file verifies that the engine's re-export barrel works:
 * `createRng`, `hashSeed`, and `createRngFromString` are re-exported
 * from `@europa/core` via `packages/engine/src/rng.ts`.
 */

import { describe, expect, it } from 'vitest';
import { createRng, createRngFromString, hashSeed } from '../../src/rng';
import type { Rng } from '../../src/types';

describe('engine RNG re-exports from @europa/core', () => {
    it('createRng produces a working Rng', () => {
        const rng: Rng = createRng(42);
        expect(typeof rng).toBe('function');
        expect(rng.state).toBeInstanceOf(Uint32Array);
        expect(rng.state.length).toBe(4);
        const a = rng();
        expect(typeof a).toBe('number');
        expect(a >>> 0).toBeGreaterThanOrEqual(0); // uint32 range
    });

    it('hashSeed produces a 4-word Uint32Array', () => {
        const state = hashSeed(123);
        expect(state).toBeInstanceOf(Uint32Array);
        expect(state.length).toBe(4);
    });

    it('createRngFromString produces a working Rng', () => {
        const rng = createRngFromString('europa-neo');
        expect(typeof rng).toBe('function');
        expect(rng.state).toBeInstanceOf(Uint32Array);
    });
});
