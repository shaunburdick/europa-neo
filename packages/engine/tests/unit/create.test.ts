/**
 * createWorld unit tests — Feature 001, T018
 *
 * Covers:
 *   - FR-001: square grid (width === height === boardSize)
 *   - FR-002: cities on land cells; water-city rejection
 *   - FR-019: playerCount ∈ {2, 3, 4}
 *   - INV-1..INV-4 (per data-model.md §9):
 *       every cell has integer elevation in [0, 255]
 *       every cell has terrain ∈ {'land', 'water'}
 *       cell count === boardSize²
 *   - Initial state: cities populated, non-city cells owner=null, count=0
 *   - sfc32 PRNG instance initialized from config.seed
 *   - Determinism: same (config, board) → byte-identical initial world
 *   - Negative: boardSize=0/1 (min 8), mismatched dims, OOB city, water city
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import type { Board, MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

const baseConfig: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 0xc0ffee,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('createWorld — FR-001 square grid', () => {
    it('produces a world with width === height === config.boardSize', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const world = createWorld(baseConfig, board);
        expect(world.board.width).toBe(8);
        expect(world.board.height).toBe(8);
        expect(world.board.width).toBe(baseConfig.boardSize);
        expect(world.board.height).toBe(baseConfig.boardSize);
    });

    it('all cells have integer elevation in [0, 255]', () => {
        const board = buildSmallBoard(8, []);
        const world = createWorld(baseConfig, board);
        for (const cell of world.board.cells) {
            expect(Number.isInteger(cell.elevation)).toBe(true);
            expect(cell.elevation).toBeGreaterThanOrEqual(0);
            expect(cell.elevation).toBeLessThanOrEqual(255);
        }
    });

    it('all cells have terrain ∈ {"land", "water"}', () => {
        const board = buildSmallBoard(8, []);
        const world = createWorld(baseConfig, board);
        for (const cell of world.board.cells) {
            expect(['land', 'water']).toContain(cell.terrain);
        }
    });

    it('cell count equals boardSize squared', () => {
        const board = buildSmallBoard(8, []);
        const world = createWorld(baseConfig, board);
        expect(world.board.cells.length).toBe(baseConfig.boardSize ** 2);
        expect(world.state.troopCounts.length).toBe(baseConfig.boardSize ** 2);
        expect(world.state.troopOwners.length).toBe(baseConfig.boardSize ** 2);
        expect(world.state.pipeMasks.length).toBe(baseConfig.boardSize ** 2);
        expect(world.state.reservesPct.length).toBe(baseConfig.boardSize ** 2);
        expect(world.state.cityOwners.length).toBe(baseConfig.boardSize ** 2);
    });
});

describe('createWorld — FR-002 cities on land', () => {
    it('rejects cities placed on water cells', () => {
        // Hand-roll a board with one city on a water cell.
        const w = 8;
        const cells = Array.from({ length: w * w }, (_, i) => ({
            x: i % w,
            y: Math.floor(i / w),
            elevation: 0,
            terrain: 'land' as const,
        }));
        // Mark (0,0) as water.
        const firstCell = cells[0];
        if (firstCell === undefined) {
            throw new Error('test setup: cells[0] missing');
        }
        cells[0] = { ...firstCell, terrain: 'water' };
        const board: Board = Object.freeze({
            width: w,
            height: w,
            cells: Object.freeze(cells),
            cities: Object.freeze([{ cell: { x: 0, y: 0 }, owner: 1 as PlayerId }]),
        });
        expect(() => createWorld(baseConfig, board)).toThrow(/water|land/i);
    });

    it('accepts cities placed on land cells (sanity)', () => {
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        expect(() => createWorld(baseConfig, board)).not.toThrow();
    });
});

describe('createWorld — FR-019 player count', () => {
    it('accepts playerCount = 2', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const cfg: MatchConfig = { ...baseConfig, playerCount: 2 };
        const world = createWorld(cfg, board);
        expect(world.players.length).toBe(2);
        expect(world.players[0]?.id).toBe(1);
        expect(world.players[1]?.id).toBe(2);
    });

    it('accepts playerCount = 3', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
            [6, 1, 3 as PlayerId],
        ]);
        const cfg: MatchConfig = { ...baseConfig, playerCount: 3 };
        const world = createWorld(cfg, board);
        expect(world.players.length).toBe(3);
    });

    it('accepts playerCount = 4', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
            [6, 1, 3 as PlayerId],
            [1, 6, 4 as PlayerId],
        ]);
        const cfg: MatchConfig = { ...baseConfig, playerCount: 4 };
        const world = createWorld(cfg, board);
        expect(world.players.length).toBe(4);
    });

    it('rejects playerCount outside {2, 3, 4}', () => {
        const board = buildSmallBoard(8, []);
        expect(() => createWorld({ ...baseConfig, playerCount: 1 as 2 }, board)).toThrow(/playerCount/);
        expect(() => createWorld({ ...baseConfig, playerCount: 5 as 4 }, board)).toThrow(/playerCount/);
    });

    it('rejects fractional playerCount values', () => {
        const board = buildSmallBoard(8, []);
        const fractionalPlayerCount = 2.5 as unknown as MatchConfig['playerCount'];
        expect(() => createWorld({ ...baseConfig, playerCount: fractionalPlayerCount }, board)).toThrow(/playerCount/);
    });

    it('rejects fractional city owner values', () => {
        const board = buildSmallBoard(8, []);
        const fractionalOwner = 1.5 as unknown as PlayerId;
        const boardWithFractionalOwner: Board = Object.freeze({
            ...board,
            cities: Object.freeze([{ cell: { x: 1, y: 1 }, owner: fractionalOwner }]),
        });

        expect(() => createWorld(baseConfig, boardWithFractionalOwner)).toThrow(/owner/);
    });
});

describe('createWorld — initial state', () => {
    it('city cells are populated in cityOwners; non-city cells are 0', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const world = createWorld(baseConfig, board);
        const idx1 = 1 * 8 + 1; // (1,1)
        const idx2 = 6 * 8 + 6; // (6,6)
        expect(world.state.cityOwners[idx1]).toBe(1);
        expect(world.state.cityOwners[idx2]).toBe(2);
        // Non-city cells should be 0.
        let nonCityZeroes = 0;
        for (let i = 0; i < world.state.cityOwners.length; i++) {
            if (i === idx1 || i === idx2) {
                continue;
            }
            if (world.state.cityOwners[i] === 0) {
                nonCityZeroes++;
            }
        }
        expect(nonCityZeroes).toBe(8 * 8 - 2);
    });

    it('all non-city cells have owner=null and count=0', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const world = createWorld(baseConfig, board);
        for (let i = 0; i < world.state.troopCounts.length; i++) {
            if (i === 1 * 8 + 1 || i === 6 * 8 + 6) {
                continue;
            }
            expect(world.state.troopCounts[i]).toBe(0);
            expect(world.state.troopOwners[i]).toBe(0);
        }
    });

    it('all cells start with zero pipe masks and zero reserves', () => {
        const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
        const world = createWorld(baseConfig, board);
        for (let i = 0; i < world.state.pipeMasks.length; i++) {
            expect(world.state.pipeMasks[i]).toBe(0);
        }
        for (let i = 0; i < world.state.reservesPct.length; i++) {
            expect(world.state.reservesPct[i]).toBe(0);
        }
    });

    it('starts at tick 0 and seeds rngState from config.seed', () => {
        const board = buildSmallBoard(8, []);
        const world = createWorld({ ...baseConfig, seed: 0xdeadbeef }, board);
        expect(world.tick).toBe(0);
        expect(world.rngSeed).toBe(0xdeadbeef);
        expect(world.rngState.length).toBe(4);
    });

    it('players array indexed by PlayerId (players[id-1].id === id)', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const world = createWorld(baseConfig, board);
        expect(world.players[0]?.id).toBe(1);
        expect(world.players[1]?.id).toBe(2);
        for (const p of world.players) {
            expect(p.status).toBe('alive');
            expect(p.troopsHeld).toBe(0);
            // citiesOwned is computed from board.cities at tick 0 (was hard-coded
            // to 0 before Wave 2B-2); each player starts with their starting cities.
            expect(p.citiesOwned).toBe(1);
        }
    });
});

describe('createWorld — determinism', () => {
    it('same (config, board) → byte-identical initial world', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1 as PlayerId],
            [6, 6, 2 as PlayerId],
        ]);
        const w1 = createWorld(baseConfig, board);
        const w2 = createWorld(baseConfig, board);
        expect(w1.state.troopCounts).toEqual(w2.state.troopCounts);
        expect(w1.state.troopOwners).toEqual(w2.state.troopOwners);
        expect(w1.state.pipeMasks).toEqual(w2.state.pipeMasks);
        expect(w1.state.reservesPct).toEqual(w2.state.reservesPct);
        expect(w1.state.cityOwners).toEqual(w2.state.cityOwners);
        expect(Array.from(w1.rngState)).toEqual(Array.from(w2.rngState));
    });

    it('different seeds produce different rngState but same other fields', () => {
        const board = buildSmallBoard(8, []);
        const w1 = createWorld({ ...baseConfig, seed: 1 }, board);
        const w2 = createWorld({ ...baseConfig, seed: 2 }, board);
        expect(Array.from(w1.rngState)).not.toEqual(Array.from(w2.rngState));
        expect(w1.state.troopCounts).toEqual(w2.state.troopCounts);
        expect(w1.state.cityOwners).toEqual(w2.state.cityOwners);
    });
});

describe('createWorld — negative validation', () => {
    it('rejects boardSize = 0 (below MIN_BOARD_SIZE = 8)', () => {
        const board: Board = Object.freeze({
            width: 0,
            height: 0,
            cells: Object.freeze([]),
            cities: Object.freeze([]),
        });
        expect(() => createWorld(baseConfig, board)).toThrow();
    });

    it('rejects boardSize = 1 (below MIN_BOARD_SIZE = 8)', () => {
        const board: Board = Object.freeze({
            width: 1,
            height: 1,
            cells: Object.freeze([{ x: 0, y: 0, elevation: 0, terrain: 'land' }]),
            cities: Object.freeze([]),
        });
        expect(() => createWorld(baseConfig, board)).toThrow();
    });

    it('rejects mismatched board dimensions vs config.boardSize', () => {
        const board = buildSmallBoard(8, []); // 8×8
        expect(() => createWorld({ ...baseConfig, boardSize: 16 }, board)).toThrow();
        expect(() => createWorld({ ...baseConfig, boardSize: 4 }, board)).toThrow();
    });

    it('rejects a non-square board', () => {
        const board: Board = Object.freeze({
            width: 8,
            height: 4,
            cells: Object.freeze(
                Array.from({ length: 32 }, (_, i) => ({
                    x: i % 8,
                    y: Math.floor(i / 8),
                    elevation: 0,
                    terrain: 'land' as const,
                })),
            ),
            cities: Object.freeze([]),
        });
        expect(() => createWorld(baseConfig, board)).toThrow(/square/);
    });

    it('rejects cities whose coordinates are out of bounds', () => {
        const board: Board = Object.freeze({
            width: 8,
            height: 8,
            cells: Object.freeze(
                Array.from({ length: 64 }, (_, i) => ({
                    x: i % 8,
                    y: Math.floor(i / 8),
                    elevation: 0,
                    terrain: 'land' as const,
                })),
            ),
            cities: Object.freeze([{ cell: { x: 99, y: 0 }, owner: 1 as PlayerId }]),
        });
        expect(() => createWorld(baseConfig, board)).toThrow();
    });
});
