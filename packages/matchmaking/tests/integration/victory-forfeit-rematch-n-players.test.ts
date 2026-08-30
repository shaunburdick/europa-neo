/**
 * Victory / forfeit / rematch lifecycle audit — N-player matches (Feature 012, T022).
 *
 * Headless end-to-end lifecycle coverage for 3- and 4-player matches
 * driven through the REAL matchmaker + the `FakeServer` networking double
 * (the package's standard integration seam — see `tests/quickstart/` and
 * `tests/fixtures/fakeServer.ts`). No real sockets, no real engine tick
 * loop: the engine session is the one the matchmaker registered at
 * auto-start, and eliminations/terminals are simulated by firing the
 * bridge triggers the host would receive from networking.
 *
 * Exercises US5 across N ∈ {3, 4} (spec FR-007 snap + 006 US4/US5):
 *
 *   (a) running Np, eliminate N-1 via disconnect-forfeit → last survivor
 *       wins: `onMatchTerminal` transitions the match to `finished` with a
 *       `win` result (US5 AC-1 — game_over / showResults terminal).
 *   (b) running Np, one voluntary `leaveMatch` → that seat is forfeited
 *       immediately (detached) but the match CONTINUES while ≥2 remain
 *       (US5 AC-2).
 *   (c) running Np, one disconnect beyond grace → that seat is forfeited
 *       via `onSeatExpired` (engine marks it `eliminated`) and the match
 *       CONTINUES while ≥2 remain (US5 AC-3).
 *   (d) finished Np, every original seat accepts rematch within the
 *       window → a NEW match with the SAME `playerCount` / `boardSize` /
 *       `visibility` and a FRESH `initialSeed` / `matchId` / `joinPath`
 *       (`MatchRecord.initialSeed` is observable on the new record)
 *       (US5 AC-4).
 *
 * Telemetry (Edge Cases): `totalForfeits` bumps ONLY for timeout
 * forfeits (`onSeatExpired`); a voluntary `leaveMatch` forfeit does NOT
 * bump it.
 *
 * Board size is 48 for every N>2 run (012 default); 64 is intentionally
 * avoided (terrain issue #26). No wire/protocol change is exercised here
 * (headless), so there is no wire bump.
 */

import { describe, expect, it } from 'vitest';
import type { MatchId, MatchVisibility, SeatAssignment } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** Concrete matchmaker instance type (avoids a named-type import). */
type MatchmakerInstance = ReturnType<typeof createMatchmaker>;

/** A fully-seated, auto-started N-player match plus its captured seats. */
interface RunningMatch {
    /** The networking double the matchmaker drove. */
    readonly server: FakeServer;
    /** The matchmaker under test. */
    readonly matchmaker: MatchmakerInstance;
    /** The running match's id. */
    readonly matchId: MatchId;
    /** Seat assignments in seat order (index 0 = player 1, …). */
    readonly seats: SeatAssignment[];
}

/**
 * Build and auto-start an N-player match on the given board size.
 *
 * Creates the match, fills every remaining seat, and asserts the engine
 * session was registered (auto-start fired) before returning. Throws if
 * any step fails so the calling `it` fails loudly rather than silently
 * proceeding against an unstarted match.
 *
 * @param playerCount - 3 or 4.
 * @param visibility - `public` (lobby-listed) or `private`.
 * @param boardSize - Square board dimension (48 for N>2 per 012).
 * @returns The running match, server, matchmaker, id, and seats.
 */
function setupRunningMatch(playerCount: 3 | 4, visibility: MatchVisibility, boardSize: number): RunningMatch {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const create = matchmaker.createMatch({
        visibility,
        displayName: 'P0',
        settings: { playerCount, boardSize },
    });
    if (!create.ok) {
        throw new Error(`createMatch failed: ${JSON.stringify(create.error)}`);
    }
    const matchId = create.data.matchId;
    const seats: SeatAssignment[] = [create.data.seatAssignment];

    for (let i = 1; i < playerCount; i++) {
        const join = matchmaker.joinMatch({ matchId, displayName: `P${i}` });
        if (!join.ok) {
            throw new Error(`joinMatch seat ${i} failed: ${JSON.stringify(join.error)}`);
        }
        seats.push(join.data.seatAssignment);
    }

    if (server.lastEngineSession === undefined) {
        throw new Error('engine session was not registered after auto-start');
    }
    return { server, matchmaker, matchId, seats };
}

/** Player counts exercised by this audit (012: 3–4 player support). */
const PLAYER_COUNTS = [3, 4] as const;

for (const N of PLAYER_COUNTS) {
    describe(`victory-forfeit-rematch lifecycle — N=${N} players (board 48)`, () => {
        it('(a) eliminating N-1 seats then reporting terminal yields a last-survivor win (US5 AC-1)', async () => {
            const { server, matchmaker, matchId, seats } = setupRunningMatch(N, 'public', 48);

            // Eliminate N-1 seats via the disconnect-forfeit path (the
            // headless stand-in for combat elimination — each surrender is
            // submitted to the engine, which marks the player eliminated).
            for (let i = 0; i < N - 1; i++) {
                server.fireOnSeatExpired({
                    matchId,
                    sessionToken: seats[i].sessionToken,
                    playerId: seats[i].playerId,
                });
            }

            // Exactly one survivor remains; the engine would now report the
            // terminal result. Simulate that bridge trigger.
            const survivor = seats[N - 1];
            server.fireOnMatchTerminal({
                matchId,
                result: { kind: 'win', winner: survivor.playerId, tick: 500, reason: 'last_standing' },
                tick: 500,
            });

            const match = matchmaker.getMatch(matchId);
            expect(match).toBeDefined();
            // US5 AC-1: the match reaches the terminal `finished` state with
            // a `win` result (the client shows game_over / showResults).
            expect(match?.status).toBe('finished');
            expect(match?.results).not.toBeNull();
            const result = match?.results?.result;
            expect(result?.kind).toBe('win');
            if (result?.kind === 'win') {
                expect(result.winner).toBe(survivor.playerId);
            }

            await matchmaker.close();
        });

        it('(b) a voluntary leaveMatch forfeits only that seat; match continues while ≥2 remain (US5 AC-2)', async () => {
            const { server, matchmaker, matchId, seats } = setupRunningMatch(N, 'public', 48);
            const forfeitsBefore = matchmaker.stats().totalForfeits;

            const leave = matchmaker.leaveMatch({ matchId, sessionToken: seats[0].sessionToken });
            expect(leave.ok).toBe(true);

            const match = matchmaker.getMatch(matchId);
            // US5 AC-2: the match is NOT torn down — it continues running.
            expect(match?.status).toBe('running');
            // The leaver was detached from networking immediately.
            expect(server.detachPlayerCalls.some((call) => call.sessionToken === seats[0].sessionToken)).toBe(true);

            // Exactly one player was removed; N-1 remain (≥2 because N≥3).
            const world = server.lastEngineSession?.world();
            const alive = world?.players.filter((player) => player.status === 'alive').length ?? 0;
            expect(alive).toBe(N - 1);
            expect(alive).toBeGreaterThanOrEqual(2);

            // Telemetry: a voluntary leave is NOT a disconnect forfeit, so
            // `totalForfeits` must be unchanged.
            expect(matchmaker.stats().totalForfeits).toBe(forfeitsBefore);

            await matchmaker.close();
        });

        it('(c) a disconnect beyond grace forfeits that seat via onSeatExpired; match continues (US5 AC-3)', async () => {
            const { server, matchmaker, matchId, seats } = setupRunningMatch(N, 'public', 48);
            const forfeitsBefore = matchmaker.stats().totalForfeits;

            server.fireOnSeatExpired({
                matchId,
                sessionToken: seats[0].sessionToken,
                playerId: seats[0].playerId,
            });

            const match = matchmaker.getMatch(matchId);
            // US5 AC-3: the match continues running (the forfeit is isolated
            // to the one expired seat).
            expect(match?.status).toBe('running');
            // The engine is the single source of truth for elimination.
            const world = server.lastEngineSession?.world();
            expect(world?.players[seats[0].seatIndex]?.status).toBe('eliminated');
            const alive = world?.players.filter((player) => player.status === 'alive').length ?? 0;
            expect(alive).toBe(N - 1);
            expect(alive).toBeGreaterThanOrEqual(2);

            // Telemetry: a timeout forfeit DOES bump `totalForfeits` by 1.
            expect(matchmaker.stats().totalForfeits).toBe(forfeitsBefore + 1);

            await matchmaker.close();
        });

        it('(d) all original seats accept rematch → new match same settings + fresh seed/id/link (US5 AC-4)', async () => {
            const visibility: MatchVisibility = 'public';
            const { server, matchmaker, matchId, seats } = setupRunningMatch(N, visibility, 48);

            const original = matchmaker.getMatch(matchId);
            if (original === undefined) {
                throw new Error('original match record missing');
            }
            const originalSeed = original.initialSeed;
            const originalJoinPath = original.joinPath;

            // Finish the match with NO forfeits so every original seat stays
            // eligible to vote on the rematch.
            const winner = seats[N - 1].playerId;
            server.fireOnMatchTerminal({
                matchId,
                result: { kind: 'win', winner, tick: 500, reason: 'last_standing' },
                tick: 500,
            });
            expect(matchmaker.getMatch(matchId)?.status).toBe('finished');

            // Open the rematch window (first request) then have every seat
            // accept. The final accept resolves into the new match.
            const firstReq = matchmaker.requestRematch({ matchId, sessionToken: seats[0].sessionToken });
            expect(firstReq.ok).toBe(true);
            if (!firstReq.ok) {
                return;
            }
            const offerId = firstReq.rematchOfferId;

            let resolvedNewMatchId: MatchId | undefined;
            for (const seat of seats) {
                const accept = matchmaker.acceptRematch({
                    matchId,
                    rematchOfferId: offerId,
                    sessionToken: seat.sessionToken,
                });
                expect(accept.ok).toBe(true);
                if (!accept.ok) {
                    return;
                }
                if (accept.allAccepted) {
                    resolvedNewMatchId = accept.newMatchId;
                }
            }

            expect(resolvedNewMatchId).toBeDefined();
            if (resolvedNewMatchId === undefined) {
                throw new Error('rematch did not resolve to a new match id');
            }
            const newMatch = matchmaker.getMatch(resolvedNewMatchId);
            expect(newMatch).toBeDefined();
            if (newMatch === undefined) {
                throw new Error('new match record missing');
            }

            // US5 AC-4: same shape, fresh identity.
            expect(newMatch.settings.playerCount).toBe(N);
            expect(newMatch.settings.boardSize).toBe(48);
            expect(newMatch.visibility).toBe(visibility);
            expect(newMatch.matchId).not.toBe(matchId);
            expect(newMatch.joinPath).not.toBe(originalJoinPath);

            // `MatchRecord.initialSeed` is visible and fresh (non-null, and
            // distinct from the original match's seed).
            expect(originalSeed).not.toBeNull();
            expect(typeof newMatch.initialSeed).toBe('number');
            expect(newMatch.initialSeed).not.toBeNull();
            expect(newMatch.initialSeed).not.toBe(originalSeed);

            // The new match is `filling` with every original seat auto-seated.
            expect(newMatch.status).toBe('filling');
            expect(newMatch.seats.size).toBe(N);

            // The original match resolved to `collected` on rematch.
            expect(matchmaker.getMatch(matchId)?.status).toBe('collected');

            // No forfeits occurred during this scenario.
            expect(matchmaker.stats().totalForfeits).toBe(0);

            await matchmaker.close();
        });

        it('telemetry: totalForfeits bumps only for timeout (onSeatExpired), not voluntary leaveMatch', async () => {
            const { server, matchmaker, matchId, seats } = setupRunningMatch(N, 'public', 48);
            expect(matchmaker.stats().totalForfeits).toBe(0);

            // Timeout forfeit (disconnect beyond grace) → bumps by exactly 1.
            server.fireOnSeatExpired({
                matchId,
                sessionToken: seats[0].sessionToken,
                playerId: seats[0].playerId,
            });
            expect(matchmaker.stats().totalForfeits).toBe(1);

            // Voluntary leave of a different seat → must NOT bump.
            const leave = matchmaker.leaveMatch({ matchId, sessionToken: seats[1].sessionToken });
            expect(leave.ok).toBe(true);
            expect(matchmaker.stats().totalForfeits).toBe(1);

            await matchmaker.close();
        });
    });
}
