/**
 * Board fixture tests — Feature 001, T015
 *
 * Validates the test-only board builders:
 *   - `buildSmallBoard` produces a square, all-land, elevation-0 board
 *     with the requested cities.
 *   - `buildBoardWithElevation` produces a board whose cells cycle
 *     through the supplied elevation map.
 *   - Both builders reject invalid inputs (out-of-bounds cities,
 *     duplicate cities, bad owner ids, undersized board).
 */

import { describe, expect, it } from 'vitest';
import type { PlayerId } from '../../src/types';
import { buildBoardWithElevation, buildSmallBoard } from '../fixtures/board';

describe('buildSmallBoard', () => {
    it('builds a square, all-land, elevation-0 board of the requested size', () => {
        const board = buildSmallBoard(8, []);
        expect(board.width).toBe(8);
        expect(board.height).toBe(8);
        expect(board.cells.length).toBe(64);
        for (const cell of board.cells) {
            expect(cell.terrain).toBe('land');
            expect(cell.elevation).toBe(0);
        }
    });

    it('places cities at the requested [x, y, owner] triples', () => {
        const board = buildSmallBoard(8, [
            [0, 0, 1 as PlayerId],
            [7, 7, 2 as PlayerId],
        ]);
        expect(board.cities.length).toBe(2);
        expect(board.cities[0]).toEqual({ cell: { x: 0, y: 0 }, owner: 1 });
        expect(board.cities[1]).toEqual({ cell: { x: 7, y: 7 }, owner: 2 });
    });

    it('row-major indexing: cell at (x, y) is at y*w + x', () => {
        const board = buildSmallBoard(8, []);
        const c = board.cells[3 * 8 + 5];
        expect(c).toEqual({ x: 5, y: 3, elevation: 0, terrain: 'land' });
    });

    it('rejects board sizes below 8', () => {
        expect(() => buildSmallBoard(7, [])).toThrow(/size must be an integer/);
        expect(() => buildSmallBoard(0, [])).toThrow(/size must be an integer/);
        expect(() => buildSmallBoard(4.5, [])).toThrow(/size must be an integer/);
    });

    it('rejects out-of-bounds cities', () => {
        expect(() => buildSmallBoard(8, [[8, 0, 1 as PlayerId]])).toThrow(/out of bounds/);
        expect(() => buildSmallBoard(8, [[0, 8, 1 as PlayerId]])).toThrow(/out of bounds/);
        expect(() => buildSmallBoard(8, [[-1, 0, 1 as PlayerId]])).toThrow(/out of bounds/);
    });

    it('rejects invalid owner ids', () => {
        // 0 and 5 are not valid PlayerId values (1..4 only).
        expect(() => buildSmallBoard(8, [[0, 0, 0 as PlayerId]])).toThrow(/owner must be 1\.\.4/);
        expect(() => buildSmallBoard(8, [[0, 0, 5 as unknown as PlayerId]])).toThrow(/owner must be 1\.\.4/);
    });

    it('rejects duplicate city placements on the same cell', () => {
        expect(() =>
            buildSmallBoard(8, [
                [2, 2, 1 as PlayerId],
                [2, 2, 2 as PlayerId],
            ]),
        ).toThrow(/duplicate city/);
    });

    it('produces a deeply-frozen board (cells + cities are immutable)', () => {
        const board = buildSmallBoard(8, [[0, 0, 1 as PlayerId]]);
        expect(Object.isFrozen(board.cells)).toBe(true);
        expect(Object.isFrozen(board.cities)).toBe(true);
        expect(Object.isFrozen(board)).toBe(true);
    });
});

describe('buildBoardWithElevation', () => {
    it('cycles the elevation map across cells in row-major order', () => {
        // 3-step staircase: 0, 1, 2, 0, 1, 2, ...
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [1, 0],
            [2, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        expect(board.cells[0]?.elevation).toBe(0);
        expect(board.cells[1]?.elevation).toBe(1);
        expect(board.cells[2]?.elevation).toBe(2);
        expect(board.cells[3]?.elevation).toBe(0);
        expect(board.cells[4]?.elevation).toBe(1);
        expect(board.cells[5]?.elevation).toBe(2);
    });

    it('marks all cells as land regardless of elevation', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [5, 0],
            [10, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        for (const cell of board.cells) {
            expect(cell.terrain).toBe('land');
        }
    });

    it('rejects an empty elevation map', () => {
        expect(() => buildBoardWithElevation(8, [], [])).toThrow(/elevationMap must be non-empty/);
    });

    it('rejects the same invalid inputs as buildSmallBoard', () => {
        const elev: ReadonlyArray<readonly [number, number]> = [[0, 0]];
        expect(() => buildBoardWithElevation(7, elev, [])).toThrow(/size must be an integer/);
        expect(() => buildBoardWithElevation(8, elev, [[8, 0, 1 as PlayerId]])).toThrow(/out of bounds/);
        expect(() => buildBoardWithElevation(8, elev, [[0, 0, 5 as unknown as PlayerId]])).toThrow(
            /owner must be 1\.\.4/,
        );
    });

    it('places cities in addition to elevation cycle', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [[0, 0]];
        const board = buildBoardWithElevation(8, elevMap, [
            [0, 0, 1 as PlayerId],
            [4, 4, 2 as PlayerId],
        ]);
        expect(board.cities.length).toBe(2);
        expect(board.cities[0]?.owner).toBe(1);
        expect(board.cities[1]?.owner).toBe(2);
    });
});
