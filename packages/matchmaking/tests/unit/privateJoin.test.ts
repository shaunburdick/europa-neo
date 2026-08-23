/**
 * Unit tests for private-by-id direct join — Feature 006 (T041)
 *
 * Covers spec US3 AC-2 + FR-006: a client holding the `MatchId` of a
 * private match (e.g., from a shareable URL) can `joinMatch` and take
 * a seat exactly like any public join — the existence of the MatchId
 * in the store IS the auth, so no visibility check exists on the join
 * path. A client WITHOUT the id has no discovery path: the lobby never
 * lists the match and unknown-id probes return the single non-leaking
 * `match_not_found`.
 *
 * Test descriptions cite the requirement they pin.
 */

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { MatchId } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

function makeMatchmaker() {
  const server = new FakeServer();
  const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
  return { server, matchmaker };
}

/** An id guaranteed unknown to this server (never equal to `exclude`). */
function unknownId(exclude: MatchId): MatchId {
  let candidate = randomUUID() as MatchId;
  while (candidate === exclude) {
    candidate = randomUUID() as MatchId;
  }
  return candidate;
}

describe('joinMatch — private match via shareable id (US3 AC-2)', () => {
  it('FR-006: a holder of the private MatchId takes a seat like any public join', () => {
    const { server, matchmaker } = makeMatchmaker();
    const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    const { matchId } = created.data;

    // No lobby consultation — Bob arrives straight from the shareable link.
    const joined = matchmaker.joinMatch({ matchId, displayName: 'Bob' });

    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.data.matchId).toBe(matchId);
    expect(joined.data.seatAssignment.seatIndex).toBe(1);
    expect(joined.data.seatAssignment.playerId).toBe(2);

    // The last seat filled → identical auto-start sequence as public.
    expect(server.registerMatchCalls).toHaveLength(1);
    expect(server.attachPlayerCalls).toHaveLength(2);
    expect(server.enableSpectatorsCalls).toEqual([matchId]);
    expect(matchmaker.stats().runningMatches).toBe(1);
    matchmaker.close();
  });

  it('FR-006: seats fill identically to public — occupancy grows seat by seat', () => {
    const { matchmaker } = makeMatchmaker();
    // A 3p match exercises multi-seat filling without auto-start (the
    // default terrain settings currently fail placement for 3 players —
    // pre-existing feature-003 finding, reported to the PM; v1 ships
    // 2-player end-to-end and the 2p auto-start parity is pinned above).
    const created = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
      settings: { playerCount: 3 },
    });
    if (!created.ok) throw new Error('fixture create failed');
    const { matchId } = created.data;

    expect(matchmaker.joinMatch({ matchId, displayName: 'Bob' }).ok).toBe(true);
    // Two of three seats taken; still holding in 'filling' — nothing
    // started early and occupancy grew exactly like a public match's.
    expect(matchmaker.stats().fillingMatches).toBe(1);
    expect(matchmaker.stats().runningMatches).toBe(0);
    matchmaker.close();
  });

  it('FR-005 / US3 AC-3: no discovery path — the lobby stays empty throughout', () => {
    const { matchmaker } = makeMatchmaker();
    const created = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
      settings: { playerCount: 3 },
    });
    if (!created.ok) throw new Error('fixture create failed');
    const { matchId } = created.data;

    expect(matchmaker.joinMatch({ matchId, displayName: 'Bob' }).ok).toBe(true);

    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(0);
    matchmaker.close();
  });

  it('FR-006 / Q2: probes of unknown ids return match_not_found with no leak', () => {
    const { matchmaker } = makeMatchmaker();
    const created = matchmaker.createMatch({ visibility: 'private', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    const { matchId } = created.data;

    for (let i = 0; i < 25; i++) {
      const result = matchmaker.joinMatch({ matchId: unknownId(matchId), displayName: 'Mallory' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('match_not_found');
      const message = result.error.message.toLowerCase();
      expect(message).not.toContain('private');
      expect(message).not.toContain('exists');
    }
    matchmaker.close();
  });
});
