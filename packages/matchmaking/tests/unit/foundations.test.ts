/**
 * Phase 2 foundational smoke tests — Feature 006
 *
 * Proves the Phase 2 wiring end-to-end before any user-story logic
 * lands: the constants mirror the contract defaults, the error factory
 * produces frozen closed-union payloads, identity generators mint
 * well-formed UUID v4 brands, validators reject junk, the in-memory
 * store round-trips records, and the internal record factories produce
 * the data-model §5/§7/§11 shapes with injected clock/id deps.
 */

import { describe, expect, it } from 'vitest';

import { MATCHMAKING_CONSTANTS, MATCHMAKING_DEFAULT_CONFIG } from '../../src/constants';
import { makeError } from '../../src/errors';
import { isValidMatchId, matchSeedFrom, newMatchId, newPlayerSessionId } from '../../src/idGen';
import * as publicApi from '../../src/index';
import { createMatchRecord } from '../../src/internal/matchRecord';
import { createPlayerSession } from '../../src/internal/playerSession';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { isValidSessionToken, newSessionToken } from '../../src/sessionToken';
import { createStore } from '../../src/store';

const { DEFAULT_GENERATION_SETTINGS } = publicApi;
describe('MATCHMAKING_CONSTANTS', () => {
  it('exposes the contract default values', () => {
    expect(MATCHMAKING_CONSTANTS).toEqual({
      maxConcurrentMatches: 64,
      emptyMatchTtlMs: 5 * 60 * 1000,
      resultsTtlMs: 60 * 1000,
      rematchWindowMs: 60 * 1000,
      maxDisplayNameLength: 32,
      minDisplayNameLength: 1,
      sweepIntervalMs: 30 * 1000,
    });
  });

  it('mirrors every constant into the default config', () => {
    expect(MATCHMAKING_DEFAULT_CONFIG).toEqual({
      maxConcurrentMatches: MATCHMAKING_CONSTANTS.maxConcurrentMatches,
      emptyMatchTtlMs: MATCHMAKING_CONSTANTS.emptyMatchTtlMs,
      resultsTtlMs: MATCHMAKING_CONSTANTS.resultsTtlMs,
      rematchWindowMs: MATCHMAKING_CONSTANTS.rematchWindowMs,
      maxDisplayNameLength: MATCHMAKING_CONSTANTS.maxDisplayNameLength,
      minDisplayNameLength: MATCHMAKING_CONSTANTS.minDisplayNameLength,
      sweepIntervalMs: MATCHMAKING_CONSTANTS.sweepIntervalMs,
    });
    expect('publicBaseUrl' in MATCHMAKING_DEFAULT_CONFIG).toBe(false);
  });
});

describe('makeError', () => {
  it('fills a human-readable default message per code', () => {
    const error = makeError('match_not_found');
    expect(error).toEqual({ code: 'match_not_found', message: 'Match not found' });
  });

  it('honors message overrides and attaches detail', () => {
    const error = makeError('invalid_request', 'displayName too long', {
      maxLength: 32,
    });
    expect(error.code).toBe('invalid_request');
    expect(error.message).toBe('displayName too long');
    expect(error.detail).toEqual({ maxLength: 32 });
  });

  it('returns a frozen payload for every code in the closed union', () => {
    const codes = [
      'invalid_request',
      'match_not_found',
      'match_full',
      'match_not_joinable',
      'seat_taken',
      'session_invalid',
      'session_expired',
      'player_not_in_match',
      'rematch_window_closed',
      'rematch_not_offered',
      'rematch_already_voted',
      'rate_limited',
      'internal_error',
    ] as const;
    for (const code of codes) {
      const error = makeError(code);
      expect(Object.isFrozen(error)).toBe(true);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('identity generation', () => {
  it('mints well-formed UUID v4 match ids and validates them', () => {
    const id = newMatchId();
    expect(isValidMatchId(id)).toBe(true);
    expect(isValidMatchId(id.toUpperCase())).toBe(true);
  });

  it('rejects malformed match ids', () => {
    expect(isValidMatchId('')).toBe(false);
    expect(isValidMatchId('not-a-uuid')).toBe(false);
    // Version nibble 1 (v1 UUID), not v4.
    expect(isValidMatchId('4f1f48f2-cdb2-11ef-9cd2-0242ac120002')).toBe(false);
  });

  it('mints distinct player-session ids and session tokens', () => {
    const a = newPlayerSessionId();
    const b = newPlayerSessionId();
    expect(a).not.toBe(b);
    expect(isValidMatchId(a)).toBe(true);

    const token = newSessionToken();
    expect(isValidSessionToken(token)).toBe(true);
    expect(isValidSessionToken('tok_junk')).toBe(false);
  });
});

describe('createStore', () => {
  it('round-trips match and session records', () => {
    const store = createStore();
    const now = (): number => 1_000;
    const sessionId = newPlayerSessionId();
    const session = createPlayerSession({
      displayName: 'Alice',
      randomId: () => sessionId,
      now,
    });
    const matchId = newMatchId();
    const match = createMatchRecord({
      matchId,
      visibility: 'public',
      settings: {
        playerCount: 2,
        boardSize: 32,
        tickIntervalMs: 250,
        terrainSettings: DEFAULT_GENERATION_SETTINGS,
      },
      createdAtMs: now(),
    });

    store.putSession(session);
    store.putMatch(match);
    expect(store.getSession(sessionId)).toBe(session);
    expect(store.getMatch(matchId)).toBe(match);
    expect(store.listSessions()).toEqual([session]);
    expect(store.listMatches()).toEqual([match]);

    expect(store.deleteMatch(matchId)).toBe(match);
    expect(store.deleteSession(sessionId)).toBe(session);
    expect(store.deleteMatch(matchId)).toBeUndefined();
    expect(store.deleteSession(sessionId)).toBeUndefined();
    expect(store.listMatches()).toEqual([]);
    expect(store.listSessions()).toEqual([]);
  });

  it('returns undefined for unknown ids and freezes its shape', () => {
    const store = createStore();
    expect(store.getMatch(newMatchId())).toBeUndefined();
    expect(store.getSession(newPlayerSessionId())).toBeUndefined();
    expect(Object.isFrozen(store)).toBe(true);
  });
});

describe('internal record factories', () => {
  it('creates a filling match record with a stable join path', () => {
    const matchId = newMatchId();
    const match = createMatchRecord({
      matchId,
      visibility: 'private',
      settings: {
        playerCount: 2,
        boardSize: 32,
        tickIntervalMs: 250,
        terrainSettings: DEFAULT_GENERATION_SETTINGS,
      },
      createdAtMs: 5_000,
    });
    expect(match.status).toBe('filling');
    expect(match.visibility).toBe('private');
    expect(match.joinPath).toBe(`/join/${matchId}`);
    expect(match.seats.size).toBe(0);
    expect(match.engineConfig).toBeNull();
    expect(match.engineSession).toBeNull();
    expect(match.results).toBeNull();
    expect(match.rematch).toBeNull();
    expect(match.startedAtMs).toBeNull();
    expect(match.finishedAtMs).toBeNull();
    expect(match.lastActivityAtMs).toBe(5_000);
  });

  it('creates a player session bound to nothing with injected deps', () => {
    let ticks = 0;
    const session = createPlayerSession({
      displayName: 'Bob',
      randomId: () => '11111111-2222-4333-8444-555555555555',
      now: () => {
        ticks += 10;
        return ticks;
      },
    });
    expect(session.playerSessionId).toBe('11111111-2222-4333-8444-555555555555');
    expect(session.displayName).toBe('Bob');
    expect(session.currentMatchId).toBeNull();
    expect(session.currentSeatIndex).toBeNull();
    expect(session.currentSessionToken).toBeNull();
    expect(session.createdAtMs).toBe(10);
    expect(session.lastSeenAtMs).toBe(10);
  });

  it('creates a seat record with clean forfeit state', () => {
    const seat = createSeatRecord({
      seatIndex: 1,
      playerSessionId: newPlayerSessionId(),
      displayName: 'Cara',
      sessionToken: newSessionToken(),
      playerId: null,
      connectedAtMs: 7_000,
    });
    expect(seat.seatIndex).toBe(1);
    expect(seat.playerId).toBeNull();
    expect(seat.connectedAtMs).toBe(7_000);
    expect(seat.forfeitedAtMs).toBeNull();
  });
});

describe('matchSeedFrom', () => {
  it('reads the first uint32 of a filled buffer', () => {
    const buffer = new Uint32Array(1);
    buffer[0] = 42;
    expect(matchSeedFrom(buffer)).toBe(42);
  });

  it('falls back to 0 for an empty buffer (defensive)', () => {
    expect(matchSeedFrom(new Uint32Array(0))).toBe(0);
  });
});

describe('public barrel', () => {
  it('exposes the Phase 2 runtime surface', () => {
    expect(publicApi.MATCHMAKING_CONSTANTS).toBe(MATCHMAKING_CONSTANTS);
    expect(typeof publicApi.makeError).toBe('function');
    expect(typeof publicApi.newMatchId).toBe('function');
    expect(typeof publicApi.newSessionToken).toBe('function');
    expect(typeof publicApi.createStore).toBe('function');
  });
});
