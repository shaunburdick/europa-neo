/**
 * Universal identity lifecycle + credential separation — issue #74
 * (T025 / T026 / T029)
 *
 * Two guarantees under test:
 *
 *   1. ONE universal id per guest follows the player unchanged from
 *      lobby identity → session → seat → `MatchConfig.playerIds` →
 *      engine world → terminal result → accepted rematch (spec 006
 *      FR-014/FR-015, spec 010 FR-036).
 *   2. A bare id is advisory correlation metadata, NEVER proof: every
 *      privileged matchmaking operation requires its session/reconnect
 *      bearer credential, and an active identity cannot be hijacked by
 *      a claim (spec 006 FR-016, spec 010 v1.11 FR-038).
 *
 * Deterministic: injected clock + deterministic id factory; the engine
 * board uses the shipped default settings so real terrain generation
 * runs (the same path as production auto-start).
 */

import type { PlayerId } from '@europa/core';
import { PlayerIdCollisionError } from '@europa/core';
import type { MatchId, SessionToken } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import type { Matchmaker } from '../../contracts/matchmaking-api';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createIdentityRegistry } from '../../src/internal/identityRegistry';
import type { MatchmakerCompositionSeam } from '../../src/matchmaker';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Registry allocation: active uniqueness + forced collision (T024/T029)
// ----------------------------------------------------------------------------

describe('identity registry allocation — canonical, unique, fail-closed', () => {
    it('mints canonical unique ids through the injected deterministic factory', () => {
        const registry = createIdentityRegistry({
            randomId: (() => {
                let n = 0;
                return () => {
                    n += 1;
                    return `AllocPlyr${String(n).padStart(3, '0')}`;
                };
            })(),
        });

        const first = registry.createIdentity();
        const second = registry.createIdentity();
        expect(first.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
        expect(second.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
        expect(first.id).not.toBe(second.id);
        expect(registry.stats().identities).toBe(2);
        registry.close();
    });

    it('retries a colliding deterministic candidate and returns the next unused id', () => {
        // The second mint first re-offers the SAME candidate (a forced
        // collision) and only then yields a fresh value.
        const draws = ['CollidePlyr1', 'CollidePlyr1', 'CollidePlyr2'];
        let index = 0;
        const registry = createIdentityRegistry({
            randomId: () => draws[Math.min(index++, draws.length - 1)] ?? 'CollidePlyr2',
            maxIdAttempts: 3,
        });

        expect(registry.createIdentity().id).toBe('CollidePlyr1');
        // First redraw collides, second succeeds within budget.
        expect(registry.createIdentity().id).toBe('CollidePlyr2');
        registry.close();
    });

    it('fails closed when the retry budget is exhausted (never a duplicate)', () => {
        const registry = createIdentityRegistry({
            randomId: () => 'SaturatePly1',
            maxIdAttempts: 2,
        });
        expect(registry.createIdentity().id).toBe('SaturatePly1');
        expect(() => registry.createIdentity()).toThrow(PlayerIdCollisionError);
        // The registry still holds exactly the one good identity.
        expect(registry.stats().identities).toBe(1);
        registry.close();
    });

    it('rejects a numeric/non-canonical injected id (typed validator, not a cast)', () => {
        const registry = createIdentityRegistry({ randomId: () => '1' });
        expect(() => registry.createIdentity()).toThrow(/Invalid player id/);
        registry.close();
    });
});

// ----------------------------------------------------------------------------
// Lifecycle: one universal id end-to-end + rematch preservation (T025/T029)
// ----------------------------------------------------------------------------

type SeamMatchmaker = Matchmaker & MatchmakerCompositionSeam;

/** Create + fill a public 2p match through the REAL matchmaker. */
function startTwoPlayerMatch(): {
    server: FakeServer;
    matchmaker: SeamMatchmaker;
    matchId: MatchId;
    alicePlayerId: PlayerId;
    bobPlayerId: PlayerId;
    aliceToken: SessionToken;
    bobToken: SessionToken;
} {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server }) as SeamMatchmaker;

    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) {
        throw new Error('fixture: create failed');
    }
    const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) {
        throw new Error('fixture: join failed');
    }

    return {
        server,
        matchmaker,
        matchId: created.data.matchId,
        alicePlayerId: created.data.seatAssignment.playerId,
        bobPlayerId: joined.data.seatAssignment.playerId,
        aliceToken: created.data.seatAssignment.sessionToken,
        bobToken: joined.data.seatAssignment.sessionToken,
    };
}

describe('universal identity lifecycle (FR-014/FR-015/FR-036)', () => {
    it('feeds the SAME seat ids into MatchConfig.playerIds and the engine world', () => {
        const { matchmaker, matchId, alicePlayerId, bobPlayerId, server } = startTwoPlayerMatch();

        const match = matchmaker.getMatch(matchId);
        expect(match?.status).toBe('running');

        const world = server.lastEngineSession?.world();
        // One value per seat, in seat/placement order — never seatIndex + 1.
        expect(world?.config.playerIds).toEqual([alicePlayerId, bobPlayerId]);
        expect([...match!.seats.values()].map((seat) => seat.playerId)).toEqual([alicePlayerId, bobPlayerId]);

        // The engine registry resolves both ids (not numeric indexes).
        expect(world?.playerRegistry.has(alicePlayerId)).toBe(true);
        expect(world?.playerRegistry.has(bobPlayerId)).toBe(true);

        matchmaker.close();
    });

    it('preserves each seat id into terminal results and an accepted rematch', () => {
        const { matchmaker, matchId, alicePlayerId, bobPlayerId, aliceToken, bobToken, server } = startTwoPlayerMatch();

        server.fireOnMatchTerminal({
            matchId,
            result: { kind: 'win', winner: alicePlayerId, tick: 3, reason: 'last_standing' },
            tick: 3,
        });
        const finished = matchmaker.getMatch(matchId);
        expect(finished?.status).toBe('finished');
        expect(finished?.results?.finalPlayers.map((player) => player.id)).toEqual([alicePlayerId, bobPlayerId]);

        const request = matchmaker.requestRematch({ matchId, sessionToken: aliceToken });
        if (!request.ok) {
            throw new Error('fixture: requestRematch failed');
        }
        const firstAccept = matchmaker.acceptRematch({
            matchId,
            rematchOfferId: request.rematchOfferId,
            sessionToken: aliceToken,
        });
        expect(firstAccept.ok && firstAccept.allAccepted).toBe(false);

        const secondAccept = matchmaker.acceptRematch({
            matchId,
            rematchOfferId: request.rematchOfferId,
            sessionToken: bobToken,
        });
        expect(secondAccept.ok).toBe(true);
        if (!secondAccept.ok || secondAccept.newMatchId === undefined) {
            throw new Error('fixture: rematch did not resolve');
        }

        const rematch = matchmaker.getMatch(secondAccept.newMatchId);
        const rematchIds = [...rematch!.seats.values()]
            .sort((a, b) => a.seatIndex - b.seatIndex)
            .map((seat) => seat.playerId);
        // Same universal ids, fresh match. The completing voter (Bob)
        // receives THEIR preserved seat assignment.
        expect(rematchIds).toEqual([alicePlayerId, bobPlayerId]);
        expect(secondAccept.newSeatAssignment?.playerId).toBe(bobPlayerId);
        expect(rematch?.matchId).not.toBe(matchId);

        matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// Credential separation: an id alone is not proof (T026/T029)
// ----------------------------------------------------------------------------

describe('credential separation — a bare id cannot authorize privileged operations', () => {
    it('leaveMatch rejects a universal id presented as the session token', () => {
        const { matchmaker, matchId, alicePlayerId } = startTwoPlayerMatch();

        const leave = matchmaker.leaveMatch({
            matchId,
            sessionToken: alicePlayerId as unknown as SessionToken,
        });
        expect(leave.ok).toBe(false);
        if (!leave.ok) {
            expect(leave.error.code).toBe('session_invalid');
        }
        // The match is untouched: Alice still runs.
        expect(matchmaker.getMatch(matchId)?.status).toBe('running');
        matchmaker.close();
    });

    it("joinMatch treats another player's id as an unknown reconnect token (no seat takeover)", () => {
        const { matchmaker, matchId, alicePlayerId, bobPlayerId } = startTwoPlayerMatch();

        const reconnect = matchmaker.joinMatch({
            matchId,
            displayName: 'Mallory',
            reconnectToken: alicePlayerId as unknown as SessionToken,
        });
        expect(reconnect.ok).toBe(false);
        if (!reconnect.ok) {
            expect(reconnect.error.code).toBe('match_not_found');
        }
        // Nothing changed in the match's seats or their identities.
        const ids = [...matchmaker.getMatch(matchId)!.seats.values()].map((seat) => seat.playerId);
        expect(ids).toEqual([alicePlayerId, bobPlayerId]);
        matchmaker.close();
    });

    it('rematch operations reject an id presented as the session token', () => {
        const { matchmaker, matchId, alicePlayerId, server } = startTwoPlayerMatch();
        server.fireOnMatchTerminal({
            matchId,
            result: { kind: 'win', winner: alicePlayerId, tick: 1, reason: 'last_standing' },
            tick: 1,
        });

        const request = matchmaker.requestRematch({
            matchId,
            sessionToken: alicePlayerId as unknown as SessionToken,
        });
        expect(request.ok).toBe(false);

        const bogusOffer = '00000000-0000-4000-8000-000000000000' as MatchId;
        const accept = matchmaker.acceptRematch({
            matchId,
            rematchOfferId: bogusOffer,
            sessionToken: alicePlayerId as unknown as SessionToken,
        });
        expect(accept.ok).toBe(false);

        const decline = matchmaker.declineRematch({
            matchId,
            rematchOfferId: bogusOffer,
            sessionToken: alicePlayerId as unknown as SessionToken,
        });
        expect(decline.ok).toBe(false);
        matchmaker.close();
    });

    it('an active identity cannot be hijacked by a bare id claim (no eviction)', () => {
        const registry = createIdentityRegistry({
            randomId: (() => {
                let n = 0;
                return () => {
                    n += 1;
                    return `ActivePlyr${String(n).padStart(2, '0')}`;
                };
            })(),
        });

        const incumbent = registry.createIdentity();
        registry.setHandle(incumbent.id, 'Nova');

        // A second "tab" presents the incumbent's id while it is ACTIVE.
        const claim = registry.restoreIdentity({ guestPlayerId: incumbent.id });

        expect(claim.restored).toBe(false);
        expect(claim.identity.id).not.toBe(incumbent.id);
        // The incumbent is neither evicted nor renamed.
        expect(registry.projectIdentity(incumbent.id)).toEqual({ handle: 'Nova', hasIdentity: true });
        registry.close();
    });
});
