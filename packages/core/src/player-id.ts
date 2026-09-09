/**
 * Player Identifier — Server-Generated Stable String IDs
 *
 * Provides `generatePlayerId()` (NanoID 12-char alphanumeric) and
 * `toPlayerId()` (branded string assertion) for creating and
 * validating player identifiers (spec FR-020/FR-021).
 *
 * NanoID rationale: 12-char alphanumeric = 62^12 ≈ 3.2 × 10^21
 * possibilities. Compact, URL-safe, collision-resistant for
 * match-scale use. No external dependency — inline implementation
 * using `crypto.getRandomValues` for cryptographic randomness.
 *
 * The branded type pattern (`string & { __brand: 'PlayerId' }`)
 * prevents accidental assignment of unvalidated strings as player
 * identifiers while remaining structurally compatible with `string`
 * at the type level.
 */

import type { PlayerId } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Character set for NanoID: uppercase + lowercase + digits (URL-safe). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Default ID length — 12 characters yields ~71 bits of entropy. */
const DEFAULT_LENGTH = 12;

// ---------------------------------------------------------------------------
// Crypto access (globalThis — no @types/node or DOM lib dependency)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Web Crypto `getRandomValues` API.
 * Accessed via `globalThis` to avoid needing `@types/node` or
 * `"DOM"` in the tsconfig lib array. Available in Node ≥ 19 and
 * all modern browsers.
 */
interface CryptoLike {
    getRandomValues<T extends Uint8Array>(array: T): T;
}

const cryptoGlobal = (globalThis as { crypto?: CryptoLike }).crypto;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assert that a raw string is a valid `PlayerId`.
 *
 * This is a **branded assertion** — it tells the type system that the
 * string has been validated and should be treated as a player identifier.
 * No runtime validation is performed beyond the type-level brand.
 *
 * Use this when you already know the string is a valid PlayerId
 * (e.g. deserialized from a trusted source). For untrusted input,
 * validate length and charset first.
 *
 * @param raw A string to brand as `PlayerId`.
 * @returns The same string, typed as `PlayerId`.
 */
export function toPlayerId(raw: string): PlayerId {
    return raw as PlayerId;
}

/**
 * Generate a cryptographically random player identifier.
 *
 * Produces a 12-character string from the alphanumeric charset
 * (A-Z, a-z, 0-9) using `crypto.getRandomValues` for each byte.
 * The result is URL-safe, collision-resistant (~71 bits of entropy),
 * and independent of seat index.
 *
 * Determinism note: this function is intentionally NON-deterministic
 * — it uses OS entropy. PlayerIds are generated at match start and
 * are inputs to the deterministic simulation, not outputs of it.
 *
 * @param length Number of characters (default 12; must be > 0).
 * @returns A branded `PlayerId` string.
 * @throws {RangeError} if length is not a positive integer.
 * @throws {Error} if the runtime lacks `crypto.getRandomValues`.
 */
export function generatePlayerId(length: number = DEFAULT_LENGTH): PlayerId {
    if (!Number.isInteger(length) || length <= 0) {
        throw new RangeError(`generatePlayerId length must be a positive integer, got ${length}`);
    }
    if (!cryptoGlobal) {
        throw new Error('crypto.getRandomValues is not available in this runtime');
    }

    const bytes = new Uint8Array(length);
    cryptoGlobal.getRandomValues(bytes);

    let id = '';
    for (let i = 0; i < length; i++) {
        // bytes[i] is always defined here (loop bound guarantees valid index),
        // but noUncheckedIndexedAccess types it as number | undefined.
        // The fallback 0 is unreachable but satisfies the type system and lint.
        id += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
    }
    return id as PlayerId;
}
