/**
 * Read helpers unit tests — Feature 001, T026 supplementary
 *
 * Covers the public read helpers exported from `src/read.ts`:
 *   - getCell decodes pipe masks into Set<Direction>
 *   - forEachCell iterates row-major and supports early-exit on false
 *   - cellsInRange returns Chebyshev ball, bounds-checked
 *   - neighborsOf returns 4-way in-bounds neighbors
 *   - getPlayer + alivePlayers cover the players-array lookup
 *
 * These supplement the Q-001/Q-003 quickstart tests which only touch
 * a few of the read helpers; the unit tests here exercise the full
 * surface to lift coverage above the 80% gate.
 */

import { describe, expect, it } from 'vitest';
import {
  alivePlayers,
  cellsInRange,
  forEachCell,
  getCell,
  getPlayer,
  neighborsOf,
} from '../../src/read';
import type { MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: 4,
};

describe('getCell', () => {
  it('decodes pipe masks into Set<Direction>', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    // Use the engine directly to set pipes (runScenario's pipe order
    // requires the cell to have troops for the (legacy Phase-2) sanity
    // test path, but real applyCommand validates ownership).
    // We use a 2-player board so the city has troops on tick 0 by
    // pre-staging a pipe order at tick -1... but tick -1 doesn't run.
    // Simpler: build a fresh world, prime a city with troops, set
    // a pipe, then read.
    // Use createWorld + applyCommand + tick flow:
    const { finalWorld } = runScenario(
      cfg,
      board,
      [
        {
          atTick: 0,
          order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'E' },
        },
        {
          atTick: 0,
          order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'N' },
        },
        {
          atTick: 0,
          order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'W' },
        },
      ],
      1,
    );
    const cell = getCell(finalWorld, 1, 1);
    expect(cell.pipes.has('E')).toBe(true);
    expect(cell.pipes.has('N')).toBe(true);
    expect(cell.pipes.has('W')).toBe(true);
    expect(cell.pipes.has('S')).toBe(false);
  });

  it('returns cityOwner matching cityOwners state slot', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 1);
    expect(getCell(finalWorld, 1, 1).cityOwner).toBe(1);
    expect(getCell(finalWorld, 6, 6).cityOwner).toBe(2);
    // Non-city cell
    expect(getCell(finalWorld, 0, 0).cityOwner).toBeNull();
  });

  it('returns null troopOwner for cells with no troops', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    const { finalWorld } = runScenario(cfg, board, [], 1);
    expect(getCell(finalWorld, 0, 0).troopOwner).toBeNull();
    expect(getCell(finalWorld, 0, 0).troopCount).toBe(0);
  });

  it('throws on out-of-bounds coord', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    expect(() => getCell(finalWorld, 99, 0)).toThrow();
  });
});

describe('forEachCell', () => {
  it('visits all 64 cells in row-major order', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    const seen: Array<{ x: number; y: number }> = [];
    forEachCell(finalWorld, (view) => {
      seen.push({ x: view.coord.x, y: view.coord.y });
      return undefined;
    });
    expect(seen.length).toBe(64);
    expect(seen[0]).toEqual({ x: 0, y: 0 });
    expect(seen[63]).toEqual({ x: 7, y: 7 });
  });

  it('stops iteration when callback returns false', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    let count = 0;
    forEachCell(finalWorld, () => {
      count++;
      return count >= 5 ? false : undefined;
    });
    expect(count).toBe(5);
  });
});

describe('cellsInRange', () => {
  it('returns Chebyshev ball around center, in-bounds only', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    const cells = cellsInRange(finalWorld, { x: 3, y: 3 }, 1);
    // (3,3) ± 1 in Chebyshev: 9 cells.
    expect(cells.length).toBe(9);
    for (const c of cells) {
      expect(Math.abs(c.x - 3) <= 1).toBe(true);
      expect(Math.abs(c.y - 3) <= 1).toBe(true);
    }
  });

  it('clamps to board edges', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    const cells = cellsInRange(finalWorld, { x: 0, y: 0 }, 2);
    // Top-left corner: 0..2 in both dims = 9 cells (no OOB).
    expect(cells.length).toBe(9);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(8);
      expect(c.y).toBeLessThan(8);
    }
  });

  it('returns single cell when r=0', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    const cells = cellsInRange(finalWorld, { x: 4, y: 4 }, 0);
    expect(cells.length).toBe(1);
    expect(cells[0]).toEqual({ x: 4, y: 4 });
  });

  it('clamps negative radius to 0', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    expect(cellsInRange(finalWorld, { x: 4, y: 4 }, -1).length).toBe(1);
  });
});

describe('neighborsOf', () => {
  it('returns 4 neighbors for an interior cell', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    const neighbors = neighborsOf(finalWorld, { x: 4, y: 4 });
    expect(neighbors.length).toBe(4);
    const dirs = neighbors.map((n) => n.direction).sort();
    expect(dirs).toEqual(['E', 'N', 'S', 'W']);
  });

  it('omits out-of-bounds neighbors at edges', () => {
    const board = buildSmallBoard(8, []);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    expect(neighborsOf(finalWorld, { x: 0, y: 0 }).length).toBe(2);
    expect(
      neighborsOf(finalWorld, { x: 0, y: 0 })
        .map((n) => n.direction)
        .sort(),
    ).toEqual(['E', 'S']);
  });
});

describe('getPlayer + alivePlayers', () => {
  it('getPlayer returns the player indexed by PlayerId-1', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 1);
    expect(getPlayer(finalWorld, 1).id).toBe(1);
    expect(getPlayer(finalWorld, 2).id).toBe(2);
  });

  it('getPlayer throws on unknown player id', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    const { finalWorld } = runScenario(cfg, board, [], 0);
    expect(() => getPlayer(finalWorld, 9 as PlayerId)).toThrow();
  });

  it('alivePlayers returns all player ids when all are alive', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 1);
    expect(alivePlayers(finalWorld)).toEqual([1, 2]);
  });
});
