/**
 * Unit tests for all-disconnected teardown — Feature 006 (T056)
 *
 * Covers US5 AC-2: when the LAST seated player's `onSeatExpired`
 * fires (everyone else already forfeited), the matchmaker submits the
 * final surrender, sees zero alive players in the engine world,
 * calls `server.unregisterMatch`, and transitions `running → collected`
 * with a `kind: 'cancelled'` results record (data-model §4/§10). If
 * one or more players remain, the match continues in `running` — no
 * teardown.
 *
 * Test descriptions cite the requirement they pin.
 */

import { describe, expect, it } from 'vitest';

import type { PlayerId } from '@europa/engine';

import { handleSeatExpired } from '../../src/forfeit';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import {
  SILENT_LOGGER,
  makeRunningForfeitFixture,
} from '../fixtures/forfeitScenario';
import { FakeServer } from '../fixtures/fakeServer';

describe('all-disconnected teardown (US5 AC-2 / T056)', () => {
  it('US5 AC-1: with one survivor the match continues running — no teardown', () => {
    const fx = makeRunningForfeitFixture();

    const result = handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      fx.nowMs(),
    );

    expect(result?.outcome).toBe('surrendered');
    expect(result?.remainingPlayers).toBe(1);
    expect(fx.server.unregisterMatchCalls).toHaveLength(0);
    expect(fx.match.status).toBe('running');
  });

  it('US5 AC-2: the last expiry tears the match down — unregister + collected + cancelled', () => {
    const fx = makeRunningForfeitFixture();
    const ctx = { store: fx.store, server: fx.server, logger: SILENT_LOGGER };

    handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      ctx,
      fx.nowMs(),
    );
    fx.advanceMs(1000);
    const final = handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.bobToken, playerId: 2 as PlayerId },
      ctx,
      fx.nowMs(),
    );

    expect(final?.outcome).toBe('torn_down');
    expect(final?.remainingPlayers).toBe(0);
    expect(fx.server.unregisterMatchCalls).toContain(fx.match.matchId);
    expect(fx.match.status).toBe('collected');
    // The cancelled marker records WHY the match ended (data-model §10).
    expect(fx.match.results?.result.kind).toBe('cancelled');
  });

  it('wiring: bridge-driven double drop tears the wired matchmaker match down', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) throw new Error('fixture join failed');

    server.fireOnSeatExpired({
      matchId: created.data.matchId,
      sessionToken: created.data.seatAssignment.sessionToken,
      playerId: created.data.seatAssignment.playerId,
    });
    // One survivor: still running, nothing unregistered.
    expect(server.unregisterMatchCalls).toHaveLength(0);
    expect(matchmaker.stats().runningMatches).toBe(1);

    server.fireOnSeatExpired({
      matchId: created.data.matchId,
      sessionToken: joined.data.seatAssignment.sessionToken,
      playerId: joined.data.seatAssignment.playerId,
    });
    expect(server.unregisterMatchCalls).toContain(created.data.matchId);
    expect(matchmaker.stats().runningMatches).toBe(0);
    expect(matchmaker.stats().collectedMatches).toBe(1);
    expect(matchmaker.stats().totalForfeits).toBe(2);
    matchmaker.close();
  });
});
