/**
 * Spectator Session Unit Tests — Feature 004 US3 (T042)
 *
 * Covers US3 + FR-006 at the unit level: `attachSpectator` returns
 * the full-board view through fog's `{ spectator: true }` branch
 * (every cell decoded, no redaction), registers the per-connection
 * spectator presence, and announces it to matchmaking with
 * `playerId: null`; `detachSpectator` removes the presence exactly
 * once; a `joinMatch` with `role: 'spectator'` against a match where
 * `enableSpectators` was not called is rejected with
 * `match_not_joinable`.
 */

import { computePlayerView } from '@europa/fog';
import { describe, expect, it } from 'vitest';

import { Connection } from '../../src/connection';
import { MatchChannel } from '../../src/match-channel';
import { createMatchServer } from '../../src/server';
import {
  attachSpectator,
  detachSpectator,
  SPECTATOR_VIEW_SEAT,
  type SpectatorDeps,
} from '../../src/spectator';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';
import {
  connectMockClient,
  realDeps,
  TEST_TICK_MS,
  testServerConfig,
} from '../integration/harness';

/** Board edge used by every fixture here (8×8 = 64 cells). */
const BOARD_SIZE = 8;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;

/**
 * Mirror the frame encoder's Set-aware serialization so fog views
 * (whose `pipes` fields are `ReadonlySet`s) compare equal to their
 * wire form. Local copy — the shared one lives in the integration
 * harness and unit suites stay self-contained.
 */
function wireShape(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (v instanceof Set ? [...v].sort() : v)));
}

/** Matchmaker bridge spy recording the US3 presence events. */
interface BridgeEvents {
  claimed: Array<{
    playerId: number | null;
    role: string;
    sessionToken: string;
    connectionId: string;
  }>;
  disconnected: Array<{ sessionToken: string; connectionId: string }>;
}

function recordingBridge(): { events: BridgeEvents; matchmaker: SpectatorDeps['matchmaker'] } {
  const events: BridgeEvents = { claimed: [], disconnected: [] };
  const matchmaker: SpectatorDeps['matchmaker'] = {
    onSeatClaimed: (event) => {
      events.claimed.push({
        playerId: event.playerId,
        role: event.role,
        sessionToken: event.sessionToken,
        connectionId: event.connectionId,
      });
    },
    onSeatDisconnected: (event) => {
      events.disconnected.push({
        sessionToken: event.sessionToken,
        connectionId: event.connectionId,
      });
    },
  };
  return { events, matchmaker };
}

/**
 * A greeted connection + channel fixture with real fog deps. The
 * gate starts closed; tests flip `channel.spectatorsAllowed` to
 * model `enableSpectators`.
 */
function spectatorFixture(): {
  channel: MatchChannel;
  socket: MockWebSocket;
  connection: Connection;
  events: BridgeEvents;
  deps: SpectatorDeps;
} {
  const match = scriptedMatch({ boardSize: BOARD_SIZE });
  const channel = new MatchChannel({
    matchId: match.matchId,
    engineSession: match.engineSession,
    matchConfig: match.matchConfig,
  });
  const socket = new MockWebSocket();
  const connection = new Connection({ socket, role: 'player', nowMs: 0 });
  connection.markGreeted();
  const { events, matchmaker } = recordingBridge();
  const deps: SpectatorDeps = { fog: realDeps().fog, matchmaker };
  return { channel, socket, connection, events, deps };
}

describe('attachSpectator', () => {
  it('returns the full-board view (no redaction) and registers the spectator presence', () => {
    const { channel, connection, events, deps } = spectatorFixture();
    channel.spectatorsAllowed = true;

    const result = attachSpectator(channel, connection, deps, 1_000);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Full board: every cell decoded exactly once, including cells
    // far outside any seated player's horizon.
    expect(result.snapshot.view.visibleCells).toHaveLength(TOTAL_CELLS);
    const coords = new Set(
      result.snapshot.view.visibleCells.map((cell) => `${cell.coord.x},${cell.coord.y}`),
    );
    expect(coords.size).toBe(TOTAL_CELLS);

    // The view is exactly fog's spectator-branch output over the
    // authoritative world (static world in a unit fixture → exact
    // wire-shape equality holds).
    const expected = wireShape(
      computePlayerView(channel.engineSession.world(), SPECTATOR_VIEW_SEAT, {
        spectator: true,
      }),
    );
    expect(wireShape(result.snapshot.view)).toEqual(expected);

    // No-seat sentinel on the view; null seat on the connection.
    expect(result.snapshot.view.player).toBe(SPECTATOR_VIEW_SEAT);
    expect(connection.role).toBe('spectator');
    expect(connection.state()).toBe('joined');
    expect(connection.playerId).toBeNull();

    // Presence registered on the channel under the connection id.
    expect(channel.spectators.has(connection.id)).toBe(true);

    // Snapshot boundary matches the channel counter.
    expect(result.snapshot.tick).toBe(channel.tickCounter);

    // Matchmaking heard the claim with playerId null + spectator role.
    expect(events.claimed).toEqual([
      {
        playerId: null,
        role: 'spectator',
        sessionToken: result.sessionToken,
        connectionId: connection.id,
      },
    ]);
  });

  it('rejects with match_not_joinable when the gate is closed and mutates nothing', () => {
    const { channel, socket, connection, events, deps } = spectatorFixture();
    expect(channel.spectatorsAllowed).toBe(false);

    const result = attachSpectator(channel, connection, deps, 1_000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('match_not_joinable');

    // The rejection rode an error frame back to the client.
    const errorFrame = socket.sentFrames.find((frame) => frame.type === 'error');
    expect(errorFrame?.payload).toMatchObject({ code: 'match_not_joinable' });

    // Nothing was bound: no presence, no role flip, no bridge event.
    expect(channel.spectators.size).toBe(0);
    expect(connection.role).toBe('player');
    expect(connection.state()).toBe('greeted');
    expect(events.claimed).toEqual([]);
  });
});

describe('detachSpectator', () => {
  it('removes the presence, cleans the delta cache, and fires onSeatDisconnected once', () => {
    const { channel, connection, events, deps } = spectatorFixture();
    channel.spectatorsAllowed = true;
    const attached = attachSpectator(channel, connection, deps, 1_000);
    if (!attached.ok) {
      throw new Error('fixture attach failed');
    }
    // Simulate a delivered tick view so cache cleanup is observable.
    channel.lastSentView.set(connection.id, attached.snapshot.view);

    expect(detachSpectator(channel, connection.id, deps)).toBe(true);
    expect(channel.spectators.has(connection.id)).toBe(false);
    expect(channel.lastSentView.has(connection.id)).toBe(false);
    expect(events.disconnected).toEqual([
      { sessionToken: attached.sessionToken, connectionId: connection.id },
    ]);

    // Idempotent: second detach removes nothing and fires nothing.
    expect(detachSpectator(channel, connection.id, deps)).toBe(false);
    expect(events.disconnected).toHaveLength(1);
  });
});

describe('server-level spectator gating (T042)', () => {
  it('a joinMatch with role spectator against a match where enableSpectators was not called is rejected with match_not_joinable', async () => {
    const server = createMatchServer(testServerConfig(), realDeps());
    const match = scriptedMatch({ boardSize: BOARD_SIZE, tickRateMs: TEST_TICK_MS });
    server.registerMatch({
      matchId: match.matchId,
      engineSession: match.engineSession,
      matchConfig: match.matchConfig,
    });

    const spectator = connectMockClient(server);
    spectator.hello();
    await spectator.nextMessage('helloAck');
    spectator.joinMatch(match.matchId, 'spectator');

    const rejection = await spectator.nextMessage('error');
    expect(rejection.payload.code).toBe('match_not_joinable');
    expect(server.stats().activeConnections).toBe(0);

    await server.close();
  });
});
