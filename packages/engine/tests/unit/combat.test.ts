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
    flowBase: 0,
    flowSlopeStep: 1,
    flowSlopeDeltaCap: 5,
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
        if (ev === undefined) {
            return;
        }
        expect(ev.attackerLoss).toBe(100);
        expect(ev.defenderLoss).toBe(100);
        expect(ev.winner).toBe('tie');
        expect(ev.tick).toBe(TICK);
        // Attacker is the lower PlayerId (deterministic tiebreak).
        expect(ev.attacker).toBe(1);
        expect(ev.defender).toBe(2);
        // Total-force: each side committed 100.
        expect(ev.attackerTotal).toBe(100);
        expect(ev.defenderTotal).toBe(100);
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
        if (ev === undefined) {
            return;
        }
        expect(ev.attackerLoss).toBe(50);
        expect(ev.defenderLoss).toBe(50);
        expect(ev.winner).toBe(1);
        expect(ev.attacker).toBe(1);
        expect(ev.defender).toBe(2);
        // Total-force: P1 committed 200, P2 committed 50.
        expect(ev.attackerTotal).toBe(200);
        expect(ev.defenderTotal).toBe(50);
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
        if (ev === undefined) {
            return;
        }
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
        // Total-force model without preFlowState: dominant-owner fallback.
        // P2 dominates tally (100 > 1), so P2 wins and retains the cell.
        expect(out.state.troopOwners[4 * size + 4]).toBe(2);
        // Verify CombatEvent totals.
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            expect(ev.attackerTotal).toBe(1);
            expect(ev.defenderTotal).toBe(100);
        }
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
        // Verify CombatEvent totals: equal forces → tie.
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            expect(ev.attackerTotal).toBe(1);
            expect(ev.defenderTotal).toBe(1);
            expect(ev.winner).toBe('tie');
        }
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

// ============================================================================
// Total-force combat resolution (FR-008 Clarifications v1.4)
// ============================================================================

describe('resolveCombat — total-force model (preFlowState + committedFlowTally)', () => {
    /**
     * Helper: build a preFlowState snapshot and committedFlowTally for a
     * single cell at (x, y). preFlowState reflects the garrison BEFORE
     * flow; committedFlowTally records raw pipe delivery per player.
     */
    function buildPreFlowAndCommitted(
        size: number,
        cellX: number,
        cellY: number,
        garrisonOwner: PlayerId | 0,
        garrisonCount: number,
        flows: Array<{ player: PlayerId; count: number }>,
    ): {
        preFlowState: { troopOwners: Uint8Array; troopCounts: Uint32Array };
        committedFlowTally: Uint32Array;
    } {
        const n = size * size;
        const preOwners = new Uint8Array(n);
        const preCounts = new Uint32Array(n);
        const tally = new Uint32Array(n * 4);
        const idx = cellY * size + cellX;
        preOwners[idx] = garrisonOwner;
        preCounts[idx] = garrisonCount;
        for (const f of flows) {
            tally[idx * 4 + (f.player - 1)] = f.count;
        }
        return {
            preFlowState: { troopOwners: preOwners, troopCounts: preCounts },
            committedFlowTally: tally,
        };
    }

    it('T-020: cell at capacity with zero headroom — committed flow fires combat (AC-1)', () => {
        // Cell has 30 P2 troops (at capacity). P1 pipes deliver 14 committed.
        // Headroom = 0, so inflowTally = 0 for P1. But committedFlowTally = 14.
        // Combat fires: attackerTotal=14, defenderTotal=30+0=30.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        // Post-flow state: P2 owns cell with 30 troops (at capacity, no new flow).
        state.troopCounts[idx] = 30;
        state.troopOwners[idx] = 2;

        const tally = emptyTally(size); // inflowTally = 0 (no actual inflow)
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            2, 30,  // garrison: P2 with 30
            [{ player: 1, count: 14 }], // P1 committed 14
        );

        const out = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        expect(out.events.combat.length).toBe(1);
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            expect(ev.attackerTotal).toBe(14); // P1 committed
            expect(ev.defenderTotal).toBe(30); // P2 garrison + 0 committed
            expect(ev.attackerLoss).toBe(14);
            expect(ev.defenderLoss).toBe(14);
            expect(ev.winner).toBe(2); // P2 survives (30-14=16 > 0)
        }
        // P2 retains cell with 16 troops.
        expect(out.state.troopCounts[idx]).toBe(16);
        expect(out.state.troopOwners[idx]).toBe(2);
    });

    it('T-022: garrison-only vs inflow-only — attacker inflow vs defender garrison (AC-3)', () => {
        // Cell has 20 P2 troops (garrison). P1 sends 15 via pipe.
        // defenderTotal = 20 (garrison) + 0 (P2 committed) = 20
        // attackerTotal = 15 (P1 committed)
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        // Post-flow: P1 overwrote owner (last writer wins in flow phase).
        state.troopCounts[idx] = 35; // 20 garrison + 15 inflow
        state.troopOwners[idx] = 1;

        const tally = emptyTally(size);
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            2, 20,  // garrison: P2 with 20
            [{ player: 1, count: 15 }], // P1 committed 15
        );

        const out = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        expect(out.events.combat.length).toBe(1);
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            expect(ev.attackerTotal).toBe(15);
            expect(ev.defenderTotal).toBe(20);
            expect(ev.attackerLoss).toBe(15);
            expect(ev.defenderLoss).toBe(15);
        }
        // P2 survives (20-15=5 > 0), P1 eliminated.
        expect(out.state.troopCounts[idx]).toBe(5);
        expect(out.state.troopOwners[idx]).toBe(2);
    });

    it('T-023: garrison + inflow from both sides — garrison owner is defender (AC-4)', () => {
        // Cell has 10 P1 troops (garrison). P1 pipes deliver 7, P2 pipes deliver 7.
        // defenderTotal = 10 (garrison) + 7 (P1 committed) = 17
        // attackerTotal = 7 (P2 committed)
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        // Post-flow: P2 overwrote owner.
        state.troopCounts[idx] = 24; // 10 garrison + 7 P1 + 7 P2
        state.troopOwners[idx] = 2;

        const tally = emptyTally(size);
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            1, 10,  // garrison: P1 with 10
            [{ player: 1, count: 7 }, { player: 2, count: 7 }],
        );

        const out = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        expect(out.events.combat.length).toBe(1);
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            expect(ev.attackerTotal).toBe(7);  // P2 committed
            expect(ev.defenderTotal).toBe(17); // P1 garrison(10) + committed(7)
            expect(ev.attackerLoss).toBe(7);
            expect(ev.defenderLoss).toBe(7);
        }
        // P1 survives (17-7=10), P2 eliminated.
        expect(out.state.troopCounts[idx]).toBe(10);
        expect(out.state.troopOwners[idx]).toBe(1);
    });

    it('T-024: empty cell with simultaneous inflow — dominant-owner fallback (AC-5)', () => {
        // Both P1 and P2 pipe into empty cell. No garrison.
        // Falls back to dominant-owner model.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        state.troopCounts[idx] = 0;
        state.troopOwners[idx] = 0;

        const tally = emptyTally(size);
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            0, 0, // no garrison
            [{ player: 1, count: 20 }, { player: 2, count: 12 }],
        );

        const out = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        expect(out.events.combat.length).toBe(1);
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            // Dominant-owner model: P1 committed 20, P2 committed 12.
            // attacker = lower PlayerId = P1, defender = P2.
            expect(ev.attackerTotal).toBe(20);
            expect(ev.defenderTotal).toBe(12);
            expect(ev.attackerLoss).toBe(12);
            expect(ev.defenderLoss).toBe(12);
            expect(ev.winner).toBe(1); // P1 retains 8
        }
        expect(out.state.troopCounts[idx]).toBe(8);
        expect(out.state.troopOwners[idx]).toBe(1);
    });

    it('T-025: CombatEvent payloads include attackerTotal/defenderTotal (AC-6)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        state.troopCounts[idx] = 15;
        state.troopOwners[idx] = 2;

        const tally = emptyTally(size);
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            2, 15,
            [{ player: 1, count: 10 }],
        );

        const out = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        expect(out.events.combat.length).toBe(1);
        const ev = out.events.combat[0];
        expect(ev).toBeDefined();
        if (ev !== undefined) {
            // Exact payload verification.
            expect(ev).toEqual({
                tick: TICK,
                cell: { x: 4, y: 4 },
                attacker: 1,
                defender: 2,
                attackerLoss: 10,
                defenderLoss: 10,
                winner: 2,
                attackerTotal: 10,
                defenderTotal: 15,
            });
        }
    });

    it('T-026: determinism — same input × 1000 calls → byte-identical output (AC-7)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const idx = 4 * size + 4;

        state.troopCounts[idx] = 25;
        state.troopOwners[idx] = 2;

        const tally = emptyTally(size);
        const { preFlowState, committedFlowTally } = buildPreFlowAndCommitted(
            size, 4, 4,
            2, 25,
            [{ player: 1, count: 12 }, { player: 3, count: 8 }],
        );

        const reference = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
        for (let i = 0; i < 1000; i++) {
            const next = resolveCombat(state, board, CONSTANTS, TICK, tally, committedFlowTally, preFlowState);
            expect(Array.from(next.state.troopCounts)).toEqual(Array.from(reference.state.troopCounts));
            expect(Array.from(next.state.troopOwners)).toEqual(Array.from(reference.state.troopOwners));
            expect(next.events.combat.length).toBe(reference.events.combat.length);
            // Verify attackerTotal/defenderTotal are identical.
            for (let j = 0; j < next.events.combat.length; j++) {
                const nev = next.events.combat[j];
                const rev = reference.events.combat[j];
                expect(nev?.attackerTotal).toBe(rev?.attackerTotal);
                expect(nev?.defenderTotal).toBe(rev?.defenderTotal);
            }
        }
    });
});
