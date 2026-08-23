/**
 * Match & player-session ID generation — Feature 006 (T013)
 *
 * Mints `MatchId`s (networking-owned brand) and `PlayerSessionId`s
 * (matchmaking-owned brand) as 36-character v4 UUIDs from Node's
 * platform CSPRNG via `crypto.randomUUID()` — no `uuid` dependency,
 * no `Math.random` (research.md §1; RFC 9562 §5.4; spec FR-003:
 * match IDs are server-issued, clients cannot choose them).
 *
 * Determinism discipline (constitution Principle II): these values are
 * *identity* artifacts, never simulation inputs. They never enter
 * engine state or tick math, so byte-level determinism (SC-001) is
 * unaffected — the same boundary rule networking's `ids.ts` follows.
 *
 * The matchmaker proper takes an injected `randomId` factory via
 * `MatchmakerDeps` for deterministic tests; these module functions are
 * the production default implementations of that dependency.
 *
 * Pure module apart from the CSPRNG call: no I/O, no clock reads.
 */

import { getRandomValues, randomUUID } from 'node:crypto';

import type { MatchId } from '@europa/networking';

import type { PlayerSessionId } from '../contracts/match-types';

/**
 * Assert a plain string into a branded string type. Single audited
 * crossing point between raw CSPRNG output and the branded id types,
 * mirroring networking's `toBranded` helper. The cast is sound at the
 * type level because the brand exists only to prevent *accidental*
 * interchange of distinct id kinds in user code.
 *
 * @typeParam T - The branded target type (e.g., `MatchId`).
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
 * Mint a fresh match id (36-char v4 UUID, branded `MatchId`). Issued
 * by the matchmaker at `createMatch` time and used verbatim in join
 * paths (`/join/<matchId>`); for private matches its secrecy IS the
 * access control (FR-003 + FR-006).
 *
 * @returns A new branded match id.
 */
export function newMatchId(): MatchId {
  return toBranded<MatchId>(randomUUID());
}

/**
 * Mint a fresh ephemeral player-session id (36-char v4 UUID, branded
 * `PlayerSessionId` per `contracts/match-types.ts`). Distinct from
 * `MatchId`, `SessionToken`, and `ConnectionId` — separate brands,
 * separate namespaces.
 *
 * @returns A new branded player-session id.
 */
export function newPlayerSessionId(): PlayerSessionId {
  return toBranded<PlayerSessionId>(randomUUID());
}

/**
 * Check whether a string has the UUID v4 shape required of every
 * `MatchId`. Used to reject malformed ids at the boundary with the
 * single `match_not_found` code path (no existence leak, FR-006).
 *
 * @param s - The candidate string.
 * @returns `true` iff `s` is a well-formed hyphenated v4 UUID.
 */
export function isValidMatchId(s: string): boolean {
  return UUID_V4_REGEX.test(s);
}

/**
 * Extract the seed from a filled uint32 buffer. Split out from
 * {@linkcode newMatchSeed} so the defensive empty-buffer fallback is a
 * pure, deterministically testable function (an in-range TypedArray
 * index can never be `undefined` at runtime, so the fallback branch
 * is unreachable through the CSPRNG path alone).
 *
 * @param values - Buffer to read from.
 * @returns The first element, or `0` for an empty buffer.
 */
export function matchSeedFrom(values: Uint32Array): number {
  return values[0] ?? 0;
}

/**
 * Mint a fresh uint32 match seed (research.md §9): the entropy input
 * for terrain board generation and the engine's sfc32 PRNG (FR-007:
 * the map is generated when the last seat fills; FR-009: rematches
 * get a fresh seed).
 *
 * Determinism discipline (constitution Principle II): this is a
 * sanctioned entropy boundary, exactly like `randomUUID` above — the
 * seed is an identity-grade input minted once per match. Everything
 * downstream of it (board generation, ticks) is fully deterministic
 * given the seed, which is what SC-001 requires.
 *
 * @returns An unsigned 32-bit integer in `[0, 2^32)`.
 */
export function newMatchSeed(): number {
  return matchSeedFrom(getRandomValues(new Uint32Array(1)));
}
