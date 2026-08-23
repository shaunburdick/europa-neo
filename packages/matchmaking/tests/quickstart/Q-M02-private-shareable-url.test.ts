/**
 * Q-M02 — Private match + shareable join URL + no lobby listing.
 * Feature 006 (T045)
 *
 * Verbatim scenario from `quickstart.md` §Q-M02 (spec US3 AC-1, AC-2,
 * AC-3; FR-003, FR-005, FR-006; Q1, Q2, Q3). Three mechanical adjustments,
 * per package test conventions (mirrors Q-M01):
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name (which would hit a possibly-stale dist build);
 *   2. `close()` is awaited (it returns a Promise) so the test stays
 *      sync-safe under lint's floating-promise hygiene;
 *   3. the stub's unused `aliceSeat` binding is asserted on (seat 0)
 *      instead of left to trip the unused-variable lint rule.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M02: private match + shareable join URL', () => {
  it('hides from lobby and is joinable via URL', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(
      { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
      { server },
    );

    // Step 1: Alice creates a private match
    const create = matchmaker.createMatch({
      visibility: 'private',
      displayName: 'Alice',
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const { matchId, joinPath, joinUrl, seatAssignment: aliceSeat } = create.data;
    expect(aliceSeat.seatIndex).toBe(0);

    // joinPath is the relative path; joinUrl is the full URL
    expect(joinPath).toBe(`/join/${matchId}`);
    expect(joinUrl).toBe(`https://europa.example.com/join/${matchId}`);

    // Step 2: Lobby does NOT contain the private match
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(0);

    // Step 3: Bob joins via the URL (has the matchId)
    const join = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.data.seatAssignment.seatIndex).toBe(1);

    await matchmaker.close();
  });
});
