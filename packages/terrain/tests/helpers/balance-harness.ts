/**
 * Balance invariant harness — Feature 003 (SC-002 / SC-004).
 *
 * The two statistical balance suites sample the same board invariants at
 * different trial counts. The checks live here so an invariant added for
 * one suite is asserted by both, and every violation names the seed and
 * the invariant it broke.
 */

import type { Board } from '@europa/core';

import { DEFAULT_GENERATION_SETTINGS, MIN_WATER_POOL_SIZE } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

/** Board shape and player count the balance suites sample. */
const BOARD_SIZE = 32;
const PLAYER_COUNT = 2 as const;

/** US3 AC-1: water ratio within ±10% of the target, relative. */
const TARGET_WATER_RATIO = DEFAULT_GENERATION_SETTINGS.waterRatio;
const WATER_RATIO_TOLERANCE = TARGET_WATER_RATIO * 0.1;

/** INV-14: elevation variance threshold. */
const MIN_ELEVATION_VARIANCE = 100;

/** Names of the invariants a generated board can violate. */
export type BalanceInvariant =
    | 'INV-5/6 symmetry'
    | 'INV-7 city count'
    | 'INV-10 city-water distance'
    | 'INV-11 city spacing'
    | 'INV-13 water ratio'
    | 'INV-14 elevation variance'
    | 'INV-15 water pool';

/** One invariant violation on one generated board. */
export interface BalanceFailure {
    readonly seed: number;
    readonly invariant: BalanceInvariant;
    readonly detail: string;
}

/**
 * Generate `trials` boards from the golden seed sequence and return every
 * invariant violation found, with the seed that produced it.
 *
 * @param trials Number of boards to generate (100 in the balance suite,
 *               200 in the SC-002 suite).
 * @returns All failures; an empty array means every board passed.
 */
export function findBalanceFailures(trials: number): BalanceFailure[] {
    const failures: BalanceFailure[] = [];
    for (const seed of goldenSeeds(trials)) {
        const { board } = generateBoard({
            boardSize: BOARD_SIZE,
            playerCount: PLAYER_COUNT,
            seed,
            rng: engineSfc32(seed),
            settings: DEFAULT_GENERATION_SETTINGS,
        });
        for (const violation of checkBoard(board)) {
            failures.push({ seed, ...violation });
        }
    }
    return failures;
}

/** Evaluate every balance invariant against one board. */
function checkBoard(board: Board): Array<Omit<BalanceFailure, 'seed'>> {
    const violations: Array<Omit<BalanceFailure, 'seed'>> = [];

    const variance = elevationVariance(board);
    if (variance <= MIN_ELEVATION_VARIANCE) {
        violations.push({
            invariant: 'INV-14 elevation variance',
            detail: `variance=${variance.toFixed(2)} (must exceed ${String(MIN_ELEVATION_VARIANCE)})`,
        });
    }

    const ratio = waterRatio(board);
    if (Math.abs(ratio - TARGET_WATER_RATIO) > WATER_RATIO_TOLERANCE) {
        violations.push({
            invariant: 'INV-13 water ratio',
            detail: `ratio=${ratio.toFixed(4)} (target ${String(TARGET_WATER_RATIO)} ±10%)`,
        });
    }

    const symmetry = symmetryViolation(board);
    if (symmetry !== null) {
        violations.push({ invariant: 'INV-5/6 symmetry', detail: symmetry });
    }

    const expectedCities = PLAYER_COUNT * DEFAULT_GENERATION_SETTINGS.citiesPerPlayer;
    if (board.cities.length !== expectedCities) {
        violations.push({
            invariant: 'INV-7 city count',
            detail: `count=${String(board.cities.length)} (expected ${String(expectedCities)})`,
        });
    }

    const spacing = citySpacingViolation(board);
    if (spacing !== null) {
        violations.push({ invariant: 'INV-11 city spacing', detail: spacing });
    }

    const cityWater = cityWaterViolation(board);
    if (cityWater !== null) {
        violations.push({ invariant: 'INV-10 city-water distance', detail: cityWater });
    }

    const pool = largestWaterPool(board);
    if (pool < MIN_WATER_POOL_SIZE) {
        violations.push({
            invariant: 'INV-15 water pool',
            detail: `largest pool=${String(pool)} (must reach ${String(MIN_WATER_POOL_SIZE)})`,
        });
    }

    return violations;
}

/** Population variance of cell elevation (INV-14). */
function elevationVariance(board: Board): number {
    let sum = 0;
    for (const cell of board.cells) {
        sum += cell.elevation;
    }
    const mean = sum / board.cells.length;
    let squares = 0;
    for (const cell of board.cells) {
        const delta = cell.elevation - mean;
        squares += delta * delta;
    }
    return squares / board.cells.length;
}

/** Water cells as a fraction of the board (INV-13). */
function waterRatio(board: Board): number {
    let water = 0;
    for (const cell of board.cells) {
        if (cell.terrain === 'water') {
            water++;
        }
    }
    return water / board.cells.length;
}

/** Return the first cell that differs from its 180° partner, if any (INV-5/6). */
function symmetryViolation(board: Board): string | null {
    const { width, height } = board;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = board.cells[y * width + x];
            const partner = board.cells[(height - 1 - y) * width + (width - 1 - x)];
            if (cell === undefined || partner === undefined) {
                return `cell (${String(x)}, ${String(y)}) or its partner is missing`;
            }
            if (cell.terrain !== partner.terrain || cell.elevation !== partner.elevation) {
                return `cell (${String(x)}, ${String(y)}) differs from its 180° partner`;
            }
        }
    }
    return null;
}

/** Return the first city pair closer than the Chebyshev minimum, if any (INV-11). */
function citySpacingViolation(board: Board): string | null {
    const minimum = DEFAULT_GENERATION_SETTINGS.minCityCityDistance;
    for (let i = 0; i < board.cities.length; i++) {
        for (let j = i + 1; j < board.cities.length; j++) {
            const a = board.cities[i];
            const b = board.cities[j];
            if (a === undefined || b === undefined) {
                continue;
            }
            const distance = Math.max(Math.abs(a.cell.x - b.cell.x), Math.abs(a.cell.y - b.cell.y));
            if (distance < minimum) {
                return `cities (${String(a.cell.x)}, ${String(a.cell.y)}) and (${String(b.cell.x)}, ${String(b.cell.y)}) are ${String(distance)} apart (minimum ${String(minimum)})`;
            }
        }
    }
    return null;
}

/** Return the first city closer than the Chebyshev minimum to water, if any (INV-10). */
function cityWaterViolation(board: Board): string | null {
    const minimum = DEFAULT_GENERATION_SETTINGS.minCityWaterDistance;
    const water: Array<{ x: number; y: number }> = [];
    for (const cell of board.cells) {
        if (cell.terrain === 'water') {
            water.push({ x: cell.x, y: cell.y });
        }
    }
    for (const city of board.cities) {
        let nearest = Number.POSITIVE_INFINITY;
        for (const coord of water) {
            nearest = Math.min(nearest, Math.max(Math.abs(city.cell.x - coord.x), Math.abs(city.cell.y - coord.y)));
        }
        if (nearest < minimum) {
            return `city (${String(city.cell.x)}, ${String(city.cell.y)}) is ${String(nearest)} from water (minimum ${String(minimum)})`;
        }
    }
    return null;
}

/** Size of the largest 4-connected water pool (INV-15). */
function largestWaterPool(board: Board): number {
    const { width, height } = board;
    const visited = new Uint8Array(board.cells.length);
    let largest = 0;
    for (let start = 0; start < board.cells.length; start++) {
        const startCell = board.cells[start];
        if (startCell?.terrain !== 'water' || visited[start] === 1) {
            continue;
        }
        let size = 0;
        const queue = [start];
        visited[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            if (index === undefined) {
                continue;
            }
            size++;
            const x = index % width;
            const y = (index - x) / width;
            for (const [nx, ny] of [
                [x, y - 1],
                [x, y + 1],
                [x - 1, y],
                [x + 1, y],
            ] as const) {
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }
                const neighbour = ny * width + nx;
                if (board.cells[neighbour]?.terrain === 'water' && visited[neighbour] === 0) {
                    visited[neighbour] = 1;
                    queue.push(neighbour);
                }
            }
        }
        largest = Math.max(largest, size);
    }
    return largest;
}
