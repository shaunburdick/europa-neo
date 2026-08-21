/**
 * Combat resolution unit tests — Feature 001, T031
 *
 * Covers FR-008 (attrition) + combat determinism:
 *   - 100v100: equal forces trade equal losses (1:1 attrition).
 *   - 200v50: bigger force overwhelms smaller; defender eliminated,
 *     attacker retains the difference.
 *   - Three-way: 100/100/100 from three players → majority wins,
 *     losers eliminated, tie broken by ascending PlayerId.
 *   - Single-sided cell: no combat, state unchanged, no event.
 *   - Symmetry: same board state with two players in different roles
 *     produces identical post-combat state modulo PlayerId labels
 *     (per spec Edge Case).
 *   - Determinism: same input × 1000 calls → byte-identical output.
 *   - CombatEvent shape per contract: 2-sided (attacker, defender,
 *     attackerLoss, defenderLoss, winner).
 *
 * resolveCombat is called directly with a hand-built WorldState and an
 * inflow tally so the pure resolution function is exercised in
 * isolation from the tick orchestrator (per data-model.md §9 +
 * research.md §10).
 *
 * **Inflow tally**: resolveCombat needs to know who contributed troops
 * to each cell to detect multi-owner conflicts. The flow phase writes
 * this side-channel; in unit tests we construct it directly. Encoding:
 * `tally[cellIdx * 4 + (playerId - 1)]` is the count of troops that
 * player sent into that cell this tick.
 *
 * **2-way attrition rule**: min(A, B) damage to each side. A keeps
 * max(0, A-B); B keeps max(0, B-A). Bigger force retains the
 * difference; equal forces are mutually destroyed (winner: 'tie').
 *
 * **3-way rule**: dominant owner (highest count, tiebreak by ascending
 * PlayerId) keeps their original count; all non-dominant owners are
 * eliminated. CombatEvents are emitted pairwise (winner vs each loser)
 * so consumers see every engagement.
 */

import { describe, expect, it } from 'vitest';
import type { EngineConstants } from '../../src/contracts/engine-api';
import { resolveCombat } from '../../src/resolution/combat';
import type { Board, WorldState } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

const CONSTANTS: EngineConstants = {
  productionRate: 1,
  cityCapacity: 30,
  cellCapacity: 30,
  decayPerTick: 1,
  flowDownhillFactor: 1,
  flowUphillFactor: 0,
  flowBase: 0,
  paratroopCost: 10,
  gunCost: 5,
  gunDamage: 2,
  visibilityRadiusDefault: 4,
};

function emptyState(size: number): WorldState {
  const n = size * size;
  return {
    troopCounts: new Uint32Array(n),
    troopOwners: new Uint8Array(n),
    pipeMasks: new Uint8Array(n),
    reservesPct: new Uint8Array(n),
    cityOwners: new Uint8Array(n),
  };
}

function emptyTally(size: number): Uint32Array {
  return new Uint32Array(size * size * 4);
}

/**
 * Record an inflow into the tally: `player` wrote `count` troops into
 * the cell at (x, y). Also updates the state's `troopCounts` and
 * `troopOwners` (sum of contributors; last writer is the recorded
 * owner, mirroring resolveFlow's overwrite-on-write behavior).
 */
function inflow(
  state: WorldState,
  tally: Uint32Array,
  size: number,
  x: number,
  y: number,
  player: number,
  count: number,
): void {
  const idx = y * size + x;
  tally[idx * 4 + (player - 1)] = (tally[idx * 4 + (player - 1)] ?? 0) + count;
  state.troopCounts[idx] = (state.troopCounts[idx] ?? 0) + count;
  state.troopOwners[idx] = player;
}

const TICK = 7;

describe('resolveCombat — FR-008 attrition (2-way)', () => {
  it('100v100: equal forces trade equal losses; both eliminated', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    // Both eliminated (count → 0, owner → 0).
    expect(out.state.troopCounts[4 * size + 4]).toBe(0);
    expect(out.state.troopOwners[4 * size + 4]).toBe(0);
  });

  it('100v100: emits one CombatEvent with attackerLoss === defenderLoss === 100, winner "tie"', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.events.combat.length).toBe(1);
    const ev = out.events.combat[0];
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    expect(ev.attackerLoss).toBe(100);
    expect(ev.defenderLoss).toBe(100);
    expect(ev.winner).toBe('tie');
    expect(ev.tick).toBe(TICK);
    // Attacker is the lower PlayerId (deterministic tiebreak).
    expect(ev.attacker).toBe(1);
    expect(ev.defender).toBe(2);
  });

  it('200v50: bigger force overwhelms smaller; defender eliminated; attacker retains 150', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 200);
    inflow(state, tally, size, 4, 4, 2, 50);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[4 * size + 4]).toBe(150);
    expect(out.state.troopOwners[4 * size + 4]).toBe(1);
  });

  it('200v50: CombatEvent attackerLoss = defenderLoss = 50; winner = attacker (1)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 200);
    inflow(state, tally, size, 4, 4, 2, 50);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.events.combat.length).toBe(1);
    const ev = out.events.combat[0];
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    expect(ev.attackerLoss).toBe(50);
    expect(ev.defenderLoss).toBe(50);
    expect(ev.winner).toBe(1);
    expect(ev.attacker).toBe(1);
    expect(ev.defender).toBe(2);
  });

  it('100v100: losses are within ±20% of each other (the equality assertion)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    const ev = out.events.combat[0];
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    const a = ev.attackerLoss;
    const d = ev.defenderLoss;
    // At 1:1 attrition with equal forces, losses are exactly equal.
    expect(a).toBe(d);
  });
});

describe('resolveCombat — single-sided & empty cells', () => {
  it('cell with single-owner inflow: no combat event, state unchanged', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 50);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.events.combat.length).toBe(0);
    expect(Array.from(out.state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(out.state.troopOwners)).toEqual(ownersBefore);
    expect(out.state.troopCounts[4 * size + 4]).toBe(50);
    expect(out.state.troopOwners[4 * size + 4]).toBe(1);
  });

  it('empty cell (no inflow): no event, state unchanged', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.events.combat.length).toBe(0);
    expect(Array.from(out.state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(out.state.troopOwners)).toEqual(ownersBefore);
  });

  it('cells outside the conflict cell are unaffected', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);
    inflow(state, tally, size, 0, 0, 1, 30); // bystander
    inflow(state, tally, size, 7, 7, 2, 20); // bystander

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[0 * size + 0]).toBe(30);
    expect(out.state.troopCounts[7 * size + 7]).toBe(20);
    expect(out.state.troopOwners[0 * size + 0]).toBe(1);
    expect(out.state.troopOwners[7 * size + 7]).toBe(2);
  });
});

describe('resolveCombat — three-way (3 owners, all-equal stack)', () => {
  it('100/100/100: tie broken by ascending PlayerId; P1 wins, keeps 100; P2/P3 eliminated', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);
    inflow(state, tally, size, 4, 4, 3, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[4 * size + 4]).toBe(100);
    expect(out.state.troopOwners[4 * size + 4]).toBe(1);
  });

  it('three-way emits one CombatEvent per (winner, loser) pair', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);
    inflow(state, tally, size, 4, 4, 3, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.events.combat.length).toBe(2);
    // First event: P1 vs P2. Second: P1 vs P3. Both winner=P1.
    const e1 = out.events.combat[0];
    const e2 = out.events.combat[1];
    expect(e1?.attacker).toBe(1);
    expect(e1?.winner).toBe(1);
    expect(e1?.defenderLoss).toBe(100);
    expect(e2?.attacker).toBe(1);
    expect(e2?.winner).toBe(1);
    expect(e2?.defenderLoss).toBe(100);
  });

  it('three-way with one larger stack: the larger stack wins, two losers eliminated', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 200);
    inflow(state, tally, size, 4, 4, 2, 100);
    inflow(state, tally, size, 4, 4, 3, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[4 * size + 4]).toBe(200);
    expect(out.state.troopOwners[4 * size + 4]).toBe(1);
  });
});

describe('resolveCombat — symmetry regardless of order-issuing player', () => {
  it('same board state with P1 and P2 in opposite roles: identical post-combat state modulo labels', () => {
    const size = 8;
    // Board A: P1 (200) wrote into cell, P2 (50) wrote into same cell.
    const boardA: Board = buildSmallBoard(size, []);
    const stateA = emptyState(size);
    const tallyA = emptyTally(size);
    inflow(stateA, tallyA, size, 4, 4, 1, 200);
    inflow(stateA, tallyA, size, 4, 4, 2, 50);

    // Board B: same shape with labels swapped.
    const stateB = emptyState(size);
    const tallyB = emptyTally(size);
    inflow(stateB, tallyB, size, 4, 4, 2, 200);
    inflow(stateB, tallyB, size, 4, 4, 1, 50);

    const outA = resolveCombat(stateA, boardA, CONSTANTS, TICK, tallyA);
    const outB = resolveCombat(stateB, boardA, CONSTANTS, TICK, tallyB);

    // In A: cell (4,4) holds 150 for P1 (winner by majority).
    // In B: cell (4,4) holds 150 for P2 (winner by majority).
    expect(outA.state.troopCounts[4 * size + 4]).toBe(150);
    expect(outB.state.troopCounts[4 * size + 4]).toBe(150);
    expect(outA.state.troopOwners[4 * size + 4]).toBe(1);
    expect(outB.state.troopOwners[4 * size + 4]).toBe(2);
  });
});

describe('resolveCombat — determinism', () => {
  it('same input × 1000 calls → byte-identical output', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 200);
    inflow(state, tally, size, 4, 4, 2, 50);
    inflow(state, tally, size, 4, 4, 3, 100);

    const reference = resolveCombat(state, board, CONSTANTS, TICK, tally);
    for (let i = 0; i < 1000; i++) {
      const next = resolveCombat(state, board, CONSTANTS, TICK, tally);
      expect(Array.from(next.state.troopCounts)).toEqual(Array.from(reference.state.troopCounts));
      expect(Array.from(next.state.troopOwners)).toEqual(Array.from(reference.state.troopOwners));
      expect(next.events.combat.length).toBe(reference.events.combat.length);
    }
  });

  it('does not mutate input state arrays or tally', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 200);
    inflow(state, tally, size, 4, 4, 2, 50);
    const countsBefore = Array.from(state.troopCounts);
    const ownersBefore = Array.from(state.troopOwners);
    const tallyBefore = Array.from(tally);

    resolveCombat(state, board, CONSTANTS, TICK, tally);

    expect(Array.from(state.troopCounts)).toEqual(countsBefore);
    expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
    expect(Array.from(tally)).toEqual(tallyBefore);
  });

  it('returned events.combat preserves tick number across calls', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);

    const r1 = resolveCombat(state, board, CONSTANTS, 1, tally);
    const r2 = resolveCombat(state, board, CONSTANTS, 99, tally);
    expect(r1.events.combat[0]?.tick).toBe(1);
    expect(r2.events.combat[0]?.tick).toBe(99);
  });
});

describe('resolveCombat — defensive / boundary', () => {
  it('1v100: smaller eliminated, larger retains 99', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 1);
    inflow(state, tally, size, 4, 4, 2, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[4 * size + 4]).toBe(99);
    expect(out.state.troopOwners[4 * size + 4]).toBe(2);
  });

  it('1v1: both eliminated', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 1);
    inflow(state, tally, size, 4, 4, 2, 1);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.troopCounts[4 * size + 4]).toBe(0);
    expect(out.state.troopOwners[4 * size + 4]).toBe(0);
  });

  it('does not modify unrelated state arrays (pipeMasks, cityOwners, reservesPct)', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    state.pipeMasks[0] = 0x05; // N + S
    state.cityOwners[10] = 1;
    state.reservesPct[20] = 3;
    const tally = emptyTally(size);
    inflow(state, tally, size, 4, 4, 1, 100);
    inflow(state, tally, size, 4, 4, 2, 100);

    const out = resolveCombat(state, board, CONSTANTS, TICK, tally);
    expect(out.state.pipeMasks[0]).toBe(0x05);
    expect(out.state.cityOwners[10]).toBe(1);
    expect(out.state.reservesPct[20]).toBe(3);
  });

  it('no tally provided: no combat events fired (single-owner assumption)', () => {
    // Direct call without inflowTally — the function sees a single-owner
    // state and emits no combat events. (In the tick orchestrator, the
    // tally is always supplied.)
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    state.troopCounts[4 * size + 4] = 200;
    state.troopOwners[4 * size + 4] = 1;

    const out = resolveCombat(state, board, CONSTANTS, TICK);
    expect(out.events.combat.length).toBe(0);
    expect(out.state.troopCounts[4 * size + 4]).toBe(200);
  });
});
