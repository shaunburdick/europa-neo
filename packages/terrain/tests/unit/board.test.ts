/**
 * Board Builder Tests — Feature 003
 *
 * Verifies INV-1 (square), INV-2 (cell count), INV-3/4 (cell value
 * ranges), and `assertBoardMatchesConfig` (mismatched boardSize
 * throws).
 *
 * The board builder converts the flat `Uint8Array` intermediates
 * (elevation + water mask) into the engine's `Cell[]` shape and
 * wraps it in a `Board` value. It is the boundary between terrain
 * internals and the engine's type contract.
 */

import { describe, expect, it } from 'vitest';

import { assertBoardMatchesConfig, buildBoard } from '../../src/board';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateElevationMap } from '../../src/elevation';
import { buildFlatElevation } from '../fixtures/board';
import { engineSfc32 } from '../fixtures/seeds';

describe('board', () => {
    describe('buildBoard (INV-1, INV-2, INV-3, INV-4)', () => {
        it('produces a Board with width === height === boardSize', () => {
            const size = 16;
            const elev = buildFlatElevation(size, 100);
            const water = new Uint8Array(size * size); // all land
            const board = buildBoard(elev, water, size, size);
            expect(board.width).toBe(size);
            expect(board.height).toBe(size);
        });

        it('cells.length === boardSize * boardSize', () => {
            const size = 24;
            const elev = buildFlatElevation(size, 50);
            const water = new Uint8Array(size * size);
            const board = buildBoard(elev, water, size, size);
            expect(board.cells.length).toBe(size * size);
        });

        it('every Cell has integer elevation in [0, 255] (INV-3)', () => {
            const size = 16;
            // Use real elevation (not flat) so the range is exercised.
            const elev = generateElevationMap(engineSfc32(42), size, size, DEFAULT_GENERATION_SETTINGS);
            const water = new Uint8Array(size * size);
            const board = buildBoard(elev, water, size, size);
            for (const cell of board.cells) {
                expect(Number.isInteger(cell.elevation)).toBe(true);
                expect(cell.elevation).toBeGreaterThanOrEqual(0);
                expect(cell.elevation).toBeLessThanOrEqual(255);
            }
        });

        it('every Cell has terrain in { land, water } (INV-4)', () => {
            const size = 16;
            const elev = buildFlatElevation(size, 100);
            const water = new Uint8Array(size * size);
            // Mark half the cells as water.
            for (let i = 0; i < water.length; i += 2) {
                water[i] = 1;
            }
            const board = buildBoard(elev, water, size, size);
            for (const cell of board.cells) {
                expect(cell.terrain === 'land' || cell.terrain === 'water').toBe(true);
            }
            // Sanity: at least one of each.
            const waterCells = board.cells.filter((c) => c.terrain === 'water');
            const landCells = board.cells.filter((c) => c.terrain === 'land');
            expect(waterCells.length).toBeGreaterThan(0);
            expect(landCells.length).toBeGreaterThan(0);
        });

        it('Cell.x and Cell.y match the linear index in row-major order', () => {
            const size = 12;
            const elev = buildFlatElevation(size, 100);
            const water = new Uint8Array(size * size);
            const board = buildBoard(elev, water, size, size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const cell = board.cells[y * size + x];
                    expect(cell?.x).toBe(x);
                    expect(cell?.y).toBe(y);
                }
            }
        });

        it('returns a Board with cities: [] (US1 placeholder; cities land in US2)', () => {
            const size = 16;
            const elev = buildFlatElevation(size, 100);
            const water = new Uint8Array(size * size);
            const board = buildBoard(elev, water, size, size);
            expect(board.cities).toEqual([]);
        });
    });

    describe('assertBoardMatchesConfig', () => {
        it('accepts a Board whose dimensions match the config', () => {
            const size = 16;
            const elev = buildFlatElevation(size, 100);
            const water = new Uint8Array(size * size);
            const board = buildBoard(elev, water, size, size);
            const config = {
                boardSize: size,
                playerCount: 2 as const,
                tickIntervalMs: 250,
                seed: 42,
                visibilityRadius: 4,
            };
            expect(() => assertBoardMatchesConfig(board, config)).not.toThrow();
        });

        it('throws on mismatched boardSize (board.width !== config.boardSize)', () => {
            const elev = buildFlatElevation(16, 100);
            const water = new Uint8Array(16 * 16);
            const board = buildBoard(elev, water, 16, 16);
            const config = {
                boardSize: 32, // mismatch: board is 16x16
                playerCount: 2 as const,
                tickIntervalMs: 250,
                seed: 42,
                visibilityRadius: 4,
            };
            expect(() => assertBoardMatchesConfig(board, config)).toThrow();
        });

        it('throws on non-square Board (width !== height)', () => {
            // We can't easily build a non-square Board with the current
            // builder (it assumes square), so we hand-construct one.
            const cells: import('@europa/engine').Cell[] = new Array(16);
            for (let i = 0; i < 16; i++) {
                cells[i] = { x: i, y: 0, elevation: 100, terrain: 'land' };
            }
            const board = {
                width: 16,
                height: 1, // non-square
                cells,
                cities: [],
            };
            const config = {
                boardSize: 16,
                playerCount: 2 as const,
                tickIntervalMs: 250,
                seed: 42,
                visibilityRadius: 4,
            };
            expect(() => assertBoardMatchesConfig(board, config)).toThrow();
        });

        it('throws on cells.length !== boardSize² (corrupted board)', () => {
            // Hand-construct a board with the wrong cell count.
            const board = {
                width: 16,
                height: 16,
                cells: new Array(100), // 100 != 16*16
                cities: [],
            };
            const config = {
                boardSize: 16,
                playerCount: 2 as const,
                tickIntervalMs: 250,
                seed: 42,
                visibilityRadius: 4,
            };
            expect(() => assertBoardMatchesConfig(board, config)).toThrow();
        });
    });
});
