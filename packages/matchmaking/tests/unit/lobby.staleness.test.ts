/**
 * Unit tests for lobby staleness — Feature 006 (T034)
 *
 * Covers SC-003 ("lobby listing reflects match creation/start/collection
 * events within 1 tick of occurrence") + FR-012 at the wired
 * `Matchmaker` surface: mutations are synchronous, so the very next
 * `listPublicMatches()` call — with no tick pump, no await, no event-loop
 * turn in between — already sees the new state. Also pins FR-005's
 * rebuild-per-call semantics against the real store.
 *
 * A deterministic injected clock keeps `ageSeconds` assertions exact
 * (constitution Principle II: no wall-clock reads in logic paths).
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** Fixed-clock harness: time only moves when the test advances it. */
function makeMatchmaker() {
  let clockMs = 1_000_000;
  const server = new FakeServer();
  const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
    server,
    now: () => clockMs,
  });
  return {
    matchmaker,
    advance(ms: number): void {
      clockMs += ms;
    },
  };
}

/** Create a public match; returns its id (fixture failures explode). */
function createPublic(
  matchmaker: ReturnType<typeof createMatchmaker>,
  displayName: string,
  playerCount?: 2 | 3 | 4,
): MatchId {
  const created = matchmaker.createMatch({
    visibility: 'public',
    displayName,
    ...(playerCount === undefined ? {} : { settings: { playerCount } }),
  });
  if (!created.ok) throw new Error('fixture create failed');
  return created.data.matchId;
}

describe('listPublicMatches — staleness (SC-003 / FR-012)', () => {
  it('SC-003: a fourth createMatch is visible to the immediately following call', () => {
    const { matchmaker } = makeMatchmaker();
    const a = createPublic(matchmaker, 'A', 2);
    const b = createPublic(matchmaker, 'B', 2);
    const c = createPublic(matchmaker, 'C', 2);

    const before = matchmaker.listPublicMatches();
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.matches.map((e) => e.matchId)).toEqual([a, b, c]);

    // No tick pump, no await — the synchronous mutation is already
    // observable on the very next call.
    const d = createPublic(matchmaker, 'D', 2);

    const after = matchmaker.listPublicMatches();
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.matches.map((e) => e.matchId)).toEqual([a, b, c, d]);
    matchmaker.close();
  });

  it('SC-003: filling the last seat removes the match from the next call (FR-012)', () => {
    const { matchmaker } = makeMatchmaker();
    const staying = createPublic(matchmaker, 'Stays', 3);
    const filling = createPublic(matchmaker, 'Fills', 2);

    const joined = matchmaker.joinMatch({ matchId: filling, displayName: 'Bob' });
    expect(joined.ok).toBe(true);

    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    // The filled match transitioned filling → running and dropped out;
    // the still-open match remains with accurate occupancy.
    expect(lobby.matches.map((e) => e.matchId)).toEqual([staying]);
    expect(lobby.matches[0]?.seatsFilled).toBe(1);
    expect(lobby.matches[0]?.playerCount).toBe(3);
    matchmaker.close();
  });

  it('FR-005: every call returns a fresh projection of current state (no stale cache)', () => {
    const { matchmaker, advance } = makeMatchmaker();
    const id = createPublic(matchmaker, 'Alice', 2);

    const first = matchmaker.listPublicMatches();
    advance(30_000);
    const second = matchmaker.listPublicMatches();

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.matches).not.toBe(second.matches); // rebuilt per call…
    expect(first.matches[0]?.ageSeconds).toBe(0); // …from live records:
    expect(second.matches[0]?.ageSeconds).toBe(30); // age moved with the clock
    expect(second.matches[0]?.matchId).toBe(id);
    matchmaker.close();
  });
});
