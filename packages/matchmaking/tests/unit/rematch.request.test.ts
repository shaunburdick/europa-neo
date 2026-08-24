/**
 * Unit tests for `requestRematch` — Feature 006 (T047)
 *
 * Covers FR-008 + FR-009 + spec US4 AC-1: firing `onMatchTerminal`
 * for a running match transitions it `running → finished` (T026) and
 * stores the results record, after which any original participant may
 * open the rematch window. The window deadline is anchored at the
 * finish time: `windowExpiresAtMs = finishedAtMs + rematchWindowMs`
 * (FR-009), so a first request made after the deadline is rejected
 * with `rematch_window_closed`.
 *
 * Contract note (deviation from T047 prose, per dispatch ruling 5):
 * `contracts/matchmaking-api.ts` defines double-`requestRematch` as
 * IDEMPOTENT — "calling twice returns the existing offer" — with
 * `rematch_already_voted` reserved for callers who already cast an
 * accept/decline vote. These tests pin the contract behavior.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';
import { makeFinished2pScenario } from '../fixtures/rematchScenario';

const FOREIGN_TOKEN = '22222222-2222-4222-8222-222222222222' as SessionToken;

describe('requestRematch opens the window on a finished match (FR-008 / FR-009 / T047)', () => {
    it('FR-008: onMatchTerminal transitions running → finished and stores results', () => {
        const scenario = makeFinished2pScenario();

        const stats = scenario.matchmaker.stats();
        expect(stats.finishedMatches).toBe(1);
        expect(stats.runningMatches).toBe(0);
        scenario.matchmaker.close();
    });

    it('FR-009: an original participant receives a fresh rematchOfferId distinct from the match id', () => {
        const { matchmaker, matchId, alice } = makeFinished2pScenario();

        const result = matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.rematchOfferId).not.toBe(matchId);
        matchmaker.close();
    });

    it('FR-009: any original participant (not just the creator) may request', () => {
        const { matchmaker, matchId, bob } = makeFinished2pScenario();

        const result = matchmaker.requestRematch({ matchId, sessionToken: bob.sessionToken });

        expect(result.ok).toBe(true);
        matchmaker.close();
    });

    it('contract: a second request before voting is idempotent — same rematchOfferId', () => {
        const { matchmaker, matchId, alice } = makeFinished2pScenario();

        const first = matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(first.ok).toBe(true);
        if (!first.ok) {
            return;
        }

        const second = matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(second.ok).toBe(true);
        if (!second.ok) {
            return;
        }
        expect(second.rematchOfferId).toBe(first.rematchOfferId);
        matchmaker.close();
    });

    it('FR-009: requesting after the window deadline returns rematch_window_closed', () => {
        const { matchmaker, matchId, alice, advanceMs } = makeFinished2pScenario();

        advanceMs(MATCHMAKING_CONSTANTS.rematchWindowMs + 1);

        const result = matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.code).toBe('rematch_window_closed');
        matchmaker.close();
    });

    it('FR-009: a request inside the window still succeeds just before the deadline', () => {
        const { matchmaker, matchId, alice, advanceMs } = makeFinished2pScenario();

        advanceMs(MATCHMAKING_CONSTANTS.rematchWindowMs - 1);

        const result = matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(result.ok).toBe(true);
        matchmaker.close();
    });

    it('US4 AC-1: requesting on a running (not finished) match returns rematch_not_offered', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
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

        // Match auto-started and is running; no terminal event has fired.
        const result = matchmaker.requestRematch({
            matchId: created.data.matchId,
            sessionToken: created.data.seatAssignment.sessionToken,
        });
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.code).toBe('rematch_not_offered');
        matchmaker.close();
    });

    it('FR-006: a caller whose token matches no seat returns session_invalid', () => {
        const { matchmaker, matchId } = makeFinished2pScenario();

        const result = matchmaker.requestRematch({ matchId, sessionToken: FOREIGN_TOKEN });
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.error.code).toBe('session_invalid');
        matchmaker.close();
    });
});
