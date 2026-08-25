/**
 * Session-token generation — Feature 006 (T014)
 *
 * Mints the bearer credential handed to each seated player: one
 * `SessionToken` per seat at create/join time, presented again on
 * reconnect. Tokens are 36-character v4 UUIDs from Node's platform
 * CSPRNG via `crypto.randomUUID()` — no `uuid` dependency, no
 * `Math.random`.
 *
 * Feature 004 boundary rule (`matchmaking-to-networking.ts`): session
 * tokens MUST be UUID v4 — networking validates the shape on every
 * reconnect claim, so the matchmaker never issues anything else.
 *
 * Determinism discipline (constitution Principle II): tokens are
 * identity/bearer artifacts at a trust boundary, not simulation
 * inputs; unpredictability is exactly what is required. The same
 * boundary rule networking's `ids.ts` follows.
 *
 * Pure module apart from the CSPRNG call: no I/O, no clock reads.
 */

import { randomUUID } from 'node:crypto';

import type { SessionToken } from '@europa/networking';

/**
 * Assert a plain string into a branded string type. Single audited
 * crossing point between raw CSPRNG output and networking's
 * `SessionToken` brand (mirrors networking's `toBranded` helper).
 *
 * @typeParam T - The branded target type.
 * @param value - The raw string value.
 * @returns The same string, typed as `T`.
 */
function toBranded<T extends string>(value: string): T {
    return value as T;
}

/**
 * Case-insensitive RFC 9562 §5.4 UUID v4 shape: version nibble `4`,
 * variant nibble one of `8/9/a/b`.
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Mint a fresh session token (36-char v4 UUID, branded `SessionToken`).
 * Issued once per seat at creation/join time; validated by networking
 * on reconnect (opaque to networking beyond shape equality).
 *
 * @returns A new branded session token.
 */
export function newSessionToken(): SessionToken {
    return toBranded<SessionToken>(randomUUID());
}

/**
 * Check whether a string has the UUID v4 shape required of every
 * `SessionToken` (feature 004 boundary rule). Public validation
 * utility, exported for hosts and tooling; the matchmaker itself
 * compares tokens opaquely (equality against seated values), so
 * nothing in this package calls this today.
 *
 * @param s - The candidate string.
 * @returns `true` iff `s` is a well-formed hyphenated v4 UUID.
 */
export function isValidSessionToken(s: string): boolean {
    return UUID_V4_REGEX.test(s);
}
