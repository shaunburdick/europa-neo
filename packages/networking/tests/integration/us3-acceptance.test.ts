/**
 * US3 Acceptance Tests — Feature 004 (T043)
 *
 * The US3 acceptance scenario from spec.md, exercised end-to-end
 * through the real server orchestrator, real engine, and real fog:
 * a third client attaches mid-match as a spectator and receives the
 * full-board snapshot plus unfiltered subsequent ticks; any order it
 * submits is rejected read-only without touching game state; and a
 * departing spectator's view delivery stops while the player seats
 * continue undisturbed.
 *
 * Test descriptions are the spec's Given/When/Then wording verbatim
 * (spec-kit convention: the test IS the acceptance criterion).
 */

import { describe, expect, it } from 'vitest';

import { createMatchServer } from '../../src/server';
import type {
  JoinAckPayload,
  Order,
  ProtocolEnvelope,
  SessionToken,
  TickBroadcastPayload,
} from '../../src/types';
import { scriptedMatch } from '../fixtures/match';
import {
  connectMockClient,
  realDeps,
  startJoinedMatch,
  TEST_TICK_MS,
  testServerConfig,
} from './harness';

/** Board edge used by the harness fixture (8×8 = 64 cells). */
const BOARD_SIZE = 8;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;

/**
 * A cell outside BOTH players' horizons: Chebyshev distance ≥ 5 from
 * P1's home (1,1) and P2's home (6,6), far beyond the visibility
 * radius. Present in full-board (spectator) views only — its absence
 * from player views is what makes "unfiltered" observable.
 */
const FOGGED_COORD = { x: 7, y: 0 };

function hasCell(
  view: TickBroadcastPayload['view'],
  coord: Readonly<{ x: number; y: number }>,
): boolean {
  return view.visibleCells.some((cell) => cell.coord.x === coord.x && cell.coord.y === coord.y);
}

/** Matchmaker bridge spy recording the US3 presence events. */
interface SpectatorEvents {
  claimed: Array<{ playerId: number | null; role: string; sessionToken: string }>;
  disconnected: Array<{ sessionToken: SessionToken }>;
}

function recordingBridge(): { events: SpectatorEvents; deps: ReturnType<typeof realDeps> } {
  const events: SpectatorEvents = { claimed: [], disconnected: [] };
  const deps = realDeps();
  deps.matchmaker = {
    onSeatClaimed: (event) => {
      events.claimed.push({
        playerId: event.playerId,
        role: event.role,
        sessionToken: event.sessionToken,
      });
    },
    onSeatDisconnected: (event) => {
      events.disconnected.push({ sessionToken: event.sessionToken });
    },
  };
  return { events, deps };
}

/**
 * Poll until `predicate` holds (transport-close handling runs on the
 * socket event, but the poll keeps the assertion jitter-tolerant).
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

/** Attach a spectator client to an enabled gate mid-match. Returns
 * the client plus its already-consumed joinAck (the helper awaits it
 * so callers never re-read the per-client cursor). */
async function attachSpectatorClient(h: Awaited<ReturnType<typeof startJoinedMatch>>): Promise<{
  spectator: ReturnType<typeof connectMockClient>;
  joinAck: ProtocolEnvelope;
}> {
  h.server.enableSpectators(h.match.matchId);
  const spectator = connectMockClient(h.server);
  spectator.hello();
  await spectator.nextMessage('helloAck');
  spectator.joinMatch(h.match.matchId, 'spectator', { displayName: 'Watcher' });
  const joinAck = await spectator.nextMessage('joinAck');
  return { spectator, joinAck };
}

describe('US3 acceptance (late-join spectating)', () => {
  it('Given a running match, When a spectator connects, Then they receive a full snapshot and all subsequent ticks unfiltered', {
    timeout: 10_000,
  }, async () => {
    const { events, deps } = recordingBridge();
    const h = await startJoinedMatch(deps);
    try {
      // Late join: let the match run before the observer arrives.
      await h.clients[0].nextMessage('tick');
      await h.clients[0].nextMessage('tick');

      const { spectator, joinAck } = await attachSpectatorClient(h);

      // Full snapshot: null seat, every cell decoded exactly once…
      expect(joinAck.type).toBe('joinAck');
      const ack = joinAck.payload as unknown as JoinAckPayload;
      expect(ack.playerId).toBeNull();
      expect(ack.view.visibleCells).toHaveLength(TOTAL_CELLS);
      expect(ack.view.config.boardSize).toBe(BOARD_SIZE);
      const coords = new Set(
        ack.view.visibleCells.map((cell) => `${cell.coord.x},${cell.coord.y}`),
      );
      expect(coords.size).toBe(TOTAL_CELLS);

      // …unfiltered: includes cells no seated player can see.
      expect(hasCell(ack.view, FOGGED_COORD)).toBe(true);

      // Matchmaking heard the claim with playerId null + role spectator
      // (after the two player claims from harness setup).
      await waitForCondition(() => events.claimed.length === 3);
      expect(events.claimed[2]).toMatchObject({ playerId: null, role: 'spectator' });

      // All subsequent ticks: full-board, unfiltered, one per
      // boundary (strictly consecutive tick numbers).
      let prevTick: number | null = null;
      for (let i = 0; i < 5; i++) {
        const frame = await spectator.nextMessage('tick');
        const payload = frame.payload as unknown as TickBroadcastPayload;
        expect(payload.view.visibleCells).toHaveLength(TOTAL_CELLS);
        expect(hasCell(payload.view, FOGGED_COORD)).toBe(true);
        if (prevTick !== null) {
          expect(payload.tick).toBe(prevTick + 1);
        }
        prevTick = payload.tick;
      }

      // The player seats were undisturbed by the attach: seat 1's
      // fog-filtered stream continues AND stays filtered (the fogged
      // corner never leaks into a player view — FR-005 / SC-004).
      const playerFrame = await h.clients[0].nextMessage('tick');
      const playerView = (playerFrame.payload as unknown as TickBroadcastPayload).view;
      expect(playerView.player).toBe(1);
      expect(playerView.visibleCells.length).toBeLessThan(TOTAL_CELLS);
      expect(hasCell(playerView, FOGGED_COORD)).toBe(false);
    } finally {
      await h.server.close();
    }
  });

  it('Given a spectator attached to a running match, When the spectator submits an order, Then the order is rejected with spectator_readonly and game state is unaffected', {
    timeout: 10_000,
  }, async () => {
    const h = await startJoinedMatch(realDeps());
    try {
      await h.clients[0].nextMessage('tick');
      const { spectator } = await attachSpectatorClient(h);

      const order: Order = {
        kind: 'setPipe',
        player: 1,
        cell: { x: 5, y: 5 },
        direction: 'N',
      };
      spectator.order(order);

      // Protocol-level rejection (not an orderAck.ok:false): the
      // spectator role is checked before anything touches the queue.
      const rejection = await spectator.nextMessage('error');
      expect(rejection.payload.code).toBe('spectator_readonly');

      // Game state unaffected: no orders are in flight in this
      // script, so the next boundaries must carry zero applied
      // orders — the rejected one never reached the engine queue.
      for (let i = 0; i < 3; i++) {
        const frame = await spectator.nextMessage('tick');
        const payload = frame.payload as unknown as TickBroadcastPayload;
        expect(payload.view.events.appliedOrders).toHaveLength(0);
      }

      // The match itself is untouched: both seats still stream.
      await h.clients[0].nextMessage('tick');
      await h.clients[1].nextMessage('tick');
    } finally {
      await h.server.close();
    }
  });

  it('Given a spectator attached to a running match, When the spectator detaches, Then view delivery stops without disturbing the player seats', {
    timeout: 10_000,
  }, async () => {
    const { events, deps } = recordingBridge();
    const h = await startJoinedMatch(deps);
    try {
      await h.clients[0].nextMessage('tick');
      const { spectator, joinAck } = await attachSpectatorClient(h);

      const spectatorToken = (joinAck.payload as unknown as JoinAckPayload).sessionToken;

      const framesBeforeDetach = spectator.socket.sentFrames.length;

      // Detach = transport hangup (the only client-side lever); the
      // server routes it through detachSpectator internally.
      spectator.socket.close(1001, 'leaving');

      // Bridge saw exactly one departure, carrying the spectator's
      // own per-connection token (the two player seats stay put).
      await waitForCondition(() => events.disconnected.length === 1);
      expect(events.disconnected).toEqual([{ sessionToken: spectatorToken }]);
      expect(events.claimed).toHaveLength(3);
      expect(events.claimed[2]).toEqual({
        playerId: null,
        role: 'spectator',
        sessionToken: spectatorToken,
      });

      // View delivery stopped: three further boundaries reach the
      // players while the detached socket receives nothing more.
      const survivorTicks: number[] = [];
      for (let i = 0; i < 3; i++) {
        const frame = await h.clients[0].nextMessage('tick');
        survivorTicks.push((frame.payload as { tick: number }).tick);
        expect(spectator.socket.sentFrames).toHaveLength(framesBeforeDetach);
      }
      for (let i = 1; i < survivorTicks.length; i++) {
        expect(survivorTicks[i]).toBe(survivorTicks[i - 1] + 1);
      }

      // Connection accounting dropped back to the two seats.
      expect(h.server.stats().activeConnections).toBe(2);
    } finally {
      await h.server.close();
    }
  });

  it('Given spectators disabled on a running match, When a spectator tries to connect, Then the attach is refused with match_not_joinable', {
    timeout: 10_000,
  }, async () => {
    // Dedicated server so the gate has never been opened for this
    // match (startJoinedMatch leaves gates untouched → closed).
    const server = createMatchServer(testServerConfig(), realDeps());
    await server.listen();
    const match = scriptedMatch({ boardSize: BOARD_SIZE, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });

    try {
      const spectator = connectMockClient(server);
      spectator.hello();
      await spectator.nextMessage('helloAck');
      spectator.joinMatch(match.matchId, 'spectator', { displayName: 'Watcher' });

      const rejection = await spectator.nextMessage('error');
      expect(rejection.payload.code).toBe('match_not_joinable');
      expect(server.stats().activeConnections).toBe(0);
    } finally {
      await server.close();
    }
  });
});
