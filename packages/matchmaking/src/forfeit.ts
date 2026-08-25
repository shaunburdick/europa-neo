/**
 * Disconnect-forfeit policy — Feature 006 (T058)
 *
 * Applies the matchmaker's forfeit decision when networking reports
 * `onSeatExpired` (the reconnect grace window lapsed with no
 * reconnect) per FR-010, US5, and research.md §6. Boundary rule 4 of
 * feature 004's `matchmaking-to-networking.ts`: **networking does NOT
 * decide forfeits** — it only reports the expiry; this module decides
 * what a forfeited seat means:
 *
 *   - `running`  → submit the engine's `OrderSurrender` for the seat
 *     (the engine is the single source of truth for elimination,
 *     FR-016), stamp `SeatRecord.forfeitedAtMs`, detach the seat from
 *     networking, then count alive players: zero remaining tears the
 *     match down (`unregisterMatch` + `collected` + a `cancelled`
 *     results record); one or more remaining lets the match continue —
 *     the engine's tick loop reports the eventual terminal result via
 *     the normal `onMatchTerminal` flow.
 *   - `filling`  → release the seat inline (remove the seat record +
 *     unbind the session + detach). No engine session exists yet.
 *     Deviation note: this is deliberately NOT full `leaveMatch`
 *     semantics (dispatch ruling 3) — the minimal inline release only.
 *   - other states / unknown ids / already-forfeited seats → no-op
 *     (idempotent; double-fire changes nothing).
 *
 * Pure-ish: exactly one engine call and one network call per forfeit;
 * timestamps arrive via arguments (constitution Principle II).
 */

import type { PlayerId } from '@europa/engine';
import type { Logger, Server } from '@europa/networking';

import type { MatchId, SessionToken } from '../contracts/match-types';
import type { MatchRecord } from './internal/matchRecord';
import type { SeatRecord } from './internal/seatRecord';
import type { StatusEmitter } from './matchLifecycle';
import { transitionToCollected } from './matchLifecycle';
import { buildMatchResultsRecord } from './results';
import type { MatchmakerStore } from './store';

/** The bridge event that triggers the policy (networking's shape). */
export interface SeatExpiredEvent {
    /** The match whose seat expired. */
    readonly matchId: MatchId;
    /** Bearer token identifying the expired seat. */
    readonly sessionToken: SessionToken;
    /** Engine player id, or `null` when networking could not bind one. */
    readonly playerId: PlayerId | null;
}

/** Everything the policy needs but does not own (injected). */
export interface ForfeitContext {
    /** The matchmaker's store (match + session lookup). */
    readonly store: MatchmakerStore;
    /** The networking server (detach / unregister calls). */
    readonly server: Server;
    /** Logger seam. */
    readonly logger: Logger;
    /** Optional lifecycle-event sink (FR-012). */
    readonly emit?: StatusEmitter;
}

/** What the policy decided for an expired seat. */
export type ForfeitOutcome =
    /** Surrender submitted to a running match's engine session. */
    | 'surrendered'
    /** Filling-phase inline seat release (no engine session existed). */
    | 'released'
    /** Final surrender tore the all-forfeited match down. */
    | 'torn_down';

/** Success payload of {@linkcode handleSeatExpired}. */
export interface SeatExpiredResult {
    /** The (possibly torn-down) match record. */
    readonly match: MatchRecord;
    /** Alive players in the engine world after the surrender. */
    readonly remainingPlayers: number;
    /** Which policy branch fired. */
    readonly outcome: ForfeitOutcome;
}

/**
 * Tear down an all-forfeited match (US5 AC-2): record the
 * `kind: 'cancelled'` results marker, unregister from networking, and
 * transition `running → collected`.
 *
 * @param match - The running match whose players all forfeited.
 * @param ctx - Injected store/server/logger/emit context.
 * @param nowMs - Epoch ms of the teardown.
 */
export function handleAllPlayersForfeited(match: MatchRecord, ctx: ForfeitContext, nowMs: number): void {
    const world = match.engineSession?.world();
    if (world !== undefined) {
        const cancelled = buildMatchResultsRecord({
            matchId: match.matchId,
            world,
            result: { kind: 'cancelled', reason: 'all_players_forfeited' },
            seats: match.seats,
        });
        ctx.server.unregisterMatch(match.matchId);
        transitionToCollected(match, nowMs, ctx.emit, cancelled);
        return;
    }
    // Defensive: no engine session (should not happen for a running
    // match) — still release the networking registration and collect.
    ctx.server.unregisterMatch(match.matchId);
    transitionToCollected(match, nowMs, ctx.emit);
}

/**
 * Apply the forfeit policy for one expired seat (FR-010 / US5 AC-1).
 * See the module doc for the branch table. Idempotent: a seat with a
 * stamped `forfeitedAtMs`, an unknown match id, or an unknown token
 * yields `null` and performs nothing.
 *
 * @param event - The `onSeatExpired` bridge payload.
 * @param ctx - Injected store/server/logger/emit context.
 * @param nowMs - Epoch ms of handling (stamped on the seat record).
 * @returns What happened, or `null` for a no-op.
 */
export function handleSeatExpired(
    event: SeatExpiredEvent,
    ctx: ForfeitContext,
    nowMs: number,
): SeatExpiredResult | null {
    const match = ctx.store.getMatch(event.matchId);
    if (match === undefined) {
        ctx.logger.warn('forfeit: onSeatExpired for unknown match', { matchId: event.matchId });
        return null;
    }
    let seat: SeatRecord | undefined;
    for (const candidate of match.seats.values()) {
        // Plain `===` is fine here (documented accepted risk, mirroring
        // networking's ids.ts): 122-bit CSPRNG v4 tokens make a timing
        // oracle worthless.
        if (candidate.sessionToken === event.sessionToken) {
            seat = candidate;
            break;
        }
    }
    if (seat === undefined) {
        ctx.logger.warn('forfeit: onSeatExpired token matches no seat', {
            matchId: event.matchId,
        });
        return null;
    }
    if (seat.forfeitedAtMs !== null) {
        // Idempotency: this seat already forfeited; nothing to do.
        return null;
    }

    const playerId = seat.playerId ?? event.playerId;

    if (match.status === 'filling') {
        // Inline seat release (dispatch ruling 3): no engine session yet,
        // so releasing is removing the seat + unbinding the session.
        match.seats.delete(seat.seatIndex);
        const session = ctx.store.getSession(seat.playerSessionId);
        if (session !== undefined) {
            session.currentMatchId = null;
            session.currentSeatIndex = null;
            session.currentSessionToken = null;
        }
        ctx.server.detachPlayer({
            matchId: match.matchId,
            playerId,
            sessionToken: event.sessionToken,
        });
        ctx.logger.info('forfeit: filling seat released', { matchId: match.matchId });
        return { match, remainingPlayers: match.seats.size, outcome: 'released' };
    }

    if (match.status !== 'running' || match.engineSession === null) {
        // finished/collected matches have nothing to surrender.
        ctx.logger.warn('forfeit: onSeatExpired for non-running match ignored', {
            matchId: event.matchId,
        });
        return null;
    }

    if (playerId === null) {
        // Seated players always carry a playerId once running; a null here
        // means networking could not bind one — mark + detach without an
        // engine order (nothing to surrender for an unbound connection).
        seat.forfeitedAtMs = nowMs;
        ctx.server.detachPlayer({
            matchId: match.matchId,
            playerId: null,
            sessionToken: event.sessionToken,
        });
        ctx.logger.warn('forfeit: expired seat had no bound playerId', {
            matchId: match.matchId,
        });
        return { match, remainingPlayers: countAlive(match), outcome: 'surrendered' };
    }

    // The engine is the single source of truth for elimination (FR-016):
    // inject its own OrderSurrender rather than inventing a forfeit path.
    const applied = match.engineSession.submit({ kind: 'surrender', player: playerId });
    if (!applied.ok) {
        // e.g., already_surrendered / match_terminal — log and proceed with
        // the bookkeeping; the engine's state remains authoritative.
        ctx.logger.debug('forfeit: engine rejected surrender order', {
            matchId: match.matchId,
            reason: applied.reason.kind,
        });
    }

    seat.forfeitedAtMs = nowMs;

    ctx.server.detachPlayer({
        matchId: match.matchId,
        playerId,
        sessionToken: event.sessionToken,
    });

    const remainingPlayers = countAlive(match);
    if (remainingPlayers === 0) {
        handleAllPlayersForfeited(match, ctx, nowMs);
        ctx.logger.info('forfeit: all players forfeited; match torn down', {
            matchId: match.matchId,
        });
        return { match, remainingPlayers: 0, outcome: 'torn_down' };
    }

    ctx.logger.info('forfeit: seat forfeited; match continues', {
        matchId: match.matchId,
        remainingPlayers,
    });
    return { match, remainingPlayers, outcome: 'surrendered' };
}

/**
 * Count alive players in a match's engine world (status `'alive'` —
 * surrendered and eliminated players are excluded per FR-015/FR-016).
 *
 * @param match - A match with a live engine session.
 * @returns The number of players still alive.
 */
function countAlive(match: MatchRecord): number {
    const world = match.engineSession?.world();
    if (world === undefined) {
        return 0;
    }
    return world.players.filter((player) => player.status === 'alive').length;
}
