/**
 * Unit tests for `joinMatch` auto-start — Feature 006 (T024)
 *
 * Covers FR-007 + spec US1 AC-2: joining the last free seat of a
 * public match returns seat 1 / playerId 2 and atomically transitions
 * the match to `running` (board generation + engine session +
 * `registerMatch` + per-seat `attachPlayer` + `enableSpectators`);
 * late joiners get `match_full`; unknown ids get the single
 * `match_not_found` code path (FR-006).
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId, SessionToken } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

/** Create a public 1/2-filled match; returns the matchmaker + id. */
function makeOpenMatch() {
  const server = new FakeServer();
  const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
  const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
  if (!created.ok) {
    throw new Error('fixture create failed');
  }
  return { server, matchmaker, matchId: created.data.matchId };
}

describe('joinMatch — last seat fills (US1 AC-2)', () => {
  it('FR-007: assigns seat 1 / playerId 2 to the joiner', () => {
    const { matchmaker, matchId } = makeOpenMatch();

    const join = matchmaker.joinMatch({ matchId, displayName: 'Bob' });

    expect(join.ok).toBe(true);
    if (!join.ok) {
      return;
    }
    expect(join.data.seatAssignment.seatIndex).toBe(1);
    expect(join.data.seatAssignment.playerId).toBe(2);
    expect(join.data.seatAssignment.displayName).toBe('Bob');
    expect(join.data.matchId).toBe(matchId);
    expect(join.data.joinPath).toBe(`/join/${matchId}`);
    matchmaker.close();
  });

  it('FR-007: atomically starts the engine — register ×1, attach ×2, spectators on', () => {
    const { server, matchmaker, matchId } = makeOpenMatch();

    const join = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
    expect(join.ok).toBe(true);

    // One registerMatch carrying a real engine session + frozen config.
    expect(server.registerMatchCalls).toHaveLength(1);
    const [registration] = server.registerMatchCalls;
    expect(registration?.matchId).toBe(matchId);
    expect(registration?.engineSession).toBeTruthy();
    expect(typeof registration?.engineSession.world()).toBe('object');
    expect(registration?.matchConfig.boardSize).toBe(32);
    expect(registration?.matchConfig.playerCount).toBe(2);
    expect(Number.isInteger(registration?.matchConfig.seed)).toBe(true);

    // Per-seat attach in seat order with the issued tokens.
    expect(server.attachPlayerCalls).toHaveLength(2);
    expect(server.attachPlayerCalls[0]?.playerId).toBe(1);
    expect(server.attachPlayerCalls[1]?.playerId).toBe(2);

    // Spectators enabled exactly once.
    expect(server.enableSpectatorsCalls).toEqual([matchId]);

    // The match is running: lobby empty, stats reflect the transition.
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok && lobby.matches).toHaveLength(0);
    expect(matchmaker.stats().runningMatches).toBe(1);
    expect(matchmaker.stats().fillingMatches).toBe(0);
    matchmaker.close();
  });

  it('FR-007: does NOT start anything while seats remain free', () => {
    const { server, matchmaker, matchId } = makeOpenMatch();

    // A failed join attempt (bad name) must not touch networking either.
    const bad = matchmaker.joinMatch({ matchId, displayName: '' });
    expect(bad.ok).toBe(false);
    expect(server.registerMatchCalls).toHaveLength(0);
    expect(server.attachPlayerCalls).toHaveLength(0);
    matchmaker.close();
  });
});

describe('joinMatch — rejections', () => {
  it('spec edge case / FR-007: a joiner arriving after the fill gets match_full', () => {
    const { matchmaker, matchId } = makeOpenMatch();
    expect(matchmaker.joinMatch({ matchId, displayName: 'Bob' }).ok).toBe(true);

    const late = matchmaker.joinMatch({ matchId, displayName: 'Carol' });

    expect(late.ok).toBe(false);
    if (late.ok) {
      return;
    }
    expect(late.error.code).toBe('match_full');
    matchmaker.close();
  });

  it('FR-006: an unknown matchId returns the single match_not_found code path', () => {
    const { matchmaker } = makeOpenMatch();

    const result = matchmaker.joinMatch({
      matchId: '00000000-0000-4000-8000-000000000000' as MatchId,
      displayName: 'Bob',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('match_not_found');
    expect(result.error.message).not.toContain('private');
    matchmaker.close();
  });

  it('FR-001: rejects an invalid displayName with invalid_request', () => {
    const { matchmaker, matchId } = makeOpenMatch();

    const result = matchmaker.joinMatch({ matchId, displayName: '' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });

  it('reconnect slice: an unknown reconnectToken gets match_not_found (no leak)', () => {
    const { matchmaker, matchId } = makeOpenMatch();

    const result = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
      reconnectToken: '00000000-0000-4000-8000-999999999999' as SessionToken,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('match_not_found');
    matchmaker.close();
  });

  it('reconnect slice: a known token reports seat_taken (claim flows land with US5)', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
    const alice = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!alice.ok) {
      throw new Error('fixture create failed');
    }
    const token = alice.data.seatAssignment.sessionToken;

    const result = matchmaker.joinMatch({
      matchId: alice.data.matchId,
      displayName: 'Alice again',
      reconnectToken: token,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('seat_taken');
    matchmaker.close();
  });
});
