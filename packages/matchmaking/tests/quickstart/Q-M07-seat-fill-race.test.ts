/**
 * Q-M07 — Seat-fill race (atomicity). Feature 006 (T032).
 *
 * Verbatim scenario from `quickstart.md` §Q-M07 (spec edge case
 * "What happens when a player joins a match that fills in the same
 * instant?" + FR-007 atomicity). Determinism note per the wave
 * dispatch: the five joiners run sequentially through the synchronous
 * public API — the single-threaded event loop makes this exactly the
 * serialized form of the race, so exactly one joiner can win.
 *
 * Mechanical adjustments (same as Q-M01): relative src imports;
 * awaited `close()`.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M07: seat-fill race is atomic', () => {
  it('only one joiner wins the last seat', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const aliceCreate = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    if (!aliceCreate.ok) throw new Error('create failed');
    const { matchId } = aliceCreate.data;

    // Simulate 5 concurrent joiners competing for the last seat
    const joiners = ['Bob', 'Carol', 'Dave', 'Eve', 'Frank'].map((name) =>
      matchmaker.joinMatch({ matchId, displayName: name }),
    );

    const successes = joiners.filter((r) => r.ok);
    const failures = joiners.filter((r) => !r.ok);

    expect(successes).toHaveLength(1); // only one wins
    expect(failures).toHaveLength(4);

    // All failures are 'match_full'
    for (const f of failures) {
      if (f.ok) continue;
      expect(f.error.code).toBe('match_full');
    }

    await matchmaker.close();
  });
});
