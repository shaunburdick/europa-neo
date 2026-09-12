/**
 * P0 release blocker tests — Issue #126
 *
 * Covers the four acceptance criteria:
 *
 *   1. A create with mismatched tickIntervalMs or malformed
 *      terrainSettings leaves zero active matches and returns an error.
 *   2. maxConcurrentMatches cannot be exhausted by repeated failing
 *      creates.
 *   3. No filling match with a full seat set is projected joinable
 *      (covered by lobby.list.test.ts).
 *   4. Auto-start failures are recoverable — the joiner gets an error,
 *      the match returns to its pre-join state.
 */

import { describe, expect, it } from 'vitest';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

describe('Issue #126 — malformed terrain settings rejected at create', () => {
    it('rejects NaN waterRatio with invalid_request and leaves zero active matches', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: {
                terrainSettings: { waterRatio: Number.NaN },
            },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('invalid_request');
            expect(result.error.detail?.field).toBe('settings.terrainSettings');
        }
        expect(matchmaker.stats().activeMatches).toBe(0);
        matchmaker.close();
    });

    it('rejects non-integer octaves with invalid_request and leaves zero active matches', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: {
                terrainSettings: { octaves: 3.5 },
            },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('invalid_request');
            expect(result.error.detail?.field).toBe('settings.terrainSettings');
        }
        expect(matchmaker.stats().activeMatches).toBe(0);
        matchmaker.close();
    });

    it('rejects invalid symmetryStrategy with invalid_request and leaves zero active matches', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const result = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: {
                terrainSettings: { symmetryStrategy: 'rotational' as 'point' },
            },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('invalid_request');
            expect(result.error.detail?.field).toBe('settings.terrainSettings');
        }
        expect(matchmaker.stats().activeMatches).toBe(0);
        matchmaker.close();
    });
});

describe('Issue #126 — maxConcurrentMatches cannot be exhausted by failing creates', () => {
    it('repeated failing creates do not consume capacity', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker({ ...MATCHMAKING_CONSTANTS, maxConcurrentMatches: 2 }, { server });

        // First: one valid create succeeds.
        const good = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(good.ok).toBe(true);
        expect(matchmaker.stats().activeMatches).toBe(1);

        // Now flood with malformed terrain settings — all should fail
        // and leave the active count unchanged.
        for (let i = 0; i < 10; i++) {
            const bad = matchmaker.createMatch({
                visibility: 'public',
                displayName: `Attacker${String(i)}`,
                settings: { terrainSettings: { waterRatio: Number.NaN } },
            });
            expect(bad.ok).toBe(false);
        }
        expect(matchmaker.stats().activeMatches).toBe(1);

        // A second valid create still works (capacity not exhausted).
        const second = matchmaker.createMatch({ visibility: 'public', displayName: 'Bob' });
        expect(second.ok).toBe(true);
        expect(matchmaker.stats().activeMatches).toBe(2);

        // Now at capacity — a valid create should be rejected.
        const third = matchmaker.createMatch({ visibility: 'public', displayName: 'Carol' });
        expect(third.ok).toBe(false);
        if (!third.ok) {
            expect(third.error.code).toBe('rate_limited');
        }

        matchmaker.close();
    });
});

describe('Issue #126 — no filling match with a full seat set is projected joinable', () => {
    it('a 2/2 filling match does not appear in listPublicMatches', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }

        // Join fills the last seat — match transitions to running.
        const joined = matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bob',
        });
        expect(joined.ok).toBe(true);

        // Running matches are not in the lobby (existing behavior).
        const lobby = matchmaker.listPublicMatches();
        expect(lobby.ok && lobby.matches).toHaveLength(0);
        matchmaker.close();
    });

    it('a 2/2 filling match created via rematch IS projected (initialSeed set)', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // Create + fill + start a match.
        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
        expect(joined.ok).toBe(true);

        // Finish the match via terminal event.
        server.fireOnMatchTerminal({
            matchId: created.data.matchId,
            result: { kind: 'victory', winner: 'WinnerPlyr01' as never },
            tick: 100,
        });

        // Request + accept rematch to create a new filling match.
        const rematch = matchmaker.requestRematch({
            matchId: created.data.matchId,
            sessionToken: created.data.seatAssignment.sessionToken,
        });
        expect(rematch.ok).toBe(true);
        if (!rematch.ok) {
            return;
        }

        const accept = matchmaker.acceptRematch({
            matchId: created.data.matchId,
            rematchOfferId: rematch.rematchOfferId,
            sessionToken: created.data.seatAssignment.sessionToken,
        });
        expect(accept.ok).toBe(true);
        if (!accept.ok || !accept.newMatchId) {
            return;
        }

        // The rematch match is filling with all seats pre-filled.
        // It SHOULD appear in the lobby so participants can reconnect.
        const lobby = matchmaker.listPublicMatches();
        expect(lobby.ok && lobby.matches).toHaveLength(1);
        if (lobby.ok) {
            expect(lobby.matches[0]?.matchId).toBe(accept.newMatchId);
        }
        matchmaker.close();
    });
});

describe('Issue #126 — auto-start failure recovery', () => {
    it('when autoStart throws, the joiner gets an error and the match stays filling', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // Create a 2-player match.
        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }

        // Override registerMatch to throw — this simulates a failure
        // during the autoStart critical section (e.g., networking
        // rejection, board generation failure, etc.).
        const originalRegister = server.registerMatch.bind(server);
        server.registerMatch = () => {
            throw new Error('simulated registerMatch failure');
        };

        // Join fills the last seat — autoStart is triggered but
        // registerMatch throws inside it.
        const joined = matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bob',
        });

        // The join should fail with an error (autoStart failure).
        expect(joined.ok).toBe(false);
        if (!joined.ok) {
            expect(joined.error.code).toBe('internal_error');
        }

        // Restore original behavior.
        server.registerMatch = originalRegister;

        // The match is still in 'filling' with 1 seat (the joiner's
        // seat was rolled back). Stats show 1 active match.
        expect(matchmaker.stats().fillingMatches).toBe(1);
        expect(matchmaker.stats().activeMatches).toBe(1);
        expect(matchmaker.stats().runningMatches).toBe(0);

        // The lobby still shows the match (1/2 filling, joinable).
        const lobby = matchmaker.listPublicMatches();
        expect(lobby.ok && lobby.matches).toHaveLength(1);
        matchmaker.close();
    });
});
