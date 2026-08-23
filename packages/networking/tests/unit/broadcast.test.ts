/**
 * Tick Broadcast Unit Tests — Feature 004 US1 (T024)
 *
 * Covers FR-005 (per-recipient fog-filtered views) and FR-006
 * (server-side skip-send delta: byte-identical views are not
 * re-sent). Uses a deterministic fog stub — the exact seam
 * `ServerDeps.fog` provides — so view identity is controlled
 * precisely; the real-engine path is exercised by the integration
 * suite.
 */

import { describe, expect, it } from 'vitest';
import { buildTickBroadcast, sendTickBroadcast } from '../../src/broadcast';
import { Connection } from '../../src/connection';
import type { FogFactory } from '../../src/contracts/network-api';
import { MatchChannel } from '../../src/match-channel';
import type { PlayerId, PlayerView } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/** A minimal valid PlayerView for stubbing fog output. The `marker`
 * rides in the cell's troopCount so mutating it flips byte-identity. */
function stubView(player: PlayerId, tick: number, marker: string): PlayerView {
  return {
    player,
    tick,
    visibleCells: [
      {
        coord: { x: 0, y: 0 },
        cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
        troopCount: marker.length + 1,
        troopOwner: player,
        pipes: new Set(),
        reservesPercent: 0,
        cityOwner: null,
      },
    ],
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: {
      boardSize: 8,
      playerCount: 2,
      tickIntervalMs: 250,
      seed: 42,
      visibilityRadius: 1,
    },
  };
}

/**
 * Fog stub returning per-player views from a mutable box. Tests flip
 * `state.marker` to simulate "the world changed" between ticks.
 */
function stubFog(state: { marker: string }): FogFactory {
  return {
    computePlayerView({ world, playerId, spectator }) {
      return spectator
        ? stubView(1, world.tick, state.marker)
        : stubView(playerId, world.tick, state.marker);
    },
  };
}

function channelWithTwoPlayers(): {
  channel: MatchChannel;
  connA: Connection;
  connB: Connection;
  sockets: [MockWebSocket, MockWebSocket];
} {
  const match = scriptedMatch({ boardSize: 8 });
  const channel = new MatchChannel({
    matchId: match.matchId,
    engineSession: match.engineSession,
    matchConfig: match.matchConfig,
  });

  const socketA = new MockWebSocket();
  const socketB = new MockWebSocket();
  const connA = new Connection({ socket: socketA, role: 'player', nowMs: 0 });
  const connB = new Connection({ socket: socketB, role: 'player', nowMs: 0 });
  connA.markJoined('token-a', 1, match.matchId);
  connB.markJoined('token-b', 2, match.matchId);
  channel.attachSeat(1, 'token-a', connA);
  channel.attachSeat(2, 'token-b', connB);

  return { channel, connA, connB, sockets: [socketA, socketB] };
}

describe('buildTickBroadcast + sendTickBroadcast', () => {
  it('with two connected players, one tick envelope is sent to each', () => {
    const { channel, connA, connB, sockets } = channelWithTwoPlayers();
    const fog = stubFog({ marker: 'v1' });
    channel.recordTick();

    const broadcast = buildTickBroadcast(channel, { fog }, 100);
    sendTickBroadcast(channel, [connA, connB], broadcast, 101);

    expect(sockets[0]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(1);
    expect(sockets[1]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(1);
  });

  it('each tick.view is the fog-filtered PlayerView for that player', () => {
    const { channel, connA, connB, sockets } = channelWithTwoPlayers();
    const fog = stubFog({ marker: 'v1' });
    channel.recordTick();

    const broadcast = buildTickBroadcast(channel, { fog }, 100);
    sendTickBroadcast(channel, [connA, connB], broadcast, 101);

    const frameA = sockets[0]?.sentFrames.find((f) => f.type === 'tick');
    const frameB = sockets[1]?.sentFrames.find((f) => f.type === 'tick');
    if (frameA?.type !== 'tick' || frameB?.type !== 'tick') {
      throw new Error('expected tick frames on both connections');
    }
    expect(frameA.payload.view.player).toBe(1);
    expect(frameB.payload.view.player).toBe(2);
  });

  it('with no intervening orders, a byte-identical second tick is skipped per connection', () => {
    const { channel, connA, connB, sockets } = channelWithTwoPlayers();
    const fog = stubFog({ marker: 'same' });

    channel.recordTick();
    const first = buildTickBroadcast(channel, { fog }, 100);
    sendTickBroadcast(channel, [connA, connB], first, 101);

    channel.recordTick();
    const second = buildTickBroadcast(channel, { fog }, 200);
    expect(second.get(connA.id)).toBe('skip');
    expect(second.get(connB.id)).toBe('skip');

    const beforeA = sockets[0]?.sentFrames.length ?? 0;
    const sentCount = sendTickBroadcast(channel, [connA, connB], second, 201);
    expect(sentCount).toBe(0);
    expect(sockets[0]?.sentFrames.length).toBe(beforeA);
  });

  it('an intervening order (changed view) makes the second tick send', () => {
    const { channel, connA, connB, sockets } = channelWithTwoPlayers();
    const state = { marker: 'before' };
    const fog = stubFog(state);

    channel.recordTick();
    sendTickBroadcast(channel, [connA, connB], buildTickBroadcast(channel, { fog }, 100), 101);

    // The order changed the world → fog output changes.
    state.marker = 'after';
    channel.recordTick();
    const second = buildTickBroadcast(channel, { fog }, 200);
    expect(second.get(connA.id)).not.toBe('skip');
    expect(second.get(connB.id)).not.toBe('skip');
    sendTickBroadcast(channel, [connA, connB], second, 201);

    expect(sockets[0]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(2);
    expect(sockets[1]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(2);
  });

  it("the tick envelope's payload.tick equals the channel's tickCounter", () => {
    const { channel, connA, sockets } = channelWithTwoPlayers();
    const fog = stubFog({ marker: 'x' });

    channel.recordTick();
    channel.recordTick();
    channel.recordTick();

    sendTickBroadcast(channel, [connA], buildTickBroadcast(channel, { fog }, 5), 6);

    const frame = sockets[0]?.sentFrames.find((f) => f.type === 'tick');
    if (frame?.type !== 'tick') {
      throw new Error('expected a tick frame');
    }
    expect(frame.payload.tick).toBe(channel.tickCounter);
    expect(frame.payload.tick).toBe(3);
  });
});
