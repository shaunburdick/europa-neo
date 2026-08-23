/**
 * US2 Acceptance Tests — Feature 004 (T040)
 *
 * The two US2 acceptance criteria from spec.md, exercised end-to-end
 * through the real server orchestrator, real engine, and real fog:
 * a scripted client drops mid-match, reconnects with its session
 * token, and either resumes with snapshot + deltas (AC-1) or is
 * detached once the grace window lapses while the remaining player's
 * stream continues uninterrupted (AC-2).
 *
 * Test descriptions are the spec's Given/When/Then wording verbatim
 * (spec-kit convention: the test IS the acceptance criterion).
 */

import { computePlayerView } from '@europa/fog';
import { describe, expect, it } from 'vitest';

import { createMatchServer } from '../../src/server';
import type { SessionToken, TickBroadcastPayload } from '../../src/types';
import { attachPlayersForMatch, type ScriptedMatch, scriptedMatch } from '../fixtures/match';
import {
  connectMockClient,
  realDeps,
  startJoinedMatch,
  TEST_TICK_MS,
  testServerConfig,
  wireShape,
} from './harness';

/** Matchmaker bridge spy recording the US2 lifecycle events. */
interface SeatEvents {
  disconnected: SessionToken[];
  reconnected: SessionToken[];
  expired: Array<{ sessionToken: SessionToken; playerId: number | null }>;
}

function recordingBridge(): { events: SeatEvents; deps: ReturnType<typeof realDeps> } {
  const events: SeatEvents = { disconnected: [], reconnected: [], expired: [] };
  const deps = realDeps();
  deps.matchmaker = {
    onSeatDisconnected: (event) => {
      events.disconnected.push(event.sessionToken);
    },
    onSeatReconnected: (event) => {
      events.reconnected.push(event.sessionToken);
    },
    onSeatExpired: (event) => {
      events.expired.push({ sessionToken: event.sessionToken, playerId: event.playerId });
    },
  };
  return { events, deps };
}

/**
 * Poll until `predicate` holds, mirroring the unit-suite helper but
 * local to this file (the unit helper lives in server.test.ts).
 */
async function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('waitForCondition: timed out');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
}

describe('US2 acceptance (reconnection with state resync)', () => {
  it('Given a connected player drops mid-match, When they reconnect with valid session credentials within the timeout window, Then they receive a full current-state snapshot and subsequent tick deltas', {
    timeout: 10_000,
  }, async () => {
    const { events, deps } = recordingBridge();
    const h = await startJoinedMatch(deps);
    try {
      // Mid-match: let several boundaries flow so the dropping seat
      // has both history and a known last-seen tick.
      for (let i = 0; i < 3; i++) {
        await h.clients[0].nextMessage('tick');
      }
      const prevTick = ((await h.clients[0].nextMessage('tick')).payload as { tick: number }).tick;

      // Drop mid-match (client hangup = transport loss of a live seat).
      h.clients[0].socket.close(1001, 'network blip');
      await waitForCondition(() => events.disconnected.length === 1);
      expect(events.disconnected).toEqual([h.tokens[0] as SessionToken]);

      // Reconnect within the window: fresh socket, same session token.
      const returning = connectMockClient(h.server);
      returning.hello();
      await returning.nextMessage('helloAck');
      returning.joinMatch(h.match.matchId, 'player', {
        reconnectToken: h.tokens[0] as SessionToken,
      });

      // Full current-state snapshot first…
      const snapshot = await returning.nextMessage('snapshot');
      expect(snapshot.type).toBe('snapshot');
      const snap = snapshot.payload as unknown as TickBroadcastPayload;
      expect(snap.view.player).toBe(1);
      expect(snap.view.visibleCells.length).toBeGreaterThan(0);
      expect(snap.tick).toBeGreaterThanOrEqual(prevTick);

      // …and the snapshot equals fog's direct computation for the
      // restored seat over the authoritative world (wire-shape compare;
      // any cross-seat leak would fail the equality).
      const expected = wireShape(computePlayerView(h.match.engineSession.world(), 1));
      expect(wireShape(snap.view)).toEqual(expected);

      // …then subsequent tick deltas. The prescribed resync order is
      // snapshot → retained history (ascending) → live continuation,
      // so tick numbers dip back to the buffer's start before climbing
      // past the snapshot seam — each payload is a self-contained view
      // and correctness is per-phase monotonicity, not global
      // monotonicity across the snapshot boundary.
      let lastReplayTick = 0;
      let lastLiveTick = snap.tick;
      let liveSeen = 0;
      for (let i = 0; i < 48 && liveSeen < 3; i++) {
        const frame = await returning.nextMessage('tick');
        const tick = (frame.payload as { tick: number }).tick;
        if (tick <= snap.tick) {
          // Replayed history: strictly ascending, no repeats.
          expect(tick).toBeGreaterThan(lastReplayTick);
          lastReplayTick = tick;
        } else {
          // Live continuation: one boundary at a time, past the seam.
          expect(tick).toBe(lastLiveTick + 1);
          lastLiveTick = tick;
          liveSeen += 1;
        }
      }
      expect(liveSeen).toBe(3);

      // Matchmaking saw the reclaim.
      await waitForCondition(() => events.reconnected.length === 1);
      expect(events.reconnected).toEqual([h.tokens[0]]);
      expect(events.expired).toEqual([]);
    } finally {
      await h.server.close();
    }
  });

  it('Given a disconnected player whose timeout expires, When the timeout elapses, Then their forces are handled per the disconnect policy and the match continues for remaining players', {
    timeout: 10_000,
  }, async () => {
    const { events, deps } = recordingBridge();
    // Grace window of 4 ticks: expiry lands well inside the test body.
    const graceMs = 4 * TEST_TICK_MS;
    const server = createMatchServer({ ...testServerConfig(), reconnectGraceMs: graceMs }, deps);
    await server.listen();

    const match: ScriptedMatch = scriptedMatch({ boardSize: 8, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });
    const tokens = attachPlayersForMatch(server, match);

    const survivor = connectMockClient(server);
    const dropper = connectMockClient(server);
    survivor.hello();
    dropper.hello();
    await survivor.nextMessage('helloAck');
    await dropper.nextMessage('helloAck');
    survivor.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
    dropper.joinMatch(match.matchId, 'player', { requestedSeat: 2 });
    await survivor.nextMessage('joinAck');
    await dropper.nextMessage('joinAck');

    try {
      // A couple of live boundaries before the drop.
      await survivor.nextMessage('tick');

      // Player 2 drops; the clock starts.
      dropper.socket.close(1001, 'gone');
      await waitForCondition(() => events.disconnected.length === 1);

      // While the window runs, the remaining player's tick stream is
      // uninterrupted: eight consecutive boundaries without a stall.
      const survivorTicks: number[] = [];
      for (let i = 0; i < 8; i++) {
        const frame = await survivor.nextMessage('tick');
        survivorTicks.push((frame.payload as { tick: number }).tick);
      }
      expect(survivorTicks).toHaveLength(8);
      for (let i = 1; i < survivorTicks.length; i++) {
        expect(survivorTicks[i]).toBe(survivorTicks[i - 1] + 1);
      }

      // The timeout elapsed: matchmaking got the expiry event with the
      // dropped seat's identity (disconnect policy input).
      await waitForCondition(() => events.expired.length === 1);
      expect(events.expired[0]).toEqual({
        sessionToken: tokens[1] as SessionToken,
        playerId: 2,
      });

      // The seat is detached: presenting the stale token now fails —
      // the sweep consumed the binding and the seat binding is gone.
      const late = connectMockClient(server);
      late.hello();
      await late.nextMessage('helloAck');
      late.joinMatch(match.matchId, 'player', {
        reconnectToken: tokens[1] as SessionToken,
      });
      const rejection = await late.nextMessage('error');
      expect(rejection.payload).toMatchObject({ code: 'token_invalid' });

      // The match itself continues for remaining players.
      expect(server.stats().activeMatches).toBe(1);
      const stillFlowing = await survivor.nextMessage('tick');
      expect((stillFlowing.payload as { tick: number }).tick).toBeGreaterThan(survivorTicks[7]);
    } finally {
      await server.close();
    }
  });
});
