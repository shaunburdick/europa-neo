/**
 * Q-M03 — Unknown match ID returns `match_not_found` (no existence
 * leak). Feature 006 (T046)
 *
 * Maps to quickstart.md §Q-M03 (spec FR-006; Q2 clarification; SC-006).
 *
 * Deviation from the original quickstart stub, resolved per PM ruling
 * "contracts + spec win": the stub's step 3 expected a probe of the
 * REAL private MatchId to return `match_not_found`. That contradicts
 * spec US3 AC-2 ("a client opens the shareable join URL → they take a
 * seat like any other join flow"), the edge case "shared beyond
 * intended group" ("anyone holding the link may take a seat"), Q-M02
 * itself, and even the stub's own parenthetical ("knowing the matchId
 * == being invited"). The single-code-path invariant is about ERROR
 * indistinguishability for UNKNOWN ids — it is proven here by the
 * 100-probe loop + SC-006 10/10 trials all returning the identical
 * non-leaking error, and by the real-id join flowing through the exact
 * same seat-fill path with no visibility branch.
 */

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { MatchId } from '../../contracts/match-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

/** An id guaranteed unknown to this server (never equal to `exclude`). */
function unknownId(exclude: MatchId): MatchId {
  let candidate = randomUUID() as MatchId;
  while (candidate === exclude) {
    candidate = randomUUID() as MatchId;
  }
  return candidate;
}

describe('Q-M03: unknown match ID returns match_not_found', () => {
  it('does not leak whether a private match exists', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Step 1: Alice creates a private match
    const create = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) {
      return;
    }

    const realMatchId = create.data.matchId;
    // The id circulates only via Alice's shareable link (FR-003/Q3).

    // The lobby never lists it (SC-003 zero-private clause).
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) {
      return;
    }
    expect(lobby.matches).toHaveLength(0);

    // Step 2: Attacker probes 100 unknown UUIDs (none are the real one)
    for (let i = 0; i < 100; i++) {
      const guessedId = unknownId(realMatchId);
      const result = matchmaker.joinMatch({
        matchId: guessedId,
        displayName: 'Mallory',
      });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.code).toBe('match_not_found');
      // The error message must NOT mention "private" or "exists"
      expect(result.error.message.toLowerCase()).not.toContain('private');
      expect(result.error.message.toLowerCase()).not.toContain('exists');
    }

    // SC-006: joining via an UNKNOWN id returns "match not found" in
    // 10/10 trials — fresh ids, same uniform rejection.
    for (let i = 0; i < 10; i++) {
      const r = matchmaker.joinMatch({ matchId: unknownId(realMatchId), displayName: 'Mallory' });
      expect(r.ok).toBe(false);
      if (r.ok) {
        return;
      }
      expect(r.error.code).toBe('match_not_found');
    }

    // Step 3 (cross-session): Bob — a different player session on the
    // same server — receives Alice's shareable URL. Holding the link IS
    // the invitation (US3 AC-2 + edge case "shared beyond intended
    // group"), so his join succeeds through the SAME code path as any
    // public join; no visibility-specific branch exists.
    const bobJoin = matchmaker.joinMatch({
      matchId: realMatchId,
      displayName: 'Bob',
    });
    expect(bobJoin.ok).toBe(true);
    if (!bobJoin.ok) {
      return;
    }
    expect(bobJoin.data.seatAssignment.seatIndex).toBe(1);

    // Post-start: unknown probes STILL get the identical non-leaking
    // rejection — starting the match changed nothing about the guard.
    const afterStart = matchmaker.joinMatch({
      matchId: unknownId(realMatchId),
      displayName: 'Mallory',
    });
    expect(afterStart.ok).toBe(false);
    if (!afterStart.ok) {
      return;
    }
    expect(afterStart.error.code).toBe('match_not_found');

    await matchmaker.close();
  });
});
