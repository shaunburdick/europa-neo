/**
 * Branded Identity Generators — Feature 004
 *
 * Helpers for minting the wire protocol's opaque identifiers:
 * session tokens (seat claims, FR-007) and connection ids (transport
 * handles). Both are 36-character v4 UUIDs produced by Node's
 * platform CSPRNG via the global `crypto.randomUUID()` — no `uuid`
 * package dependency, no `Math.random`.
 *
 * Determinism discipline (constitution Principle II): these values
 * are *identity* artifacts, not simulation inputs. They never enter
 * engine state, tick math, or order application, so the byte-level
 * determinism guarantees (SC-001) are unaffected. The no-unseeded-
 * randomness rule governs simulation code; identity generation at a
 * trust boundary is exactly where unpredictability is required.
 *
 * Pure module apart from the CSPRNG call itself: no I/O, no clock
 * reads.
 */

import type { ConnectionId, SessionToken } from './contracts/network-types';

/**
 * Assert a plain string into a branded string type. The single place
 * the brand assertion happens; used at every trust boundary
 * (`generateSessionToken`, `generateConnectionId`, and future
 * `parseToken` / `parseMatchId` / `parseConnectionId` helpers).
 *
 * The cast is sound at the type level because the brand exists only
 * to prevent *accidental* interchange of distinct id kinds in user
 * code; this function is the deliberate, audited crossing point.
 *
 * @typeParam T - The branded target type (e.g., `SessionToken`).
 * @param value The raw string value.
 * @returns The same string, typed as `T`.
 */
export function toBranded<T extends string>(value: string): T {
    return value as T;
}

/**
 * Mint a fresh session token (36-char v4 UUID, branded
 * `SessionToken`). Issued when a seat is claimed (`joinAck`) and
 * presented again on reconnect (FR-007). Unpredictability matters:
 * tokens are bearer credentials for reclaiming a seat.
 *
 * @returns A new branded session token.
 */
export function generateSessionToken(): SessionToken {
    return toBranded<SessionToken>(crypto.randomUUID());
}

/**
 * Mint a fresh connection id (36-char v4 UUID, branded
 * `ConnectionId`). Assigned by the server when a WebSocket connects;
 * distinct from `SessionToken` so the transport handle can never be
 * confused with the seat claim it may later carry (see
 * `network-types.ts` on the two brands).
 *
 * @returns A new branded connection id.
 */
export function generateConnectionId(): ConnectionId {
    return toBranded<ConnectionId>(crypto.randomUUID());
}
