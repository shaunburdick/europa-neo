/**
 * Unit tests for visibility type handling — Feature 006 (T039)
 *
 * Covers FR-002 + FR-005 + FR-006 + data-model.md §3 at the wired
 * `Matchmaker` surface: `visibility: 'private'` is accepted, stored,
 * and never projected by `listPublicMatches()`; `'public'` is stored
 * and projected; values outside the closed union are rejected with
 * `invalid_request`; visibility is fixed at creation (no
 * `updateVisibility` API exists — record-level immutability of the
 * `readonly visibility` field is pinned in `foundations.test.ts`).
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchVisibility } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

function makeMatchmaker() {
    const server = new FakeServer();
    return createMatchmaker(MATCHMAKING_CONSTANTS, { server });
}

describe('createMatch — visibility handling (FR-002 / US3 AC-1)', () => {
    it('FR-002: accepts visibility "private" and seats the creator', () => {
        const matchmaker = makeMatchmaker();

        const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });

        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        expect(created.data.seatAssignment.seatIndex).toBe(0);
        expect(created.data.seatAssignment.displayName).toBe('Alice');
        matchmaker.close();
    });

    it('FR-005 / Q1: a private match is NEVER projected by listPublicMatches', () => {
        const matchmaker = makeMatchmaker();
        const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        const lobby = matchmaker.listPublicMatches();

        expect(lobby.ok).toBe(true);
        if (!lobby.ok) {
            return;
        }
        expect(lobby.matches).toHaveLength(0);
        // Stats corroborate: filling but not publicly joinable.
        expect(matchmaker.stats().fillingMatches).toBe(1);
        expect(matchmaker.stats().publicJoinableMatches).toBe(0);
        matchmaker.close();
    });

    it('FR-005: a public match created the same way IS projected (contrast)', () => {
        const matchmaker = makeMatchmaker();
        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        const lobby = matchmaker.listPublicMatches();

        expect(lobby.ok).toBe(true);
        if (!lobby.ok) {
            return;
        }
        expect(lobby.matches.map((e) => e.matchId)).toEqual([created.data.matchId]);
        expect(matchmaker.stats().publicJoinableMatches).toBe(1);
        matchmaker.close();
    });

    it('FR-002: rejects a visibility outside the closed union with invalid_request', () => {
        const matchmaker = makeMatchmaker();

        // Simulates a malformed wire payload: the closed union would reject
        // this at compile time for internal callers.
        const bogus = 'foo' as MatchVisibility;
        const result = matchmaker.createMatch({ visibility: bogus, displayName: 'Alice' });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.code).toBe('invalid_request');
        matchmaker.close();
    });
});

describe('visibility immutability (US3 / Q4)', () => {
    it('Q4: no updateVisibility API exists on the Matchmaker surface', () => {
        const matchmaker = makeMatchmaker();

        expect('updateVisibility' in matchmaker).toBe(false);
        matchmaker.close();
    });

    it('Q4: a private match stays invisible as its seats fill (no re-evaluation path)', () => {
        const matchmaker = makeMatchmaker();
        const created = matchmaker.createMatch({
            visibility: 'private',
            displayName: 'Alice',
            settings: { playerCount: 3 },
        });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const { matchId } = created.data;

        expect(matchmaker.joinMatch({ matchId, displayName: 'Bob' }).ok).toBe(true);

        const lobby = matchmaker.listPublicMatches();
        expect(lobby.ok).toBe(true);
        if (!lobby.ok) {
            return;
        }
        expect(lobby.matches).toHaveLength(0);
        matchmaker.close();
    });
});
