/**
 * SC-001 Determinism Test — Feature 001, Polish-phase (T052)
 *
 * Per spec Q-004 acceptance: "Same scripted scenario → same final world
 * for two independent runs of ≥10,000 ticks."
 *
 * Implementation:
 *   1. Build a deterministic scenario (board, orders, seed).
 *   2. Run the scenario twice for 10,000 ticks each.
 *   3. Serialize the final world from each run; assert the bytes are
 *      byte-identical (i.e., not just deep-equal — actually the same
 *      sequence of bytes).
 *
 * If the engine ever introduces a non-deterministic behavior (wall-
 * clock read, Math.random, sort instability, etc.), this test will
 * fail.
 *
 * **Performance note**: 10,000 ticks at ~1ms per tick (per SC-004) takes
 * ~10 seconds. This is acceptable for a Polish-phase gate but should
 * not be run on every commit. The CI workflow (T055) gates coverage
 * and quick tests on PRs; this one runs on push to main only.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../src/constants';
import { serializeWorld } from '../src/serialize';
import type { Direction, MatchConfig, PlayerId } from '../src/types';
import { buildSmallBoard } from './fixtures/board';
import { runScenario } from './fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 0xdeadbeef,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

/** Number of ticks to simulate (spec Q-004: ≥10,000). */
const TICK_COUNT = 10_000;

describe('SC-001 — determinism (Q-004 acceptance)', () => {
  it('two independent 10k-tick runs produce byte-identical serialized worlds', () => {
    // P1 + P2 each have a city (US5 would otherwise freeze P2).
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    // A handful of pipe orders at tick 0 (every direction, both
    // players) to exercise the flow phase deterministically. After
    // tick 0 no further orders are issued — the cities grow
    // monotonically, no combat triggers, no decay (since both cells
    // remain owned by friendly cities).
    const pipeOrders: Array<{
      atTick: number;
      order: {
        kind: 'setPipe';
        player: PlayerId;
        cell: { x: number; y: number };
        direction: Direction;
      };
    }> = [
      {
        atTick: 0,
        order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'E' },
      },
      {
        atTick: 0,
        order: { kind: 'setPipe', player: 2, cell: { x: 6, y: 6 }, direction: 'W' },
      },
    ];

    const a = runScenario(cfg, board, pipeOrders, TICK_COUNT);
    const b = runScenario(cfg, board, pipeOrders, TICK_COUNT);

    // Same final tick.
    expect(a.finalWorld.tick).toBe(TICK_COUNT);
    expect(b.finalWorld.tick).toBe(TICK_COUNT);

    // Byte-identical serialized worlds.
    const aBytes = serializeWorld(a.finalWorld);
    const bBytes = serializeWorld(b.finalWorld);
    expect(aBytes.length).toBe(bBytes.length);
    expect(Array.from(aBytes)).toEqual(Array.from(bBytes));

    // Cross-check: deep equality of the deserialized form too.
    expect(b.finalWorld.state.troopCounts).toEqual(a.finalWorld.state.troopCounts);
    expect(b.finalWorld.state.troopOwners).toEqual(a.finalWorld.state.troopOwners);
    expect(b.finalWorld.state.pipeMasks).toEqual(a.finalWorld.state.pipeMasks);
    expect(b.finalWorld.state.cityOwners).toEqual(a.finalWorld.state.cityOwners);
    expect(b.finalWorld.players).toEqual(a.finalWorld.players);
  }, 60_000 /* 60s timeout — 10k ticks can take ~10s on slower CI */);
});
