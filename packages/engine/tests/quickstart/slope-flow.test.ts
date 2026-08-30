/**
 * Quickstart Q-003 — Slope flow respects elevation — Feature 001, T030
 * (rewritten for issue #30)
 *
 * Builds three boards with identical source-cell elevations and
 * identical pipe orders, varying only the destination cell's elevation.
 * Asserts the destination's troop count satisfies the strict
 * downhill > flat > uphill ordering (FR-007).
 *
 * Expected rates are derived from `ENGINE_CONSTANTS` via
 * `flowRateForDelta` (the single source of the FR-007 formula):
 *   downhill Δ=−10 → flowRateForDelta(−10, ENGINE_CONSTANTS) = 12
 *   flat Δ=0       → flowRateForDelta(0, ENGINE_CONSTANTS) = 7
 *   uphill Δ=+10   → flowRateForDelta(10, ENGINE_CONSTANTS) = 0 (stall)
 *
 * NOTE: We hand-build the elevation map here rather than use
 * `buildBoardWithElevation`'s cycling helper — that fixture cycles
 * the elevation map across the whole board, which makes per-cell
 * control awkward for two-cell scenarios. Direct construction
 * keeps the slope relationship between (3, 3) and (4, 3) explicit
 * and easy to verify.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { flowRateForDelta } from '../../src/flow-rate';
import { getCell } from '../../src/read';
import type { Board, MatchConfig, Order, PlayerId } from '../../src/types';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 0xfeed,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

/** Pipe order: player 1 pipes east from (3, 3) into (4, 3). */
const pipeOrder: Order = {
    kind: 'setPipe',
    player: 1,
    cell: { x: 3, y: 3 },
    direction: 'E',
};

const SIZE = 8;

/**
 * Build a flat-board with elevation 0 except for (3, 3) and (4, 3),
 * which are set explicitly so the source→destination slope is clear.
 *
 * @param srcElev Elevation of the source cell (3, 3).
 * @param dstElev Elevation of the destination cell (4, 3).
 */
function buildTwoCellSlopeBoard(srcElev: number, dstElev: number): Board {
    const cells = Array.from({ length: SIZE * SIZE }, (_, i) => ({
        x: i % SIZE,
        y: Math.floor(i / SIZE),
        elevation: i === 3 * SIZE + 3 ? srcElev : i === 3 * SIZE + 4 ? dstElev : 0,
        terrain: 'land' as const,
    }));
    return Object.freeze({
        width: SIZE,
        height: SIZE,
        cells: Object.freeze(cells),
        cities: Object.freeze([{ cell: { x: 3, y: 3 }, owner: 1 as PlayerId }]),
    });
}

describe('quickstart Q-003 — slope factor ordering', () => {
    it('downhill destination gains > flat destination gains > uphill destination', () => {
        // With the shipped gradient constants (flowBase=7, flowSlopeStep=1,
        // flowSlopeDeltaCap=5):
        // - downhill source (10) → destination (0) gains flowRateForDelta(−10) = 12
        // - flat source (5) → destination (5) gains flowRateForDelta(0) = 7
        // - uphill source (0) → destination (10) gains flowRateForDelta(+10) = 0 (stall)
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const flat: Board = buildTwoCellSlopeBoard(5, 5);
        const uphill: Board = buildTwoCellSlopeBoard(0, 10);

        const downResult = runScenario(cfg, downhill, [{ atTick: 0, order: pipeOrder }], 1);
        const flatResult = runScenario(cfg, flat, [{ atTick: 0, order: pipeOrder }], 1);
        const upResult = runScenario(cfg, uphill, [{ atTick: 0, order: pipeOrder }], 1);

        const downCount = getCell(downResult.finalWorld, 4, 3).troopCount;
        const flatCount = getCell(flatResult.finalWorld, 4, 3).troopCount;
        const upCount = getCell(upResult.finalWorld, 4, 3).troopCount;

        // Strict ordering: downhill > flat > uphill (12 > 7 > 0).
        expect(downCount).toBeGreaterThan(flatCount);
        expect(flatCount).toBeGreaterThan(upCount);

        // Sanity: nothing leaked into water (we built all-land boards) and
        // the pipe recorded the order.
        expect(downResult.events[0]?.appliedOrders.length).toBe(1);
    });

    it('flow respects ENGINE_CONSTANTS gradient rates (explicit value assertion)', () => {
        // Each tick moves exactly `flowRateForDelta(delta, ENGINE_CONSTANTS)`
        // troops along the pipe (clamped to capacity). Verify the explicit
        // value, deriving the expected count from the constants via the
        // exported formula — this pins the contract: downstream code that
        // changes ENGINE_CONSTANTS will need to update this assertion too.
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const { finalWorld } = runScenario(cfg, downhill, [{ atTick: 0, order: pipeOrder }], 1);
        const dest = getCell(finalWorld, 4, 3);
        const srcElev = 10;
        const expected = flowRateForDelta(dest.cell.elevation - srcElev, ENGINE_CONSTANTS);
        expect(dest.troopCount).toBe(expected);
        // Pin the shipped values explicitly: Δ=−10 → 12 (capped bonus).
        expect(expected).toBe(12);
    });

    it('uphill Δ=10 stalls: destination gains 0 troops (US1 AC-5)', () => {
        const uphill: Board = buildTwoCellSlopeBoard(0, 10);
        const { finalWorld } = runScenario(cfg, uphill, [{ atTick: 0, order: pipeOrder }], 1);
        const dest = getCell(finalWorld, 4, 3);
        expect(flowRateForDelta(10, ENGINE_CONSTANTS)).toBe(0);
        expect(dest.troopCount).toBe(0);
        // Stall is a legal, persistent state: the pipe remains laid.
        expect(getCell(finalWorld, 3, 3).pipes.has('E')).toBe(true);
    });

    it('flow is deterministic: same boards + same orders → same destination counts', () => {
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const a = runScenario(cfg, downhill, [{ atTick: 0, order: pipeOrder }], 1);
        const b = runScenario(cfg, downhill, [{ atTick: 0, order: pipeOrder }], 1);
        expect(getCell(a.finalWorld, 4, 3).troopCount).toBe(getCell(b.finalWorld, 4, 3).troopCount);
        expect(getCell(a.finalWorld, 4, 3).troopOwner).toBe(getCell(b.finalWorld, 4, 3).troopOwner);
    });
});