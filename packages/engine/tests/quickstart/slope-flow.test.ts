/**
 * Quickstart Q-003 — Slope flow respects elevation — Feature 001, T030
 * (rewritten for issue #30; source-depletion assertions for issue #99)
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
 *   uphill Δ=+40   → flowRateForDelta(40, ENGINE_CONSTANTS) = 4
 *   uphill Δ=+100  → flowRateForDelta(100, ENGINE_CONSTANTS) = 0 (stall)
 *
 * The source city is seeded to `cityCapacity` (30) troops before the
 * tick so the pipe rate is observable — with the Clarifications v1.6
 * transfer semantics, a 1-troop source would only deliver 1 troop
 * regardless of the rate. Production is a no-op at capacity, so the
 * seeded count is stable across the tick.
 *
 * NOTE: We hand-build the elevation map here rather than use
 * `buildBoardWithElevation`'s cycling helper — that fixture cycles
 * the elevation map across the whole board, which makes per-cell
 * control awkward for two-cell scenarios. Direct construction
 * keeps the slope relationship between (3, 3) and (4, 3) explicit
 * and easy to verify.
 */

import { flowRateForDelta } from '@europa/core';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import { getCell } from '../../src/read';
import { tick } from '../../src/tick';
import type { Board, MatchConfig, Order, PlayerId, World } from '../../src/types';

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

/**
 * Run one tick with the source city seeded to `cityCapacity` troops.
 * Stages the pipe order, ticks once, and returns the final world.
 * Seeding makes the per-tick flow rate observable (Clarifications
 * v1.6 transfer semantics: a source only delivers what it holds).
 */
function runSeededTick(board: Board): World {
    let world: World = createWorld(cfg, board);
    // Seed the source city to capacity (production is a no-op at cap).
    const srcIdx = 3 * SIZE + 3;
    world = {
        ...world,
        state: {
            ...world.state,
            troopCounts: world.state.troopCounts.map((v, i) => (i === srcIdx ? ENGINE_CONSTANTS.cityCapacity : v)),
            troopOwners: world.state.troopOwners.map((v, i) => (i === srcIdx ? 1 : v)),
        },
    };
    const staged = applyCommand(world, pipeOrder);
    if (!staged.result.ok) {
        throw new Error(`seed scenario: pipe order rejected: ${String(staged.result.reason)}`);
    }
    return tick(staged.world).world;
}

describe('quickstart Q-003 — slope factor ordering', () => {
    it('downhill destination gains > flat destination gains > uphill destination', () => {
        // With the shipped gradient constants (flowBase=7, flowDownhillStep=1,
        // flowUphillStep=1, flowSlopeDeltaCap=5, flowUphillCap=80):
        // - downhill source (10) → destination (0) gains flowRateForDelta(−10) = 12
        // - flat source (5) → destination (5) gains flowRateForDelta(0) = 7
        // - uphill source (0) → destination (40) gains flowRateForDelta(+40) = 4
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const flat: Board = buildTwoCellSlopeBoard(5, 5);
        const uphill: Board = buildTwoCellSlopeBoard(0, 40);

        const downWorld = runSeededTick(downhill);
        const flatWorld = runSeededTick(flat);
        const upWorld = runSeededTick(uphill);

        const downCount = getCell(downWorld, 4, 3).troopCount;
        const flatCount = getCell(flatWorld, 4, 3).troopCount;
        const upCount = getCell(upWorld, 4, 3).troopCount;

        // Strict ordering: downhill > flat > uphill (12 > 7 > 4).
        expect(downCount).toBeGreaterThan(flatCount);
        expect(flatCount).toBeGreaterThan(upCount);

        // Source depletion (Clarifications v1.6): the source city loses
        // exactly what the destination gained.
        expect(getCell(downWorld, 3, 3).troopCount).toBe(ENGINE_CONSTANTS.cityCapacity - downCount);
        expect(getCell(flatWorld, 3, 3).troopCount).toBe(ENGINE_CONSTANTS.cityCapacity - flatCount);
        expect(getCell(upWorld, 3, 3).troopCount).toBe(ENGINE_CONSTANTS.cityCapacity - upCount);
    });

    it('flow respects ENGINE_CONSTANTS gradient rates (explicit value assertion)', () => {
        // Each tick moves exactly `flowRateForDelta(delta, ENGINE_CONSTANTS)`
        // troops along the pipe (clamped to capacity and source
        // availability). Verify the explicit value, deriving the expected
        // count from the constants via the exported formula — this pins
        // the contract: downstream code that changes ENGINE_CONSTANTS will
        // need to update this assertion too.
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const finalWorld = runSeededTick(downhill);
        const dest = getCell(finalWorld, 4, 3);
        const srcElev = 10;
        const expected = flowRateForDelta(dest.cell.elevation - srcElev, ENGINE_CONSTANTS);
        expect(dest.troopCount).toBe(expected);
        // Pin the shipped values explicitly: Δ=−10 → 12 (capped bonus).
        expect(expected).toBe(12);
    });

    it('uphill Δ=100 stalls: destination gains 0 troops (US1 AC-5)', () => {
        const uphill: Board = buildTwoCellSlopeBoard(0, 100);
        const finalWorld = runSeededTick(uphill);
        const dest = getCell(finalWorld, 4, 3);
        expect(flowRateForDelta(100, ENGINE_CONSTANTS)).toBe(0);
        expect(dest.troopCount).toBe(0);
        // Stall is a legal, persistent state: the pipe remains laid.
        expect(getCell(finalWorld, 3, 3).pipes.has('E')).toBe(true);
        // No transfer occurred → the source keeps its full seeded stack.
        expect(getCell(finalWorld, 3, 3).troopCount).toBe(ENGINE_CONSTANTS.cityCapacity);
    });

    it('flow is deterministic: same boards + same orders → same destination counts', () => {
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        const a = runSeededTick(downhill);
        const b = runSeededTick(downhill);
        expect(getCell(a, 4, 3).troopCount).toBe(getCell(b, 4, 3).troopCount);
        expect(getCell(a, 4, 3).troopOwner).toBe(getCell(b, 4, 3).troopOwner);
    });

    it('troop conservation: total board troops are conserved across ticks (no inflation)', () => {
        // Run 10 ticks on the downhill board with the pipe laid from tick 0.
        // The city produces 1/tick (capped at 30) and the pipe transfers
        // troops east. Total troops on the board must equal the initial
        // total plus production — flow never creates troops from nothing.
        const downhill: Board = buildTwoCellSlopeBoard(10, 0);
        let world: World = createWorld(cfg, downhill);
        const srcIdx = 3 * SIZE + 3;
        world = {
            ...world,
            state: {
                ...world.state,
                troopCounts: world.state.troopCounts.map((v, i) => (i === srcIdx ? ENGINE_CONSTANTS.cityCapacity : v)),
                troopOwners: world.state.troopOwners.map((v, i) => (i === srcIdx ? 1 : v)),
            },
        };
        const staged = applyCommand(world, pipeOrder);
        if (!staged.result.ok) {
            throw new Error(`conservation scenario: pipe order rejected: ${String(staged.result.reason)}`);
        }
        world = staged.world;

        const initialTotal = Array.from(world.state.troopCounts).reduce((a, b) => a + b, 0);
        const TICKS = 10;
        for (let t = 0; t < TICKS; t++) {
            world = tick(world).world;
        }
        const finalTotal = Array.from(world.state.troopCounts).reduce((a, b) => a + b, 0);
        // Production adds 1/tick while the city is below capacity; the
        // source starts at capacity, so production is a no-op. Decay
        // applies to unfed cells (the destination has friendly inflow
        // every tick, so it is exempt). Expected: initial total.
        expect(finalTotal).toBe(initialTotal);
    });
});
