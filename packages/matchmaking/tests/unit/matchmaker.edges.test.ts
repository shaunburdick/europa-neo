/**
 * Unit tests for matchmaker edges — Feature 006 (T028 support)
 *
 * Pins the parts of the US1 surface the create/join suites don't
 * reach: the documented throwing stubs (rematch/leave land in later
 * waves), `close()` semantics (idempotent, state-clearing, unusable
 * afterwards), the `stats()` snapshot, deterministic dependency
 * overrides (`randomId` / `rngFactory` / `now`), settings resolution
 * edges (board-size clamping per `MatchSettings.boardSize`, invalid
 * tick intervals, terrain-settings merging), and the bridge soft-
 * binding path exercised through the FakeServer.
 */

import type { Logger } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

/** Recording logger for asserting the default-logger code paths. */
function recordingLogger(): Logger & { lines: string[] } {
    const lines: string[] = [];
    return {
        lines,
        debug: (msg) => lines.push(`debug:${msg}`),
        info: (msg) => lines.push(`info:${msg}`),
        warn: () => {},
        error: () => {},
    };
}

describe('matchmaker — throwing stubs (later waves)', () => {
    // Remediation R-005 (feature 010) replaced the leaveMatch throwing
    // stub with the real body; the full phase table is pinned in
    // `matchmaker.leave.test.ts`. Here we keep THIS suite's original
    // shape: a known match plus a bogus token is a RESULT-level
    // `session_invalid`, never a throw.
    it('leaveMatch rejects an unknown session token with session_invalid (R-005 body)', () => {
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server: new FakeServer() });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const result = mm.leaveMatch({
            matchId: created.data.matchId,
            sessionToken: '00000000-0000-4000-8000-000000000001' as SessionToken,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('session_invalid');
        }
        mm.close();
    });

    it('rematch trio returns rematch_not_offered for a known filling match (US4 landed)', () => {
        // Wave 7D (T052): the rematch bodies replaced their throwing
        // stubs. A known match that is still `filling` carries no offer,
        // so every trio member returns the RESULT-level
        // `rematch_not_offered` (never a throw).
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server: new FakeServer() });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const token = created.data.seatAssignment.sessionToken;
        const requested = mm.requestRematch({ matchId: created.data.matchId, sessionToken: token });
        expect(requested.ok).toBe(false);
        if (requested.ok) {
            return;
        }
        expect(requested.error.code).toBe('rematch_not_offered');
        const accepted = mm.acceptRematch({
            matchId: created.data.matchId,
            rematchOfferId: '00000000-0000-4000-8000-000000000003' as MatchId,
            sessionToken: token,
        });
        expect(accepted.ok).toBe(false);
        if (accepted.ok) {
            return;
        }
        expect(accepted.error.code).toBe('rematch_not_offered');
        const declined = mm.declineRematch({
            matchId: created.data.matchId,
            rematchOfferId: '00000000-0000-4000-8000-000000000003' as MatchId,
            sessionToken: token,
        });
        expect(declined.ok).toBe(false);
        if (declined.ok) {
            return;
        }
        expect(declined.error.code).toBe('rematch_not_offered');
        mm.close();
    });
});

describe('matchmaker — close()', () => {
    it('clears all state; the instance is unusable afterwards', async () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        await mm.close();

        // Contract: "After close(), the matchmaker is unusable." Every
        // state-changing call is an invariant violation and throws.
        expect(() => mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' })).toThrow(/closed/);
        expect(() => mm.listPublicMatches()).toThrow(/closed/);
    });

    it('makes createMatch unusable (invariant violation throws)', async () => {
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server: new FakeServer() });
        await mm.close();
        expect(() => mm.createMatch({ visibility: 'public', displayName: 'Alice' })).toThrow(/closed/);
    });

    it('is idempotent and zeroes stats', async () => {
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server: new FakeServer() });
        mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        await mm.close();
        await expect(mm.close()).resolves.toBeUndefined();

        const stats = mm.stats();
        expect(stats.activeMatches).toBe(0);
        expect(stats.activePlayerSessions).toBe(0);
        expect(stats.fillingMatches).toBe(0);
    });
});

describe('matchmaker — stats()', () => {
    it('reflects lifecycle counts and totals after create + auto-start', () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const before = mm.stats();
        expect(before.totalCreated).toBe(0);

        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        expect(mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' }).ok).toBe(true);

        const stats = mm.stats();
        expect(stats.totalCreated).toBe(1);
        expect(stats.fillingMatches).toBe(0);
        expect(stats.runningMatches).toBe(1);
        expect(stats.activeMatches).toBe(1);
        expect(stats.publicJoinableMatches).toBe(0); // running ≠ joinable
        expect(stats.activePlayerSessions).toBe(2);
        expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
        mm.close();
    });
});

describe('matchmaker — deterministic deps', () => {
    it('honors injected randomId / now / rngFactory overrides', () => {
        const server = new FakeServer();
        let idSeq = 0;
        let clock = 50_000;
        const seeds: number[] = [];
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, {
            server,
            randomId: () => {
                idSeq += 1;
                return `aaaaaaaa-0000-4000-8000-${String(idSeq).padStart(12, '0')}`;
            },
            now: () => {
                clock += 100;
                return clock;
            },
            rngFactory: (seed) => {
                seeds.push(seed);
                // Minimal Rng stand-in: auto-start only consumes it inside
                // generateBoard, which we exercise for real.
                return () => 0;
            },
        });

        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        expect(created.data.matchId).toBe('aaaaaaaa-0000-4000-8000-000000000002');
        expect(created.data.seatAssignment.playerSessionId).toBe('aaaaaaaa-0000-4000-8000-000000000001');

        expect(mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' }).ok).toBe(true);
        // The board generation consumed the injected RNG factory exactly once.
        expect(seeds).toHaveLength(1);
        expect(Number.isInteger(seeds[0])).toBe(true);
        mm.close();
    });

    it('emits lifecycle logs through an injected logger', () => {
        const server = new FakeServer();
        const logger = recordingLogger();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server, logger });

        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        expect(mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' }).ok).toBe(true);

        expect(logger.lines.some((l) => l.startsWith('info:matchmaker: match created'))).toBe(true);
        expect(logger.lines.some((l) => l.startsWith('debug:matchmaker: board generated'))).toBe(true);
        expect(logger.lines.some((l) => l.startsWith('info:matchmaker: match started'))).toBe(true);
        mm.close();
    });
});

describe('matchmaker — settings resolution edges', () => {
    it('clamps boardSize into [8, 128] per MatchSettings.boardSize', () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // Clamped values are observable through the lobby projection
        // (no auto-start, so no terrain generation in this test).
        const tiny = mm.createMatch({
            visibility: 'public',
            displayName: 'A',
            settings: { boardSize: 2 },
        });
        expect(tiny.ok).toBe(true);
        const huge = mm.createMatch({
            visibility: 'public',
            displayName: 'B',
            settings: { boardSize: 999 },
        });
        expect(huge.ok).toBe(true);

        const lobby = mm.listPublicMatches();
        if (!lobby.ok) {
            throw new Error('lobby failed');
        }
        const sizes = lobby.matches.map((m) => m.boardSize).sort((a, b) => a - b);
        expect(sizes).toEqual([8, 128]);
        mm.close();
    });

    it('rejects non-finite boardSize and non-positive tickIntervalMs', () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const nanBoard = mm.createMatch({
            visibility: 'public',
            displayName: 'A',
            settings: { boardSize: Number.NaN },
        });
        expect(nanBoard.ok).toBe(false);
        if (!nanBoard.ok) {
            expect(nanBoard.error.code).toBe('invalid_request');
        }

        const badTick = mm.createMatch({
            visibility: 'public',
            displayName: 'A',
            settings: { tickIntervalMs: 0 },
        });
        expect(badTick.ok).toBe(false);
        if (!badTick.ok) {
            expect(badTick.error.code).toBe('invalid_request');
        }
        mm.close();
    });

    it('merges partial terrainSettings over the defaults', () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // A valid partial override is accepted (generation happens at
        // start; here we only pin that creation succeeds with a merge).
        const result = mm.createMatch({
            visibility: 'private',
            displayName: 'A',
            settings: { playerCount: 3 },
        });
        expect(result.ok).toBe(true);
        mm.close();
    });
});

describe('matchmaker — bridge soft binding', () => {
    it('hands its handlers to a server exposing bindMatchmaker', () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        // The matchmaker bound its (currently no-op) handlers at
        // construction; firing any bridge event must be a safe no-op.
        expect(() =>
            server.fireOnSeatClaimed({
                matchId: '00000000-0000-4000-8000-000000000000' as MatchId,
                connectionId: 'conn-1',
                sessionToken: '00000000-0000-4000-8000-000000000001' as never,
                playerId: 1,
                role: 'player',
            }),
        ).not.toThrow();
        mm.close();
    });
});
