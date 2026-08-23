/**
 * Unit tests for new MatchId + seed creation — Feature 006 (T050)
 *
 * Covers FR-009 "fresh map generation once all accept": the rematch
 * match is a brand-new entity — distinct UUID v4 MatchId, fresh uint32
 * seed different from the original's, `/join/<newMatchId>` share path,
 * original participants auto-seated at their prior `seatIndex` with
 * NEW session tokens (research.md §5), and identical visibility.
 *
 * Two observation levels:
 *   1. Matchmaker-level via the public API (ids, seat parity, status).
 *   2. Lifecycle-level white-box on the shared record factory
 *      (`createRematchMatchRecord`), which is where the fresh seed is
 *      minted at creation time per FR-007/FR-009 — the new match stays
 *      in `filling` (Q-M05), so its seed cannot ride a
 *      `registerMatch` call and must live on the record itself
 *      (`MatchRecord.initialSeed`, additive internal field).
 *
 * Test descriptions cite the requirement they pin.
 */

import type { PlayerId } from '@europa/engine';
import { DEFAULT_GENERATION_SETTINGS } from '@europa/terrain';
import { describe, expect, it } from 'vitest';
import type { MatchId, PlayerSessionId, SessionToken } from '../../contracts/match-types';

import { createMatchRecord } from '../../src/internal/matchRecord';
import type { PlayerSession } from '../../src/internal/playerSession';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { createRematchMatchRecord, transitionRunningToFinished } from '../../src/matchLifecycle';
import { makeFinished2pScenario } from '../fixtures/rematchScenario';

const ORIGINAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as MatchId;
const ORIGINAL_SEED = 123456789;

/** Minimal finished-state results stub (the transition only stores it). */
const RESULTS_STUB = {
  matchId: ORIGINAL_ID,
  tick: 1,
  effectiveSeed: ORIGINAL_SEED,
  result: { kind: 'win', winner: 1 as const, tick: 1, reason: 'last_standing' },
  finalBoardHash: 'stub',
  finalPlayers: [],
};

/** Build a finished 2-player original record plus its two sessions. */
function makeOriginalFixture(nowMs: number): {
  readonly record: ReturnType<typeof createMatchRecord>;
  readonly alice: PlayerSession;
  readonly bob: PlayerSession;
} {
  const record = createMatchRecord({
    matchId: ORIGINAL_ID,
    visibility: 'private',
    settings: {
      playerCount: 2,
      boardSize: 24,
      tickIntervalMs: 250,
      terrainSettings: DEFAULT_GENERATION_SETTINGS,
    },
    createdAtMs: nowMs - 1000,
  });
  record.engineConfig = {
    boardSize: 24,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: ORIGINAL_SEED,
    visibilityRadius: 6,
  };

  const alice: PlayerSession = {
    playerSessionId: 'p-alice' as PlayerSessionId,
    displayName: 'Alice',
    currentMatchId: record.matchId,
    currentSeatIndex: 0,
    currentSessionToken: 'tok-a' as SessionToken,
    createdAtMs: nowMs - 1000,
    lastSeenAtMs: nowMs - 1000,
  };
  const bob: PlayerSession = {
    playerSessionId: 'p-bob' as PlayerSessionId,
    displayName: 'Bob',
    currentMatchId: record.matchId,
    currentSeatIndex: 1,
    currentSessionToken: 'tok-b' as SessionToken,
    createdAtMs: nowMs - 1000,
    lastSeenAtMs: nowMs - 1000,
  };
  record.seats.set(
    0,
    createSeatRecord({
      seatIndex: 0,
      playerSessionId: alice.playerSessionId,
      displayName: 'Alice',
      sessionToken: alice.currentSessionToken,
      playerId: 1 as PlayerId,
      connectedAtMs: nowMs - 1000,
    }),
  );
  record.seats.set(
    1,
    createSeatRecord({
      seatIndex: 1,
      playerSessionId: bob.playerSessionId,
      displayName: 'Bob',
      sessionToken: bob.currentSessionToken,
      playerId: 2 as PlayerId,
      connectedAtMs: nowMs - 1000,
    }),
  );
  // White-box: place the record in `running` so the legal
  // running → finished transition can stamp the finish fields.
  record.status = 'running';
  transitionRunningToFinished(record, RESULTS_STUB, nowMs);
  return { record, alice, bob };
}

describe('all-accept creates a genuinely fresh match (FR-009 / T050)', () => {
  /** Run the full handshake; returns the scenario plus the new match id. */
  function runHandshake(): ReturnType<typeof makeFinished2pScenario> & {
    readonly newMatchId: MatchId;
  } {
    const scenario = makeFinished2pScenario();
    const requested = scenario.matchmaker.requestRematch({
      matchId: scenario.matchId,
      sessionToken: scenario.alice.sessionToken,
    });
    if (!requested.ok) throw new Error('fixture request failed');
    const aliceAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.alice.sessionToken,
    });
    if (!aliceAccept.ok) throw new Error('fixture alice accept failed');
    const bobAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.bob.sessionToken,
    });
    if (!bobAccept.ok || !bobAccept.allAccepted || bobAccept.newMatchId === undefined) {
      throw new Error('fixture: all-accept did not resolve');
    }
    return { ...scenario, newMatchId: bobAccept.newMatchId };
  }

  it('FR-009: the new MatchId is a distinct UUID v4', () => {
    const { matchmaker, matchId, newMatchId } = runHandshake();
    expect(newMatchId).not.toBe(matchId);
    expect(newMatchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    matchmaker.close();
  });

  it('US4 AC-2: participants auto-seated at prior seatIndex with fresh tokens', () => {
    const scenario = makeFinished2pScenario();
    const requested = scenario.matchmaker.requestRematch({
      matchId: scenario.matchId,
      sessionToken: scenario.alice.sessionToken,
    });
    if (!requested.ok) throw new Error('fixture request failed');
    void scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.alice.sessionToken,
    });
    const bobAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.bob.sessionToken,
    });
    expect(bobAccept.ok).toBe(true);
    if (!bobAccept.ok) return;
    const seat = bobAccept.newSeatAssignment;
    expect(seat).toBeDefined();
    if (seat === undefined) return;
    // Bob keeps his seat (1) and provisional playerId (2)…
    expect(seat.seatIndex).toBe(scenario.bob.seatIndex);
    expect(seat.playerId).toBe(scenario.bob.playerId);
    expect(seat.displayName).toBe('Bob');
    // …but receives a NEW session token for the new match (research §5).
    expect(seat.sessionToken).not.toBe(scenario.bob.sessionToken);
    scenario.matchmaker.close();
  });

  it('US4 AC-2: the new match sits in filling while the resolved original is collected', () => {
    const { matchmaker, newMatchId } = runHandshake();
    const stats = matchmaker.stats();
    expect(stats.fillingMatches).toBe(1);
    expect(stats.finishedMatches).toBe(0);
    expect(stats.collectedMatches).toBe(1);
    expect(stats.totalCreated).toBe(2);

    // A public original yields a public, lobby-visible new match.
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches.some((m) => m.matchId === newMatchId)).toBe(true);
    matchmaker.close();
  });

  it('US3 parity: a private original produces a private rematch never lobby-listed', () => {
    const scenario = makeFinished2pScenario({ visibility: 'private' });
    const requested = scenario.matchmaker.requestRematch({
      matchId: scenario.matchId,
      sessionToken: scenario.alice.sessionToken,
    });
    if (!requested.ok) throw new Error('fixture request failed');
    void scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.alice.sessionToken,
    });
    const bobAccept = scenario.matchmaker.acceptRematch({
      matchId: scenario.matchId,
      rematchOfferId: requested.rematchOfferId,
      sessionToken: scenario.bob.sessionToken,
    });
    expect(bobAccept.ok).toBe(true);
    if (!bobAccept.ok || bobAccept.newMatchId === undefined) {
      throw new Error('fixture: all-accept did not resolve');
    }

    const lobby = scenario.matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches.some((m) => m.matchId === bobAccept.newMatchId)).toBe(false);
    scenario.matchmaker.close();
  });

  it('FR-009: the factory mints a fresh seed + /join path + re-seated seats', () => {
    const nowMs = 7_777_777;
    const fixture = makeOriginalFixture(nowMs);

    // Deterministic id sequence: first draw becomes the new MatchId.
    const scriptedIds = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
    let idCursor = 0;
    const randomId = (): string => {
      const id = scriptedIds[idCursor];
      idCursor += 1;
      return id ?? 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    };

    const { match, seats } = createRematchMatchRecord({
      original: fixture.record,
      participants: [
        { session: fixture.alice, seatIndex: 0 },
        { session: fixture.bob, seatIndex: 1 },
      ],
      nowMs,
      randomId,
    });

    // Fresh identity + share path.
    expect(match.matchId).not.toBe(fixture.record.matchId);
    expect(match.joinPath).toBe(`/join/${match.matchId}`);
    // Fresh uint32 seed, different from the original's engine seed.
    expect(match.initialSeed).not.toBeNull();
    expect(match.initialSeed).not.toBe(ORIGINAL_SEED);
    expect(match.initialSeed).toBeGreaterThanOrEqual(0);
    expect(match.initialSeed).toBeLessThanOrEqual(0xffffffff);
    // Both participants re-seated at prior indices with NEW tokens.
    expect(seats.map((s) => s.seatIndex)).toEqual([0, 1]);
    expect(seats[0]?.sessionToken).not.toBe('tok-a');
    expect(seats[1]?.sessionToken).not.toBe('tok-b');
    // Sessions rebound to the new match/seat/token.
    expect(fixture.alice.currentMatchId).toBe(match.matchId);
    expect(fixture.bob.currentMatchId).toBe(match.matchId);
    expect(fixture.alice.currentSessionToken).toBe(seats[0]?.sessionToken);
    expect(fixture.bob.currentSessionToken).toBe(seats[1]?.sessionToken);
  });

  it('FR-009: the factory copies visibility and settings from the original record', () => {
    const nowMs = 7_777_777;
    const fixture = makeOriginalFixture(nowMs);

    const { match } = createRematchMatchRecord({
      original: fixture.record,
      participants: [
        { session: fixture.alice, seatIndex: 0 },
        { session: fixture.bob, seatIndex: 1 },
      ],
      nowMs,
      randomId: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    expect(match.visibility).toBe(fixture.record.visibility);
    expect(match.settings).toBe(fixture.record.settings);
  });
});
