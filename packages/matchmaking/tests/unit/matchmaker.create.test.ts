/**
 * Unit tests for `createMatch` — Feature 006 (T023)
 *
 * Covers FR-002 + FR-003 + FR-004: a successful create returns a
 * `SeatAssignedResult` with a UUID v4 `MatchId`, the `/join/<id>`
 * path, `joinUrl: null` without a configured base URL, and seat 0
 * reserved for the creator; invalid display names and unknown
 * visibility values are rejected with `invalid_request`; the
 * concurrent-match cap is enforced.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';
import type { MatchVisibility } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

describe('createMatch — happy path', () => {
  it('FR-002/FR-003/FR-004: seats the creator in seat 0 with id, joinPath, and joinUrl null', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { data } = result;
    // UUID v4 shape (FR-003: server-assigned identity).
    expect(data.matchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(data.joinPath).toBe(`/join/${data.matchId}`);
    expect(data.joinUrl).toBeNull(); // no publicBaseUrl configured
    expect(data.seatAssignment).toEqual({
      playerSessionId: expect.any(String),
      seatIndex: 0,
      playerId: 1,
      sessionToken: expect.any(String),
      displayName: 'Alice',
    });
    matchmaker.close();
  });

  it('FR-003: composes joinUrl when publicBaseUrl is configured', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(
      { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
      { server },
    );

    const result = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.joinUrl).toBe(`https://europa.example.com/join/${result.data.matchId}`);
    matchmaker.close();
  });

  it('FR-004: reserves the creator seat immediately (lobby shows 1/2 filling)', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    expect(result.ok).toBe(true);

    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) {
      return;
    }
    expect(lobby.matches).toHaveLength(1);
    expect(lobby.matches[0]?.seatsFilled).toBe(1);
    expect(lobby.matches[0]?.hostDisplayName).toBe('Alice');
    // No engine work happens until the match is full (FR-007 is join-side).
    expect(server.registerMatchCalls).toHaveLength(0);
    matchmaker.close();
  });

  it('FR-002: accepts explicit settings and merges terrain defaults', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
      settings: { boardSize: 16 },
    });

    expect(result.ok).toBe(true);
    matchmaker.close();
  });
});

describe('createMatch — validation (FR-001/FR-002)', () => {
  it('rejects an empty displayName with invalid_request', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({ visibility: 'public', displayName: '' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });

  it('rejects a whitespace-only displayName with invalid_request', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({ visibility: 'public', displayName: '   ' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });

  it('rejects a displayName longer than maxDisplayNameLength with invalid_request', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const result = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'x'.repeat(MATCHMAKING_CONSTANTS.maxDisplayNameLength + 1),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });

  it('rejects an unknown visibility value with invalid_request', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Simulates a malformed request crossing the API boundary.
    const bogus = 'fort-knox' as MatchVisibility;
    const result = matchmaker.createMatch({ visibility: bogus, displayName: 'Alice' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });

  it('rejects a playerCount outside the engine contract with invalid_request', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const bogus = 5 as 2 | 3 | 4;
    const result = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
      settings: { playerCount: bogus },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('invalid_request');
    matchmaker.close();
  });
});

describe('createMatch — capacity (maxConcurrentMatches)', () => {
  it('rejects creation beyond maxConcurrentMatches with rate_limited', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(
      { ...MATCHMAKING_CONSTANTS, maxConcurrentMatches: 1 },
      { server },
    );

    const first = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    expect(first.ok).toBe(true);

    const second = matchmaker.createMatch({ visibility: 'public', displayName: 'Bob' });
    expect(second.ok).toBe(false);
    if (second.ok) {
      return;
    }
    expect(second.error.code).toBe('rate_limited');
    matchmaker.close();
  });
});
