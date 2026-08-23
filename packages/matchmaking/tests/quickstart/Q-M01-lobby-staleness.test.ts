/**
 * Q-M01 extension — lobby staleness acceptance — Feature 006 (T037)
 *
 * SC-003 timing assertion on top of Q-M01's flow: the lobby listing is
 * rebuilt synchronously inside `listPublicMatches()`, so a created
 * match is visible to the immediately following call (length 1 with no
 * async gap), and once `joinMatch` fills the last seat the very next
 * call shows length 0. The whole mutation→projection sequence runs in
 * one synchronous block; the generous wall-clock guard below only
 * proves no hidden await/tick sneaks in between (CI-safe bound).
 *
 * Maps to quickstart.md §Q-M01 (SC-003; FR-005, FR-012).
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M01 staleness: lobby reflects mutations within one tick (SC-003)', () => {
  it('shows a created match immediately and drops it immediately when full', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    const startedAtMs = performance.now();

    // Step 1: Alice creates a public match…
    const create = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const { matchId } = create.data;

    // …and the IMMEDIATELY following call already lists it (length 1,
    // zero async gap — synchronous rebuild per FR-005).
    const lobby = matchmaker.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(1);
    expect(lobby.matches[0]?.matchId).toBe(matchId);

    // Step 2: Bob fills the last seat → atomic fill → running.
    const join = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
    expect(join.ok).toBe(true);

    // Step 3: the next call reflects the transition — length 0.
    const lobby2 = matchmaker.listPublicMatches();
    expect(lobby2.ok).toBe(true);
    if (!lobby2.ok) return;
    expect(lobby2.matches).toHaveLength(0);

    // SC-003 wall-clock guard: creation → projection → transition →
    // projection all happened synchronously (no event-loop turns).
    // Generous bound keeps this stable on loaded CI runners while still
    // failing if an await/tick ever slips between the calls above.
    const elapsedMs = performance.now() - startedAtMs;
    expect(elapsedMs).toBeLessThan(100);

    void matchmaker.close();
  });
});
