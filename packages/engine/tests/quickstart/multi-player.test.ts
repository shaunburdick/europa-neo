/**
 * Multi-player (3/4-player) supplementary test — Feature 001, Polish-phase (T053)
 *
 * Per FR-019: "engine API supports 2–4 players". Per AGENTS.md:
 * "Engine supports 2–4 players by contract; v1 ships 2-player
 * end-to-end."
 *
 * This test confirms that the engine's lifecycle (`createWorld` + `tick`)
 * works for `playerCount: 3` and `playerCount: 4` — a smoke test
 * ensuring the contract holds even though v1 doesn't ship
 * 3/4-player end-to-end gameplay (no matchmaking, no UI for the
 * extra players).
 *
 * We deliberately keep these tests lighter than the 2-player suite:
 * they verify the engine doesn't throw and that the post-tick state
 * is consistent, but don't exercise the full gameplay loop.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { tick } from '../../src/tick';
import type { MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

function build3PlayerConfig(seed: number): MatchConfig {
  return {
    boardSize: 12,
    playerCount: 3,
    tickIntervalMs: 250,
    seed,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
  };
}

function build4PlayerConfig(seed: number): MatchConfig {
  return {
    boardSize: 16,
    playerCount: 4,
    tickIntervalMs: 250,
    seed,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
  };
}

describe('3-player engine (FR-019 smoke)', () => {
  it('createWorld + tick succeeds for playerCount: 3', () => {
    const cfg = build3PlayerConfig(1);
    const board = buildSmallBoard(12, [
      [1, 1, 1 as PlayerId],
      [10, 1, 2 as PlayerId],
      [5, 10, 3 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 10);
    expect(finalWorld.players.length).toBe(3);
    expect(finalWorld.players[0]?.id).toBe(1);
    expect(finalWorld.players[1]?.id).toBe(2);
    expect(finalWorld.players[2]?.id).toBe(3);
    expect(finalWorld.tick).toBe(10);
  });

  it('3-player tick advances by exactly 1 per call', () => {
    const cfg = build3PlayerConfig(2);
    const board = buildSmallBoard(12, [
      [1, 1, 1 as PlayerId],
      [10, 1, 2 as PlayerId],
      [5, 10, 3 as PlayerId],
    ]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r = tick(w0);
    expect(r.world.tick).toBe(1);
    const r2 = tick(r.world);
    expect(r2.world.tick).toBe(2);
  });

  it('3-player board has 3 cities with distinct owners', () => {
    const cfg = build3PlayerConfig(3);
    const board = buildSmallBoard(12, [
      [1, 1, 1 as PlayerId],
      [10, 1, 2 as PlayerId],
      [5, 10, 3 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 5);
    const owners = new Set<number>();
    for (const city of finalWorld.board.cities) {
      owners.add(city.owner);
    }
    expect(owners.size).toBe(3);
  });
});

describe('4-player engine (FR-019 smoke)', () => {
  it('createWorld + tick succeeds for playerCount: 4', () => {
    const cfg = build4PlayerConfig(1);
    const board = buildSmallBoard(16, [
      [1, 1, 1 as PlayerId],
      [14, 1, 2 as PlayerId],
      [1, 14, 3 as PlayerId],
      [14, 14, 4 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 10);
    expect(finalWorld.players.length).toBe(4);
    expect(finalWorld.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(finalWorld.tick).toBe(10);
  });

  it('4-player tick advances by exactly 1 per call', () => {
    const cfg = build4PlayerConfig(2);
    const board = buildSmallBoard(16, [
      [1, 1, 1 as PlayerId],
      [14, 1, 2 as PlayerId],
      [1, 14, 3 as PlayerId],
      [14, 14, 4 as PlayerId],
    ]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r = tick(w0);
    expect(r.world.tick).toBe(1);
  });

  it('4-player board has 4 cities with distinct owners', () => {
    const cfg = build4PlayerConfig(3);
    const board = buildSmallBoard(16, [
      [1, 1, 1 as PlayerId],
      [14, 1, 2 as PlayerId],
      [1, 14, 3 as PlayerId],
      [14, 14, 4 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 5);
    const owners = new Set<number>();
    for (const city of finalWorld.board.cities) {
      owners.add(city.owner);
    }
    expect(owners.size).toBe(4);
  });
});
