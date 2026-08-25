/**
 * MatchChannel Unit Tests — Feature 004 US1 (T022)
 *
 * Covers FR-003 (per-match channel state) and FR-007 (seat binding +
 * token-theft invalidation: a second claim on the same seat closes the
 * previous socket).
 */

import { describe, expect, it } from 'vitest';

import { MatchChannel } from '../../src/match-channel';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

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
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        const first = channel.attachSeat(1, 'token-a');
        expect(first.ok).toBe(true);

        // Same triple again → no-op success, no displacement.
        const second = channel.attachSeat(1, 'token-a');
        expect(second.ok).toBe(true);
        if (second.ok) {
            expect(second.displaced).toBeUndefined();
        }
        expect(channel.seats.get(1)?.sessionToken).toBe('token-a');
        expect(channel.seats.size).toBe(1);
    });

    it('attachSeat with a different token invalidates the previous binding and closes its socket', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        const oldSocket = new MockWebSocket();
        channel.attachSeat(1, 'token-old', oldSocket);
        expect(oldSocket.isOpen).toBe(true);

        const result = channel.attachSeat(1, 'token-new');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.displaced?.token).toBe('token-old');
        }
        expect(oldSocket.isOpen).toBe(false);
        expect(oldSocket.closes).toHaveLength(1);
        expect(channel.seats.get(1)?.sessionToken).toBe('token-new');
    });

    it('detachSeat clears the seat and closes any active connection', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        const socket = new MockWebSocket();
        channel.attachSeat(2, 'token-b', socket);
        channel.detachSeat(2);

        expect(channel.seats.has(2)).toBe(false);
        expect(socket.isOpen).toBe(false);
    });

    it('drainOrdersForTick sorts by (playerId, kind) per engine FR-018 and drains the queue', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        channel.enqueueOrder(2, { kind: 'setReserves', player: 2, cell: { x: 0, y: 0 }, percent: 10 }, 1);
        channel.enqueueOrder(1, { kind: 'surrender', player: 1 }, 2);
        channel.enqueueOrder(2, { kind: 'clearAllPipes', player: 2, cell: { x: 1, y: 1 } }, 3);

        const drained = channel.drainOrdersForTick();
        expect(drained.map((entry) => [entry.playerId, entry.order.kind])).toEqual([
            [1, 'surrender'],
            [2, 'clearAllPipes'],
            [2, 'setReserves'],
        ]);
        expect(channel.pendingOrders).toHaveLength(0);
        // Second drain is empty.
        expect(channel.drainOrdersForTick()).toHaveLength(0);
    });

    it('recordTick increments tickCounter monotonically', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        channel.recordTick();
        channel.recordTick();
        expect(channel.tickCounter).toBe(2);
    });
});
