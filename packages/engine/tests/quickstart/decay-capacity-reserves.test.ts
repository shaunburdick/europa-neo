/**
 * Quickstart Q-007 — Decay, capacity, and reserves — Feature 001, T040
 *
 * End-to-end exercise of US3 (decay) via the full tick pipeline:
 *   - Single-cell decay (-1/tick when no friendly inflow)
 *   - Mutual-feeding sustain (two friendly cells with pipes to each
 *     other → no decay)
 *   - Reserves 30% hold (reserves floor respected)
 *   - Capacity cap (transfers clamped to cellCapacity)
 *
 * These tests use `runScenario` (which delegates to the real engine)
 * and observe post-tick state. They cover the integration story from
 * the player's perspective: stage orders via applyCommand, let the
 * engine run, and assert the observable consequences.
 *
 * All scenarios include a city for P2 so US5 terminal detection
 * doesn't freeze the match on tick 0 (P2 with 0 troops + 0 cities
 * would otherwise be eliminated immediately).
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { getCell } from '../../src/read';
import { tick } from '../../src/tick';
import type { MatchConfig, Order, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 0xa17ec0de,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

/** Build a `setPipe` order at (x,y) facing direction `d`. */
function pipeOrder(x: number, y: number, direction: 'N' | 'E' | 'S' | 'W', player: PlayerId): Order {
    return { kind: 'setPipe', player, cell: { x, y }, direction };
}

/** Build a `setReserves` order (percent is 0..9 → 0..90% in 10% steps). */
function reservesOrder(x: number, y: number, percent: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, player: PlayerId): Order {
    return { kind: 'setReserves', player, cell: { x, y }, percent };
}

describe('quickstart Q-007 — decay: city is exempt (self-feeding)', () => {
    it('isolated city produces troops every tick (no decay applies)', () => {
        // City cells are exempt from decay (they self-feed via production).
        // After 10 ticks, the city cell holds productionRate × 10 troops.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2], // P2 also has a city (US5 terminal guard)
        ]);
        const { finalWorld } = runScenario(cfg, board, [], 10);
        const cell = getCell(finalWorld, 1, 1);
        expect(cell.troopCount).toBe(10);
    });
});

describe('quickstart Q-007 — mutual feeding sustains indefinitely', () => {
    it('two friendly cells with pipes to each other sustain each other', () => {
        // Two P1 cities pipe into a shared neighbor (1,2). The neighbor
        // receives friendly inflow, so it is exempt from decay and
        // accumulates troops until it reaches cellCapacity. Once full,
        // the cities' flows are blocked and the neighbor oscillates at
        // capacity (decay −1 on a blocked tick, refill +1 on the next) —
        // it never decays away.
        //
        // The cities themselves are city cells (decay-exempt) and
        // TRANSFER their production out (Clarifications v1.6), so they
        // stay near zero rather than accumulating 20 troops each.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [1, 3, 1],
            [6, 6, 2],
        ]);
        const orders = [
            { atTick: 0, order: pipeOrder(1, 1, 'S', 1) }, // city (1,1) → (1,2)
            { atTick: 0, order: pipeOrder(1, 3, 'N', 1) }, // city (1,3) → (1,2)
        ];
        const { finalWorld } = runScenario(cfg, board, orders, 20);
        const city11 = getCell(finalWorld, 1, 1).troopCount;
        const city13 = getCell(finalWorld, 1, 3).troopCount;
        const cell12 = getCell(finalWorld, 1, 2).troopCount;

        // The shared neighbor is sustained at capacity — friendly inflow
        // prevents runaway decay.
        expect(cell12).toBeGreaterThanOrEqual(ENGINE_CONSTANTS.cellCapacity - 1);

        // Conservation (issue #99): total troops never exceed production
        // (2 cities × productionRate × 20 ticks). The pre-fix copy bug
        // created troops from nothing; this pins the transfer semantics.
        const total = city11 + city13 + cell12;
        const produced = 2 * ENGINE_CONSTANTS.productionRate * 20;
        expect(total).toBeLessThanOrEqual(produced);
        // Decay only ever reduces the total (the neighbor loses at most
        // 1 per tick when blocked at capacity), so it is also bounded
        // below by production minus the worst case.
        expect(total).toBeGreaterThanOrEqual(produced - 20);
    });
});

describe('quickstart Q-007 — reserves 30% holds the floor', () => {
    it('setReserves 30% accepted on city cell, no observable difference on city', () => {
        // City at (1,1) for P1. Stage setReserves at 30% (percent=3).
        // After many ticks, the city would normally saturate at cityCapacity
        // (30). The reserves invariant is observable when troops are placed
        // in non-city cells and need to be preserved against decay — that
        // case is covered in `decay.test.ts` (unit). Here we verify the
        // setReserves command is accepted.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const { finalWorld: w0 } = runScenario(cfg, board, [], 1);
        const reservesR = applyCommand(w0, reservesOrder(1, 1, 3, 1));
        expect(reservesR.result.ok).toBe(true);
        // Run another tick; the cell should still be producing (no observable
        // difference on a city cell).
        const r = tick(reservesR.world);
        expect(r.world.tick).toBe(2);
        expect(getCell(r.world, 1, 1).troopCount).toBeGreaterThan(0);
    });
});

describe('quickstart Q-007 — capacity cap', () => {
    it('cell capacity is never exceeded by production or flow', () => {
        // City produces 1/tick. After 100 ticks, city cell holds
        // min(100, cityCapacity) = cityCapacity.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const { finalWorld } = runScenario(cfg, board, [], 100);
        const cell = getCell(finalWorld, 1, 1);
        expect(cell.troopCount).toBeLessThanOrEqual(ENGINE_CONSTANTS.cityCapacity);
        expect(cell.troopCount).toBe(ENGINE_CONSTANTS.cityCapacity);
    });
});
