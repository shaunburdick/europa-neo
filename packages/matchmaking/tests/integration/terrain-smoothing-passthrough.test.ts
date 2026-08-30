/**
 * terrainSmoothing passthrough verification (issue #30, spec 006
 * Implementation Notes, T033).
 *
 * Proves `terrainSmoothing` flows through `MatchSettings.terrainSettings`
 * via `DEFAULT_GENERATION_SETTINGS` — no `MatchSettings` shape change,
 * no caller changes, no matchmaking source change. Driven through the
 * REAL matchmaker + the `FakeServer` networking double (the package's
 * standard integration seam — see `tests/quickstart/` and
 * `tests/fixtures/fakeServer.ts`), mirroring
 * `victory-forfeit-rematch-n-players.test.ts`.
 *
 *   (a) create with `terrainSettings: { terrainSmoothing: 2 }` → the
 *       match record's settings carry 2 AND the generated board's
 *       `effectiveSettings.terrainSmoothing` is 2.
 *   (b) create with `terrainSmoothing: 99` → the record carries the raw
 *       value (the matchmaker is a pass-through) and the generated
 *       board's `effectiveSettings.terrainSmoothing` is clamped to 8
 *       (spec 003 FR-008).
 *   (c) create with no override → the default 4 flows through and is
 *       surfaced.
 *   (d) a rematch reuses the original smoothing value: the new match
 *       record carries the same `terrainSettings` (settings carry-over
 *       by construction) plus a FRESH pre-minted `initialSeed`
 *       (FR-009).
 *
 * The matchmaker discards `TerrainGenerationResult` after auto-start
 * (it keeps only `generation.board`), so `effectiveSettings` is
 * observed by regenerating the board with the match record's own
 * settings + `initialSeed` — the exact inputs `autoStart` feeds
 * `generateBoard` (`matchmaker.ts`). Byte-identity with the engine
 * session's actual board (via `hashBoard`) pins that the matchmaker
 * really generated with these settings, so the passthrough is real
 * rather than an artifact of the regeneration.
 */

import { createRng } from '@europa/engine';
import { DEFAULT_GENERATION_SETTINGS, generateBoard, hashBoard } from '@europa/terrain';
import { describe, expect, it } from 'vitest';
import type { CreateMatchRequest, MatchId, MatchSettings, SeatAssignment } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** Concrete matchmaker instance type (avoids a named-type import). */
type MatchmakerInstance = ReturnType<typeof createMatchmaker>;

/** A fully-seated, auto-started 2-player match plus its captured seats. */
interface StartedMatch {
    /** The networking double the matchmaker drove. */
    readonly server: FakeServer;
    /** The matchmaker under test. */
    readonly matchmaker: MatchmakerInstance;
    /** The running match's id. */
    readonly matchId: MatchId;
    /** Seat assignments in seat order (index 0 = player 1, index 1 = player 2). */
    readonly seats: SeatAssignment[];
}

/** The subset of `MatchRecord` regeneration needs (structural, no import). */
interface RegenerationInput {
    readonly settings: MatchSettings;
    readonly initialSeed: number | null;
}

/**
 * Create and auto-start a 2-player match with the given settings.
 *
 * Creates the match, fills the second seat, and asserts the engine
 * session was registered (auto-start fired) before returning. Throws if
 * any step fails so the calling `it` fails loudly rather than silently
 * proceeding against an unstarted match.
 *
 * @param settings - Optional `createMatch` settings (e.g.
 *   `{ terrainSettings: { terrainSmoothing: 2 } }`); omitted for the
 *   no-override default case.
 * @returns The running match, server, matchmaker, id, and seats.
 */
function setupStartedMatch(settings?: CreateMatchRequest['settings']): StartedMatch {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const create = matchmaker.createMatch({
        visibility: 'public',
        displayName: 'P0',
        settings,
    });
    if (!create.ok) {
        throw new Error(`createMatch failed: ${JSON.stringify(create.error)}`);
    }
    const matchId = create.data.matchId;
    const seats: SeatAssignment[] = [create.data.seatAssignment];

    const join = matchmaker.joinMatch({ matchId, displayName: 'P1' });
    if (!join.ok) {
        throw new Error(`joinMatch failed: ${JSON.stringify(join.error)}`);
    }
    seats.push(join.data.seatAssignment);

    if (server.lastEngineSession === undefined) {
        throw new Error('engine session was not registered after auto-start');
    }
    return { server, matchmaker, matchId, seats };
}

/**
 * Regenerate the board exactly as the matchmaker's `autoStart` did and
 * return the full generation result, so `effectiveSettings` is
 * observable (the matchmaker itself discards it after auto-start).
 *
 * @param match - The match record's settings + minted seed.
 * @returns The `TerrainGenerationResult` for the record's own inputs.
 */
function regenerateBoard(match: RegenerationInput): ReturnType<typeof generateBoard> {
    if (match.initialSeed === null) {
        throw new Error('match has no initialSeed (auto-start did not mint one)');
    }
    return generateBoard({
        boardSize: match.settings.boardSize,
        playerCount: match.settings.playerCount,
        seed: match.initialSeed,
        rng: createRng(match.initialSeed),
        settings: match.settings.terrainSettings,
    });
}

/**
 * Assert the engine session's actual board is byte-identical to a
 * regeneration from the match record's own settings + seed — pinning
 * that the matchmaker really generated with these settings.
 */
function expectBoardMatchesRegeneration(server: FakeServer, generation: ReturnType<typeof generateBoard>): void {
    const actualBoard = server.lastEngineSession?.world().board;
    expect(actualBoard).toBeDefined();
    if (actualBoard === undefined) {
        throw new Error('engine session board missing');
    }
    expect(hashBoard(generation.board)).toBe(hashBoard(actualBoard));
}

describe('matchmaking — terrainSmoothing passthrough (issue #30)', () => {
    it('(a) terrainSettings: { terrainSmoothing: 2 } → settings carry 2 and effectiveSettings.terrainSmoothing === 2', async () => {
        const { server, matchmaker, matchId } = setupStartedMatch({ terrainSettings: { terrainSmoothing: 2 } });

        const match = matchmaker.getMatch(matchId);
        expect(match).toBeDefined();
        if (match === undefined) {
            throw new Error('match record missing');
        }

        // The match record's settings carry the caller's value.
        expect(match.settings.terrainSettings.terrainSmoothing).toBe(2);

        // Regenerating with the record's own settings + seed reproduces
        // the board the matchmaker generated and exposes the effective
        // settings (spec 006 Implementation Notes: the clamped value is
        // surfaced via `TerrainGenerationResult.effectiveSettings`).
        const generation = regenerateBoard(match);
        expect(generation.effectiveSettings.terrainSmoothing).toBe(2);

        // Byte-identity: the engine session's board WAS generated with
        // exactly these settings — the passthrough is real.
        expectBoardMatchesRegeneration(server, generation);

        await matchmaker.close();
    });

    it('(b) terrainSmoothing: 99 → clamped to 8 and surfaced via effectiveSettings', async () => {
        const { server, matchmaker, matchId } = setupStartedMatch({ terrainSettings: { terrainSmoothing: 99 } });

        const match = matchmaker.getMatch(matchId);
        expect(match).toBeDefined();
        if (match === undefined) {
            throw new Error('match record missing');
        }

        // The matchmaker is a pass-through: the record carries the raw
        // caller value (no clamping at the matchmaking layer).
        expect(match.settings.terrainSettings.terrainSmoothing).toBe(99);

        // Clamping is terrain's job (spec 003 FR-008): the generated
        // board's effective settings surface the clamped value 8.
        const generation = regenerateBoard(match);
        expect(generation.effectiveSettings.terrainSmoothing).toBe(8);

        expectBoardMatchesRegeneration(server, generation);

        await matchmaker.close();
    });

    it('(c) no override → default 4 flows through and is surfaced', async () => {
        const { server, matchmaker, matchId } = setupStartedMatch();

        const match = matchmaker.getMatch(matchId);
        expect(match).toBeDefined();
        if (match === undefined) {
            throw new Error('match record missing');
        }

        // `DEFAULT_GENERATION_SETTINGS.terrainSmoothing` (4) flows
        // through `MatchSettings.terrainSettings` automatically.
        expect(match.settings.terrainSettings.terrainSmoothing).toBe(DEFAULT_GENERATION_SETTINGS.terrainSmoothing);
        expect(match.settings.terrainSettings.terrainSmoothing).toBe(4);

        const generation = regenerateBoard(match);
        expect(generation.effectiveSettings.terrainSmoothing).toBe(4);

        expectBoardMatchesRegeneration(server, generation);

        await matchmaker.close();
    });

    it('(d) a rematch reuses the original smoothing value (fresh initialSeed + settings carry-over)', async () => {
        const { server, matchmaker, matchId, seats } = setupStartedMatch({ terrainSettings: { terrainSmoothing: 2 } });

        const original = matchmaker.getMatch(matchId);
        if (original === undefined) {
            throw new Error('original match record missing');
        }
        const originalSeed = original.initialSeed;
        const originalSmoothing = original.settings.terrainSettings.terrainSmoothing;
        expect(originalSmoothing).toBe(2);

        // Finish the match with NO forfeits so every original seat stays
        // eligible to vote on the rematch.
        const winner = seats[1].playerId;
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

        // Settings carry over by construction: the rematch reuses the
        // original match's settings (spec 006 Implementation Notes).
        expect(newMatch.settings.terrainSettings.terrainSmoothing).toBe(originalSmoothing);
        expect(newMatch.settings.terrainSettings.terrainSmoothing).toBe(2);

        // FR-009: the rematch match carries a FRESH pre-minted seed
        // (distinct from the original match's seed).
        expect(originalSeed).not.toBeNull();
        expect(typeof newMatch.initialSeed).toBe('number');
        expect(newMatch.initialSeed).not.toBeNull();
        expect(newMatch.initialSeed).not.toBe(originalSeed);

        await matchmaker.close();
    });
});
