/**
 * PlayerSession — server-internal record shape (Feature 006, T016)
 *
 * Per `data-model.md` §11. An ephemeral matchmaking identity: created
 * on the player's first `createMatch` / `joinMatch`, never persisted
 * across restarts (in-memory only, spec Assumptions).
 *
 * @internal Exported for testability only; not part of the public
 * surface re-exported through the package barrel.
 *
 * Pure module: no clock reads, no randomness — both arrive via the
 * injected `now` / `randomId` dependencies (constitution Principle II).
 */

import type { MatchId, SessionToken } from '@europa/networking';
import type { PlayerSessionId, SeatIndex } from '../../contracts/match-types';

/**
 * Ephemeral per-player matchmaking state. A session is in at most one
 * match at a time (no multi-match in v1); `currentSeatIndex` and
 * `currentSessionToken` are non-null iff `currentMatchId` is non-null.
 */
export interface PlayerSession {
    /** Matchmaking-owned identity (§2 of the data model). */
    readonly playerSessionId: PlayerSessionId;
    /**
     * Cosmetic name the player chose (FR-001). No uniqueness check:
     * duplicate display names are allowed by design (spec edge case
     * "someone reuses a display name currently in the lobby" → allowed).
     */
    readonly displayName: string;
    /** The match the player is currently in, or `null`. */
    currentMatchId: MatchId | null;
    /** Seat index inside {@linkcode currentMatchId}, or `null`. */
    currentSeatIndex: SeatIndex | null;
    /** Bearer token for the current seat, or `null`. */
    currentSessionToken: SessionToken | null;
    /** Epoch ms when the session was created. */
    readonly createdAtMs: number;
    /** Epoch ms of the player's last action; drives session GC. */
    lastSeenAtMs: number;
}

/**
 * Arguments for {@linkcode createPlayerSession}.
 */
export interface CreatePlayerSessionArgs {
    /** Cosmetic display name (validated upstream at the API boundary). */
    readonly displayName: string;
    /** Injected UUID v4 generator (deterministic in tests). */
    readonly randomId: () => string;
    /** Injected wall-clock provider in epoch ms. */
    readonly now: () => number;
}

/**
 * Create a new ephemeral player session with no match binding.
 *
 * @param args - Display name plus injected `randomId` / `now`.
 * @returns A fresh `PlayerSession` with all match fields `null`.
 */
export function createPlayerSession(args: CreatePlayerSessionArgs): PlayerSession {
    const { displayName, now, randomId } = args;
    const createdAtMs = now();
    return {
        playerSessionId: randomId() as PlayerSessionId,
        displayName,
        currentMatchId: null,
        currentSeatIndex: null,
        currentSessionToken: null,
        createdAtMs,
        lastSeenAtMs: createdAtMs,
    };
}
