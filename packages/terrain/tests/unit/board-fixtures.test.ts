/**
 * Board Fixture Tests — Feature 003
 *
 * Verifies the test-only builders in `tests/fixtures/board.ts` produce
 * the expected shapes and reject invalid inputs.
 */

import type { Board, Cell } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import { buildBoardFromCells, buildCellsFromElevation, buildEmptyBoard, buildFlatElevation } from '../fixtures/board';

describe('board fixtures', () => {
    describe('buildEmptyBoard', () => {
        it('produces a square board of the requested size', () => {
            const board = buildEmptyBoard(16);
            expect(board.width).toBe(16);
            expect(board.height).toBe(16);
            expect(board.cells.length).toBe(16 * 16);
        });

        it('all cells are land at elevation 0', () => {
            const board = buildEmptyBoard(8);
            for (const cell of board.cells) {
                expect(cell.terrain).toBe('land');
                expect(cell.elevation).toBe(0);
            }
        });

        it('has no cities', () => {
            const board = buildEmptyBoard(8);
            expect(board.cities.length).toBe(0);
        });

        it('rejects sub-minimum sizes', () => {
            expect(() => buildEmptyBoard(7)).toThrow(/size must be an integer/);
        });

        it('rejects non-integer sizes', () => {
            expect(() => buildEmptyBoard(8.5)).toThrow(/size must be an integer/);
        });
    });

    describe('buildFlatElevation', () => {
        it('produces a Uint8Array of length size² filled with the value', () => {
            const elev = buildFlatElevation(8, 42);
            expect(elev).toBeInstanceOf(Uint8Array);
            expect(elev.length).toBe(64);
            for (let i = 0; i < elev.length; i++) {
                expect(elev[i]).toBe(42);
            }
        });

        it('accepts boundary values 0 and 255', () => {
            expect(buildFlatElevation(8, 0).length).toBe(64);
            expect(buildFlatElevation(8, 255).length).toBe(64);
        });

        it('rejects out-of-range values', () => {
            expect(() => buildFlatElevation(8, -1)).toThrow(/value must be an integer in/);
            expect(() => buildFlatElevation(8, 256)).toThrow(/value must be an integer in/);
            expect(() => buildFlatElevation(8, 1.5)).toThrow(/value must be an integer in/);
        });

        it('rejects sub-minimum sizes', () => {
            expect(() => buildFlatElevation(7, 0)).toThrow(/size must be an integer/);
        });
    });

    describe('buildCellsFromElevation', () => {
        it('maps a flat all-land elevation to all-land cells', () => {
            const elev = buildFlatElevation(8, 100);
            const water = new Uint8Array(64); // all zeros
            const cells = buildCellsFromElevation(elev, water);
            expect(cells.length).toBe(64);
            for (let i = 0; i < cells.length; i++) {
                expect(cells[i]?.terrain).toBe('land');
                expect(cells[i]?.elevation).toBe(100);
            }
        });

        it('honors the water mask (1 = water)', () => {
            const elev = buildFlatElevation(8, 50);
            const water = new Uint8Array(64);
            water[0] = 1; // first cell is water
            water[5] = 1; // another cell is water
            const cells = buildCellsFromElevation(elev, water);
            expect(cells[0]?.terrain).toBe('water');
            expect(cells[5]?.terrain).toBe('water');
            expect(cells[1]?.terrain).toBe('land');
        });

        it('rejects mismatched lengths', () => {
            const elev = buildFlatElevation(8, 50);
            const water = new Uint8Array(63); // wrong length (64 expected)
            expect(() => buildCellsFromElevation(elev, water)).toThrow(/length mismatch/);
        });

        it('rejects non-square lengths', () => {
            const elev = new Uint8Array(7); // not a perfect square
            const water = new Uint8Array(7);
            expect(() => buildCellsFromElevation(elev, water)).toThrow(/perfect square/);
        });

        it('rejects non-Uint8Array inputs', () => {
            const elev = [1, 2, 3, 4] as unknown as Uint8Array;
            const water = new Uint8Array(4);
            expect(() => buildCellsFromElevation(elev, water)).toThrow(/Uint8Array/);
        });
    });

    describe('buildBoardFromCells', () => {
        it('wraps a Cell[] into a Board with the given dimensions', () => {
            const elev = buildFlatElevation(8, 50);
            const water = new Uint8Array(64);
            const cells = buildCellsFromElevation(elev, water);
            const board: Board = buildBoardFromCells(cells, 8);
            expect(board.width).toBe(8);
            expect(board.height).toBe(8);
            expect(board.cells.length).toBe(64);
            expect(board.cities).toEqual([]);
        });

        it('rejects mismatched cells.length and size²', () => {
            const elev = buildFlatElevation(8, 50);
            const water = new Uint8Array(64);
            const cells = buildCellsFromElevation(elev, water);
            // Pass a different size.
            expect(() => buildBoardFromCells(cells, 9)).toThrow(/cells\.length/);
        });

        it('rejects sub-minimum sizes', () => {
            const cells: Cell[] = [];
            expect(() => buildBoardFromCells(cells, 7)).toThrow(/size must be an integer/);
        });
    });
});
