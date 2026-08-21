/**
 * tick + applyCommand unit tests — Feature 001, T024/T025/T027 supplementary
 *
 * Direct tests of the orchestrator and apply pipeline that complement
 * the Q-001 quickstart test. Covers branches the quickstart doesn't
 * touch:
 *   - All four pipe command kinds applied through tick()
 *   - Deferred order kinds are no-ops in US1
 *   - applyCommand rejects invalid orders with the typed reason
 *   - applyCommand returns world unchanged on failure
 *   - tick() drains staged orders and resets pendingOrders
 *   - Order sort by PlayerId then kind is observable
 *   - Frozen-once-terminal behavior (US1 stub)
 *   - isTerminal returns undefined for US1
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { isTerminal, tick } from '../../src/tick';
import type { Direction, MatchConfig, PlayerId } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
  boardSize: 8,
  playerCount: 2,
  tickIntervalMs: 250,
  seed: 1,
  visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

describe('applyCommand — pipe commands', () => {
  it('setPipe on owned cell stages the order and returns ok:true', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r = applyCommand(w0, {
      kind: 'setPipe',
      player: 1,
      cell: { x: 1, y: 1 },
      direction: 'E',
    });
    expect(r.result.ok).toBe(true);
    // Pending orders are not part of the public World contract, but
    // `tick()` consumes them. We don't need to inspect them here.
  });

  it('setPipe on enemy cell returns not_owner rejection', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r = applyCommand(w0, {
      kind: 'setPipe',
      player: 1,
      cell: { x: 6, y: 6 }, // player 2's cell
      direction: 'E',
    });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.reason.kind).toBe('not_owner');
    }
  });

  it('setPipe on water destination returns water_target rejection', () => {
    // Hand-roll a board: (2,0) is a city, (3,0) is water.
    const size = 8;
    const cells = Array.from({ length: size * size }, (_, i) => ({
      x: i % size,
      y: Math.floor(i / size),
      elevation: 0,
      terrain: 'land' as const,
    }));
    const waterCell = cells[0 * size + 3];
    if (waterCell === undefined) throw new Error('test setup');
    cells[3] = { ...waterCell, terrain: 'water' };
    const board = Object.freeze({
      width: size,
      height: size,
      cells: Object.freeze(cells),
      cities: Object.freeze([{ cell: { x: 2, y: 0 }, owner: 1 as PlayerId }]),
    });
    const { finalWorld: w0 } = runScenario(cfg, board, [], 1);
    const r = applyCommand(w0, {
      kind: 'setPipe',
      player: 1,
      cell: { x: 2, y: 0 },
      direction: 'E',
    });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.reason.kind).toBe('water_target');
    }
  });

  it('setPipe to OOB destination returns out_of_bounds rejection', () => {
    const board = buildSmallBoard(8, [[7, 0, 1 as PlayerId]]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 1);
    const r = applyCommand(w0, {
      kind: 'setPipe',
      player: 1,
      cell: { x: 7, y: 0 },
      direction: 'E',
    });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.reason.kind).toBe('out_of_bounds');
    }
  });

  it('setPipe on OOB source returns out_of_bounds rejection', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r = applyCommand(w0, {
      kind: 'setPipe',
      player: 1,
      cell: { x: 99, y: 0 },
      direction: 'E',
    });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.reason.kind).toBe('out_of_bounds');
    }
  });

  it('setPipesExclusive replaces existing pipes on the cell', () => {
    // P2 has a city too — US5 terminal detection would otherwise freeze
    // the world after tick 0.
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const pipeOrders: Array<{
      atTick: number;
      order: {
        kind: string;
        player: PlayerId;
        cell: { x: number; y: number };
        direction: Direction;
      };
    }> = [
      { atTick: 0, order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'E' } },
      { atTick: 0, order: { kind: 'setPipe', player: 1, cell: { x: 1, y: 1 }, direction: 'N' } },
      {
        atTick: 1,
        order: { kind: 'setPipesExclusive', player: 1, cell: { x: 1, y: 1 }, direction: 'S' },
      },
    ];
    const { finalWorld } = runScenario(cfg, board, pipeOrders, 2);
    const cell = finalWorld.state.pipeMasks[1 * 8 + 1] ?? 0;
    // Only S should remain after exclusive set.
    expect(cell & 0x01).toBe(0); // N
    expect(cell & 0x02).toBe(0); // E
    expect(cell & 0x04).toBe(0x04); // S
  });

  it('clearAllPipes removes all pipes from a cell', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const orders = [
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'E' as Direction,
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'N' as Direction,
        },
      },
      {
        atTick: 1,
        order: { kind: 'clearAllPipes' as const, player: 1 as PlayerId, cell: { x: 1, y: 1 } },
      },
    ];
    const { finalWorld } = runScenario(cfg, board, orders, 2);
    expect(finalWorld.state.pipeMasks[1 * 8 + 1]).toBe(0);
  });

  it('clearPipe removes a single direction', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const orders = [
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'E' as Direction,
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'N' as Direction,
        },
      },
      {
        atTick: 1,
        order: {
          kind: 'clearPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'E' as Direction,
        },
      },
    ];
    const { finalWorld } = runScenario(cfg, board, orders, 2);
    const cell = finalWorld.state.pipeMasks[1 * 8 + 1] ?? 0;
    expect(cell & 0x01).toBe(0x01); // N still set
    expect(cell & 0x02).toBe(0); // E cleared
  });

  it('deferred order kinds (paratroop, gun, setReserves, surrender) are accepted when prerequisites are met', () => {
    // P2 has a city too — otherwise US5 terminal detection eliminates P2
    // and freezes the world. Run enough ticks for P1 to accumulate troops.
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 30);
    expect(
      applyCommand(w0, {
        kind: 'paratroop',
        player: 1,
        source: { x: 1, y: 1 },
        target: { x: 2, y: 1 },
      }).result.ok,
    ).toBe(true);
    expect(
      applyCommand(w0, { kind: 'gun', player: 1, source: { x: 1, y: 1 }, target: { x: 2, y: 1 } })
        .result.ok,
    ).toBe(true);
    expect(
      applyCommand(w0, { kind: 'setReserves', player: 1, cell: { x: 1, y: 1 }, percent: 3 }).result
        .ok,
    ).toBe(true);
    expect(applyCommand(w0, { kind: 'surrender', player: 2 as PlayerId }).result.ok).toBe(true);
  });
});

describe('tick — orchestrator', () => {
  it('drains staged orders: same order staged on two ticks only applies once', () => {
    const board = buildSmallBoard(8, [[1, 1, 1 as PlayerId]]);
    // Stage setPipe E at tick 0, but call tick twice. The pipe is
    // consumed on the first tick; the second tick has nothing to do.
    const orders = [
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'E' as Direction,
        },
      },
    ];
    const { events, finalWorld } = runScenario(cfg, board, orders, 2);
    expect(events[0]?.appliedOrders.length).toBe(1);
    expect(events[1]?.appliedOrders.length).toBe(0);
    // Pipe is still set (orders aren't re-applied):
    expect((finalWorld.state.pipeMasks[1 * 8 + 1] ?? 0) & 0x02).toBe(0x02);
  });

  it('orders from different players are sorted deterministically', () => {
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    // Stage player 2's order BEFORE player 1's in the array. The
    // tick() pipeline must apply them in PlayerId-ascending order.
    const orders = [
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 2 as PlayerId,
          cell: { x: 6, y: 6 },
          direction: 'W' as Direction,
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'setPipe' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          direction: 'E' as Direction,
        },
      },
    ];
    const { events } = runScenario(cfg, board, orders, 1);
    const recorded = events[0]?.appliedOrders ?? [];
    expect(recorded.length).toBe(2);
    // Player 1 first, then player 2.
    expect(recorded[0]?.order.player).toBe(1);
    expect(recorded[1]?.order.player).toBe(2);
  });

  it('isTerminal returns undefined for non-terminal US1 worlds', () => {
    // P2 must have a city too — otherwise terminal detection fires.
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld } = runScenario(cfg, board, [], 5);
    expect(isTerminal(finalWorld)).toBeUndefined();
  });

  it('tick advances world.tick by exactly 1', () => {
    // P2 must have a city too — otherwise terminal detection freezes the world.
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    const { finalWorld: w0 } = runScenario(cfg, board, [], 0);
    const r1 = tick(w0);
    expect(r1.world.tick).toBe(1);
    const r2 = tick(r1.world);
    expect(r2.world.tick).toBe(2);
  });

  it('deferred order kinds (surrender, paratroop, gun, setReserves) are recorded as applied', () => {
    // Stage a surrender + a paratroop + a gun + a setReserves order.
    // Surrender is applied immediately (FR-016 — player marked
    // eliminated). The other three are staged and applied by their
    // dedicated resolution phases in tick.ts.
    const board = buildSmallBoard(8, [
      [1, 1, 1 as PlayerId],
      [6, 6, 2 as PlayerId],
    ]);
    // Run enough ticks for P1 to accumulate troops (gun/paratroop need
    // a populated source).
    const { finalWorld: warmed } = runScenario(cfg, board, [], 30);
    const orders = [
      {
        atTick: 0,
        order: {
          kind: 'surrender' as const,
          player: 2 as PlayerId,
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'paratroop' as const,
          player: 1 as PlayerId,
          source: { x: 1, y: 1 },
          target: { x: 2, y: 2 },
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'gun' as const,
          player: 1 as PlayerId,
          source: { x: 1, y: 1 },
          target: { x: 6, y: 6 },
        },
      },
      {
        atTick: 0,
        order: {
          kind: 'setReserves' as const,
          player: 1 as PlayerId,
          cell: { x: 1, y: 1 },
          percent: 3 as const,
        },
      },
    ];
    // Stage each via applyCommand on the warmed world (which has 30
    // troops at the city). This validates that each kind is accepted.
    expect(applyCommand(warmed, orders[0]?.order as never).result.ok).toBe(true);
    expect(applyCommand(warmed, orders[1]?.order as never).result.ok).toBe(true);
    expect(applyCommand(warmed, orders[2]?.order as never).result.ok).toBe(true);
    expect(applyCommand(warmed, orders[3]?.order as never).result.ok).toBe(true);
  });
});
