/**
 * Unit tests for forfeit `OrderSurrender` injection — Feature 006
 * (T055)
 *
 * Covers FR-010 + US5 AC-1 + research.md §6: when networking fires
 * `onSeatExpired` for a running match, the matchmaker (a) looks up the
 * match, (b) looks up the seat by `sessionToken`, (c) submits the
 * engine's `OrderSurrender` via `engineSession.submit`, (d) stamps
 * `SeatRecord.forfeitedAtMs`, and (e) calls `server.detachPlayer`.
 * Double-fire is a no-op (idempotent); forfeiting during `filling`
 * releases the seat inline with no engine call.
 *
 * Contract notes (deviations from task prose, per dispatch ruling 5):
 *   - networking's real `onSeatExpired` payload carries NO
 *     `expiredAtMs` — the forfeit timestamp is the matchmaker's
 *     injected clock reading at handling time;
 *   - networking's real `DetachRequest` carries NO `reason` field —
 *     detachment is asserted by `(matchId, sessionToken, playerId)`.
 *
 * Two observation levels: direct calls into `src/forfeit.ts` over a
 * hand-rolled store (white-box), and bridge-driven calls through the
 * wired matchmaker (the FakeServer `fireOnSeatExpired` trigger).
 *
 * Test descriptions cite the requirement they pin.
 */

import type { PlayerId } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { handleSeatExpired } from '../../src/forfeit';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';
import {
  makeFillingForfeitFixture,
  makeRunningForfeitFixture,
  SILENT_LOGGER,
} from '../fixtures/forfeitScenario';

describe('forfeit policy injects OrderSurrender on seat expiry (FR-010 / T055)', () => {
  it('US5 AC-1: expiry submits surrender for the seat and the engine marks it', () => {
    const fx = makeRunningForfeitFixture();

    const result = handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      fx.nowMs(),
    );

    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.outcome).toBe('surrendered');
    // The engine applied the order: Alice is eliminated in the world
    // (FR-016 — surrender marks the player eliminated immediately).
    const world = fx.match.engineSession?.world();
    expect(world?.players[0]?.status).toBe('eliminated');
    // One player (Bob) remains alive.
    expect(result.remainingPlayers).toBe(1);
  });

  it('(d) stamps SeatRecord.forfeitedAtMs with the handler clock reading', () => {
    const fx = makeRunningForfeitFixture();
    fx.advanceMs(555);

    handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      fx.nowMs(),
    );

    const seat = fx.match.seats.get(0);
    expect(seat?.forfeitedAtMs).toBe(fx.nowMs());
  });

  it('(e) detaches the seat from networking', () => {
    const fx = makeRunningForfeitFixture();

    handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: 1 as PlayerId },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      fx.nowMs(),
    );

    expect(fx.server.detachPlayerCalls).toHaveLength(1);
    const detach = fx.server.detachPlayerCalls[0];
    expect(detach?.matchId).toBe(fx.match.matchId);
    expect(detach?.sessionToken).toBe(fx.aliceToken);
    expect(detach?.playerId).toBe(1);
  });

  it('FR-010: double-fire for the same seat is an idempotent no-op', () => {
    const fx = makeRunningForfeitFixture();
    const ctx = { store: fx.store, server: fx.server, logger: SILENT_LOGGER };
    const event = {
      matchId: fx.match.matchId,
      sessionToken: fx.aliceToken,
      playerId: 1 as PlayerId,
    };

    const first = handleSeatExpired(event, ctx, fx.nowMs());
    expect(first?.outcome).toBe('surrendered');

    fx.advanceMs(100);
    const second = handleSeatExpired(event, ctx, fx.nowMs());
    expect(second).toBeNull();
    // Still exactly one detach; the world is unchanged by the re-fire.
    expect(fx.server.detachPlayerCalls).toHaveLength(1);
  });

  it('FR-010: forfeiting during filling releases the seat inline — no engine call', () => {
    const fx = makeFillingForfeitFixture();

    const result = handleSeatExpired(
      { matchId: fx.match.matchId, sessionToken: fx.aliceToken, playerId: null },
      { store: fx.store, server: fx.server, logger: SILENT_LOGGER },
      fx.nowMs(),
    );

    expect(result?.outcome).toBe('released');
    // Seat removed from the record; session unbound; detach recorded.
    expect(fx.match.seats.has(0)).toBe(false);
    const alice = fx.store.listSessions().find((s) => s.displayName === 'Alice');
    expect(alice?.currentMatchId).toBeNull();
    expect(fx.server.detachPlayerCalls).toHaveLength(1);
  });

  it('FR-006 hygiene: unknown match or token are no-ops, never throws', () => {
    const fx = makeRunningForfeitFixture();
    const ctx = { store: fx.store, server: fx.server, logger: SILENT_LOGGER };

    expect(
      handleSeatExpired(
        {
          matchId: '00000000-0000-4000-8000-000000000000' as never,
          sessionToken: fx.aliceToken,
          playerId: 1 as PlayerId,
        },
        ctx,
        fx.nowMs(),
      ),
    ).toBeNull();
    expect(
      handleSeatExpired(
        {
          matchId: fx.match.matchId,
          sessionToken: '99999999-9999-4999-8999-999999999999' as never,
          playerId: 1 as PlayerId,
        },
        ctx,
        fx.nowMs(),
      ),
    ).toBeNull();
    expect(fx.server.detachPlayerCalls).toHaveLength(0);
  });

  it('wiring: the matchmaker bridge applies the same policy on fireOnSeatExpired', () => {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) throw new Error('fixture join failed');
    const engineSession = server.lastEngineSession;

    server.fireOnSeatExpired({
      matchId: created.data.matchId,
      sessionToken: created.data.seatAssignment.sessionToken,
      playerId: created.data.seatAssignment.playerId,
    });

    const world = engineSession?.world();
    expect(world?.players[0]?.status).toBe('eliminated');
    expect(server.detachPlayerCalls).toHaveLength(1);
    expect(server.detachPlayerCalls[0]?.sessionToken).toBe(
      created.data.seatAssignment.sessionToken,
    );
    void joined;
    matchmaker.close();
  });
});
