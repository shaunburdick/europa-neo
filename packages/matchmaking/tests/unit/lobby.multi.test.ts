/**
 * Unit tests for a multi-match lobby snapshot — Feature 006 (T038)
 *
 * Covers spec US2 AC-1 + the edge case "three open public matches in
 * various fill states": three concurrent public matches with different
 * `playerCount` (2, 3, 4) each report accurate `seatsFilled` /
 * `playerCount`; joining seats updates occupancy; and transitioning one
 * match to `running` (its last seat filling — a 2/2-full match starts
 * atomically per FR-007, which is exactly how the transition is
 * triggered here) drops it from the next listing.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** Fresh matchmaker per test; ids are real UUIDs from the default mint. */
function makeMatchmaker() {
    const server = new FakeServer();
    return createMatchmaker(MATCHMAKING_CONSTANTS, { server });
}

/** Create a public match with an explicit player count. */
function createPublic(matchmaker: ReturnType<typeof makeMatchmaker>, name: string, playerCount: 2 | 3 | 4): MatchId {
    const created = matchmaker.createMatch({
        visibility: 'public',
        displayName: name,
        settings: { playerCount },
    });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    return created.data.matchId;
}

/** Lobby ids + occupancy in insertion order; fixture failures explode. */
function snapshot(matchmaker: ReturnType<typeof makeMatchmaker>): [MatchId, number, number][] {
    const lobby = matchmaker.listPublicMatches();
    if (!lobby.ok) {
        throw new Error('fixture lobby failed');
    }
    return lobby.matches.map((e) => [e.matchId, e.seatsFilled, e.playerCount] as [MatchId, number, number]);
}

describe('listPublicMatches — multi-match snapshot (US2 AC-1)', () => {
    it('FR-005: reports accurate occupancy for three concurrent matches at once', () => {
        const matchmaker = makeMatchmaker();
        const two = createPublic(matchmaker, 'Two', 2);
        const three = createPublic(matchmaker, 'Three', 3);
        const four = createPublic(matchmaker, 'Four', 4);

        expect(snapshot(matchmaker)).toEqual([
            [two, 1, 2],
            [three, 1, 3],
            [four, 1, 4],
        ]);
        matchmaker.close();
    });

    it('FR-005 / SC-003: partial fills update live without disturbing sibling entries', () => {
        const matchmaker = makeMatchmaker();
        const two = createPublic(matchmaker, 'Two', 2);
        const three = createPublic(matchmaker, 'Three', 3);
        const four = createPublic(matchmaker, 'Four', 4);

        // One joiner into the 3p and one into the 4p: 1/2, 2/3, 2/4.
        expect(matchmaker.joinMatch({ matchId: three, displayName: 'B' }).ok).toBe(true);
        expect(matchmaker.joinMatch({ matchId: four, displayName: 'C' }).ok).toBe(true);

        expect(snapshot(matchmaker)).toEqual([
            [two, 1, 2],
            [three, 2, 3],
            [four, 2, 4],
        ]);
        matchmaker.close();
    });

    it("spec edge case: filling a match's last seat (→ running) leaves only two entries", () => {
        const matchmaker = makeMatchmaker();
        const two = createPublic(matchmaker, 'Two', 2);
        const three = createPublic(matchmaker, 'Three', 3);
        const four = createPublic(matchmaker, 'Four', 4);

        // The 2p match reaching 2/2 auto-starts (FR-007) and must drop out.
        expect(matchmaker.joinMatch({ matchId: two, displayName: 'B' }).ok).toBe(true);

        expect(snapshot(matchmaker)).toEqual([
            [three, 1, 3],
            [four, 1, 4],
        ]);
        expect(matchmaker.stats().runningMatches).toBe(1);
        matchmaker.close();
    });
});
