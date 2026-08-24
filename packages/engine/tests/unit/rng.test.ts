/**
 * Deterministic PRNG tests — Feature 001, T013
 *
 * Validates the four core determinism properties called out in the
 * task spec:
 *   1. Same seed → same first 1000 outputs (FR-006 / SC-001).
 *   2. Different seeds → different outputs (statistical sanity).
 *   3. `createRng(0)` is non-degenerate (edge case: zero seed).
 *   4. Source uses only `Math.imul` / `>>> 0` (constitution Principle II:
 *      no `Math.random`, no `Date.now`, no `Math.sin`/`Math.cos`).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRng, createRngFromString, hashSeed } from '../../src/rng';
import type { Rng } from '../../src/types';

// Resolve the rng.ts source so we can grep it for forbidden APIs.
// `import.meta.url` is the only way to locate our own file in ESM;
// `readFileSync` then lets us scan the source as text. We use
// `dirname()` to get the directory of THIS test file
// (`packages/engine/tests/unit/`) and then go up 2 levels to reach
// `packages/engine/src/rng.ts`.
const here = dirname(fileURLToPath(import.meta.url));
const RNG_SOURCE_PATH = resolve(here, '..', '..', 'src', 'rng.ts');

describe('createRng — determinism (FR-006 / SC-001)', () => {
    it('same seed produces the same first 1000 outputs', () => {
        const a = createRng(42);
        const b = createRng(42);
        for (let i = 0; i < 1000; i++) {
            expect(a()).toBe(b());
        }
    });

    it('different seeds produce different output streams', () => {
        const a = createRng(1);
        const b = createRng(2);
        let diffs = 0;
        for (let i = 0; i < 1000; i++) {
            if (a() !== b()) {
                diffs++;
            }
        }
        // Statistical sanity: with 32-bit output and random seeds, the
        // expected number of differences is ~1000 (all 1000). Allow
        // a generous lower bound; this test only catches "streams are
        // identical" (diffs === 0), not subtle distribution defects.
        expect(diffs).toBeGreaterThan(900);
    });

    it('createRng(0) is non-degenerate', () => {
        const rng = createRng(0);
        const outputs = new Set<number>();
        for (let i = 0; i < 1000; i++) {
            outputs.add(rng());
        }
        // sfc32 should produce ~1000 distinct values from a 32-bit
        // space. Collision rate is astronomically low; allow ≥990.
        expect(outputs.size).toBeGreaterThan(990);
        // All-zero stream would be the failure mode — assert non-zero.
        expect(outputs.has(0)).toBe(false);
    });

    it('the returned Rng is callable and has a Uint32Array state', () => {
        const rng: Rng = createRng(7);
        expect(typeof rng).toBe('function');
        expect(rng.state).toBeInstanceOf(Uint32Array);
        expect(rng.state.length).toBe(4);
        // State mutates between calls (the array is live, not a snapshot).
        const before = Array.from(rng.state);
        rng();
        const after = Array.from(rng.state);
        expect(after).not.toEqual(before);
    });

    it('state is a live view — repeated reads return the same reference', () => {
        const rng = createRng(99);
        const s1 = rng.state;
        rng();
        rng();
        const s2 = rng.state;
        expect(s1).toBe(s2); // same Uint32Array instance
    });
});

describe('hashSeed — 4-word mixing', () => {
    it('returns a 4-word Uint32Array', () => {
        const state = hashSeed(123);
        expect(state).toBeInstanceOf(Uint32Array);
        expect(state.length).toBe(4);
        for (let i = 0; i < 4; i++) {
            expect(Number.isInteger(state[i])).toBe(true);
            expect((state[i] ?? 0) >>> 0).toBe(state[i] ?? 0); // uint32 check
        }
    });

    it('different inputs produce different 4-word states', () => {
        const a = hashSeed(1);
        const b = hashSeed(2);
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('hashSeed(0) produces a non-zero state', () => {
        const state = hashSeed(0);
        const allZero = Array.from(state).every((w) => w === 0);
        expect(allZero).toBe(false);
    });

    it('hashSeed is deterministic — same input → same output', () => {
        const a = hashSeed(0xdeadbeef);
        const b = hashSeed(0xdeadbeef);
        expect(Array.from(a)).toEqual(Array.from(b));
    });
});

describe('createRngFromString — string-seeded determinism', () => {
    it('same string produces the same stream', () => {
        const a = createRngFromString('europa-neo');
        const b = createRngFromString('europa-neo');
        for (let i = 0; i < 100; i++) {
            expect(a()).toBe(b());
        }
    });

    it('different strings produce different streams', () => {
        const a = createRngFromString('alpha');
        const b = createRngFromString('beta');
        const aOut = new Array<number>(100).fill(0).map(() => a());
        const bOut = new Array<number>(100).fill(0).map(() => b());
        expect(aOut).not.toEqual(bOut);
    });
});

describe('rng.ts — source purity guard (constitution Principle II)', () => {
    it('does not reference Math.random, Date.now, or Math.sin/cos', () => {
        const src = readFileSync(RNG_SOURCE_PATH, 'utf8');
        // Each forbidden pattern would be a constitution violation.
        // Match the bare function call (followed by `(`) and also
        // property/member access to catch `Math.random` as a value.
        const forbidden: ReadonlyArray<{ name: string; pattern: RegExp }> = [
            { name: 'Math.random', pattern: /\bMath\.random\b/ },
            { name: 'Date.now', pattern: /\bDate\.now\b/ },
            { name: 'performance.now', pattern: /\bperformance\.now\b/ },
            { name: 'Math.sin', pattern: /\bMath\.sin\b/ },
            { name: 'Math.cos', pattern: /\bMath\.cos\b/ },
            { name: 'Math.floor (with Math.random)', pattern: /Math\.floor\s*\(\s*Math\.random/ },
        ];
        const hits = forbidden.filter((f) => f.pattern.test(src));
        expect(hits, `rng.ts contains forbidden API(s): ${hits.map((h) => h.name).join(', ')}`).toEqual([]);
    });

    it('uses Math.imul and >>> 0 (the approved integer-only toolkit)', () => {
        const src = readFileSync(RNG_SOURCE_PATH, 'utf8');
        // These are the building blocks the spec mandates. If they're
        // removed, the file probably regressed to floats.
        expect(src).toMatch(/\bMath\.imul\b/);
        expect(src).toMatch(/>>>\s*0/);
    });
});
