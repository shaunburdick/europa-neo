/**
 * MatchChannel Unit Tests — Feature 004 US1 (T022)
 *
 * Covers FR-003 (per-match channel state) and FR-007 (seat binding +
 * token-theft invalidation: a second claim on the same seat closes the
 * previous socket).
 */

import type { PlayerId } from '@europa/networking';
import { describe, expect, it } from 'vitest';
import { toBranded } from '../../src/ids';
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

        const first = channel.attachSeat(toBranded<PlayerId>('player-001'), 'token-a');
        expect(first.ok).toBe(true);

        // Same triple again → no-op success, no displacement.
        const second = channel.attachSeat(toBranded<PlayerId>('player-001'), 'token-a');
        expect(second.ok).toBe(true);
        if (second.ok) {
            expect(second.displaced).toBeUndefined();
        }
        expect(channel.seats.get(toBranded<PlayerId>('player-001'))?.sessionToken).toBe('token-a');
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
        channel.attachSeat(toBranded<PlayerId>('player-001'), 'token-old', oldSocket);
        expect(oldSocket.isOpen).toBe(true);

        const result = channel.attachSeat(toBranded<PlayerId>('player-001'), 'token-new');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.displaced?.token).toBe('token-old');
        }
        expect(oldSocket.isOpen).toBe(false);
        expect(oldSocket.closes).toHaveLength(1);
        expect(channel.seats.get(toBranded<PlayerId>('player-001'))?.sessionToken).toBe('token-new');
    });

    it('detachSeat clears the seat and closes any active connection', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        const socket = new MockWebSocket();
        channel.attachSeat(toBranded<PlayerId>('player-002'), 'token-b', socket);
        channel.detachSeat(toBranded<PlayerId>('player-002'));

        expect(channel.seats.has(toBranded<PlayerId>('player-002'))).toBe(false);
        expect(socket.isOpen).toBe(false);
    });

    it('drainOrdersForTick sorts by (playerId, kind) per engine FR-018 and drains the queue', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });

        channel.enqueueOrder(
            toBranded<PlayerId>('player-b'),
            { kind: 'setReserves', player: toBranded<PlayerId>('player-b'), cell: { x: 0, y: 0 }, percent: 10 },
            1,
        );
        channel.enqueueOrder(
            toBranded<PlayerId>('player-a'),
            { kind: 'surrender', player: toBranded<PlayerId>('player-a') },
            2,
        );
        channel.enqueueOrder(
            toBranded<PlayerId>('player-b'),
            { kind: 'clearAllPipes', player: toBranded<PlayerId>('player-b'), cell: { x: 1, y: 1 } },
            3,
        );

        const drained = channel.drainOrdersForTick();
        expect(drained.map((entry) => [entry.playerId, entry.order.kind])).toEqual([
            [toBranded<PlayerId>('player-a'), 'surrender'],
            [toBranded<PlayerId>('player-b'), 'clearAllPipes'],
            [toBranded<PlayerId>('player-b'), 'setReserves'],
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
