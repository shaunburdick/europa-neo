/**
 * Quickstart Q-001 — Engine US1 Tick Simulation — Feature 001, T028
 *
 * Proves the tick loop runs end-to-end headlessly:
 *   - `createWorld` + `tick` produce a deterministic `World` that
 *     advances monotonically (`world.tick` increases by 1 per tick).
 *   - Two runs of the same scripted scenario produce byte-identical
 *     `World` state at every tick (SC-001 micro-check at small N; the
 *     full 10k-tick proof lives in Polish phase).
 *
 * This file intentionally uses the real `runScenario` fixture (which
 * now delegates to `createWorld` + `applyCommand` + `tick`), proving
 * the production engine is wired in correctly.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { alivePlayers, getCell, getPlayer } from '../../src/read';
import { tick } from '../../src/tick';
import type { MatchConfig } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 0xc0ffee,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('quickstart Q-001 — tick loop end-to-end', () => {
  it('tick() advances world.tick by exactly 1 each call', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 5);
    expect(finalWorld.tick).toBe(5);
  });

  it('two identical scripted runs produce byte-identical state', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    // Stage a pipe order on tick 0 from player 1's city going east.
    const order = {
      atTick: 0,
      order: {
        kind: 'setPipe' as const,
        player: 1 as const,
        cell: { x: 1, y: 1 },
        direction: 'E' as const,
      },
    };
    const a = runScenario(cfg, board, [order], 5);
    const b = runScenario(cfg, board, [order], 5);
    expect(Array.from(a.finalWorld.state.troopCounts)).toEqual(
      Array.from(b.finalWorld.state.troopCounts),
    );
    expect(Array.from(a.finalWorld.state.troopOwners)).toEqual(
      Array.from(b.finalWorld.state.troopOwners),
    );
    expect(Array.from(a.finalWorld.state.pipeMasks)).toEqual(
      Array.from(b.finalWorld.state.pipeMasks),
    );
    expect(Array.from(a.finalWorld.state.cityOwners)).toEqual(
      Array.from(b.finalWorld.state.cityOwners),
    );
    expect(a.finalWorld.tick).toBe(b.finalWorld.tick);
  });

  it('tick() returns events with empty combat/captures/elims arrays for US1', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const { events } = runScenario(cfg, board, [], 3);
    expect(events.length).toBe(3);
    for (const e of events) {
      expect(e.combat).toEqual([]);
      expect(e.captures).toEqual([]);
      expect(e.eliminations).toEqual([]);
    }
  });

  it('alivePlayers returns all player ids with status alive', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 2);
    expect(alivePlayers(finalWorld)).toEqual([1, 2]);
    expect(getPlayer(finalWorld, 1).status).toBe('alive');
    expect(getPlayer(finalWorld, 2).status).toBe('alive');
  });

  it('production adds ENGINE_CONSTANTS.productionRate per tick to each city', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const { finalWorld } = runScenario(cfg, board, [], 3);
    const cell = getCell(finalWorld, 1, 1);
    // 3 ticks * 1 production/tick = 3 (no cap yet).
    expect(cell.troopCount).toBe(3);
    expect(cell.troopOwner).toBe(1);
  });

  it('tick() is callable directly on a created world', () => {
    const board = buildSmallBoard(8, [[1, 1, 1]]);
    const { finalWorld: initial } = runScenario(cfg, board, [], 0);
    const r1 = tick(initial);
    expect(r1.world.tick).toBe(1);
    const r2 = tick(r1.world);
    expect(r2.world.tick).toBe(2);
  });
});
