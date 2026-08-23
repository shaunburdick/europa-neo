/**
 * Unit tests for grace-window expiry timing (SC-004) — Feature 006
 * (T057)
 *
 * Covers SC-004: "forfeit policy triggers exactly at grace-window
 * expiry in 10/10 scripted drop tests". The forfeit stamp is taken
 * from the matchmaker's injected clock at handling time — there is no
 * clock skew because there is no second clock (the bridge payload
 * carries no timestamp; see the fixture/contract deviation note in
 * `forfeit.surrender.test.ts`). The SC-004 loop runs ten fresh
 * matchmaker instances through the identical scripted drop and
 * requires every single one to trigger the forfeit.
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

describe('grace-window expiry triggers deterministically (SC-004 / T057)', () => {
  it('the forfeit stamp equals the injected clock reading — no skew', () => {
    const fx = makeRunningForfeitFixture();
    fx.advanceMs(1234);
    const handledAtMs = fx.nowMs();

    handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      handledAtMs,
    );

    expect(fx.match.seats.get(0)?.forfeitedAtMs).toBe(handledAtMs);
  });

  it('SC-004: 10/10 scripted drops trigger the forfeit across fresh instances', () => {
    for (let iteration = 0; iteration < 10; iteration++) {
      const fx = makeRunningForfeitFixture();

      const result = handleSeatExpired(
        { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
        { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
        fx.nowMs(),
      );

      // Every single drop must trigger — 10/10 (SC-004).
      expect(result?.outcome).toBe('surrendered');
      const world = fx.match.engineSession?.world();
      expect(world?.players[0]?.status).toBe('surrendered');
      expect(fx.server.detachPlayerCalls).toHaveLength(1);
    }
  });

  it('SC-004: 10/10 bridge-driven drops trigger the wired matchmaker forfeit', () => {
    for (let iteration = 0; iteration < 10; iteration++) {
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

      expect(server.lastEngineSession?.world().players[0]?.status).toBe('surrendered');
      expect(server.detachPlayerCalls).toHaveLength(1);
      void joined;
      matchmaker.close();
    }
  });
});
