/**
 * Issue #2 regression — 3-player public match auto-start.
 *
 * Before the terrain fix, filling the third seat of a public 3p match
 * threw `GenerationError('attempts_exhausted')` out of `autoStart` on
 * every seed: terrain's INV-9 flagged the self-symmetric middle
 * player's legitimate same-owner mirror cities as asymmetry violations,
 * and the FR-004 point-symmetry × FR-005 equal-cities combination made
 * an odd city total impossible on even boards.
 *
 * Integration level: this drives matchmaking's real auto-start path,
 * which calls terrain's real `generateBoard` (no mocks), then asserts
 * the produced board through the registered engine session. The
 * FakeServer stands in for networking per package convention.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('matchmaker — 3-player public auto-start (issue #2 regression)', () => {
    it('auto-starts a public 3p match when the third seat fills', async () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // Alice creates a PUBLIC 3-player match (lobby-listed).
        const create = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { playerCount: 3 },
        });
        expect(create.ok).toBe(true);
        if (!create.ok) {
            return;
        }
        const { matchId, seatAssignment: aliceSeat } = create.data;
        expect(aliceSeat.seatIndex).toBe(0);
        expect(aliceSeat.playerId).toBe(1);

        // The lobby lists it as a filling 3p match.
        const lobbyBefore = matchmaker.listPublicMatches();
        expect(lobbyBefore.ok).toBe(true);
        if (!lobbyBefore.ok) {
            return;
        }
        expect(lobbyBefore.matches).toHaveLength(1);
        expect(lobbyBefore.matches[0]?.matchId).toBe(matchId);
        expect(lobbyBefore.matches[0]?.playerCount).toBe(3);
        expect(lobbyBefore.matches[0]?.seatsFilled).toBe(1);

        // Bob takes seat 2.
        const bob = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
        expect(bob.ok).toBe(true);
        if (!bob.ok) {
            return;
        }
        expect(bob.data.seatAssignment.seatIndex).toBe(1);
        expect(bob.data.seatAssignment.playerId).toBe(2);

        // Carol's join fills the last seat and fires auto-start — the
        // exact call site that threw GenerationError before the fix.
        const carol = matchmaker.joinMatch({ matchId, displayName: 'Carol' });
        expect(carol.ok).toBe(true);
        if (!carol.ok) {
            return;
        }
        expect(carol.data.seatAssignment.seatIndex).toBe(2);
        expect(carol.data.seatAssignment.playerId).toBe(3);

        // Networking was driven once, with all three seats attached in
        // seat order and spectators enabled.
        expect(server.registerMatchCalls).toHaveLength(1);
        expect(server.attachPlayerCalls).toHaveLength(3);
        expect(server.attachPlayerCalls.map((call) => call.playerId)).toEqual([1, 2, 3]);
        expect(server.enableSpectatorsCalls).toEqual([matchId]);

        // Each attach carries the matching seat's session token.
        expect(server.attachPlayerCalls.map((call) => call.sessionToken)).toEqual([
            aliceSeat.sessionToken,
            bob.data.seatAssignment.sessionToken,
            carol.data.seatAssignment.sessionToken,
        ]);

        // The board inside the registered engine session satisfies the
        // 3p contract: six starting cities, two per player, and a
        // playerCount of 3 in the engine config.
        const world = server.lastEngineSession?.world();
        expect(world).toBeDefined();
        expect(world?.config.playerCount).toBe(3);
        const cities = world?.board.cities ?? [];
        expect(cities).toHaveLength(6);
        const perPlayer = new Map<number, number>();
        for (const city of cities) {
            perPlayer.set(city.owner, (perPlayer.get(city.owner) ?? 0) + 1);
        }
        expect([...perPlayer.entries()].sort((a, b) => a[0] - b[0])).toEqual([
            [1, 2],
            [2, 2],
            [3, 2],
        ]);

        // Lifecycle settled: running, no longer lobby-listed.
        const lobbyAfter = matchmaker.listPublicMatches();
        expect(lobbyAfter.ok).toBe(true);
        if (!lobbyAfter.ok) {
            return;
        }
        expect(lobbyAfter.matches).toHaveLength(0);

        const stats = matchmaker.stats();
        expect(stats.totalCreated).toBe(1);
        expect(stats.fillingMatches).toBe(0);
        expect(stats.runningMatches).toBe(1);
        expect(stats.activePlayerSessions).toBe(3);

        await matchmaker.close();
    });
});
