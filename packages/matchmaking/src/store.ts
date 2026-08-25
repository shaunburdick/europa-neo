/**
 * In-memory matchmaker store — Feature 006 (T015)
 *
 * Per research.md §3 + spec Assumptions: matches and player sessions
 * live in plain `Map`s, in memory only — no SQLite, no Redis, no
 * persistence across restart. The store is the single source of truth
 * for all matchmaker state (constitution Principle V: simplicity over
 * cleverness); every user-story phase reads and writes through it.
 *
 * The returned object is frozen so callers cannot swap the maps out
 * from under the matchmaker; the records themselves are mutated only
 * by lifecycle transitions.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchId } from '@europa/networking';

import type { PlayerSessionId } from '../contracts/match-types';
import type { MatchRecord } from './internal/matchRecord';
import type { PlayerSession } from './internal/playerSession';

/**
 * Frozen-shape in-memory store keyed by branded ids. All list methods
 * return fresh `ReadonlyArray` snapshots; callers may not mutate the
 * underlying collections through them.
 */
export interface MatchmakerStore {
    /** Look up a match by id. */
    getMatch(id: MatchId): MatchRecord | undefined;
    /** Insert or replace a match record. */
    putMatch(record: MatchRecord): void;
    /** Remove a match; returns the removed record, or `undefined`. */
    deleteMatch(id: MatchId): MatchRecord | undefined;
    /** Snapshot of every stored match (insertion order). */
    listMatches(): readonly MatchRecord[];
    /** Look up a player session by id. */
    getSession(id: PlayerSessionId): PlayerSession | undefined;
    /** Insert or replace a player session. */
    putSession(session: PlayerSession): void;
    /** Remove a session; returns the removed session, or `undefined`. */
    deleteSession(id: PlayerSessionId): PlayerSession | undefined;
    /** Snapshot of every stored session (insertion order). */
    listSessions(): readonly PlayerSession[];
}

/**
 * Create an empty in-memory store.
 *
 * @returns A frozen {@linkcode MatchmakerStore} backed by two private
 *   `Map`s (matches by `MatchId`, sessions by `PlayerSessionId`).
 */
export function createStore(): MatchmakerStore {
    const matches = new Map<MatchId, MatchRecord>();
    const sessions = new Map<PlayerSessionId, PlayerSession>();

    return Object.freeze({
        getMatch(id: MatchId): MatchRecord | undefined {
            return matches.get(id);
        },
        putMatch(record: MatchRecord): void {
            matches.set(record.matchId, record);
        },
        deleteMatch(id: MatchId): MatchRecord | undefined {
            const removed = matches.get(id);
            if (removed !== undefined) {
                matches.delete(id);
            }
            return removed;
        },
        listMatches(): readonly MatchRecord[] {
            return [...matches.values()];
        },
        getSession(id: PlayerSessionId): PlayerSession | undefined {
            return sessions.get(id);
        },
        putSession(session: PlayerSession): void {
            sessions.set(session.playerSessionId, session);
        },
        deleteSession(id: PlayerSessionId): PlayerSession | undefined {
            const removed = sessions.get(id);
            if (removed !== undefined) {
                sessions.delete(id);
            }
            return removed;
        },
        listSessions(): readonly PlayerSession[] {
            return [...sessions.values()];
        },
    });
}
