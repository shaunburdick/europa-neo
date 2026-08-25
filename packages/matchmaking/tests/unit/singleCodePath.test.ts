/**
 * Unit tests for the single `match_not_found` code path — Feature 006
 * (T042)
 *
 * Covers FR-006 + the Q2 clarification uniformly across EVERY operation
 * that takes a `matchId`: an unknown MatchId must return the standard
 * non-leaking `{ ok: false, error: { code: 'match_not_found' } }`
 * RESULT — never a throw, and never a message hinting at existence or
 * privacy. This includes operations whose feature bodies are still
 * wave-tagged stubs (`leaveMatch` → US3+ seat release; the rematch trio
 * → US4): the existence gate runs BEFORE the stub rejection so the
 * no-leak invariant is testable now and the stub boundary stays pinned.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000' as MatchId;
const ANY_TOKEN = '11111111-1111-4111-8111-111111111111' as SessionToken;

/** Fresh matchmaker holding one known public filling match. */
function makeFixture() {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    return { matchmaker, knownId: created.data.matchId };
}

/** Shared assertions: failed RESULT with the non-leaking code + message. */
function expectNotFound(result: {
    readonly ok: boolean;
    readonly error?: { readonly code: string; readonly message: string };
}): void {
    expect(result.ok).toBe(false);
    if (result.ok) {
        return;
    }
    expect(result.error?.code).toBe('match_not_found');
    const message = result.error?.message.toLowerCase() ?? '';
    expect(message).not.toContain('private');
    expect(message).not.toContain('exists');
}

describe('single match_not_found code path on stubbed operations (FR-006 / T042)', () => {
    it('FR-006: leaveMatch with an unknown matchId returns match_not_found', () => {
        const { matchmaker } = makeFixture();

        const result = matchmaker.leaveMatch({ matchId: UNKNOWN_ID, sessionToken: ANY_TOKEN });

        expectNotFound(result);
        matchmaker.close();
    });

    it('FR-006: requestRematch with an unknown matchId returns match_not_found', () => {
        const { matchmaker } = makeFixture();

        const result = matchmaker.requestRematch({ matchId: UNKNOWN_ID, sessionToken: ANY_TOKEN });

        expectNotFound(result);
        matchmaker.close();
    });

    it('FR-006: acceptRematch with an unknown matchId returns match_not_found', () => {
        const { matchmaker } = makeFixture();

        const result = matchmaker.acceptRematch({
            matchId: UNKNOWN_ID,
            rematchOfferId: UNKNOWN_ID,
            sessionToken: ANY_TOKEN,
        });

        expectNotFound(result);
        matchmaker.close();
    });

    it('FR-006: declineRematch with an unknown matchId returns match_not_found', () => {
        const { matchmaker } = makeFixture();

        const result = matchmaker.declineRematch({
            matchId: UNKNOWN_ID,
            rematchOfferId: UNKNOWN_ID,
            sessionToken: ANY_TOKEN,
        });

        expectNotFound(result);
        matchmaker.close();
    });
});

describe('stub boundary stays pinned (feature bodies land in later waves)', () => {
    it('US3+: a KNOWN matchId still hits the leaveMatch invariant throw', () => {
        const { matchmaker, knownId } = makeFixture();

        // The existence gate passes for the known id; the unimplemented
        // feature body then throws its invariant violation as before.
        expect(() => matchmaker.leaveMatch({ matchId: knownId, sessionToken: ANY_TOKEN })).toThrow(
            /leaveMatch is not implemented/,
        );
        matchmaker.close();
    });

    it('US4: the rematch trio no longer throws — a known filling match returns rematch_not_offered', () => {
        // Wave 7D replaced the trio's throwing stubs with real bodies; on
        // a known match that is still `filling` (no terminal event), every
        // member returns the RESULT-level `rematch_not_offered`.
        const { matchmaker, knownId } = makeFixture();

        const requested = matchmaker.requestRematch({ matchId: knownId, sessionToken: ANY_TOKEN });
        expect(requested.ok).toBe(false);
        if (!requested.ok) {
            expect(requested.error.code).toBe('rematch_not_offered');
        }

        const accepted = matchmaker.acceptRematch({
            matchId: knownId,
            rematchOfferId: knownId,
            sessionToken: ANY_TOKEN,
        });
        expect(accepted.ok).toBe(false);
        if (!accepted.ok) {
            expect(accepted.error.code).toBe('rematch_not_offered');
        }

        const declined = matchmaker.declineRematch({
            matchId: knownId,
            rematchOfferId: knownId,
            sessionToken: ANY_TOKEN,
        });
        expect(declined.ok).toBe(false);
        if (!declined.ok) {
            expect(declined.error.code).toBe('rematch_not_offered');
        }
        matchmaker.close();
    });
});
