/**
 * SeatRecord — server-internal record shape (Feature 006, T017)
 *
 * Per `data-model.md` §7. One occupied seat inside a `MatchRecord`:
 * carries the matchmaking-issued credentials (`playerSessionId`,
 * `sessionToken`) plus the lifecycle timestamps the matchmaker stamps
 * (claim, forfeit). Disconnect/reconnect state is NOT tracked here —
 * networking owns the grace window on its own seat records and
 * reports only the expiry (`onSeatExpired`) across the bridge.
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
    /** Cosmetic name chosen by the seated player. */
    readonly displayName: string;
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
}

/**
 * Create a seat record with clean forfeit state.
 *
 * @param args - Seat position, credentials, optional provisional
 *   `playerId`, and the claim timestamp.
 * @returns A fresh `SeatRecord` with `forfeitedAtMs` unset.
 */
export function createSeatRecord(args: CreateSeatRecordArgs): SeatRecord {
    const { connectedAtMs, displayName, playerId, playerSessionId, seatIndex, sessionToken } = args;
    return {
        seatIndex,
        playerSessionId,
        displayName,
        sessionToken,
        playerId,
        connectedAtMs,
        forfeitedAtMs: null,
    };
}
