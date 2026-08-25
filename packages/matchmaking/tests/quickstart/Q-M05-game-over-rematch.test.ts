/**
 * Q-M05 — Game over → rematch handshake (US4). Feature 006 (T054).
 *
 * Verbatim scenario from `quickstart.md` §Q-M05 (spec US4 AC-1, AC-2;
 * FR-008, FR-009; SC-001 end-to-end match cycle). Mechanical
 * adjustments, per package test conventions:
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name (which would hit a possibly-stale dist build);
 *   2. `fireOnMatchTerminal` is a METHOD on the FakeServer fixture
 *      (the fixture's bridge-trigger API), not a standalone function
 *      taking `server.bridge`;
 *   3. `close()` is awaited (it returns a Promise) so the test stays
 *      sync-safe under lint's floating-promise hygiene.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M05: game over → rematch handshake', () => {
    it('creates a new match when both players accept', async () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // Set up a running match
        const aliceCreate = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
        });
        if (!aliceCreate.ok) {
            throw new Error('create failed');
        }
        const { matchId, seatAssignment: aliceSeat } = aliceCreate.data;

        const bobJoin = matchmaker.joinMatch({
            matchId,
            displayName: 'Bob',
        });
        if (!bobJoin.ok) {
            throw new Error('join failed');
        }
        const bobSeat = bobJoin.data.seatAssignment;

        // Engine reports terminal
        server.fireOnMatchTerminal({
            matchId,
            tick: 1234,
            result: {
                kind: 'win',
                winner: 1,
                tick: 1234,
                reason: 'last_standing',
            },
        });

        // Matchmaker should have transitioned to 'finished' and opened
        // a rematch window.
        const stats1 = matchmaker.stats();
        expect(stats1.finishedMatches).toBe(1);

        // Alice requests rematch
        const aliceRematch = matchmaker.requestRematch({
            matchId,
            sessionToken: aliceSeat.sessionToken,
        });
        expect(aliceRematch.ok).toBe(true);
        if (!aliceRematch.ok) {
            return;
        }
        const { rematchOfferId } = aliceRematch;
        expect(rematchOfferId).not.toBe(matchId);

        // Alice accepts
        const aliceAccept = matchmaker.acceptRematch({
            matchId,
            rematchOfferId,
            sessionToken: aliceSeat.sessionToken,
        });
        expect(aliceAccept.ok).toBe(true);
        if (!aliceAccept.ok) {
            return;
        }
        const { allAccepted: aliceAccepted } = aliceAccept;
        expect(aliceAccepted).toBe(false); // Bob hasn't accepted yet

        // Bob accepts
        const bobAccept = matchmaker.acceptRematch({
            matchId,
            rematchOfferId,
            sessionToken: bobSeat.sessionToken,
        });
        expect(bobAccept.ok).toBe(true);
        if (!bobAccept.ok) {
            return;
        }
        const { allAccepted: bobAccepted, newMatchId, newSeatAssignment } = bobAccept;
        expect(bobAccepted).toBe(true); // last vote
        expect(newMatchId).toBeDefined();
        expect(newSeatAssignment).toBeDefined();

        // The new match should be in 'filling' state with both players
        // auto-seated.
        if (newMatchId === undefined) {
            throw new Error('newMatchId missing');
        }
        const lobby = matchmaker.listPublicMatches();
        expect(lobby.ok).toBe(true);
        if (!lobby.ok) {
            return;
        }
        // Visibility was 'public', so new match is also public and in lobby
        expect(lobby.matches.some((m) => m.matchId === newMatchId)).toBe(true);

        await matchmaker.close();
    });
});
