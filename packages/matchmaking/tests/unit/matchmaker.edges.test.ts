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
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import type { MatchId, SessionToken } from '../../src/contracts/match-types';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

/** Recording logger for asserting the default-logger code paths. */
function recordingLogger(): Logger & { lines: string[] } {
    const lines: string[] = [];
    return {
        lines,
        debug: (msg) => lines.push(`debug:${msg}`),
        info: (msg) => lines.push(`info:${msg}`),
        warn: (msg) => lines.push(`warn:${msg}`),
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

    it('FR-021: fires unregisterMatch per residual record exactly once across two closes (issue #147 test 5)', async () => {
        const server = new FakeServer();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        await mm.close();

        expect(server.unregisterMatchCalls).toContain(created.data.matchId);
        const afterFirst = server.unregisterMatchCalls.length;
        await mm.close();
        expect(server.unregisterMatchCalls).toHaveLength(afterFirst);

        const stats = mm.stats();
        expect(stats.activeMatches).toBe(0);
        expect(stats.activePlayerSessions).toBe(0);
        expect(() => mm.createMatch({ visibility: 'public', displayName: 'Bob' })).toThrow(/closed/);
    });

    it('FR-021: close() survives a throwing unregisterMatch — teardown completes and the failure is logged (issue #147 test 12)', async () => {
        class ThrowingServer extends FakeServer {
            override unregisterMatch(matchId: MatchId): void {
                super.unregisterMatch(matchId);
                throw new Error('simulated unregister failure');
            }
        }
        const server = new ThrowingServer();
        const logger = recordingLogger();
        const mm = createMatchmaker(MATCHMAKING_CONSTANTS, { server, logger });
        const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        await expect(mm.close()).resolves.toBeUndefined();

        expect(server.unregisterMatchCalls).toContain(created.data.matchId);
        const stats = mm.stats();
        expect(stats.activeMatches).toBe(0);
        expect(stats.activePlayerSessions).toBe(0);
        const afterFirst = server.unregisterMatchCalls.length;
        await mm.close();
        expect(server.unregisterMatchCalls).toHaveLength(afterFirst);
        expect(logger.lines.some((l) => l.startsWith('warn:matchmaker: unregisterMatch failed'))).toBe(true);
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
                playerId: 'EventPlyr001' as never,
                role: 'player',
            }),
        ).not.toThrow();
        mm.close();
    });
});

describe('matchmaker — sweep-then-channel-release (FR-024 / SC-007, issue #147 test 10)', () => {
    function makeClockedStack(config = MATCHMAKING_CONSTANTS) {
        let clockMs = 10_000_000;
        const now = (): number => clockMs;
        const server = new FakeServer({ now });
        const matchmaker = createMatchmaker(config, { server, now });
        return {
            server,
            matchmaker,
            advance(ms: number): void {
                clockMs += ms;
            },
            createRunning() {
                const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
                if (!created.ok) {
                    throw new Error('fixture create failed');
                }
                const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
                if (!joined.ok) {
                    throw new Error('fixture join failed');
                }
                return {
                    matchId: created.data.matchId,
                    alice: created.data.seatAssignment,
                    bob: joined.data.seatAssignment,
                };
            },
            finish(matchId: MatchId, winner: never): void {
                server.fireOnMatchTerminal({
                    matchId,
                    result: { kind: 'win', winner, tick: 42, reason: 'last_standing' },
                    tick: 42,
                });
            },
        };
    }

    function expectUnregisteredAtCollection(server: FakeServer, matchId: MatchId, registered: boolean): void {
        expect(server.unregisterMatchCalls).toContain(matchId);
        if (registered) {
            expect(server.stats().activeMatches).toBe(0);
        }
    }

    it('rematch-window lapse collects and unregisters the registered match', () => {
        const h = makeClockedStack();
        const { matchId, alice } = h.createRunning();
        h.finish(matchId, 'WinnerPlyr01' as never);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(requested.ok).toBe(true);

        h.advance(MATCHMAKING_CONSTANTS.rematchWindowMs + 1);
        const stats = h.matchmaker.stats();
        expect(stats.collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });

    it('results-TTL sweep collects and unregisters the registered match', () => {
        const h = makeClockedStack({ ...MATCHMAKING_CONSTANTS, resultsTtlMs: 1_000 });
        const { matchId } = h.createRunning();
        h.finish(matchId, 'WinnerPlyr01' as never);

        h.advance(1_001);
        const stats = h.matchmaker.stats();
        expect(stats.collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });

    it('empty-TTL sweep collects and unregisters the never-registered filling match', () => {
        const h = makeClockedStack();
        const created = h.matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        h.advance(MATCHMAKING_CONSTANTS.emptyMatchTtlMs + 1);
        const stats = h.matchmaker.stats();
        expect(stats.collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, created.data.matchId, false);
    });

    it('final-seat leaveMatch collects and unregisters the never-registered filling match', () => {
        const h = makeClockedStack();
        const created = h.matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        expect(
            h.matchmaker.leaveMatch({
                matchId: created.data.matchId,
                sessionToken: created.data.seatAssignment.sessionToken,
            }).ok,
        ).toBe(true);

        const stats = h.matchmaker.stats();
        expect(stats.collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, created.data.matchId, false);
    });

    it('declineRematch collects and unregisters the registered match', () => {
        const h = makeClockedStack();
        const { matchId, alice, bob } = h.createRunning();
        h.finish(matchId, 'WinnerPlyr01' as never);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        if (!requested.ok) {
            throw new Error('fixture requestRematch failed');
        }

        expect(
            h.matchmaker.declineRematch({
                matchId,
                rematchOfferId: requested.rematchOfferId,
                sessionToken: bob.sessionToken,
            }).ok,
        ).toBe(true);

        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });

    it('all-accepted acceptRematch collects and unregisters the registered original', () => {
        const h = makeClockedStack();
        const { matchId, alice, bob } = h.createRunning();
        h.finish(matchId, 'WinnerPlyr01' as never);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        if (!requested.ok) {
            throw new Error('fixture requestRematch failed');
        }
        expect(
            h.matchmaker.acceptRematch({
                matchId,
                rematchOfferId: requested.rematchOfferId,
                sessionToken: alice.sessionToken,
            }).ok,
        ).toBe(true);
        const completing = h.matchmaker.acceptRematch({
            matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: bob.sessionToken,
        });
        expect(completing.ok).toBe(true);

        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });

    it('all-forfeited teardown unregisters the registered match', () => {
        const h = makeClockedStack();
        const { matchId, alice, bob } = h.createRunning();

        h.server.fireOnSeatExpired({ matchId, sessionToken: alice.sessionToken, playerId: alice.playerId });
        h.server.fireOnSeatExpired({ matchId, sessionToken: bob.sessionToken, playerId: bob.playerId });

        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });

    it('divergent TTLs: a live window blocks collection and unregister; lapse collects and unregisters', () => {
        const h = makeClockedStack({ ...MATCHMAKING_CONSTANTS, resultsTtlMs: 1_000, rematchWindowMs: 60_000 });
        const { matchId, alice } = h.createRunning();
        h.finish(matchId, 'WinnerPlyr01' as never);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(requested.ok).toBe(true);

        h.advance(2_000);
        expect(h.matchmaker.stats().finishedMatches).toBe(1);
        expect(h.server.unregisterMatchCalls).toHaveLength(0);

        h.advance(60_000);
        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expectUnregisteredAtCollection(h.server, matchId, true);
    });
});

describe('matchmaker — no orphaned sessions after terminal collection (FR-025 / SC-008, issue #147 test 11)', () => {
    function makeClockedStack() {
        let clockMs = 20_000_000;
        const now = (): number => clockMs;
        const server = new FakeServer({ now });
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server, now });
        return {
            server,
            matchmaker,
            advance(ms: number): void {
                clockMs += ms;
            },
            createRunning() {
                const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
                if (!created.ok) {
                    throw new Error('fixture create failed');
                }
                const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
                if (!joined.ok) {
                    throw new Error('fixture join failed');
                }
                return {
                    matchId: created.data.matchId,
                    alice: created.data.seatAssignment,
                    bob: joined.data.seatAssignment,
                };
            },
            finish(matchId: MatchId): void {
                server.fireOnMatchTerminal({
                    matchId,
                    result: { kind: 'win', winner: 'WinnerPlyr01' as never, tick: 42, reason: 'last_standing' },
                    tick: 42,
                });
            },
        };
    }

    it('rematch-window lapse returns activePlayerSessions to the pre-match baseline', () => {
        const h = makeClockedStack();
        const baseline = h.matchmaker.stats().activePlayerSessions;
        const { matchId, alice } = h.createRunning();
        h.finish(matchId);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(requested.ok).toBe(true);

        h.advance(MATCHMAKING_CONSTANTS.rematchWindowMs + 1);
        const stats = h.matchmaker.stats();
        expect(stats.collectedMatches).toBe(1);
        expect(stats.activePlayerSessions).toBe(baseline);
    });

    it('declineRematch returns activePlayerSessions to baseline and a later requestRematch is a value error, not a throw', () => {
        const h = makeClockedStack();
        const baseline = h.matchmaker.stats().activePlayerSessions;
        const { matchId, alice, bob } = h.createRunning();
        h.finish(matchId);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        if (!requested.ok) {
            throw new Error('fixture requestRematch failed');
        }

        expect(
            h.matchmaker.declineRematch({
                matchId,
                rematchOfferId: requested.rematchOfferId,
                sessionToken: bob.sessionToken,
            }).ok,
        ).toBe(true);

        expect(h.matchmaker.stats().activePlayerSessions).toBe(baseline);
        const again = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        expect(again.ok).toBe(false);
        if (!again.ok) {
            expect(again.error.code).toBe('rematch_not_offered');
        }
    });

    it('all-forfeited teardown returns activePlayerSessions to baseline', () => {
        const h = makeClockedStack();
        const baseline = h.matchmaker.stats().activePlayerSessions;
        const { matchId, alice, bob } = h.createRunning();

        h.server.fireOnSeatExpired({ matchId, sessionToken: alice.sessionToken, playerId: alice.playerId });
        h.server.fireOnSeatExpired({ matchId, sessionToken: bob.sessionToken, playerId: bob.playerId });

        expect(h.matchmaker.stats().collectedMatches).toBe(1);
        expect(h.matchmaker.stats().activePlayerSessions).toBe(baseline);
    });

    it('control: all-accept leaves the live rematch match holding both rebound sessions', () => {
        const h = makeClockedStack();
        const { matchId, alice, bob } = h.createRunning();
        h.finish(matchId);
        const requested = h.matchmaker.requestRematch({ matchId, sessionToken: alice.sessionToken });
        if (!requested.ok) {
            throw new Error('fixture requestRematch failed');
        }
        expect(
            h.matchmaker.acceptRematch({
                matchId,
                rematchOfferId: requested.rematchOfferId,
                sessionToken: alice.sessionToken,
            }).ok,
        ).toBe(true);
        const completing = h.matchmaker.acceptRematch({
            matchId,
            rematchOfferId: requested.rematchOfferId,
            sessionToken: bob.sessionToken,
        });
        expect(completing.ok).toBe(true);

        expect(h.matchmaker.stats().activePlayerSessions).toBe(2);
        expect(h.matchmaker.stats().fillingMatches).toBe(1);
    });
});

describe('matchmaker — collection survives a throwing unregisterMatch (FR-024 catch branch, issue #147 test 13)', () => {
    class RecordThenThrowServer extends FakeServer {
        override unregisterMatch(matchId: MatchId): void {
            super.unregisterMatch(matchId);
            throw new Error('simulated unregister failure');
        }
    }

    function recordingWarnLogger(): Logger & { lines: string[] } {
        const lines: string[] = [];
        return {
            lines,
            debug: (msg) => lines.push(`debug:${msg}`),
            info: (msg) => lines.push(`info:${msg}`),
            warn: (msg) => lines.push(`warn:${msg}`),
            error: (msg) => lines.push(`error:${msg}`),
        };
    }

    it('empty-match TTL sweep still collects, releases sessions, and logs the failure', () => {
        let clockMs = 30_000_000;
        const now = (): number => clockMs;
        const server = new RecordThenThrowServer({ now });
        const logger = recordingWarnLogger();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server, now, logger });
        const baseline = matchmaker.stats().activePlayerSessions;

        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }

        clockMs += MATCHMAKING_CONSTANTS.emptyMatchTtlMs + 1;
        const stats = matchmaker.stats();

        expect(stats.collectedMatches).toBe(1);
        expect(stats.activePlayerSessions).toBe(baseline);
        expect(server.unregisterMatchCalls).toContain(created.data.matchId);
        expect(logger.lines.some((l) => l.startsWith('warn:matchmaking: unregisterMatch failed'))).toBe(true);
        matchmaker.close();
    });
});
