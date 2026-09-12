/**
 * Tick Broadcast Unit Tests — Feature 004 US1 (T024)
 *
 * Covers FR-005 (per-recipient fog-filtered views) and FR-006
 * (server-side skip-send delta: byte-identical views are not
 * re-sent). Uses a deterministic fog stub — the exact seam
 * `ServerDeps.fog` provides — so view identity is controlled
 * precisely; the real-engine path is exercised by the integration
 * suite. Issue #74: identity is the canonical string `PlayerId`.
 */

import { describe, expect, it } from 'vitest';

import { buildTickBroadcast, sendTickBroadcast, viewsEqual } from '../../src/broadcast';
import { Connection } from '../../src/connection';
import type { FogFactory } from '../../src/contracts/network-api';
import { MatchChannel } from '../../src/match-channel';
import { SPECTATOR_VIEW_PLAYER_ID } from '../../src/spectator';
import type { PlayerId, PlayerView } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/** The scripted fixture's slot-1 identity (used for view equality samples). */
const P1 = 'Player000001' as PlayerId;
/** The scripted fixture's slot-2 identity. */
const P2 = 'Player000002' as PlayerId;

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
            playerIds: [P1, P2],
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
                ? stubView(SPECTATOR_VIEW_PLAYER_ID, world.tick, state.marker)
                : stubView(playerId, world.tick, state.marker);
        },
    };
}

function channelWithTwoPlayers(): {
    channel: MatchChannel;
    connA: Connection;
    connB: Connection;
    ids: [PlayerId, PlayerId];
    sockets: [MockWebSocket, MockWebSocket];
} {
    const match = scriptedMatch({ boardSize: 8 });
    const channel = new MatchChannel({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    const [p1, p2] = match.playerIds;
    if (p1 === undefined || p2 === undefined) {
        throw new Error('channelWithTwoPlayers: fixture missing player ids');
    }

    const socketA = new MockWebSocket();
    const socketB = new MockWebSocket();
    const connA = new Connection({ socket: socketA, role: 'player', nowMs: 0 });
    const connB = new Connection({ socket: socketB, role: 'player', nowMs: 0 });
    connA.markJoined('token-a', p1, match.matchId);
    connB.markJoined('token-b', p2, match.matchId);
    channel.attachSeat(p1, 'token-a', connA);
    channel.attachSeat(p2, 'token-b', connB);

    return { channel, connA, connB, ids: [p1, p2], sockets: [socketA, socketB] };
}

describe('buildTickBroadcast + sendTickBroadcast', () => {
    it('with two connected players, one tick envelope is sent to each', () => {
        const { channel, connA, connB, sockets } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'v1' });
        channel.recordTick();

        const { broadcast } = buildTickBroadcast(channel, { fog }, 100);
        sendTickBroadcast(channel, [connA, connB], broadcast, 101);

        expect(sockets[0]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(1);
        expect(sockets[1]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(1);
    });

    it('each tick.view is the fog-filtered PlayerView for that player', () => {
        const { channel, connA, connB, ids, sockets } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'v1' });
        channel.recordTick();

        const { broadcast } = buildTickBroadcast(channel, { fog }, 100);
        sendTickBroadcast(channel, [connA, connB], broadcast, 101);

        const frameA = sockets[0]?.sentFrames.find((f) => f.type === 'tick');
        const frameB = sockets[1]?.sentFrames.find((f) => f.type === 'tick');
        if (frameA?.type !== 'tick' || frameB?.type !== 'tick') {
            throw new Error('expected tick frames on both connections');
        }
        expect(frameA.payload.view.player).toBe(ids[0]);
        expect(frameB.payload.view.player).toBe(ids[1]);
    });

    it('with no intervening orders, a byte-identical second tick is skipped per connection', () => {
        const { channel, connA, connB, sockets } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'same' });

        channel.recordTick();
        const first = buildTickBroadcast(channel, { fog }, 100);
        sendTickBroadcast(channel, [connA, connB], first.broadcast, 101);

        channel.recordTick();
        const second = buildTickBroadcast(channel, { fog }, 200);
        expect(second.broadcast.get(connA.id)).toBe('skip');
        expect(second.broadcast.get(connB.id)).toBe('skip');

        const beforeA = sockets[0]?.sentFrames.length ?? 0;
        const sentCount = sendTickBroadcast(channel, [connA, connB], second.broadcast, 201);
        expect(sentCount).toBe(0);
        expect(sockets[0]?.sentFrames.length).toBe(beforeA);
    });

    it('an intervening order (changed view) makes the second tick send', () => {
        const { channel, connA, connB, sockets } = channelWithTwoPlayers();
        const state = { marker: 'before' };
        const fog = stubFog(state);

        channel.recordTick();
        sendTickBroadcast(channel, [connA, connB], buildTickBroadcast(channel, { fog }, 100).broadcast, 101);

        // The order changed the world → fog output changes.
        state.marker = 'after';
        channel.recordTick();
        const second = buildTickBroadcast(channel, { fog }, 200);
        expect(second.broadcast.get(connA.id)).not.toBe('skip');
        expect(second.broadcast.get(connB.id)).not.toBe('skip');
        sendTickBroadcast(channel, [connA, connB], second.broadcast, 201);

        expect(sockets[0]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(2);
        expect(sockets[1]?.sentFrames.filter((f) => f.type === 'tick')).toHaveLength(2);
    });

    it("the tick envelope's payload.tick equals the channel's tickCounter", () => {
        const { channel, connA, sockets } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'x' });

        channel.recordTick();
        channel.recordTick();
        channel.recordTick();

        sendTickBroadcast(channel, [connA], buildTickBroadcast(channel, { fog }, 5).broadcast, 6);

        const frame = sockets[0]?.sentFrames.find((f) => f.type === 'tick');
        if (frame?.type !== 'tick') {
            throw new Error('expected a tick frame');
        }
        expect(frame.payload.tick).toBe(channel.tickCounter);
        expect(frame.payload.tick).toBe(3);
    });
});

// ----------------------------------------------------------------------------
// viewsEqual (FR-020: zero-allocation structural comparison)
// ----------------------------------------------------------------------------

describe('viewsEqual', () => {
    it('returns true for identical views', () => {
        const view = stubView(P1, 10, 'same');
        expect(viewsEqual(view, view)).toBe(true);
    });

    it('returns true for structurally equal views with different tick', () => {
        const a = stubView(P1, 10, 'same');
        const b = stubView(P1, 99, 'same');
        // viewsEqual ignores the tick field (wire payload stamp is authoritative).
        expect(viewsEqual(a, b)).toBe(true);
    });

    it('returns false when player differs', () => {
        const a = stubView(P1, 10, 'same');
        const b = stubView(P2, 10, 'same');
        expect(viewsEqual(a, b)).toBe(false);
    });

    it('returns false when visibleCells length differs', () => {
        const a: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [
                {
                    coord: { x: 0, y: 0 },
                    cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
                    troopCount: 2,
                    troopOwner: P1,
                    pipes: new Set(),
                    reservesPercent: 0,
                    cityOwner: null,
                },
            ],
        };
        const b: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [],
        };
        expect(viewsEqual(a, b)).toBe(false);
    });

    it('returns false when a cell field differs', () => {
        const base: PlayerView = stubView(P1, 10, 'x');
        const baseCell = base.visibleCells[0];
        if (!baseCell) {
            throw new Error('expected at least one visible cell in base view');
        }
        const modified: PlayerView = {
            ...base,
            visibleCells: [
                {
                    ...baseCell,
                    troopCount: 999,
                },
            ],
        };
        expect(viewsEqual(base, modified)).toBe(false);
    });

    it('returns false when pipes (Set) differ', () => {
        const a: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [
                {
                    coord: { x: 0, y: 0 },
                    cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
                    troopCount: 2,
                    troopOwner: P1,
                    pipes: new Set(['N' as const]),
                    reservesPercent: 0,
                    cityOwner: null,
                },
            ],
        };
        const b: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [
                {
                    coord: { x: 0, y: 0 },
                    cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
                    troopCount: 2,
                    troopOwner: P1,
                    pipes: new Set(['S' as const]),
                    reservesPercent: 0,
                    cityOwner: null,
                },
            ],
        };
        expect(viewsEqual(a, b)).toBe(false);
    });

    it('returns true when pipes (Set) are equal but in different order', () => {
        const a: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [
                {
                    coord: { x: 0, y: 0 },
                    cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
                    troopCount: 2,
                    troopOwner: P1,
                    pipes: new Set(['N' as const, 'E' as const]),
                    reservesPercent: 0,
                    cityOwner: null,
                },
            ],
        };
        const b: PlayerView = {
            ...stubView(P1, 10, 'x'),
            visibleCells: [
                {
                    coord: { x: 0, y: 0 },
                    cell: { x: 0, y: 0, terrain: 'land', elevation: 0 },
                    troopCount: 2,
                    troopOwner: P1,
                    pipes: new Set(['E' as const, 'N' as const]),
                    reservesPercent: 0,
                    cityOwner: null,
                },
            ],
        };
        expect(viewsEqual(a, b)).toBe(true);
    });

    it('returns false when events array lengths differ', () => {
        const a = stubView(P1, 10, 'x');
        const b: PlayerView = {
            ...a,
            events: {
                combat: [
                    {
                        tick: 1,
                        cell: { x: 0, y: 0 },
                        attacker: P1,
                        defender: P2,
                        attackerLoss: 1,
                        defenderLoss: 1,
                        winner: P1,
                        attackerTotal: 5,
                        defenderTotal: 5,
                    },
                ],
                captures: [],
                eliminations: [],
                appliedOrders: [],
                errors: [],
            },
        };
        expect(viewsEqual(a, b)).toBe(false);
    });

    it('returns false when config differs', () => {
        const a = stubView(P1, 10, 'x');
        const b: PlayerView = {
            ...a,
            config: { ...a.config, boardSize: 16 },
        };
        expect(viewsEqual(a, b)).toBe(false);
    });

    it('returns false when the ordered playerIds config differs', () => {
        const a = stubView(P1, 10, 'x');
        const b: PlayerView = {
            ...a,
            config: { ...a.config, playerIds: [P2, P1] },
        };
        expect(viewsEqual(a, b)).toBe(false);
    });
});

// ----------------------------------------------------------------------------
// Broadcast view cache (FR-018)
// ----------------------------------------------------------------------------

describe('buildTickBroadcast view cache', () => {
    it('returns a view cache with entries for each player and spectator', () => {
        const { channel, ids } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'v1' });
        channel.recordTick();

        const { viewCache } = buildTickBroadcast(channel, { fog }, 100);
        expect(viewCache[ids[0]]).toBeDefined();
        expect(viewCache[ids[1]]).toBeDefined();
        expect(viewCache.spectator).toBeUndefined();
    });

    it('cache entry for a player matches the view sent to that player', () => {
        const { channel, connA, ids } = channelWithTwoPlayers();
        const fog = stubFog({ marker: 'v1' });
        channel.recordTick();

        const { broadcast, viewCache } = buildTickBroadcast(channel, { fog }, 100);
        const payload = broadcast.get(connA.id);
        expect(payload).not.toBe('skip');
        if (payload !== 'skip' && payload !== undefined) {
            expect(viewCache[ids[0]]).toBe(payload.view);
        }
    });
});
