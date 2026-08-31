/**
 * SeatRecord — server-internal record shape (Feature 006, T017;
 * feature 010 T-006 adds the identity/handle seat snapshot)
 *
 * Per `data-model.md` §7. One occupied seat inside a `MatchRecord`:
 * carries the matchmaking-issued credentials (`playerSessionId`,
 * `sessionToken`) plus the lifecycle timestamps the matchmaker stamps
 * (claim, forfeit). Disconnect/reconnect state is NOT tracked here —
 * networking owns the grace window on its own seat records and
 * reports only the expiry (`onSeatExpired`) across the bridge.
 *
 * Feature 010 (spec FR-019/FR-020): each seat additionally snapshots
 * WHO occupies it — the authoritative {@linkcode GuestPlayerId}
 * association and the accepted display {@linkcode handle} — copied
 * from the seated player's session at claim time. The snapshot is
 * what seat labels render (T-016); authority remains the identity
 * registry (data-model §2: "copied into a seat projection only as a
 * display snapshot"). The identity id is non-secret correlation metadata, not
 * a bearer credential; handles remain preferred for seat labels. Session
 * tokens stay protected and server seat authority is unchanged.
 *
 * @internal Exported for testability only; not part of the public
 * surface re-exported through the package barrel.
 *
 * Pure module: no clock reads, no randomness — timestamps arrive via
 * the factory's arguments (constitution Principle II).
 */

import type { PlayerId } from '@europa/engine';
import type { SessionToken } from '@europa/networking';
import type { PlayerSessionId, SeatIndex } from '../../contracts/match-types';
import type { GuestPlayerId } from '../contracts/lobby-types';

/**
 * One occupied seat. `playerId` (the engine-facing 1..playerCount id)
 * is assigned when the match transitions to `running`; during
 * `'filling'` it is provisionally `seatIndex + 1` per
 * `SeatAssignment.playerId` in the contract.
 */
export interface SeatRecord {
    /** Position in seat order, `0 <= seatIndex < playerCount`. */
    readonly seatIndex: SeatIndex;
    /** Ephemeral identity of the seated player (FR-001). */
    readonly playerSessionId: PlayerSessionId;
    /**
     * Authoritative association to the seated player's lobby identity
     * (feature 010 FR-019), or `null` outside the lobby flow. Copied
     * from the session at claim time; survives start/terminal/forfeit
     * so attribution persists for the match's whole life.
     *
     * Non-secret identity correlation reference. It may be serialized on safe
     * correlation surfaces, but it does not authorize or select the seat.
     */
    readonly guestPlayerId: GuestPlayerId | null;
    /** Cosmetic name chosen by the seated player. */
    readonly displayName: string;
    /**
     * Display snapshot of the seated player's ACCEPTED lobby handle at
     * claim time (feature 010 FR-020/US4 AC-5), or `null` when
     * unnamed/legacy. This is the value seat labels render. Mutable
     * ONLY via `matchLifecycle.propagateHandleRename` (an accepted
     * rename sweeps in-flight snapshots); authority stays with the
     * identity registry.
     */
    handle: string | null;
    /** Bearer token for reconnect; UUID v4 (feature 004 boundary). */
    readonly sessionToken: SessionToken;
    /** Engine PlayerId; non-null once the match is `running`. */
    playerId: PlayerId | null;
    /** Epoch ms the seat was claimed. */
    readonly connectedAtMs: number;
    /** Epoch ms of forfeit (`onSeatExpired`); terminal for the seat. */
    forfeitedAtMs: number | null;
}

/**
 * Arguments for {@linkcode createSeatRecord}.
 */
export interface CreateSeatRecordArgs {
    /** Position in seat order. */
    readonly seatIndex: SeatIndex;
    /** Ephemeral identity of the seated player. */
    readonly playerSessionId: PlayerSessionId;
    /** Cosmetic name chosen by the seated player. */
    readonly displayName: string;
    /** Bearer token issued for this seat. */
    readonly sessionToken: SessionToken;
    /**
     * Engine PlayerId, or `null` while the match is still `'filling'`
     * (assigned at the atomic `filling → running` transition, FR-004).
     */
    readonly playerId: PlayerId | null;
    /** Epoch ms the seat is being claimed. */
    readonly connectedAtMs: number;
    /**
     * Server-resolved lobby identity of the seated player (feature
     * 010 FR-019). Omit or pass `null` for legacy flows; stored as
     * `null`. The nullable form lets the lifecycle transitions copy
     * session fields verbatim without normalization casts.
     */
    readonly guestPlayerId?: GuestPlayerId | null;
    /**
     * Accepted-handle display snapshot for seat labels (FR-020).
     * Omit or pass `null` when unnamed or legacy; stored as `null`.
     */
    readonly handle?: string | null;
}

/**
 * Create a seat record with clean forfeit state.
 *
 * @param args - Seat position, credentials, optional provisional
 *   `playerId`, the claim timestamp, and the optional identity/handle
 *   snapshot (feature 010).
 * @returns A fresh `SeatRecord` with `forfeitedAtMs` unset.
 */
export function createSeatRecord(args: CreateSeatRecordArgs): SeatRecord {
    const { connectedAtMs, displayName, playerId, playerSessionId, seatIndex, sessionToken } = args;
    return {
        seatIndex,
        playerSessionId,
        guestPlayerId: args.guestPlayerId ?? null,
        displayName,
        handle: args.handle ?? null,
        sessionToken,
        playerId,
        connectedAtMs,
        forfeitedAtMs: null,
    };
}
