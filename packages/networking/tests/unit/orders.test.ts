/**
 * Orders Pipeline Unit Tests — Feature 004 US1 (T023)
 *
 * Covers FR-002 (per-connection sequencing), FR-008 (protocol-level
 * rejections vs engine-level acks), FR-010 (token-bucket rate
 * limiting: burst capacity, lazy refill, protocol-level
 * `rate_limited` rejection).
 */

import { describe, expect, it } from 'vitest';

import { Connection } from '../../src/connection';
import { MatchChannel } from '../../src/match-channel';
import { acceptOrder } from '../../src/orders';
import type { Order } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

/** Rate-limit config matching T023's arithmetic: 5/s × 2 burst = 10 tokens. */
const RATE_5S_BURST2 = { ordersPerSecond: 5, burstFactor: 2 };

function joinedPlayerChannel(): {
    channel: MatchChannel;
    connection: Connection;
    socket: MockWebSocket;
} {
    const match = scriptedMatch();
    const channel = new MatchChannel({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
    });
    const socket = new MockWebSocket();
    const connection = new Connection({
        socket,
        role: 'player',
        nowMs: 0,
        rateLimit: RATE_5S_BURST2,
    });
    connection.markJoined('token-1', 1, match.matchId);
    return { channel, connection, socket };
}

function pipeOrder(player: 1 | 2): Order {
    return { kind: 'setPipe', player, cell: { x: 3, y: 3 }, direction: 'N' };
}

describe('acceptOrder', () => {
    it('accepts a valid order, decrements the bucket by 1, and enqueues the full triple', () => {
        const { channel, connection } = joinedPlayerChannel();
        const before = connection.rateBucket.tokens;
        const order = pipeOrder(1);

        // The client envelope carried seq 4 on its way in.
        connection.noteClientSeq(4);
        const result = acceptOrder(channel, connection, order, 1_000);

        expect(result.ok).toBe(true);
        expect(connection.rateBucket.tokens).toBe(before - 1);
        expect(channel.pendingOrders).toHaveLength(1);
        const [pending] = channel.pendingOrders;
        expect(pending?.playerId).toBe(1);
        expect(pending?.order).toEqual(order);
        expect(pending?.submittedAtSeq).toBe(4);
    });

    it('rejects the 11th rapid order with a protocol-level rate_limited error', () => {
        const { channel, connection, socket } = joinedPlayerChannel();

        let rejected: string | undefined;
        for (let i = 1; i <= 11; i++) {
            connection.noteClientSeq(i);
            const result = acceptOrder(channel, connection, pipeOrder(1), 500);
            if (!result.ok) {
                rejected = result.error.code;
            }
        }

        expect(rejected).toBe('rate_limited');
        // Burst capacity 10 accepted; nothing extra queued.
        expect(channel.pendingOrders).toHaveLength(10);
        // Protocol-level rejection rides an error frame, not an orderAck.
        const errorFrame = socket.sentFrames.find((frame) => frame.type === 'error');
        expect(errorFrame?.payload).toMatchObject({ code: 'rate_limited' });
    });

    it('refills the bucket lazily as wall time passes between orders', () => {
        const { channel, connection } = joinedPlayerChannel();

        // Drain the entire burst at t=0.
        for (let i = 1; i <= 10; i++) {
            connection.noteClientSeq(i);
            expect(acceptOrder(channel, connection, pipeOrder(1), 0).ok).toBe(true);
        }
        // 1 second later, 5 tokens have refilled: exactly 5 more fit.
        let accepted = 0;
        for (let i = 11; i <= 16; i++) {
            connection.noteClientSeq(i);
            if (acceptOrder(channel, connection, pipeOrder(1), 1_000).ok) {
                accepted += 1;
            }
        }
        expect(accepted).toBe(5);
    });

    it.each(['disconnected', 'expired', 'closed'] as const)(
        'rejects orders from a %s connection with protocol_sequence_error',
        (state) => {
            const { channel, connection } = joinedPlayerChannel();
            if (state === 'disconnected') {
                connection.markDisconnected();
            } else if (state === 'expired') {
                connection.markDisconnected();
                connection.markExpired();
            } else {
                connection.close(1000, 'test');
            }

            const result = acceptOrder(channel, connection, pipeOrder(1), 0);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.code).toBe('protocol_sequence_error');
            }
            expect(channel.pendingOrders).toHaveLength(0);
        },
    );

    it('rejects orders from a spectator-role connection with spectator_readonly', () => {
        const match = scriptedMatch();
        const channel = new MatchChannel({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        const socket = new MockWebSocket();
        const spectator = new Connection({ socket, role: 'spectator', nowMs: 0 });
        spectator.markJoined('token-s', null, match.matchId);

        const result = acceptOrder(channel, spectator, pipeOrder(1), 0);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('spectator_readonly');
        }
        expect(channel.pendingOrders).toHaveLength(0);
    });
});
