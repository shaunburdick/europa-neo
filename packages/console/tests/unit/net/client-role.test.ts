/**
 * Console client adapter role tests — feature 010 (T-016).
 *
 * Pins the minimal spectator-role extension of the network adapter:
 * the join role passes through to the wire request (default player),
 * and a spectator connection refuses outbound orders BEFORE any wire
 * I/O (SC-005: zero accepted orders, enforced at every layer).
 */

import { describe, expect, it, vi } from 'vitest';

import { createConsoleClient } from '../../../src/net/client';
import { allocateActionId } from '../../../src/state/reducer';
import type { CommandResult, Order, ProtocolEnvelope } from '../../../src/state/types';

/** Capturing fake of the inner MatchClient surface. */
function fakeInner() {
    const joinRequests: Array<{ matchId: string; role: string; displayName: string }> = [];
    const sentOrders: Order[] = [];
    return {
        joinRequests,
        sentOrders,
        connect: vi.fn((_url: string) => Promise.resolve()),
        disconnect: vi.fn(),
        joinMatch: vi.fn((req: { matchId: string; role: string; displayName: string }) => {
            joinRequests.push(req);
            return Promise.resolve();
        }),
        sendOrder: vi.fn((order: Order) => {
            sentOrders.push(order);
            return Promise.resolve({ ok: true } as CommandResult);
        }),
        onMessage: vi.fn(
            (_handler: (envelope: ProtocolEnvelope<import('../../../src/state/types').NetworkPayload>) => void) => () =>
                undefined,
        ),
        state: vi.fn(() => ({
            connection: 'greeted' as const,
            sessionToken: null,
            matchId: null,
            playerId: null,
            lastTick: 0,
            lastSeenServerSeq: 0,
        })),
        lastOrderSeq: vi.fn((): null => null),
    };
}

const ORDER: Order = { kind: 'setReserves', player: 1, cell: { x: 1, y: 1 }, percent: 3 };

describe('createConsoleClient join roles (T-016)', () => {
    it('defaults to the player role when no role is configured', async () => {
        const inner = fakeInner();
        const client = createConsoleClient(
            { url: 'ws://x', displayName: 'Nova', matchId: 'm-1' },
            { matchClientFactory: () => inner },
        );
        await client.joinMatch();
        expect(inner.joinRequests).toHaveLength(1);
        expect(inner.joinRequests[0]?.role).toBe('player');
    });

    it('passes role spectator through to the wire join', async () => {
        const inner = fakeInner();
        const client = createConsoleClient(
            { url: 'ws://x', displayName: 'Watcher', matchId: 'm-1', role: 'spectator' },
            { matchClientFactory: () => inner },
        );
        await client.joinMatch();
        expect(inner.joinRequests[0]?.role).toBe('spectator');
        expect(inner.joinRequests[0]?.displayName).toBe('Watcher');
    });

    it('a plain contract config object remains a valid argument (structural extension)', async () => {
        const inner = fakeInner();
        // Exactly the contract shape — no role field.
        const client = createConsoleClient(
            { url: 'ws://x', displayName: 'Nova', matchId: 'm-1', autoReconnect: false },
            { matchClientFactory: () => inner },
        );
        await client.joinMatch();
        expect(inner.joinRequests[0]?.role).toBe('player');
    });

    it('spectator connections reject sendOrder before touching the wire (SC-005)', async () => {
        const inner = fakeInner();
        const client = createConsoleClient(
            { url: 'ws://x', displayName: 'Watcher', matchId: 'm-1', role: 'spectator' },
            { matchClientFactory: () => inner },
        );
        await expect(client.sendOrder(allocateActionId(), ORDER)).rejects.toThrow(/read-only/);
        expect(inner.sentOrders).toHaveLength(0);
        expect(inner.sendOrder).not.toHaveBeenCalled();
    });

    it('player connections still submit orders unchanged', async () => {
        const inner = fakeInner();
        const client = createConsoleClient(
            { url: 'ws://x', displayName: 'Nova', matchId: 'm-1' },
            { matchClientFactory: () => inner },
        );
        await client.sendOrder(allocateActionId(), ORDER);
        expect(inner.sentOrders).toEqual([ORDER]);
    });
});
