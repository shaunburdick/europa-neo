/**
 * Unit tests for the all-must-accept gate — Feature 006 (T049)
 *
 * Covers FR-009 ("all original participants must accept within a
 * bounded window") + the spec edge case "What happens when a rematch
 * participant has left?" → the window expiring without all-accept
 * degrades to normal matchmaking: a lazy sweep (driven by injected
 * fake time through read paths — no timers per constitution Principle
 * II) transitions the unfinished offer's match to `collected` with no
 * new match created. A forfeited participant cannot accept at all:
 * their vote is rejected with `session_invalid`.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SeatAssignment } from '../../contracts/match-types';
import type { Matchmaker } from '../../contracts/matchmaking-api';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';
import { makeFinished2pScenario } from '../fixtures/rematchScenario';

/** A 2-player match still in its running state (terminal not fired). */
interface RunningScenario {
    readonly server: FakeServer;
    readonly matchmaker: Matchmaker;
    readonly matchId: MatchId;
    readonly alice: SeatAssignment;
    readonly bob: SeatAssignment;
}

/** Build a running 1v1 fixture with a controllable fake clock. */
function makeRunning2pFixture(): RunningScenario {
    const clockMs = 2_000_000;
    const now = (): number => clockMs;
    const server = new FakeServer({ now });
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server, now });
    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    const joined = matchmaker.joinMatch({
        matchId: created.data.matchId,
        displayName: 'Bob',
    });
    if (!joined.ok) {
        throw new Error('fixture join failed');
    }
    return {
        server,
        matchmaker,
        matchId: created.data.matchId,
        alice: created.data.seatAssignment,
        bob: joined.data.seatAssignment,
    };
}

describe('all-must-accept gate + window expiry sweep (FR-009 / T049)', () => {
    it('FR-009: partial acceptance leaves the match finished — not collected', () => {
        const scenario = makeFinished2pScenario();
        const requested = scenario.matchmaker.requestRematch({
            matchId: scenario.matchId,
            sessionToken: scenario.alice.sessionToken,
        });
        if (!requested.ok) {
            throw new Error('fixture request failed');
        }
        const accepted = scenario.matchmaker.acceptRematch({
            matchId: scenario.matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: scenario.alice.sessionToken,
        });
        expect(accepted.ok).toBe(true);
        if (!accepted.ok) {
            return;
        }
        expect(accepted.allAccepted).toBe(false);

        const stats = scenario.matchmaker.stats();
        expect(stats.finishedMatches).toBe(1);
        expect(stats.collectedMatches).toBe(0);
        scenario.matchmaker.close();
    });

    it('FR-009: advancing past the window sweeps the match to collected — no new match', () => {
        const scenario = makeFinished2pScenario();
        const requested = scenario.matchmaker.requestRematch({
            matchId: scenario.matchId,
            sessionToken: scenario.alice.sessionToken,
        });
        if (!requested.ok) {
            throw new Error('fixture request failed');
        }
        const accepted = scenario.matchmaker.acceptRematch({
            matchId: scenario.matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: scenario.alice.sessionToken,
        });
        if (!accepted.ok) {
            throw new Error('fixture accept failed');
        }

        scenario.advanceMs(MATCHMAKING_CONSTANTS.rematchWindowMs + 1);

        // Reading stats drives the expiry sweep (check-on-access; no timers).
        const stats = scenario.matchmaker.stats();
        expect(stats.finishedMatches).toBe(0);
        expect(stats.collectedMatches).toBe(1);
        // No new match was created for the unresolved offer.
        expect(stats.totalCreated).toBe(1);
        expect(stats.fillingMatches).toBe(0);

        // The lobby carries no rematch product either.
        const lobby = scenario.matchmaker.listPublicMatches();
        expect(lobby.ok).toBe(true);
        if (!lobby.ok) {
            return;
        }
        expect(lobby.matches).toHaveLength(0);
        scenario.matchmaker.close();
    });

    it('FR-009/FR-011: the rematch sweep skips offer-less matches; results TTL collects them', () => {
        // Distinct TTLs isolate the two sweeps: the rematch-window expiry
        // sweep only touches matches with OPEN offers; an offer-less
        // finished match is the results-TTL sweep's job (FR-011 second
        // clause) once `resultsTtlMs` elapses past `finishedAtMs`.
        let clockMs = 3_000_000;
        const now = (): number => clockMs;
        const server = new FakeServer({ now });
        const config = {
            ...MATCHMAKING_CONSTANTS,
            rematchWindowMs: 1_000,
            resultsTtlMs: 5_000,
        };
        const mm = createMatchmaker(config, { server, now });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const joined = mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
        if (!joined.ok) {
            throw new Error('fixture join failed');
        }
        server.fireOnMatchTerminal({
            matchId: created.data.matchId,
            result: { kind: 'win', winner: 1, tick: 42, reason: 'last_standing' },
            tick: 42,
        });

        // Past the (short) rematch window with NO offer ever opened: the
        // rematch sweep has nothing to touch, and the results TTL has not
        // elapsed yet — the match is still finished.
        clockMs += config.rematchWindowMs + 1;
        const midStats = mm.stats();
        expect(midStats.finishedMatches).toBe(1);
        expect(midStats.collectedMatches).toBe(0);

        // At the results TTL the backstop sweep collects it.
        clockMs += config.resultsTtlMs - config.rematchWindowMs - 1;
        const swept = mm.stats();
        expect(swept.finishedMatches).toBe(0);
        expect(swept.collectedMatches).toBe(1);
        mm.close();
    });

    it('spec edge case: a forfeited participant cannot accept — session_invalid', () => {
        const running = makeRunning2pFixture();

        // Alice forfeits mid-match (grace window expired), then Bob wins.
        running.server.fireOnSeatExpired({
            matchId: running.matchId,
            sessionToken: running.alice.sessionToken,
            playerId: running.alice.playerId,
        });
        running.server.fireOnMatchTerminal({
            matchId: running.matchId,
            result: { kind: 'win', winner: 2, tick: 9, reason: 'last_standing' },
            tick: 9,
        });

        const requested = running.matchmaker.requestRematch({
            matchId: running.matchId,
            sessionToken: running.bob.sessionToken,
        });
        if (!requested.ok) {
            throw new Error('fixture request failed');
        }

        const forfeitedAccept = running.matchmaker.acceptRematch({
            matchId: running.matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: running.alice.sessionToken,
        });
        expect(forfeitedAccept.ok).toBe(false);
        if (forfeitedAccept.ok) {
            return;
        }
        expect(forfeitedAccept.error.code).toBe('session_invalid');

        // The survivor's vote cannot complete the set: ALL original
        // participants must accept, so allAccepted stays false and the
        // window degrades to normal matchmaking (FR-009 edge case).
        const survivorAccept = running.matchmaker.acceptRematch({
            matchId: running.matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: running.bob.sessionToken,
        });
        expect(survivorAccept.ok).toBe(true);
        if (!survivorAccept.ok) {
            return;
        }
        expect(survivorAccept.allAccepted).toBe(false);
        running.matchmaker.close();
    });
});
