/**
 * Q-M04 — Disconnect forfeit (US5). Feature 006 (T060).
 *
 * Verbatim scenario from `quickstart.md` §Q-M04 (spec US5 AC-1, AC-2;
 * FR-010; SC-004 "10/10 scripted drops"). Mechanical adjustments, per
 * package test conventions and the shipped contracts:
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name; `close()` is awaited;
 *   2. `fireOnSeatExpired` is a METHOD on the FakeServer fixture (the
 *      fixture's bridge-trigger API), not a standalone function taking
 *      `server.bridge`;
 *   3. networking's real `onSeatExpired` payload carries NO
 *      `expiredAtMs` field (contracts win over quickstart prose) — the
 *      forfeit timestamp is the matchmaker's injected clock;
 *   4. the contract `EngineSession` exposes no `submittedOrders` log —
 *      the surrender is asserted behaviorally: the engine (FR-016)
 *      marks a surrendered player `eliminated` in the world immediately;
 *   5. networking's real `DetachRequest` carries NO `reason` field —
 *      detachment is asserted by `(matchId, sessionToken, playerId)`.
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M04: disconnect forfeit', () => {
  it('marks player forfeit when grace window expires', async () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

    // Set up a running match: Alice vs Bob
    const aliceCreate = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
    });
    expect(aliceCreate.ok).toBe(true);
    if (!aliceCreate.ok) {
      return;
    }
    const { matchId, seatAssignment: aliceSeat } = aliceCreate.data;

    const bobJoin = matchmaker.joinMatch({
      matchId,
      displayName: 'Bob',
    });
    expect(bobJoin.ok).toBe(true);
    if (!bobJoin.ok) {
      return;
    }
    const bobSeat = bobJoin.data.seatAssignment;

    // Engine is now running. FakeServer has recorded the engine session.
    const engineSession = server.lastEngineSession;
    expect(engineSession).toBeDefined();

    // Step 1: Alice's WebSocket drops, grace window expires.
    // Networking fires onSeatExpired (we simulate it).
    server.fireOnSeatExpired({
      matchId,
      sessionToken: aliceSeat.sessionToken,
      playerId: aliceSeat.playerId,
    });

    // Step 2: Matchmaker should have called engineSession.submit
    // with an OrderSurrender for Alice — observable as Alice's
    // immediate elimination in the engine world (FR-016).
    const world = engineSession?.world();
    expect(world?.players[0]?.status).toBe('eliminated');

    // Step 3: Matchmaker called server.detachPlayer for Alice.
    expect(server.detachPlayerCalls).toHaveLength(1);
    const [detach] = server.detachPlayerCalls;
    expect(detach?.sessionToken).toBe(aliceSeat.sessionToken);
    expect(detach?.playerId).toBe(aliceSeat.playerId);
    expect(detach?.matchId).toBe(matchId);

    // SC-004: 10/10 scripted drops
    const { sessionToken, playerId } = bobSeat;
    for (let i = 0; i < 10; i++) {
      server.fireOnSeatExpired({
        matchId,
        sessionToken,
        playerId,
      });
      // After Bob also disconnects, the match is torn down
      expect(server.unregisterMatchCalls.includes(matchId)).toBe(true);
    }

    await matchmaker.close();
  });
});
