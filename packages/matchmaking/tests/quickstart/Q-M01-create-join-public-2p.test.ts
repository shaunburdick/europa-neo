/**
 * Q-M01 — Create + join public 2-player match; lobby reflects it;
 * auto-start. Feature 006 (T031).
 *
 * Verbatim scenario from `quickstart.md` §Q-M01 (spec US1 AC-1, AC-2;
 * FR-002, FR-004, FR-005, FR-007). Two mechanical adjustments, per
 * package test conventions:
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name (which would hit a possibly-stale dist build);
 *   2. `close()` is awaited (it returns a Promise) so the test stays
 *      sync-safe under lint's floating-promise hygiene.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M01: create + join public 2-player match', () => {
  it('auto-starts when the last seat fills', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Step 1: Alice creates a public match
    const create = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) {
      return;
    }

    const { matchId, seatAssignment: aliceSeat } = create.data;
    expect(aliceSeat.seatIndex).toBe(0);
    expect(aliceSeat.playerId).toBe(1);
    expect(aliceSeat.displayName).toBe('Alice');

    // Step 2: Lobby contains the new match
    const lobby1 = matchmaker.listPublicMatches();
    expect(lobby1.ok).toBe(true);
    if (!lobby1.ok) {
      return;
    }
    expect(lobby1.matches).toHaveLength(1);
    expect(lobby1.matches[0]?.matchId).toBe(matchId);
    expect(lobby1.matches[0]?.hostDisplayName).toBe('Alice');
    expect(lobby1.matches[0]?.seatsFilled).toBe(1);
    expect(lobby1.matches[0]?.playerCount).toBe(2);

    // Step 3: Bob joins
    const join = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(join.ok).toBe(true);
    if (!join.ok) {
      return;
    }

    const { seatAssignment: bobSeat } = join.data;
    expect(bobSeat.seatIndex).toBe(1);
    expect(bobSeat.playerId).toBe(2);

    // Step 4: Match is now 'running'; networking was driven
    expect(server.registerMatchCalls).toHaveLength(1);
    expect(server.attachPlayerCalls).toHaveLength(2);
    expect(server.enableSpectatorsCalls).toHaveLength(1);

    // Step 5: Lobby no longer lists the match (it's running now)
    const lobby2 = matchmaker.listPublicMatches();
    expect(lobby2.ok).toBe(true);
    if (!lobby2.ok) {
      return;
    }
    expect(lobby2.matches).toHaveLength(0);

    await matchmaker.close();
  });
});
