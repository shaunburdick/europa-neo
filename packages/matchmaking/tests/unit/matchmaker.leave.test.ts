/**
 * Unit tests for `leaveMatch` — Feature 006 US3 AC-3, implemented by
 * feature 010 remediation R-005.
 *
 * Pins the full phase table (spec 006 Implementation Notes ruling):
 *
 *   - `filling`   → the EXACT inline-release machinery of the
 *     filling-forfeit path (seat removed, session's match binding
 *     cleared, networking detach); the match stays fillable and the
 *     freed seat is re-assignable; releasing the FINAL seat collects
 *     the match immediately (creator-cancelled case, US3 AC-3
 *     end-to-end through the public projection) and deletes the
 *     leaver's unreachable session (SC-005 discipline).
 *   - `running`   → immediate forfeit delegated to the SAME forfeit
 *     policy as grace expiry (engine surrender FR-016, forfeit stamp,
 *     detach, all-forfeited teardown); `totalForfeits` is NOT bumped
 *     (US5 disconnect telemetry only) while a teardown counts in
 *     `totalCollected`.
 *   - `finished` / `collected` → acknowledged no-op success.
 *   - unknown id → `match_not_found`; unknown token → `session_invalid`;
 *     already-forfeited seat → idempotent `{ ok: true }`.
 *
 * Determinism: injected sequential ids + fixed clock; board generation
 * runs on the shipped default board (the only size terrain reliably
 * generates for matchmaking matches) with the engine's seeded RNG
 * (constitution Principle II — the seed is a sanctioned identity-grade
 * entropy boundary, everything downstream is deterministic given it).
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import type { MatchmakerCompositionSeam } from '../../src/matchmaker';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

/** Fixed epoch start — every timestamp derives from the mutable clock. */
let clockMs = 1_000_000;

/** Sequential fake UUID v4 generator (deterministic ids, no CSPRNG). */
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** Fresh matchmaker + composition seam + advancing injected clock. */
function makeHarness() {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
        server,
        randomId: fakeRandomId,
        now: () => clockMs,
    });
    const seam = matchmaker as Matchmaker & MatchmakerCompositionSeam;
    return { server, matchmaker, seam };
}

/**
 * Create a public filling match (creator seated) whose capacity keeps
 * it in `'filling'` while tests manipulate seats — 3 players, so a
 * single join never triggers the atomic auto-start (a 2p match starts
 * the moment its second seat fills).
 */
function createFilling(h: ReturnType<typeof makeHarness>) {
    const created = h.matchmaker.createMatch({
        visibility: 'public',
        displayName: 'Alice',
        settings: { playerCount: 3 },
    });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    return {
        matchId: created.data.matchId,
        aliceToken: created.data.seatAssignment.sessionToken,
    };
}

/** Join one more player into a filling match (fills the next free seat). */
function joinSecond(h: ReturnType<typeof makeHarness>, matchId: MatchId) {
    const joined = h.matchmaker.joinMatch({ matchId, displayName: 'Bob' });
    if (!joined.ok) {
        throw new Error('fixture join failed');
    }
    return { bobToken: joined.data.seatAssignment.sessionToken };
}

/**
 * A started public 2p match (default settings): the second join triggers
 * the atomic auto-start, so the returned match is `'running'`.
 */
function startTwoPlayer(h: ReturnType<typeof makeHarness>) {
    const created = h.matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    const joined = h.matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) {
        throw new Error('fixture join failed');
    }
    return {
        matchId: created.data.matchId,
        aliceToken: created.data.seatAssignment.sessionToken,
        bobToken: joined.data.seatAssignment.sessionToken,
    };
}

// ----------------------------------------------------------------------------
// Filling phase — seat release keeps the match fillable
// ----------------------------------------------------------------------------

describe('leaveMatch — filling phase releases the seat (US3 AC-3)', () => {
    it('releases the joiner seat; the match stays filling, listed, and the seat is refillable', () => {
        const h = makeHarness();
        const { matchId } = createFilling(h);
        const { bobToken } = joinSecond(h, matchId);

        clockMs += 1_000;
        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: bobToken });
        expect(left.ok).toBe(true);

        // Seat record removed; the creator's seat untouched.
        const match = h.seam.getMatch(matchId);
        expect(match?.status).toBe('filling');
        expect(match?.seats.size).toBe(1);
        expect(match?.seats.has(0)).toBe(true);
        expect(match?.seats.has(1)).toBe(false);

        // Still publicly listed as joinable with accurate occupancy.
        const listed = h.matchmaker.listPublicMatches();
        expect(listed.ok).toBe(true);
        if (listed.ok) {
            expect(listed.matches).toHaveLength(1);
            expect(listed.matches[0]?.matchId).toBe(matchId);
            expect(listed.matches[0]?.seatsFilled).toBe(1);
        }

        // The freed seat is re-assignable; the match stays filling (2/3).
        const refill = h.matchmaker.joinMatch({ matchId, displayName: 'Cara' });
        expect(refill.ok).toBe(true);
        if (refill.ok) {
            expect(refill.data.seatAssignment.seatIndex).toBe(1);
        }
        const refilled = h.seam.getMatch(matchId);
        expect(refilled?.status).toBe('filling');
        expect(refilled?.seats.size).toBe(2);

        // Completion STILL auto-starts on the last seat.
        expect(h.matchmaker.joinMatch({ matchId, displayName: 'Dave' }).ok).toBe(true);
        expect(h.seam.getMatch(matchId)?.status).toBe('running');
        expect(h.server.registerMatchCalls).toHaveLength(1);

        // The leaving seat was detached from networking; the survivor wasn't.
        expect(h.server.detachPlayerCalls.map((call) => call.sessionToken)).toEqual([bobToken]);
        h.matchmaker.close();
    });

    it('releasing the creator seat frees seat 0 for the next joiner', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = createFilling(h);
        joinSecond(h, matchId);

        clockMs += 1_000;
        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(left.ok).toBe(true);

        const refill = h.matchmaker.joinMatch({ matchId, displayName: 'Cara' });
        expect(refill.ok).toBe(true);
        if (refill.ok) {
            expect(refill.data.seatAssignment.seatIndex).toBe(0);
        }
        h.matchmaker.close();
    });

    it('refreshes lastActivityAtMs so a still-filling match keeps its full empty-match window', () => {
        const h = makeHarness();
        const { matchId } = createFilling(h);
        const { bobToken } = joinSecond(h, matchId); // activity at t≈+0

        // Leave well after the join: the leave IS the latest activity.
        clockMs += 2_000;
        expect(h.matchmaker.leaveMatch({ matchId, sessionToken: bobToken }).ok).toBe(true);

        // One ms before the TTL anchored at the LEAVE: must survive.
        clockMs += MATCHMAKING_CONSTANTS.emptyMatchTtlMs - 1;
        const before = h.matchmaker.listPublicMatches();
        expect(before.ok).toBe(true);
        if (before.ok) {
            expect(before.matches.map((entry) => entry.matchId)).toContain(matchId);
        }

        // One ms after: collected by the lazy sweep as usual.
        clockMs += 1;
        const after = h.matchmaker.listPublicMatches();
        expect(after.ok).toBe(true);
        if (after.ok) {
            expect(after.matches.map((entry) => entry.matchId)).not.toContain(matchId);
        }
        h.matchmaker.close();
    });

    it('collects the match immediately when the final filling seat is released (US3 AC-3 end-to-end)', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = createFilling(h);

        // Before: visible in the public projection with one seat filled.
        const before = h.matchmaker.listPublicMatches();
        expect(before.ok).toBe(true);
        if (before.ok) {
            expect(before.matches.map((entry) => entry.matchId)).toContain(matchId);
        }

        clockMs += 1_000;
        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(left.ok).toBe(true);

        // Creator-cancelled case: gone from the projection AT ONCE (no
        // empty-match TTL wait), counted as a collection, record collected.
        const after = h.matchmaker.listPublicMatches();
        expect(after.ok).toBe(true);
        if (after.ok) {
            expect(after.matches).toHaveLength(0);
        }
        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expect(h.seam.getMatch(matchId)?.status).toBe('collected');
        // (The just-unbound leaver session is also deleted on this path —
        // the GC sweeps' SC-005 no-leak discipline; not directly observable
        // through the public surface, so no assertion here.)

        // The seat was detached from networking during the release.
        expect(h.server.detachPlayerCalls).toHaveLength(1);
        expect(h.server.detachPlayerCalls[0]?.sessionToken).toBe(aliceToken);
        h.matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// Running phase — voluntary leave = immediate forfeit via the forfeit path
// ----------------------------------------------------------------------------

describe('leaveMatch — running phase delegates to the forfeit policy', () => {
    it('surrenders the leaver to the engine, stamps the seat, and the match continues', () => {
        const h = makeHarness();
        const { matchId, bobToken } = startTwoPlayer(h);
        expect(h.seam.getMatch(matchId)?.status).toBe('running');

        clockMs += 1_000;
        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: bobToken });
        expect(left.ok).toBe(true);

        // FR-016: the engine is the single source of truth for elimination.
        const world = h.server.lastEngineSession?.world();
        expect(world?.players[1]?.status).toBe('eliminated');
        expect(world?.players[0]?.status).toBe('alive');

        // The seat carries the forfeit stamp; the match keeps running.
        const match = h.seam.getMatch(matchId);
        expect(match?.status).toBe('running');
        expect(match?.seats.get(1)?.forfeitedAtMs).toBe(clockMs);
        expect(match?.seats.get(0)?.forfeitedAtMs).toBeNull();

        // Detached from networking; NOT counted as a disconnect-forfeit.
        expect(h.server.detachPlayerCalls.map((call) => call.sessionToken)).toEqual([bobToken]);
        expect(h.matchmaker.stats().totalForfeits).toBe(0);
        expect(h.matchmaker.stats().totalCollected).toBe(0);
        h.matchmaker.close();
    });

    it('tears the match down when the voluntary leave is the last player standing', () => {
        const h = makeHarness();
        const { matchId, aliceToken, bobToken } = startTwoPlayer(h);

        clockMs += 1_000;
        expect(h.matchmaker.leaveMatch({ matchId, sessionToken: bobToken }).ok).toBe(true);
        clockMs += 1_000;
        const lastLeave = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(lastLeave.ok).toBe(true);

        // US5 AC-2 teardown semantics via the shared forfeit path.
        expect(h.server.unregisterMatchCalls).toEqual([matchId]);
        const match = h.seam.getMatch(matchId);
        expect(match?.status).toBe('collected');
        expect(match?.results?.result.kind).toBe('cancelled');
        expect(h.matchmaker.stats().totalCollected).toBe(1);
        h.matchmaker.close();
    });

    it('is idempotent for an already-forfeited seat (grace expired first)', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = startTwoPlayer(h);

        // Grace expiry forfeits Alice through the bridge...
        h.server.fireOnSeatExpired({ matchId, sessionToken: aliceToken, playerId: 1 });
        expect(h.seam.getMatch(matchId)?.seats.get(0)?.forfeitedAtMs).not.toBeNull();

        // ...then a voluntary leave with the dead token succeeds trivially.
        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(left.ok).toBe(true);
        h.matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// Terminal phases + credential errors
// ----------------------------------------------------------------------------

describe('leaveMatch — terminal phases and error table', () => {
    it('finished matches: acknowledged no-op that leaves the rematch window intact', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = startTwoPlayer(h);

        h.server.fireOnMatchTerminal({
            matchId,
            result: { kind: 'win', winner: 1, tick: 42, reason: 'last_standing' },
            tick: 42,
        });
        expect(h.seam.getMatch(matchId)?.status).toBe('finished');

        const left = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(left.ok).toBe(true);
        expect(h.seam.getMatch(matchId)?.status).toBe('finished');

        // The no-op disturbed nothing: the rematch window still opens.
        const rematch = h.matchmaker.requestRematch({ matchId, sessionToken: aliceToken });
        expect(rematch.ok).toBe(true);
        h.matchmaker.close();
    });

    it('unknown match id → match_not_found; unknown token → session_invalid', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = createFilling(h);

        const unknownId = h.matchmaker.leaveMatch({
            matchId: '00000000-0000-4000-8000-000000000000' as MatchId,
            sessionToken: aliceToken,
        });
        expect(unknownId.ok).toBe(false);
        if (!unknownId.ok) {
            expect(unknownId.error.code).toBe('match_not_found');
        }

        const unknownToken = h.matchmaker.leaveMatch({
            matchId,
            sessionToken: '11111111-1111-4111-8111-111111111111' as SessionToken,
        });
        expect(unknownToken.ok).toBe(false);
        if (!unknownToken.ok) {
            expect(unknownToken.error.code).toBe('session_invalid');
        }
        h.matchmaker.close();
    });

    it('a released filling seat no longer matches its token (session_invalid on re-leave)', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = createFilling(h);

        clockMs += 1_000;
        expect(h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken }).ok).toBe(true);

        // The seat was REMOVED (not stamped), so the stale token misses.
        const again = h.matchmaker.leaveMatch({ matchId, sessionToken: aliceToken });
        expect(again.ok).toBe(false);
        if (!again.ok) {
            expect(again.error.code).toBe('session_invalid');
        }
        h.matchmaker.close();
    });
});
