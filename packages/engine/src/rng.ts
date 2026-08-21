/**
 * Deterministic Pseudorandom Number Generator — Feature 001
 *
 * Implements **sfc32** (Small Fast Counter, 128-bit state) plus the
 * **xmur3** string-hashing helper used to seed it. Together they form
 * the match-wide deterministic PRNG required by spec FR-017
 * ("no wall-clock reads inside tick logic", "command application in a
 * well-defined total order"). See `research.md` §5 for rationale.
 *
 * **Determinism invariants (constitution Principle II):**
 *   - No unseeded entropy sources (any host RNG, wall-clock reads,
 *     trig functions, etc.) are used in state updates.
 *   - All arithmetic uses 32-bit integer multiplication (imul) and
 *     unsigned right-shift-with-zero (the `>>> 0` idiom) to coerce
 *     results to uint32. No float math in state updates.
 *   - Same input seed + same call sequence → identical output stream
 *     on every platform, every run. This is the basis of replay
 *     support and the SC-001 10k-tick determinism test.
 *
 * The engine owns the PRNG instance; it is passed to feature 003
 * (terrain) so map generation consumes the same stream that drives
 * tick resolution. Consumers MUST NOT advance the generator from
 * outside — `Rng.state` is exposed read-only for test/assertion use.
 */

import type { Rng } from './types';

// ----------------------------------------------------------------------------
// xmur3 — string-to-uint32 hash function
// ----------------------------------------------------------------------------
//
// Public-domain reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
// Produces a closure that returns the next hash word each call. Calling it
// 4 times yields 4×uint32 — the standard sfc32 seed-init pattern.

/**
 * Initialize an xmur3 hash chain from a string. Each call to the returned
 * function yields the next 32-bit hash word.
 *
 * @param str Input to hash. UTF-16 code units (i.e. `String.prototype.charCodeAt`).
 * @returns A closure that returns a uint32 on each call. Call 4× to seed sfc32.
 */
function xmur3(str: string): () => number {
  // Initial seed: 0x6c078965 XOR length. (Standard xmur3 initial value.)
  let h = (0x6c078965 ^ str.length) >>> 0;
  // Pre-mix: 32-bit avalanche per character.
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ (str.charCodeAt(i) ?? 0), 0xcc9e2d51) >>> 0;
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  // Output mix: 3 rounds of avalanche producing a single uint32 word.
  return function next(): number {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  };
}

// ----------------------------------------------------------------------------
// sfc32 — 128-bit PRNG
// ----------------------------------------------------------------------------
//
// Public-domain reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
// Four 32-bit state words, 2^128 period, passes TestU01 Crush and BigCrush.
// Integer-only ops: no float drift; same stream on every JS engine.

/**
 * Construct an sfc32 generator from a 4-word state. The state is mutated
 * in place; the returned `Rng` exposes a live read-only view via `.state`.
 *
 * @param state 4-word Uint32Array (sfc32 internal order). Not copied.
 * @returns Callable matching the `Rng` type from `./types`.
 */
function createRngFromState(state: Uint32Array): Rng {
  // Read the four state words on every call (instead of holding them
  // in closure variables) so the live `state` Uint32Array is the
  // single source of truth and reflects the most recent mix.
  function rng(): number {
    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;

    // sfc32 mix: integer-only ops, force to uint32 at every step.
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    t = t >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;

    // Persist updated state so `.state` reflects the post-mix values.
    state[0] = a;
    state[1] = b;
    state[2] = c;
    state[3] = d;

    // Return uint32 in [0, 2^32), matching the contract's documented
    // return type. (Standard sfc32 reference divides by 2^32 for a
    // [0, 1) float; bits are equivalent, scale differs.)
    return t;
  }

  // Attach the live `state` property. `Object.defineProperty` keeps the
  // callable as a plain function; the getter returns the same array
  // reference that the closure mutates.
  Object.defineProperty(rng, 'state', {
    get: () => state,
    enumerable: true,
  });

  return rng as Rng;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Hash a numeric seed into a 4-word sfc32 state. Uses xmur3-style
 * mixing so that `hashSeed(0)`, `hashSeed(1)`, and any other input
 * produce non-degenerate, well-distributed 4-word states.
 *
 * @param seed Input seed (uint32; values outside that range are coerced).
 * @returns Freshly allocated 4-word Uint32Array.
 */
export function hashSeed(seed: number): Uint32Array {
  // Convert to string so the xmur3 chain sees a deterministic,
  // platform-independent byte sequence. `String(num)` is
  // ECMA-262-specified and stable across V8/SpiderMonkey/JavaScriptCore.
  const hash = xmur3(String(seed));
  const result = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    result[i] = hash();
  }
  return result;
}

/**
 * Create a deterministic sfc32 generator from a numeric seed. Same
 * seed → same stream, every run (spec FR-017 determinism, SC-001).
 *
 * @param seed Integer seed (typically uint32; not validated — any
 *             number works, but values are coerced through `String`
 *             to the xmur3 mixer).
 * @returns Callable `Rng` (see `./types`).
 */
export function createRng(seed: number): Rng {
  return createRngFromState(hashSeed(seed));
}

/**
 * Create a deterministic sfc32 generator from a string seed. Useful
 * for human-friendly match seeds (e.g. a lobby ID) and for hashing
 * composite keys (e.g. `${matchId}:${replayTick}`).
 *
 * @param str Input string. UTF-16 code units are hashed.
 * @returns Callable `Rng`.
 */
export function createRngFromString(str: string): Rng {
  const hash = xmur3(str);
  const state = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    state[i] = hash();
  }
  return createRngFromState(state);
}
