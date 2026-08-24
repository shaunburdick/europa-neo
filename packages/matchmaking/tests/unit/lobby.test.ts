/**
 * Unit tests for the lobby projection — Feature 006 (T021)
 *
 * Covers FR-004 + FR-005 + data-model.md §12: `projectLobbyEntry`
 * projects a public `filling` match into a `LobbyEntry`, returns
 * `null` for private matches and for non-joinable statuses, and
 * `listPublicMatches` filters then maps in insertion order.
 *
 * Test descriptions cite the requirement they pin.
 */

import type { MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';
import type { MatchVisibility, PlayerSessionId, SeatIndex, SessionToken } from '../../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import { createMatchRecord, type MatchRecord } from '../../src/internal/matchRecord';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { listPublicMatches, projectLobbyEntry } from '../../src/lobby';

/** Deterministic id factory: concrete ids never matter to projection logic. */
let idCounter = 0;
function nextId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-id-${String(idCounter).padStart(3, '0')}`;
}

/**
 * Build a `filling` match with `filled` seats named P1..Pn. Uses the
 * real record factories so the projection is tested against the
 * production shapes, not test doubles.
 */
function makeMatch(visibility: MatchVisibility, filled: number, createdAtMs = 1_000): MatchRecord {
    const record = createMatchRecord({
        matchId: nextId('match') as MatchId,
        visibility,
        settings: DEFAULT_MATCH_SETTINGS,
        createdAtMs,
    });
    for (let seat = 0; seat < filled; seat++) {
        record.seats.set(
            seat as SeatIndex,
            createSeatRecord({
                seatIndex: seat as SeatIndex,
                playerSessionId: nextId('session') as PlayerSessionId,
                displayName: `P${String(seat + 1)}`,
                sessionToken: nextId('token') as SessionToken,
                playerId: null,
                connectedAtMs: createdAtMs,
            }),
        );
    }
    return record;
}

describe('projectLobbyEntry', () => {
    it('FR-005: projects a public filling match with host, occupancy, settings, and age', () => {
        const match = makeMatch('public', 1, 10_000);
        const entry = projectLobbyEntry(match, 12_500);

        expect(entry).not.toBeNull();
        expect(entry?.matchId).toBe(match.matchId);
        expect(entry?.hostDisplayName).toBe('P1');
        expect(entry?.playerCount).toBe(DEFAULT_MATCH_SETTINGS.playerCount);
        expect(entry?.seatsFilled).toBe(1);
        expect(entry?.boardSize).toBe(DEFAULT_MATCH_SETTINGS.boardSize);
        expect(entry?.visibility).toBe('public');
        expect(entry?.createdAtMs).toBe(10_000);
        expect(entry?.ageSeconds).toBe(2.5);
    });

    it('FR-005 / Q1: returns null for a private match regardless of status', () => {
        const match = makeMatch('private', 1);
        expect(projectLobbyEntry(match, 2_000)).toBeNull();
    });

    it('FR-005: returns null once the match is running (no longer joinable)', () => {
        const match = makeMatch('public', 2);
        match.status = 'running';
        expect(projectLobbyEntry(match, 2_000)).toBeNull();
    });

    it('FR-005: returns null for finished and collected matches', () => {
        const finished = makeMatch('public', 2);
        finished.status = 'finished';
        const collected = makeMatch('public', 1);
        collected.status = 'collected';
        expect(projectLobbyEntry(finished, 2_000)).toBeNull();
        expect(projectLobbyEntry(collected, 2_000)).toBeNull();
    });

    it('FR-005: refuses to project a public filling match with no host seat', () => {
        // Defensive path: seat 0 is populated atomically at creation, so a
        // hostless record can only exist through external corruption.
        const match = makeMatch('public', 0);
        expect(projectLobbyEntry(match, 2_000)).toBeNull();
    });
});

describe('listPublicMatches', () => {
    it('FR-005: filters to public filling matches and maps each in order', () => {
        const openPublic = makeMatch('public', 1);
        const privateMatch = makeMatch('private', 1);
        const runningPublic = makeMatch('public', 2);
        runningPublic.status = 'running';
        const secondOpenPublic = makeMatch('public', 2);

        const entries = listPublicMatches([openPublic, privateMatch, runningPublic, secondOpenPublic], 61_000);

        expect(entries).toHaveLength(2);
        expect(entries[0]?.matchId).toBe(openPublic.matchId);
        expect(entries[1]?.matchId).toBe(secondOpenPublic.matchId);
        // Occupancy reflects the live seat count at projection time.
        expect(entries[1]?.seatsFilled).toBe(2);
    });

    it('FR-005: returns an empty array when nothing is joinable', () => {
        const privateMatch = makeMatch('private', 1);
        expect(listPublicMatches([privateMatch], 61_000)).toEqual([]);
        expect(listPublicMatches([], 61_000)).toEqual([]);
    });
});
