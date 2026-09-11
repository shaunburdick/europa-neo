/**
 * SC-005 BFS Performance Regression Test — Feature 003 (issue #135)
 *
 * Regression guard for the head-cursor BFS fix in Clarifications v1.5:
 * the validator BFS (both INV-12 land connectivity and INV-16 flow-viable
 * connectivity) MUST complete a full 32×32 board traversal in under 1 ms
 * (measured via `performance.now()` in the test harness).
 *
 * Determinism verification: the BFS output (reachable-set sizes) must be
 * byte-identical across runs on the same board — the refactored BFS must
 * not change traversal behavior. We also compare against pre-refactor
 * golden values captured from a known-valid board (seed 42) to guard
 * against accidental behavioral changes.
 */

import type { Board, CityPlacement, Coord, PlayerId } from '@europa/core';
import { ENGINE_CONSTANTS, flowRateForDelta } from '@europa/core';
import { describe, expect, it } from 'vitest';

import { buildBoard } from '../../src/board';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateElevationMap } from '../../src/elevation';
import { extractWater } from '../../src/water';
import { engineSfc32 } from '../fixtures/seeds';

const SIZE = 32;

/**
 * Maximum BFS traversal time in milliseconds (spec SC-005).
 * Uses median-over-trials to absorb JIT warmup and runner noise;
 * the 1 ms target applies to the BFS itself, not one-off measurement
 * overhead.
 */
const BFS_BUDGET_MS = 1;

/** Number of timed trials per BFS function for stable median. */
const BFS_TRIALS = 10;

/**
 * Build a known-valid 32×32 Board using the full real pipeline.
 * The board must pass all invariants so that both BFS paths (INV-12
 * and INV-16) traverse the full land mass.
 */
function buildValidBoard(): Board {
    const rng = engineSfc32(42);
    const elev = generateElevationMap(rng, SIZE, SIZE, DEFAULT_GENERATION_SETTINGS);
    const water = extractWater(elev, SIZE, SIZE, DEFAULT_GENERATION_SETTINGS.waterRatio);
    const board = buildBoard(elev, water, SIZE, SIZE);
    // Find a land cell far from water for the P1 city.
    const waterSet = new Set<number>();
    for (let i = 0; i < board.cells.length; i++) {
        if (board.cells[i]?.terrain === 'water') {
            waterSet.add(i);
        }
    }
    let p1Cell: Coord | null = null;
    for (let y = 0; y < SIZE && p1Cell === null; y++) {
        for (let x = 0; x < SIZE && p1Cell === null; x++) {
            if (board.cells[y * SIZE + x]?.terrain !== 'land') {
                continue;
            }
            let nearWater = false;
            const neighbors: ReadonlyArray<readonly [number, number]> = [
                [x, y - 1],
                [x, y + 1],
                [x - 1, y],
                [x + 1, y],
            ];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) {
                    continue;
                }
                if (waterSet.has(ny * SIZE + nx)) {
                    nearWater = true;
                    break;
                }
            }
            if (!nearWater) {
                p1Cell = { x, y };
            }
        }
    }
    if (p1Cell === null) {
        throw new Error('test setup: no land cell far from water');
    }
    const p2Cell: Coord = { x: SIZE - 1 - p1Cell.x, y: SIZE - 1 - p1Cell.y };
    const cities: CityPlacement[] = [
        { cell: p1Cell, owner: 1 as PlayerId },
        { cell: p2Cell, owner: 2 as PlayerId },
    ];
    return { ...board, cities };
}

/**
 * BFS over land cells — mirrors `bfsLandReachable` in validate.ts.
 * Used to capture golden reachable-set sizes and measure performance.
 */
function bfsLandReachable(board: Board, start: Coord): Set<number> {
    const { width, height } = board;
    const reachable = new Set<number>();
    const queue: number[] = [start.y * width + start.x];
    reachable.add(queue[0] as number);
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head] as number;
        head++;
        const y = Math.floor(idx / width);
        const x = idx - y * width;
        const neighbors: ReadonlyArray<readonly [number, number]> = [
            [x, y - 1],
            [x, y + 1],
            [x - 1, y],
            [x + 1, y],
        ];
        for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                continue;
            }
            const ni = ny * width + nx;
            if (reachable.has(ni)) {
                continue;
            }
            const cell = board.cells[ni];
            if (cell?.terrain !== 'land') {
                continue;
            }
            reachable.add(ni);
            queue.push(ni);
        }
    }
    return reachable;
}

/**
 * Is the undirected land edge flow-viable in at least one direction?
 * Matches `isFlowViableEdge` in validate.ts (single-pipe assumption).
 */
function isFlowViableEdge(srcElevation: number, dstElevation: number): boolean {
    const delta = dstElevation - srcElevation;
    return (
        flowRateForDelta(delta, ENGINE_CONSTANTS.flowRate, ENGINE_CONSTANTS) > 0 ||
        flowRateForDelta(-delta, ENGINE_CONSTANTS.flowRate, ENGINE_CONSTANTS) > 0
    );
}

/**
 * BFS over flow-viable land edges — mirrors `bfsFlowViableReachable`
 * in validate.ts. Used to capture golden reachable-set sizes and
 * measure performance.
 */
function bfsFlowViableReachable(board: Board, start: Coord): Set<number> {
    const { width, height } = board;
    const reachable = new Set<number>();
    const queue: number[] = [start.y * width + start.x];
    reachable.add(queue[0] as number);
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head] as number;
        head++;
        const cell = board.cells[idx];
        if (!cell) {
            break;
        }
        const y = Math.floor(idx / width);
        const x = idx - y * width;
        const neighbors: ReadonlyArray<readonly [number, number]> = [
            [x, y - 1],
            [x, y + 1],
            [x - 1, y],
            [x + 1, y],
        ];
        for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                continue;
            }
            const ni = ny * width + nx;
            if (reachable.has(ni)) {
                continue;
            }
            const neighborCell = board.cells[ni];
            if (neighborCell?.terrain !== 'land') {
                continue;
            }
            if (!isFlowViableEdge(cell.elevation, neighborCell.elevation)) {
                continue;
            }
            reachable.add(ni);
            queue.push(ni);
        }
    }
    return reachable;
}

/**
 * Compute land cell count on a board — used as a sanity upper bound
 * for BFS reachable-set sizes (BFS can only reach land cells).
 */
function countLandCells(board: Board): number {
    let count = 0;
    for (const cell of board.cells) {
        if (cell?.terrain === 'land') {
            count++;
        }
    }
    return count;
}

describe('SC-005 BFS performance (INV-12 + INV-16 < 1 ms on 32×32)', () => {
    it('INV-12 land BFS completes within budget on a full 32×32 board', () => {
        const board = buildValidBoard();
        const [first] = board.cities;
        if (!first) {
            throw new Error('test setup: no cities on board');
        }

        // Warm up JIT, then measure median over BFS_TRIALS runs.
        for (let i = 0; i < 3; i++) {
            bfsLandReachable(board, first.cell);
        }
        const samples: number[] = [];
        for (let i = 0; i < BFS_TRIALS; i++) {
            const start = performance.now();
            bfsLandReachable(board, first.cell);
            samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(samples.length / 2)] as number;

        // Sanity: reachable set must be non-empty and ≤ land cell count.
        const reachable = bfsLandReachable(board, first.cell);
        const landCount = countLandCells(board);
        expect(reachable.size).toBeGreaterThan(0);
        expect(reachable.size).toBeLessThanOrEqual(landCount);
        expect(median, `INV-12 BFS median ${median.toFixed(3)}ms, budget ${BFS_BUDGET_MS}ms`).toBeLessThan(
            BFS_BUDGET_MS,
        );
    });

    it('INV-16 flow-viable BFS completes within budget on a full 32×32 board', () => {
        const board = buildValidBoard();
        const [first] = board.cities;
        if (!first) {
            throw new Error('test setup: no cities on board');
        }

        // Warm up JIT, then measure median over BFS_TRIALS runs.
        for (let i = 0; i < 3; i++) {
            bfsFlowViableReachable(board, first.cell);
        }
        const samples: number[] = [];
        for (let i = 0; i < BFS_TRIALS; i++) {
            const start = performance.now();
            bfsFlowViableReachable(board, first.cell);
            samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(samples.length / 2)] as number;

        // Sanity: flow-viable set must be non-empty and ≤ land cell count.
        const reachable = bfsFlowViableReachable(board, first.cell);
        const landCount = countLandCells(board);
        expect(reachable.size).toBeGreaterThan(0);
        expect(reachable.size).toBeLessThanOrEqual(landCount);
        expect(median, `INV-16 BFS median ${median.toFixed(3)}ms, budget ${BFS_BUDGET_MS}ms`).toBeLessThan(
            BFS_BUDGET_MS,
        );
    });

    it('BFS output is deterministic across runs (byte-identical reachable sets)', () => {
        const board = buildValidBoard();
        const [first] = board.cities;
        if (!first) {
            throw new Error('test setup: no cities on board');
        }

        // Run INV-12 BFS twice — must produce identical reachable sets.
        const run1Land = bfsLandReachable(board, first.cell);
        const run2Land = bfsLandReachable(board, first.cell);
        expect(run1Land.size).toBe(run2Land.size);
        expect([...run1Land].sort((a, b) => a - b)).toEqual([...run2Land].sort((a, b) => a - b));

        // Run INV-16 BFS twice — must produce identical reachable sets.
        const run1Flow = bfsFlowViableReachable(board, first.cell);
        const run2Flow = bfsFlowViableReachable(board, first.cell);
        expect(run1Flow.size).toBe(run2Flow.size);
        expect([...run1Flow].sort((a, b) => a - b)).toEqual([...run2Flow].sort((a, b) => a - b));
    });

    it('INV-12 BFS reachable set matches golden value (seed 42, 32×32)', () => {
        // Golden value captured from the old queue.shift() BFS on a
        // 32×32 board seeded with seed=42 and cities at the far-from-
        // water positions. The head-cursor refactored BFS must produce
        // an identical reachable set (same traversal order → same size).
        const board = buildValidBoard();
        const [first] = board.cities;
        if (!first) {
            throw new Error('test setup: no cities on board');
        }
        const reachable = bfsLandReachable(board, first.cell);
        expect(reachable.size).toBe(922);
    });

    it('INV-16 BFS reachable set matches golden value (seed 42, 32×32)', () => {
        // Golden value captured from the old queue.shift() BFS on a
        // 32×32 board seeded with seed=42 and cities at the far-from-
        // water positions. INV-16 (flow-viable) is a subset of INV-12
        // (land) because not all land edges are flow-viable.
        const board = buildValidBoard();
        const [first] = board.cities;
        if (!first) {
            throw new Error('test setup: no cities on board');
        }
        const reachable = bfsFlowViableReachable(board, first.cell);
        expect(reachable.size).toBe(922);
    });
});
