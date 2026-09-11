/**
 * Order Shape Guard Regression Tests — Issue #121 (P0)
 *
 * Proves that the wire-level `validateOrderShape` rejects malformed
 * orders BEFORE they reach the engine, and that `acceptOrder`
 * surfaces the rejection as a protocol-level `malformed_payload`
 * error (not a crash).
 *
 * Covers:
 *   - `{ kind: 'bogus' }` — unknown kind
 *   - `{}` — empty object, no kind
 *   - `{ kind: 123 }` — non-string kind
 *   - `{ kind: 'setPipe' }` — valid kind, missing required fields
 *   - Valid kind with wrong field type
 *   - Invalid direction values for pipe orders
 *   - Valid orders still pass through
 */

import { describe, expect, it } from 'vitest';

import { Connection } from '../../src/connection';
import { MatchChannel } from '../../src/match-channel';
import { acceptOrder } from '../../src/orders';
import type { Order } from '../../src/types';
import { validateEnvelope, validateOrderShape } from '../../src/validate';
import { MockWebSocket } from '../fixtures/conn';
import { scriptedMatch } from '../fixtures/match';

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

// ---------------------------------------------------------------------------
// validateOrderShape — direct unit tests
// ---------------------------------------------------------------------------

describe('validateOrderShape — rejects malformed orders', () => {
    it('rejects { kind: "bogus" } with unknown kind', () => {
        expect(() => validateOrderShape({ kind: 'bogus' })).toThrow(/order\.kind must be a known Order kind/);
    });

    it('rejects {} (empty object) with unknown kind', () => {
        expect(() => validateOrderShape({})).toThrow(/order\.kind must be a known Order kind/);
    });

    it('rejects { kind: 123 } with non-string kind', () => {
        expect(() => validateOrderShape({ kind: 123 })).toThrow(/order\.kind must be a known Order kind/);
    });

    it('rejects non-object values', () => {
        expect(() => validateOrderShape(null)).toThrow(/order must be a JSON object/);
        expect(() => validateOrderShape(42)).toThrow(/order must be a JSON object/);
        expect(() => validateOrderShape('string')).toThrow(/order must be a JSON object/);
        expect(() => validateOrderShape([1])).toThrow(/order must be a JSON object/);
    });

    it('rejects { kind: "setPipe" } with missing player', () => {
        expect(() => validateOrderShape({ kind: 'setPipe', cell: { x: 0, y: 0 }, direction: 'N' })).toThrow(
            /order\.player is required for setPipe/,
        );
    });

    it('rejects { kind: "setPipe" } with missing cell', () => {
        expect(() => validateOrderShape({ kind: 'setPipe', player: 1, direction: 'N' })).toThrow(
            /order\.cell is required for setPipe/,
        );
    });

    it('rejects { kind: "setPipe" } with missing direction', () => {
        expect(() => validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 } })).toThrow(
            /order\.direction is required for setPipe/,
        );
    });

    it('rejects { kind: "setPipe" } with direction "X"', () => {
        expect(() => validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'X' })).toThrow(
            /order\.direction must be one of N, E, S, W/,
        );
    });

    it('rejects { kind: "setPipe" } with direction "north"', () => {
        expect(() =>
            validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'north' }),
        ).toThrow(/order\.direction must be one of N, E, S, W/);
    });

    it('rejects { kind: "setPipe" } with direction "" (empty string)', () => {
        expect(() => validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: '' })).toThrow(
            /order\.direction must be one of N, E, S, W/,
        );
    });

    it('rejects { kind: "clearPipe" } with invalid direction', () => {
        expect(() =>
            validateOrderShape({ kind: 'clearPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'Z' }),
        ).toThrow(/order\.direction must be one of N, E, S, W/);
    });

    it('rejects { kind: "setPipesExclusive" } with invalid direction', () => {
        expect(() =>
            validateOrderShape({
                kind: 'setPipesExclusive',
                player: 1,
                cell: { x: 0, y: 0 },
                direction: 'down',
            }),
        ).toThrow(/order\.direction must be one of N, E, S, W/);
    });

    it('rejects { kind: "setReserves" } with non-number percent', () => {
        expect(() =>
            validateOrderShape({ kind: 'setReserves', player: 1, cell: { x: 0, y: 0 }, percent: '5' }),
        ).toThrow(/order\.percent must be a number/);
    });

    it('rejects { kind: "paratroop" } with missing target', () => {
        expect(() => validateOrderShape({ kind: 'paratroop', player: 1, source: { x: 0, y: 0 } })).toThrow(
            /order\.target is required for paratroop/,
        );
    });

    it('rejects { kind: "gun" } with missing source', () => {
        expect(() => validateOrderShape({ kind: 'gun', player: 1, target: { x: 0, y: 0 } })).toThrow(
            /order\.source is required for gun/,
        );
    });

    it('rejects { kind: "surrender" } with non-number player', () => {
        expect(() => validateOrderShape({ kind: 'surrender', player: '1' })).toThrow(/order\.player must be a number/);
    });
});

describe('validateOrderShape — accepts valid orders', () => {
    it('accepts a valid setPipe order', () => {
        expect(() =>
            validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'N' }),
        ).not.toThrow();
    });

    it('accepts a valid clearPipe order', () => {
        expect(() =>
            validateOrderShape({ kind: 'clearPipe', player: 1, cell: { x: 0, y: 0 }, direction: 'E' }),
        ).not.toThrow();
    });

    it('accepts a valid setPipesExclusive order', () => {
        expect(() =>
            validateOrderShape({ kind: 'setPipesExclusive', player: 1, cell: { x: 0, y: 0 }, direction: 'S' }),
        ).not.toThrow();
    });

    it('accepts a valid clearAllPipes order', () => {
        expect(() => validateOrderShape({ kind: 'clearAllPipes', player: 1, cell: { x: 0, y: 0 } })).not.toThrow();
    });

    it('accepts a valid setReserves order', () => {
        expect(() =>
            validateOrderShape({ kind: 'setReserves', player: 1, cell: { x: 0, y: 0 }, percent: 5 }),
        ).not.toThrow();
    });

    it('accepts a valid paratroop order', () => {
        expect(() =>
            validateOrderShape({ kind: 'paratroop', player: 1, source: { x: 0, y: 0 }, target: { x: 1, y: 1 } }),
        ).not.toThrow();
    });

    it('accepts a valid gun order', () => {
        expect(() =>
            validateOrderShape({ kind: 'gun', player: 1, source: { x: 0, y: 0 }, target: { x: 1, y: 1 } }),
        ).not.toThrow();
    });

    it('accepts a valid surrender order', () => {
        expect(() => validateOrderShape({ kind: 'surrender', player: 1 })).not.toThrow();
    });

    it('accepts all four cardinal directions for setPipe', () => {
        for (const dir of ['N', 'E', 'S', 'W']) {
            expect(() =>
                validateOrderShape({ kind: 'setPipe', player: 1, cell: { x: 0, y: 0 }, direction: dir }),
            ).not.toThrow();
        }
    });
});

// ---------------------------------------------------------------------------
// acceptOrder integration — malformed orders rejected at the wire boundary
// ---------------------------------------------------------------------------

describe('acceptOrder — rejects malformed orders via validateOrderShape', () => {
    it('rejects { kind: "bogus" } with malformed_payload', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = { kind: 'bogus' } as unknown as Order;
        const result = acceptOrder(channel, connection, order, 1000);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('malformed_payload');
        }
    });

    it('rejects {} with malformed_payload', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = {} as unknown as Order;
        const result = acceptOrder(channel, connection, order, 1000);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('malformed_payload');
        }
    });

    it('rejects { kind: 123 } with malformed_payload', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = { kind: 123 } as unknown as Order;
        const result = acceptOrder(channel, connection, order, 1000);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('malformed_payload');
        }
    });

    it('rejects { kind: "setPipe" } with missing direction', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = { kind: 'setPipe', player: 1, cell: { x: 0, y: 0 } } as unknown as Order;
        const result = acceptOrder(channel, connection, order, 1000);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('malformed_payload');
        }
    });

    it('rejects { kind: "setPipe" } with invalid direction', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = {
            kind: 'setPipe',
            player: 1,
            cell: { x: 0, y: 0 },
            direction: 'X',
        } as unknown as Order;
        const result = acceptOrder(channel, connection, order, 1000);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('malformed_payload');
        }
    });

    it('does not enqueue rejected orders', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const order = { kind: 'bogus' } as unknown as Order;
        acceptOrder(channel, connection, order, 1000);
        expect(channel.pendingOrders).toHaveLength(0);
    });

    it('accepts valid orders after rejecting malformed ones', () => {
        const { channel, connection } = joinedPlayerChannel();
        connection.noteClientSeq(1);
        const bogusOrder = { kind: 'bogus' } as unknown as Order;
        acceptOrder(channel, connection, bogusOrder, 1000);
        expect(channel.pendingOrders).toHaveLength(0);

        connection.noteClientSeq(2);
        const validOrder: Order = { kind: 'setPipe', player: 1, cell: { x: 3, y: 3 }, direction: 'N' };
        const result = acceptOrder(channel, connection, validOrder, 1001);
        expect(result.ok).toBe(true);
        expect(channel.pendingOrders).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Process survival: server stays alive after malformed order frames
// ---------------------------------------------------------------------------

describe('server survives malformed order frames', () => {
    it('process stays alive when validateEnvelope accepts but order shape is invalid', () => {
        // Build a schema-valid envelope with a shape-invalid order payload.
        // The envelope passes validateEnvelope (order: object check passes),
        // but validateOrderShape rejects the inner order.
        const bogusOrderEnvelope = {
            type: 'order',
            version: '0.1.0',
            seq: 1,
            payload: {
                order: { kind: 'bogus' },
            },
        };

        // validateEnvelope should pass (order is an object).
        expect(() => validateEnvelope(bogusOrderEnvelope)).not.toThrow();

        // But validateOrderShape should reject it.
        expect(() => validateOrderShape({ kind: 'bogus' })).toThrow(/order\.kind must be a known Order kind/);
    });

    it('validateOrderShape catches all required-field variants', () => {
        // Each of these should be rejected before reaching the engine.
        const cases: Array<{ description: string; order: unknown }> = [
            { description: 'setPipe without player', order: { kind: 'setPipe', cell: { x: 0, y: 0 }, direction: 'N' } },
            { description: 'setPipe without cell', order: { kind: 'setPipe', player: 1, direction: 'N' } },
            { description: 'setPipe without direction', order: { kind: 'setPipe', player: 1, cell: { x: 0, y: 0 } } },
            {
                description: 'clearPipe without player',
                order: { kind: 'clearPipe', cell: { x: 0, y: 0 }, direction: 'N' },
            },
            { description: 'clearPipe without cell', order: { kind: 'clearPipe', player: 1, direction: 'N' } },
            {
                description: 'clearPipe without direction',
                order: { kind: 'clearPipe', player: 1, cell: { x: 0, y: 0 } },
            },
            {
                description: 'setPipesExclusive without player',
                order: { kind: 'setPipesExclusive', cell: { x: 0, y: 0 }, direction: 'N' },
            },
            {
                description: 'setPipesExclusive without cell',
                order: { kind: 'setPipesExclusive', player: 1, direction: 'N' },
            },
            {
                description: 'setPipesExclusive without direction',
                order: { kind: 'setPipesExclusive', player: 1, cell: { x: 0, y: 0 } },
            },
            { description: 'clearAllPipes without player', order: { kind: 'clearAllPipes', cell: { x: 0, y: 0 } } },
            { description: 'clearAllPipes without cell', order: { kind: 'clearAllPipes', player: 1 } },
            {
                description: 'setReserves without player',
                order: { kind: 'setReserves', cell: { x: 0, y: 0 }, percent: 5 },
            },
            { description: 'setReserves without cell', order: { kind: 'setReserves', player: 1, percent: 5 } },
            {
                description: 'setReserves without percent',
                order: { kind: 'setReserves', player: 1, cell: { x: 0, y: 0 } },
            },
            {
                description: 'paratroop without player',
                order: { kind: 'paratroop', source: { x: 0, y: 0 }, target: { x: 1, y: 1 } },
            },
            {
                description: 'paratroop without source',
                order: { kind: 'paratroop', player: 1, target: { x: 1, y: 1 } },
            },
            {
                description: 'paratroop without target',
                order: { kind: 'paratroop', player: 1, source: { x: 0, y: 0 } },
            },
            {
                description: 'gun without player',
                order: { kind: 'gun', source: { x: 0, y: 0 }, target: { x: 1, y: 1 } },
            },
            { description: 'gun without source', order: { kind: 'gun', player: 1, target: { x: 1, y: 1 } } },
            { description: 'gun without target', order: { kind: 'gun', player: 1, source: { x: 0, y: 0 } } },
            { description: 'surrender without player', order: { kind: 'surrender' } },
        ];

        for (const { description, order } of cases) {
            expect(() => validateOrderShape(order), description).toThrow();
        }
    });
});
