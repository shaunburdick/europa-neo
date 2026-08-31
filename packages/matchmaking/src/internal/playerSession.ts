/**
 * PlayerSession — server-internal record shape (Feature 006, T016;
 * feature 010 T-006 adds the guest-identity association)
 *
 * Per `data-model.md` §11. An ephemeral matchmaking identity: created
 * on the player's first `createMatch` / `joinMatch`, never persisted
 * across restarts (in-memory only, spec Assumptions).
 *
 * Feature 010 (spec FR-019): a session created on behalf of a lobby
 * identity additionally carries the authoritative
 * {@linkcode GuestPlayerId} association plus a snapshot of the
 * accepted display handle. The registry (feature 010) remains the
 * AUTHORITY for identity + handle; these fields are the matchmaker's
 * server-resolved reference and display snapshot — they are set once
 * at creation from server state (never from client claims) and have
 * no public mutator, so a forged association cannot be expressed.
 * The identity id is non-secret correlation metadata and may reach safe
 * payloads or diagnostics where useful; handles remain preferred for labels.
 * It is not a bearer credential. Session/reconnect tokens remain protected and
 * are the values used for seat authority.
 *
 * @internal Exported for testability only; not part of the public
 * surface re-exported through the package barrel.
 *
 * Pure module: no clock reads, no randomness — both arrive via the
 * injected `now` / `randomId` dependencies (constitution Principle II).
 */

import type { MatchId, SessionToken } from '@europa/networking';
import type { PlayerSessionId, SeatIndex } from '../../contracts/match-types';
import type { GuestPlayerId } from '../contracts/lobby-types';

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
    /**
     * Authoritative association to the lobby's `GuestPlayerIdentity`
     * (feature 010 FR-019), or `null` for sessions created outside the
     * lobby flow (direct feature-006 matchmaker use). Server-resolved
     * at creation; immutable for the session's lifetime — the lobby
     * facade passes the registry's value, never a client claim.
     *
     * Non-secret identity correlation reference. It does not authorize a seat;
     * the server-resolved session and seat remain authoritative.
     */
    readonly guestPlayerId: GuestPlayerId | null;
    /**
     * Snapshot of the identity's ACCEPTED display handle at session
     * creation (feature 010 US1 AC-5), or `null` when unnamed/legacy.
     * Distinct from {@linkcode displayName}: this is the validated,
     * uniqueness-enforced lobby value. Mutable ONLY via
     * `matchLifecycle.propagateHandleRename` (an accepted rename
     * sweeps in-flight snapshots); subsequent sessions naturally carry
     * the fresh value. Authority stays with the identity registry
     * (data-model §2).
     */
    acceptedHandle: string | null;
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
    /**
     * Server-resolved lobby identity to associate (feature 010 FR-019).
     * Omit for legacy feature-006 flows; stored as `null`. MUST come
     * from the server's identity registry — never from client input.
     */
    readonly guestPlayerId?: GuestPlayerId;
    /**
     * The identity's accepted display handle snapshot (US1 AC-5).
     * Omit when unnamed or legacy; stored as `null`.
     */
    readonly acceptedHandle?: string;
}

/**
 * Create a new ephemeral player session with no match binding.
 *
 * @param args - Display name plus injected `randomId` / `now`, and the
 *   optional lobby-identity association (feature 010).
 * @returns A fresh `PlayerSession` with all match fields `null`.
 */
export function createPlayerSession(args: CreatePlayerSessionArgs): PlayerSession {
    const { displayName, now, randomId } = args;
    const createdAtMs = now();
    return {
        playerSessionId: randomId() as PlayerSessionId,
        displayName,
        guestPlayerId: args.guestPlayerId ?? null,
        acceptedHandle: args.acceptedHandle ?? null,
        currentMatchId: null,
        currentSeatIndex: null,
        currentSessionToken: null,
        createdAtMs,
        lastSeenAtMs: createdAtMs,
    };
}
