/**
 * Scenario runner tests — Feature 001, T016
 *
 * Validates the test-only `runScenario` helper:
 *   - "no orders produces a world where cities produce each tick" —
 *     the minimal production phase adds `ENGINE_CONSTANTS.productionRate`
 *     troops per tick to each city cell, up to `cityCapacity`.
 *   - "one order at tick 0 produces a tick event recording the order" —
 *     the order appears in `events[0].appliedOrders` as an
 *     `AppliedOrderRecord` with `result.ok === true`.
 *
 * These tests use the minimal in-fixture engine; the real production
 * engine (Phase 3) replaces the internals. The public API of
 * `runScenario` is stable.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import type { MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 42,
    visibilityRadius: 4,
};

describe('runScenario — sanity', () => {
    it('with no orders, cities produce each tick', () => {
        // Include a P2 city so US5 terminal detection doesn't freeze the match.
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        const tickCount = 5;
        const { finalWorld, events } = runScenario(cfg, board, [], tickCount);

        // Each tick produced an event record.
        expect(events.length).toBe(tickCount);
        // No orders were applied.
        for (const e of events) {
            expect(e.appliedOrders.length).toBe(0);
            expect(e.errors.length).toBe(0);
        }

        // World advanced by `tickCount` ticks.
        expect(finalWorld.tick).toBe(tickCount);

        // City cell (0,0) has `productionRate * tickCount` troops,
        // capped at `cityCapacity` (5 < 30 here so no cap).
        const expected = Math.min(ENGINE_CONSTANTS.productionRate * tickCount, ENGINE_CONSTANTS.cityCapacity);
        expect(finalWorld.state.troopCounts[0]).toBe(expected);
        expect(finalWorld.state.troopOwners[0]).toBe(1);
    });

    it('with no orders, multiple cities each produce independently', () => {
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        const tickCount = 3;
        const { finalWorld } = runScenario(cfg, board, [], tickCount);

        // City at (0,0) for player 1 — cell index 0*8+0 = 0.
        expect(finalWorld.state.troopCounts[0]).toBe(Math.min(3, ENGINE_CONSTANTS.cityCapacity));
        expect(finalWorld.state.troopOwners[0]).toBe(1);

        // City at (7,7) for player 2 — cell index 7*8+7 = 63.
        expect(finalWorld.state.troopCounts[63]).toBe(Math.min(3, ENGINE_CONSTANTS.cityCapacity));
        expect(finalWorld.state.troopOwners[63]).toBe(2);
    });

    it('respects cityCapacity — production saturates', () => {
        // Lower the test cap to keep the test fast.
        const cap = ENGINE_CONSTANTS.cityCapacity;
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        // Run more ticks than needed to saturate.
        const overSaturate = cap + 5;
        const { finalWorld } = runScenario(cfg, board, [], overSaturate);
        expect(finalWorld.state.troopCounts[0]).toBe(cap);
    });
});

describe('runScenario — order staging', () => {
    it('records an order staged at tick 0 in the first tick events', () => {
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        const order = {
            kind: 'setPipe' as const,
            player: 1 as PlayerId,
            cell: { x: 0, y: 0 },
            direction: 'E' as const,
        };
        const { events, finalWorld } = runScenario(
            cfg,
            board,
            [{ atTick: 0, order }],
            // tickCount defaults to max(1, max(atTick)+1) = 1 if not given.
        );

        expect(events.length).toBe(1);
        expect(events[0]?.appliedOrders.length).toBe(1);
        expect(events[0]?.appliedOrders[0]?.order).toEqual(order);
        expect(events[0]?.appliedOrders[0]?.tick).toBe(0);
        expect(events[0]?.appliedOrders[0]?.result).toEqual({ ok: true });
        expect(finalWorld.tick).toBe(1);
    });

    it('records an order staged at a later tick in the right event', () => {
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        const order = {
            kind: 'clearAllPipes' as const,
            player: 1 as PlayerId,
            cell: { x: 0, y: 0 },
        };
        const { events } = runScenario(cfg, board, [{ atTick: 2, order }], 4);

        // Tick 0 and tick 1 events have no applied orders.
        expect(events[0]?.appliedOrders.length).toBe(0);
        expect(events[1]?.appliedOrders.length).toBe(0);
        // Tick 2 records the order.
        expect(events[2]?.appliedOrders.length).toBe(1);
        expect(events[2]?.appliedOrders[0]?.order).toEqual(order);
        // Tick 3 has no orders either.
        expect(events[3]?.appliedOrders.length).toBe(0);
    });
});
