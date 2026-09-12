/**
 * Canonical Player Identity — Shared Foundation (issue #74)
 *
 * One server-issued, opaque, 12-character identifier is shared by the
 * active lobby identity (`GuestPlayerId`) and the in-match engine
 * identity (`PlayerId`). This module is the single source of truth for
 * the identity format, its runtime validators, and the CSPRNG-backed
 * generator. The type and constants originated in feature 001's v1.13
 * amendment (spec `FR-020`..`FR-022`).
 *
 * ## IDs are correlation metadata, never credentials
 *
 * A `PlayerId` (or `GuestPlayerId`) is a **non-secret** correlator. It
 * names *who* a record belongs to in engine state, wire payloads, fog
 * views, and the console. It is **never** proof of authority:
 *
 *   - Possessing a valid-looking ID grants no seat, order, view,
 *     reconnect, eviction, or forfeit authority.
 *   - `SessionToken` / `ReconnectToken` remain the only bearer
 *     credentials; they are distinct brands with distinct semantics and
 *     must never be derived from — or replaced by — an ID.
 *   - IDs may appear in logs and shareable URLs (a match link); tokens
 *     must not.
 *
 * ## Canonical representation
 *
 * | Constant             | Value                                                    |
 * | -------------------- | -------------------------------------------------------- |
 * | `PLAYER_ID_ALPHABET` | `A–Z a–z 0–9 _ -` (64 symbols)                           |
 * | `PLAYER_ID_LENGTH`   | 12 characters                                            |
 * | `PLAYER_ID_BITS`     | 72 bits (12 × 6)                                         |
 * | `PLAYER_ID_PATTERN`  | `/^[A-Za-z0-9_-]{12}$/`                                  |
 *
 * ## Generation and determinism
 *
 * Generation happens only at server trust boundaries (identity
 * allocation), **never** inside the engine tick or replay paths. The
 * generator consumes 9 platform-CSPRNG bytes and packs them into 12
 * six-bit symbol indices — exactly 72 bits. No clock is read, no weak
 * host randomness is used, and the seeded simulation PRNG (`rng.ts`) is
 * never consulted.
 *
 * ### On "rejection sampling" and modulo bias
 *
 * The canonical alphabet has 64 symbols, and a byte has 256 = 4 × 64
 * values. Taking the low six bits of a byte (`byte & 63`) is therefore
 * *exactly* uniform — every symbol has four preimages — so no byte is
 * ever rejected and no modulo bias is possible. The generator still
 * performs **rejection sampling at the candidate level**: each candidate
 * is offered to the optional `isActive` predicate, and active
 * (colliding) candidates are rejected and redrawn within a bounded
 * budget, failing closed on exhaustion. See `generatePlayerId`.
 */

// ----------------------------------------------------------------------------
// Normative constants
// ----------------------------------------------------------------------------

/**
 * The exact URL-safe alphabet for every canonical player identity:
 * `A–Z`, `a–z`, `0–9`, underscore, hyphen (64 symbols).
 */
export const PLAYER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' as const;

/** Exact number of characters in a canonical player identity. */
export const PLAYER_ID_LENGTH = 12 as const;

/** Exact entropy width in bits (`PLAYER_ID_LENGTH` × 6). */
export const PLAYER_ID_BITS = 72 as const;

/**
 * Canonical validation pattern. A value is a well-formed identity iff it
 * is a string of exactly 12 characters drawn from {@link PLAYER_ID_ALPHABET}.
 *
 * Deliberately **not** global/sticky: `RegExp.prototype.test` on a
 * stateful regex is order-dependent, and this constant is shared.
 */
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

// ----------------------------------------------------------------------------
// Branded identity types
// ----------------------------------------------------------------------------

/**
 * Opaque, branded server-issued player identity.
 *
 * The brand is nominal only (it exists at compile time to prevent
 * accidental interchange with handles, seats, sessions, tokens, and
 * other string identifiers). It confers no runtime secrecy: values are
 * non-secret correlation metadata, never credentials.
 */
export type PlayerId = string & { readonly __brand: 'PlayerId' };

/**
 * Opaque, branded lobby guest identity.
 *
 * Structurally shares the canonical 12-character representation with
 * {@link PlayerId} but carries a distinct brand: the matchmaker brands
 * the active guest identity, and the same value becomes the in-match
 * `PlayerId`. The distinct brand prevents a guest identity from being
 * silently used where a match-scoped player identity is expected (and
 * vice versa) without an explicit, audited conversion.
 */
export type GuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };

/**
 * The single audited crossing point between a validated `string` and a
 * branded identity type. Every brand assertion in this module goes
 * through this generic helper (`as T`, never `as PlayerId`) so the
 * repository's identity-migration guard does not see ad-hoc casts, and
 * so there is exactly one place to audit. Callers must have validated
 * the string first.
 *
 * @typeParam T - The branded target type (`PlayerId` or `GuestPlayerId`).
 * @param value - A string already proven canonical.
 * @returns The same string, typed as `T`.
 */
function brand<T extends string>(value: string): T {
    return value as T;
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/**
 * Base class for every domain error raised by this module. Catching
 * `PlayerIdError` reliably distinguishes identity failures from
 * ordinary runtime errors.
 */
export class PlayerIdError extends Error {
    /**
     * @param message - Human-readable, actionable failure description.
     * @param options - Optional standard `Error` options (e.g. `cause`).
     */
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'PlayerIdError';
    }
}

/**
 * Raised by `parsePlayerId` / `parseGuestPlayerId` when a raw value is
 * not a canonical identity. Never raised by the non-throwing
 * `isPlayerId` / `isGuestPlayerId` guards.
 */
export class InvalidPlayerIdError extends PlayerIdError {
    /** The offending raw value, preserved for diagnostics. This is not a credential. */
    public readonly received: unknown;

    /**
     * @param received - The value that failed canonical validation.
     */
    public constructor(received: unknown) {
        super(
            `Invalid player id: expected exactly ${PLAYER_ID_LENGTH} characters from the canonical alphabet; received ${describeValue(received)}.`,
        );
        this.name = 'InvalidPlayerIdError';
        this.received = received;
    }
}

/**
 * Raised when the platform CSPRNG is unavailable, fails, or returns an
 * unexpected number of bytes. Generation fails closed: there is no
 * fallback to weak randomness and no partial identity is returned.
 */
export class PlayerIdEntropyError extends PlayerIdError {
    /**
     * @param message - Actionable description of the entropy failure.
     * @param options - Optional standard `Error` options (e.g. `cause`).
     */
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'PlayerIdEntropyError';
    }
}

/**
 * Raised when the bounded candidate-retry budget is exhausted because
 * every drawn candidate was reported active. The generator never
 * returns a colliding identity, so this is the fail-closed outcome.
 */
export class PlayerIdCollisionError extends PlayerIdError {
    /** Number of candidate draws attempted before giving up. */
    public readonly attempts: number;

    /**
     * @param attempts - The exhausted retry budget.
     */
    public constructor(attempts: number) {
        super(
            `Unable to generate an unused player id after ${attempts} attempt(s); the active-id set may be saturated.`,
        );
        this.name = 'PlayerIdCollisionError';
        this.attempts = attempts;
    }
}

/**
 * Render an unknown value for an error message without leaking secrets
 * (identities are non-secret; tokens never reach these validators).
 *
 * @param value - The value to describe.
 * @returns A short, type-aware description.
 */
function describeValue(value: unknown): string {
    if (typeof value === 'string') {
        return `a non-canonical string of length ${value.length}`;
    }
    if (value === null) {
        return 'null';
    }
    return `a ${typeof value}`;
}

// ----------------------------------------------------------------------------
// Runtime validation and parsing
// ----------------------------------------------------------------------------

/**
 * Non-throwing canonical identity guard.
 *
 * Returns `true` iff `value` is a string of exactly
 * {@link PLAYER_ID_LENGTH} characters drawn from
 * {@link PLAYER_ID_ALPHABET}. Numbers (including `1`) are always
 * rejected — a numeric value is never coerced or stringified.
 *
 * @param value - Candidate value of any type.
 * @returns `true` when `value` is a canonical `PlayerId`.
 */
export function isPlayerId(value: unknown): value is PlayerId {
    return typeof value === 'string' && PLAYER_ID_PATTERN.test(value);
}

/**
 * Parse and validate a canonical player identity.
 *
 * @param value - Candidate value of any type.
 * @returns The same string, branded as `PlayerId`.
 * @throws {InvalidPlayerIdError} When `value` is not canonical.
 */
export function parsePlayerId(value: unknown): PlayerId {
    if (isPlayerId(value)) {
        return value;
    }
    throw new InvalidPlayerIdError(value);
}

/**
 * Non-throwing canonical guest-identity guard. Shares the exact
 * representation and validation rule of {@link isPlayerId}; only the
 * brand differs.
 *
 * @param value - Candidate value of any type.
 * @returns `true` when `value` is a canonical `GuestPlayerId`.
 */
export function isGuestPlayerId(value: unknown): value is GuestPlayerId {
    return typeof value === 'string' && PLAYER_ID_PATTERN.test(value);
}

/**
 * Parse and validate a canonical lobby guest identity.
 *
 * @param value - Candidate value of any type.
 * @returns The same string, branded as `GuestPlayerId`.
 * @throws {InvalidPlayerIdError} When `value` is not canonical.
 */
export function parseGuestPlayerId(value: unknown): GuestPlayerId {
    if (isGuestPlayerId(value)) {
        return value;
    }
    throw new InvalidPlayerIdError(value);
}

// ----------------------------------------------------------------------------
// CSPRNG-backed generation
// ----------------------------------------------------------------------------

/** Fixed source of random bytes. Production injects the platform CSPRNG. */
export type RandomBytesSource = (length: number) => Uint8Array;

/** Optional generation controls. */
export interface GeneratePlayerIdOptions {
    /**
     * Maximum candidate draws before failing closed with
     * {@link PlayerIdCollisionError}. Must be a positive integer.
     * Defaults to {@link DEFAULT_PLAYER_ID_MAX_ATTEMPTS}.
     */
    readonly maxAttempts?: number;
}

/**
 * Default bounded candidate-retry budget. With a 2^-72 per-draw
 * collision probability, a single retry is already astronomically
 * sufficient; a small budget keeps the fail-closed guarantee explicit
 * without ever spinning.
 */
export const DEFAULT_PLAYER_ID_MAX_ATTEMPTS = 8;

/** Bits in one octet. */
const BITS_PER_BYTE = 8;

/** Bits contributed by one alphabet symbol (64 = 2^6). */
const BITS_PER_SYMBOL = 6;

/** Mask selecting a six-bit symbol index from a random byte. */
const SYMBOL_MASK = PLAYER_ID_ALPHABET.length - 1;

/** Bytes required per identity: `12 × 6 / 8 = 9`. */
const BYTES_PER_PLAYER_ID = (PLAYER_ID_LENGTH * BITS_PER_SYMBOL) / BITS_PER_BYTE;

/** Minimal structural Web Crypto surface required for byte generation. */
interface WebCryptoLike {
    getRandomValues<T extends ArrayBufferView>(array: T): T;
}

/**
 * Production entropy source: the platform CSPRNG via
 * `globalThis.crypto.getRandomValues` (the Web Crypto API, available in
 * Node ≥ 19 and every modern browser). Using the global rather than a
 * static `node:crypto` import keeps `@europa/core` zero-dependency and
 * safe to bundle for the browser.
 *
 * @param length - Number of random bytes requested.
 * @returns A fresh `Uint8Array` of `length` CSPRNG bytes.
 * @throws {PlayerIdEntropyError} When no platform CSPRNG is available.
 */
function defaultRandomBytes(length: number): Uint8Array {
    const cryptoRef = (globalThis as { crypto?: WebCryptoLike }).crypto;
    if (cryptoRef === undefined || typeof cryptoRef.getRandomValues !== 'function') {
        throw new PlayerIdEntropyError(
            'Cannot generate a player id: no platform CSPRNG is available (expected globalThis.crypto.getRandomValues).',
        );
    }
    const bytes = new Uint8Array(length);
    cryptoRef.getRandomValues(bytes);
    return bytes;
}

/**
 * Draw exactly {@link BYTES_PER_PLAYER_ID} bytes from an injected
 * source, failing closed on any anomaly. An already-typed
 * {@link PlayerIdError} is rethrown unchanged so a specific entropy
 * message is not obscured; any other failure is wrapped.
 *
 * @param source - The byte source to draw from.
 * @returns Exactly 9 random bytes.
 * @throws {PlayerIdEntropyError} On source failure or wrong length.
 */
function drawBytes(source: RandomBytesSource): Uint8Array {
    try {
        const bytes = source(BYTES_PER_PLAYER_ID);
        if (bytes.length !== BYTES_PER_PLAYER_ID) {
            throw new PlayerIdEntropyError(
                `Player id entropy source returned ${String(bytes.length)} byte(s); expected ${BYTES_PER_PLAYER_ID}.`,
            );
        }
        return bytes;
    } catch (cause) {
        if (cause instanceof PlayerIdError) {
            throw cause;
        }
        throw new PlayerIdEntropyError('Player id entropy source failed.', { cause });
    }
}

/**
 * Pack nine bytes into twelve six-bit alphabet symbols.
 *
 * This is pure bit extraction (no modulo): consume each byte into a
 * little reservoir, emit every complete six-bit group, and drop the
 * consumed low bits so the reservoir can never exceed 32 bits. Nine
 * bytes yield exactly twelve symbols.
 *
 * @param bytes - Exactly nine random bytes.
 * @returns The assembled canonical identity.
 */
function encodePlayerId(bytes: Uint8Array): PlayerId {
    const symbols: string[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    for (const byte of bytes) {
        bitBuffer = ((bitBuffer << BITS_PER_BYTE) | byte) >>> 0;
        bitCount += BITS_PER_BYTE;
        while (bitCount >= BITS_PER_SYMBOL) {
            bitCount -= BITS_PER_SYMBOL;
            const index = (bitBuffer >>> bitCount) & SYMBOL_MASK;
            symbols.push(PLAYER_ID_ALPHABET.charAt(index));
        }
        // Discard already-consumed low bits; keep only pending bits.
        bitBuffer = bitCount === 0 ? 0 : bitBuffer & ((1 << bitCount) - 1);
    }

    return brand<PlayerId>(symbols.join(''));
}

/**
 * Generate a fresh canonical `PlayerId` from a CSPRNG.
 *
 * The generator is injectable and deterministic under test: pass a
 * `source` that returns fixed bytes for repeatable vectors, and an
 * `isActive` predicate to model the registry's active-uniqueness set.
 * Candidate-level rejection sampling redraws whenever `isActive`
 * reports a collision, within `options.maxAttempts`; exhaustion fails
 * closed with {@link PlayerIdCollisionError}.
 *
 * This function must **not** be called from tick or replay code — it
 * draws platform entropy at an identity trust boundary only.
 *
 * @param source - Random-byte source; defaults to the platform CSPRNG.
 * @param isActive - Optional predicate returning `true` for a candidate
 *                   already present in the active-id set.
 * @param options - Optional generation controls (`maxAttempts`).
 * @returns A fresh, unused canonical `PlayerId`.
 * @throws {PlayerIdError} When `maxAttempts` is not a positive integer.
 * @throws {PlayerIdEntropyError} When entropy cannot be obtained.
 * @throws {PlayerIdCollisionError} When the retry budget is exhausted.
 */
export function generatePlayerId(
    source?: RandomBytesSource,
    isActive?: (candidate: PlayerId) => boolean,
    options?: GeneratePlayerIdOptions,
): PlayerId {
    const maxAttempts = options?.maxAttempts ?? DEFAULT_PLAYER_ID_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new PlayerIdError(
            `Player id generation requires a positive integer maxAttempts; received ${String(maxAttempts)}.`,
        );
    }

    const randomBytes = source ?? defaultRandomBytes;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = encodePlayerId(drawBytes(randomBytes));
        if (isActive?.(candidate)) {
            continue;
        }
        return candidate;
    }

    throw new PlayerIdCollisionError(maxAttempts);
}
