/**
 * MatchChannel Unit Tests — Feature 004 US1 (T022)
 *
 * Covers FR-003 (per-match channel state) and FR-007 (seat binding +
 * token-theft invalidation: a second claim on the same seat closes the
 * previous socket). Issue #74: seat keys are canonical `PlayerId`
 * strings and the order drain uses the explicit UTF-16 comparator
 * (never numeric subtraction or `localeCompare`).
 */

import { parsePlayerId } from '@europa/core';

import { describe, expect, it } from 'vitest';

import { Connection } from '../../src/connection';
import { MatchChannel } from '../../src/match-channel';
import type { PlayerId } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/**
 * Build a channel over a fresh scripted match plus its two canonical
 * slot identities.
 *
 * @returns The channel and `[slot1, slot2]` identities.
 */
function channelFixture(): { channel: MatchChannel; ids: [PlayerId, PlayerId] } {
    const match = scriptedMatch();
    const channel = new MatchChannel({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    const [first, second] = match.playerIds;
    if (first === undefined || second === undefined) {
        throw new Error('channelFixture: scripted match is missing player ids');
    }
    return { channel, ids: [first, second] };
}

describe('MatchChannel', () => {
    it('constructed from scriptedMatch exposes match state with empty seats and tickCounter 0', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        expect(channel.matchId).toBe(match.matchId);
        expect(channel.engineSession).toBe(match.engineSession);
        expect(channel.matchConfig).toBe(match.matchConfig);
        expect(channel.seats.size).toBe(0);
        expect(channel.tickCounter).toBe(0);
        expect(channel.pendingOrders).toHaveLength(0);
        expect(channel.spectatorsAllowed).toBe(false);
        expect(channel.terminalSent).toBe(false);
    });

    it('attachSeat populates the seat and is idempotent on the (playerId, token) triple', () => {
        const { channel, ids } = channelFixture();
        const [p1] = ids;

        const first = channel.attachSeat(p1, 'token-a');
        expect(first.ok).toBe(true);

        // Same triple again → no-op success, no displacement.
        const second = channel.attachSeat(p1, 'token-a');
        expect(second.ok).toBe(true);
        if (second.ok) {
            expect(second.displaced).toBeUndefined();
        }
        expect(channel.seats.get(p1)?.sessionToken).toBe('token-a');
        expect(channel.seats.size).toBe(1);
    });

    it('attachSeat with a different token invalidates the previous binding and closes its socket', () => {
        const { channel, ids } = channelFixture();
        const [p1] = ids;

        const oldSocket = new MockWebSocket();
        channel.attachSeat(p1, 'token-old', oldSocket);
        expect(oldSocket.isOpen).toBe(true);

        const result = channel.attachSeat(p1, 'token-new');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.displaced?.token).toBe('token-old');
        }
        expect(oldSocket.isOpen).toBe(false);
        expect(oldSocket.closes).toHaveLength(1);
        expect(channel.seats.get(p1)?.sessionToken).toBe('token-new');
    });

    it('detachSeat clears the seat and closes any active connection', () => {
        const { channel, ids } = channelFixture();
        const [, p2] = ids;

        const socket = new MockWebSocket();
        channel.attachSeat(p2, 'token-b', socket);
        channel.detachSeat(p2);

        expect(channel.seats.has(p2)).toBe(false);
        expect(socket.isOpen).toBe(false);
    });

    it('drainOrdersForTick sorts by (playerId, kind) per engine FR-018 and drains the queue', () => {
        const { channel, ids } = channelFixture();
        const [p1, p2] = ids;

        channel.enqueueOrder(p2, { kind: 'setReserves', player: p2, cell: { x: 0, y: 0 }, percent: 10 }, 1);
        channel.enqueueOrder(p1, { kind: 'surrender', player: p1 }, 2);
        channel.enqueueOrder(p2, { kind: 'clearAllPipes', player: p2, cell: { x: 1, y: 1 } }, 3);

        const drained = channel.drainOrdersForTick();
        expect(drained.map((entry) => [entry.playerId, entry.order.kind])).toEqual([
            [p1, 'surrender'],
            [p2, 'clearAllPipes'],
            [p2, 'setReserves'],
        ]);
        expect(channel.pendingOrders).toHaveLength(0);
        // Second drain is empty.
        expect(channel.drainOrdersForTick()).toHaveLength(0);
    });

    it('drainOrdersForTick orders by UTF-16 code units, not insertion order', () => {
        const { channel } = channelFixture();
        // Deliberately reverse-lexical insertion: the lower code-unit id
        // must drain first regardless of when it was enqueued.
        const lower = 'aaaaaaaaaa01' as PlayerId;
        const upper = 'zzzzzzzzzz01' as PlayerId;

        channel.enqueueOrder(upper, { kind: 'surrender', player: upper }, 1);
        channel.enqueueOrder(lower, { kind: 'surrender', player: lower }, 2);

        const drained = channel.drainOrdersForTick();
        expect(drained.map((entry) => entry.playerId)).toEqual([lower, upper]);
    });

    it('connections() orders seats by UTF-16 code units regardless of attach order', () => {
        const { channel, ids } = channelFixture();
        const [p1, p2] = ids;
        const socketA = new MockWebSocket();
        const socketB = new MockWebSocket();
        const connA = new Connection({ socket: socketA, role: 'player', nowMs: 0 });
        const connB = new Connection({ socket: socketB, role: 'player', nowMs: 0 });

        // Attach the lexically GREATER id first so insertion order is the
        // inverse of canonical order.
        const greater = p1 < p2 ? p2 : p1;
        const lesser = p1 < p2 ? p1 : p2;
        const connForGreater = greater === p1 ? connA : connB;
        const connForLesser = lesser === p1 ? connA : connB;
        connForGreater.markJoined('token-g', greater, channel.matchId);
        connForLesser.markJoined('token-l', lesser, channel.matchId);
        channel.attachSeat(greater, 'token-g', connForGreater);
        channel.attachSeat(lesser, 'token-l', connForLesser);

        expect(channel.connections().map((c) => c.playerId)).toEqual([lesser, greater]);
    });

    it('recordTick increments tickCounter monotonically', () => {
        const { channel } = channelFixture();

        channel.recordTick();
        channel.recordTick();
        expect(channel.tickCounter).toBe(2);
    });

    it('joinAckPlayers labels each player by its own seat, not canonical registry order (issue #74 B2)', () => {
        // Deliberately reverse-lexical placement: seat 1's id is lexically
        // GREATER than seat 2's, so the engine's canonical UTF-16 registry
        // order (`world.players`) is the INVERSE of seat/placement order.
        // Overlaying displayNames by registry index would swap the labels.
        const seatOne = parsePlayerId('Player000002');
        const seatTwo = parsePlayerId('Player000001');
        const match = scriptedMatch({
            playerIds: [seatOne, seatTwo],
            displayNames: ['Alpha', 'Bravo'],
        });
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
            displayNames: match.displayNames,
        });

        // Registry order is canonical (seatTwo's id first), proving the
        // fixture actually exercises the seat-order ≠ registry-order case.
        expect(channel.engineSession.world().players.map((p) => p.id)).toEqual([seatTwo, seatOne]);

        const nameById = new Map(channel.joinAckPlayers().map((player) => [player.id, player.displayName]));
        expect(nameById.get(seatOne)).toBe('Alpha');
        expect(nameById.get(seatTwo)).toBe('Bravo');
    });
});
