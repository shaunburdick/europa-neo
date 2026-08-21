/**
 * Quickstart Q-002 — Production saturates a city — Feature 001, T029
 *
 * Asserts that after N ticks, a city cell contains
 * `min(N × productionRate, cityCapacity)` troops. Covers the
 * saturation edge case (cap not exceeded) and the linear case (under
 * cap).
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { getCell } from '../../src/read';
import type { MatchConfig } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('quickstart Q-002 — production saturates', () => {
  it('after 10 ticks, city contains min(10 × rate, capacity) troops', () => {
    // P2 has a city so the match doesn't immediately terminate (US5).
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 10);
    const cell = getCell(finalWorld, 1, 1);
    const expected = Math.min(10 * ENGINE_CONSTANTS.productionRate, ENGINE_CONSTANTS.cityCapacity);
    expect(cell.troopCount).toBe(expected);
    expect(cell.troopOwner).toBe(1);
  });

  it('after 1 tick, city contains productionRate troops', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 1);
    expect(getCell(finalWorld, 1, 1).troopCount).toBe(ENGINE_CONSTANTS.productionRate);
  });

  it('production saturates at cityCapacity and does not overflow', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const overshoot = ENGINE_CONSTANTS.cityCapacity + 5;
    const { finalWorld } = runScenario(cfg, board, [], overshoot);
    expect(getCell(finalWorld, 1, 1).troopCount).toBe(ENGINE_CONSTANTS.cityCapacity);
  });

  it('production is per-city: two cities add independently', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1],
      [6, 6, 1],
      // P2 has a city too — without it, US5 terminal detection would
      // freeze the world and break this test.
      [4, 4, 2],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 4);
    expect(getCell(finalWorld, 1, 1).troopCount).toBe(4 * ENGINE_CONSTANTS.productionRate);
    expect(getCell(finalWorld, 6, 6).troopCount).toBe(4 * ENGINE_CONSTANTS.productionRate);
  });
});
