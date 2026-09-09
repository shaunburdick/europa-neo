/**
 * Flow resolution unit tests — Feature 001, T020 (rewritten for
 * issue #50 / equal-split model, Clarifications v1.9)
 *
 * Covers:
 *   - FR-007: elevation-gradient flow — exact per-tick rates for
 *     downhill (capped bonus), flat, and uphill (linear penalty,
 *     stall at delta >= perPipe / flowUphillStep)
 *   - US1 AC-5: a stalled uphill pipe remains laid and legal
 *   - FR-006: 4-way pipe support, exclusive mode
 *   - Equal-split model (Clarifications v1.9): perPipe =
 *     floor(flowRate / numPipes), scarcity splitting
 *   - Plateau flow: stable source sends constant troops per tick
 *   - Water-target rejection (flow into water is a no-op)
 *   - Capacity clamp: destination never exceeds cellCapacity
 *   - Determinism: same input → same output
 *
 * resolveFlow is called directly with hand-built WorldState so the
 * tests exercise the pure resolution function in isolation.
 *
 * TEST_CONSTANTS uses the shipped equal-split shape (flowRate=12,
 * flowDownhillStep=1, flowUphillStep=1, flowSlopeDeltaCap=5)
 * so the exact-rate assertions pin the PM-confirmed formula
 * (spec 024 v1.3 FR-051): perPipe = floor(flowRate / numPipes),
 * downhill `perPipe + downhillStep × min(|delta|, cap)`, flat
 * `perPipe`, uphill `max(0, perPipe − uphillStep × delta)`.
 */

import { describe, expect, it } from 'vitest';
import type { EngineConstants } from '../../src/contracts/engine-api';
import { resolveFlow } from '../../src/resolution/flow';
import type { Board, WorldState } from '../../src/types';
import { buildBoardWithElevation, buildSmallBoard } from '../fixtures/board';

// Synthetic constants matching the shipped equal-split shape so exact
// per-tick rates are observable and pinned to the FR-051 formula.
const TEST_CONSTANTS: EngineConstants = {
    productionRate: 1,
    cityCapacity: 30,
    cellCapacity: 30,
    decayPerTick: 1,
    flowRate: 12,
    flowDownhillStep: 1,
    flowUphillStep: 1,
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

const N = 0x01;
const E = 0x02;
const S = 0x04;
const W = 0x08;

function setPipe(
    state: WorldState,
    size: number,
    x: number,
    y: number,
    directionMask: number,
    count: number,
    owner: number,
): void {
    const idx = y * size + x;
    state.pipeMasks[idx] = directionMask;
    state.troopCounts[idx] = count;
    state.troopOwners[idx] = owner;
}

// ---------------------------------------------------------------------------
// FR-007 gradient slope rates (single pipe, perPipe = flowRate = 12)
// ---------------------------------------------------------------------------

describe('resolveFlow — FR-007 gradient slope rates', () => {
    it('downhill Δ=−1 moves perPipe + step×1 = 13 troops', () => {
        // Source at elevation 5, destination east at elevation 4 (delta = −1).
        // perPipe = 12, bonus = 1×min(1,5) = 1, total = 13.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [4, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1); // source full, pipes east

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(13);
        expect(out.troopOwners[1]).toBe(1);
    });

    it('downhill Δ=−5 moves perPipe + step×5 = 17 troops', () => {
        // perPipe = 12, bonus = 1×min(5,5) = 5, total = 17.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [0, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(17);
    });

    it('downhill Δ=−10 is capped at perPipe + step×cap = 17 troops', () => {
        // delta = −10 exceeds flowSlopeDeltaCap = 5; the bonus is capped.
        // perPipe = 12, bonus = 1×min(10,5) = 5, total = 17.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [0, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(17);
    });

    it('flat pipe moves perPipe = 12 troops', () => {
        // perPipe = 12, delta = 0 → rate = 12.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(12);
    });

    it('uphill Δ=1 moves perPipe − step×1 = 11 troops', () => {
        // perPipe = 12, penalty = 1×1 = 1, total = 11.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [4, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(11);
    });

    it('uphill Δ=6 moves perPipe − step×6 = 6 troops', () => {
        // perPipe = 12, penalty = 1×6 = 6, total = 6.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [6, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(6);
    });

    it('uphill Δ=11 moves perPipe − step×11 = 1 troop (near stall)', () => {
        // perPipe = 12, penalty = 1×11 = 11, total = 1.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [11, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(1);
    });

    it('uphill Δ=12 stalls (0 troops) and the pipe remains laid and legal (US1 AC-5)', () => {
        // delta = +12 reaches the stall threshold (perPipe / flowUphillStep = 12).
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [12, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
        expect(out.troopOwners[1]).toBe(0);
        // Stall is a legal, persistent state: the pipe stays laid...
        expect(out.pipeMasks[0] & E).toBe(E);
        // ...and the source stack is untouched because NO transfer
        // occurred (stall = zero flow rate; Clarifications v1.6).
        expect(out.troopCounts[0]).toBe(30);
    });

    it('uphill Δ=100 also stalls (far beyond stall threshold)', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [100, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
    });

    it('downhill > flat > uphill ordering holds for identical source stacks', () => {
        // Three boards; same pipe order (E); same source count. With the
        // equal-split constants the ordering is strict: 17 > 12 > 4.
        const downhill = buildBoardWithElevation(
            8,
            [
                [10, 0],
                [0, 0],
            ],
            [],
        );
        const flat = buildBoardWithElevation(
            8,
            [
                [5, 0],
                [5, 0],
            ],
            [],
        );
        const uphill = buildBoardWithElevation(
            8,
            [
                [0, 0],
                [40, 0],
            ],
            [],
        );

        const make = (): WorldState => {
            const s = emptyState(8);
            setPipe(s, 8, 0, 0, E, 30, 1);
            return s;
        };

        const downDest = resolveFlow(make(), downhill, TEST_CONSTANTS).troopCounts[1];
        const flatDest = resolveFlow(make(), flat, TEST_CONSTANTS).troopCounts[1];
        const upDest = resolveFlow(make(), uphill, TEST_CONSTANTS).troopCounts[1];

        // downhill Δ=−10 → 17 (capped), flat → 12, uphill Δ=40 → 0 (stall).
        expect(downDest).toBe(17);
        expect(flatDest).toBe(12);
        expect(upDest).toBe(0);
        expect(downDest).toBeGreaterThan(flatDest);
        expect(flatDest).toBeGreaterThan(upDest);
    });
});

// ---------------------------------------------------------------------------
// FR-006 pipe support
// ---------------------------------------------------------------------------

describe('resolveFlow — FR-006 pipe support', () => {
    it('4-way pipe support: each direction moves independently, source depletes (Clarifications v1.6)', () => {
        // Hand-roll a board: (4,4) is elevation 10, all its neighbors are
        // elevation 5, all other cells are elevation 5 too (so they're
        // "flat" relative to each other but "downhill" relative to (4,4)).
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => {
            const cx = i % size;
            const cy = Math.floor(i / size);
            const elev = cx === 4 && cy === 4 ? 10 : 5;
            return { x: cx, y: cy, elevation: elev, terrain: 'land' as const };
        });
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(8);
        // (4,4) pipes N/E/S/W. All neighbors at elevation 5, source at 10
        // → delta = −5. perPipe = floor(12/4) = 3. rate = 3 + 1×5 = 8.
        // Source has 30 troops; reserve floor recomputed per-transfer:
        //   N: srcCount=30, floor=ceil(30×0/10)=0, available=30,
        //      base=min(3, floor(30/4))=3, rate=8, send=8 → src=22
        //   E: srcCount=22, floor=0, available=22,
        //      base=min(3, floor(22/3))=3, rate=8, send=8 → src=14
        //   S: srcCount=14, floor=0, available=14,
        //      base=min(3, floor(14/2))=3, rate=8, send=6 (capped by
        //      maxDeductable=14 vs headroom=30 → deduct=min(8,14)=8, but
        //      wait—deduct = min(add, maxDeductable) = min(8,14) = 8.
        //      Actually: src=14, send=8, src→6.
        //   W: srcCount=6, floor=0, available=6,
        //      base=min(3, floor(6/1))=3, rate=8, send=6 (src only has 6).
        // Total sent: 8+8+8+6=30. Source fully depleted.
        setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * 8 + 4; // (4,3)
        const eIdx = 4 * 8 + 5; // (5,4)
        const sIdx = 5 * 8 + 4; // (4,5)
        const wIdx = 4 * 8 + 3; // (3,4)
        const srcIdx = 4 * 8 + 4; // (4,4)
        expect(out.troopCounts[nIdx]).toBe(8);
        expect(out.troopCounts[eIdx]).toBe(8);
        expect(out.troopCounts[sIdx]).toBe(8);
        expect(out.troopCounts[wIdx]).toBe(6);
        // Source fully depleted → owner preserved (Clarifications v1.8).
        expect(out.troopCounts[srcIdx]).toBe(0);
        expect(out.troopOwners[srcIdx]).toBe(1);
        // Conservation: total on the board is unchanged (30 in, 30 out).
        let total = 0;
        for (const c of out.troopCounts) {
            total += c;
        }
        expect(total).toBe(30);
    });

    it('exclusive mode: only the configured direction receives troops', () => {
        // Even if the bitmask only has E set, NE/SW shouldn't fire.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 4, 4, E, 30, 1); // exclusive (single bit)

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * 8 + 4;
        const eIdx = 4 * 8 + 5;
        const sIdx = 5 * 8 + 4;
        const wIdx = 4 * 8 + 3;
        expect(out.troopCounts[eIdx]).toBeGreaterThan(0);
        expect(out.troopCounts[nIdx]).toBe(0);
        expect(out.troopCounts[sIdx]).toBe(0);
        expect(out.troopCounts[wIdx]).toBe(0);
    });

    it('source with no outgoing pipes does not flow', () => {
        const board = buildSmallBoard(8, []);
        const state = emptyState(8);
        state.troopCounts[0] = 30;
        state.troopOwners[0] = 1;
        // No pipes.
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
        expect(out.troopCounts[8]).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Equal-split model (Clarifications v1.9)
// ---------------------------------------------------------------------------

describe('resolveFlow — equal-split model (Clarifications v1.9)', () => {
    it('2-pipe flat: each pipe gets floor(12/2) = 6 troops', () => {
        // Source 30 troops, 2 pipes at same elevation. perPipe = 6.
        // N and E pipes. Both flat → rate = 6 each.
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        // Source at (4,4) pipes N and E.
        setPipe(state, size, 4, 4, N | E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4; // (4,3)
        const eIdx = 4 * size + 5; // (5,4)
        expect(out.troopCounts[nIdx]).toBe(6);
        expect(out.troopCounts[eIdx]).toBe(6);
        // Source lost 12 total.
        expect(out.troopCounts[4 * size + 4]).toBe(18);
    });

    it('3-pipe flat: each pipe gets floor(12/3) = 4 troops', () => {
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        setPipe(state, size, 4, 4, N | E | S, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4;
        const eIdx = 4 * size + 5;
        const sIdx = 5 * size + 4;
        expect(out.troopCounts[nIdx]).toBe(4);
        expect(out.troopCounts[eIdx]).toBe(4);
        expect(out.troopCounts[sIdx]).toBe(4);
        expect(out.troopCounts[4 * size + 4]).toBe(18);
    });

    it('4-pipe flat: each pipe gets floor(12/4) = 3 troops', () => {
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        setPipe(state, size, 4, 4, N | E | S | W, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4;
        const eIdx = 4 * size + 5;
        const sIdx = 5 * size + 4;
        const wIdx = 4 * size + 3;
        expect(out.troopCounts[nIdx]).toBe(3);
        expect(out.troopCounts[eIdx]).toBe(3);
        expect(out.troopCounts[sIdx]).toBe(3);
        expect(out.troopCounts[wIdx]).toBe(3);
        expect(out.troopCounts[4 * size + 4]).toBe(18);
    });

    it('scarcity 2-pipe: source 5 troops, each pipe gets min(perPipe, available/remaining)', () => {
        // perPipe = 6. Source = 5, no reserves.
        //   Pipe 1 (N): available=5, remaining=2, base=min(6,floor(5/2))=2,
        //      flat→rate=2, send=2 → src=3
        //   Pipe 2 (E): available=3, remaining=1, base=min(6,floor(3/1))=3,
        //      flat→rate=3, send=3 → src=0
        // Total = 5. Source fully depleted.
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        setPipe(state, size, 4, 4, N | E, 5, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4;
        const eIdx = 4 * size + 5;
        expect(out.troopCounts[nIdx]).toBe(2);
        expect(out.troopCounts[eIdx]).toBe(3);
        expect(out.troopCounts[4 * size + 4]).toBe(0);
    });

    it('scarcity 4-pipe: source 10 troops, splits equally across 4 pipes', () => {
        // perPipe = 3. Source = 10, no reserves.
        //   Pipe 1 (N): available=10, remaining=4, base=min(3,floor(10/4))=2,
        //      flat→rate=2, send=2 → src=8
        //   Pipe 2 (E): available=8, remaining=3, base=min(3,floor(8/3))=2,
        //      flat→rate=2, send=2 → src=6
        //   Pipe 3 (S): available=6, remaining=2, base=min(3,floor(6/2))=3,
        //      flat→rate=3, send=3 → src=3
        //   Pipe 4 (W): available=3, remaining=1, base=min(3,floor(3/1))=3,
        //      flat→rate=3, send=3 → src=0
        // Total = 10. Source fully depleted.
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        setPipe(state, size, 4, 4, N | E | S | W, 10, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4;
        const eIdx = 4 * size + 5;
        const sIdx = 5 * size + 4;
        const wIdx = 4 * size + 3;
        expect(out.troopCounts[nIdx]).toBe(2);
        expect(out.troopCounts[eIdx]).toBe(2);
        expect(out.troopCounts[sIdx]).toBe(3);
        expect(out.troopCounts[wIdx]).toBe(3);
        expect(out.troopCounts[4 * size + 4]).toBe(0);
    });

    it('unequal elevation split: 2-pipe, one downhill Δ=−5, one flat', () => {
        // perPipe = 6. Source at elevation 10, N neighbor at 5 (delta=−5),
        // E neighbor at 10 (flat). Source = 30.
        //   Pipe 1 (N): base=6, rate=6+1×5=11, send=11 → src=19
        //   Pipe 2 (E): base=6, rate=6, send=6 → src=13
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => {
            const cx = i % size;
            const cy = Math.floor(i / size);
            // (4,4) = 10, (4,3) north = 5, (5,4) east = 10, rest = 0.
            let elev = 0;
            if (cx === 4 && cy === 4) elev = 10;
            else if (cx === 4 && cy === 3) elev = 5;
            else if (cx === 5 && cy === 4) elev = 10;
            return { x: cx, y: cy, elevation: elev, terrain: 'land' as const };
        });
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(size);
        setPipe(state, size, 4, 4, N | E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * size + 4; // (4,3) — downhill
        const eIdx = 4 * size + 5; // (5,4) — flat
        expect(out.troopCounts[nIdx]).toBe(11);
        expect(out.troopCounts[eIdx]).toBe(6);
        expect(out.troopCounts[4 * size + 4]).toBe(13);
    });
});

// ---------------------------------------------------------------------------
// Plateau flow
// ---------------------------------------------------------------------------

describe('resolveFlow — plateau flow', () => {
    it('chain of 4 cells: first cell sends flowRate troops until depleted', () => {
        // 4 cells in a line (E pipe from each to the next), all same
        // elevation. Seed first cell with 30 troops. Run 3 ticks via
        // resolveFlow and verify the plateau pattern: each tick the
        // head-of-chain sends 12 troops (or whatever remains) downstream.
        //
        // Within a single tick, cells are processed in row-major order.
        // A cell reads its source count from the original input state,
        // but destinations accumulate in newCounts. So a downstream cell
        // that receives troops in the same tick has those troops available
        // when it is processed.
        //
        // Tick 1: cell0=30→12=18, cell1=0+12=12
        // Tick 2: cell0=18→12=6,  cell1=12+12→12=12, cell2=0+12=12
        // Tick 3: cell0=6→6=0,    cell1=12+6→12=6,  cell2=12+12→12=12, cell3=0+12=12
        const size = 8;
        const board = buildSmallBoard(size, []);

        // Helper: set up 4 cells in a line with pipes.
        function makeLineState(): WorldState {
            const s = emptyState(size);
            // Cell (0,0) → (1,0) → (2,0) → (3,0)
            s.pipeMasks[0] = E; // (0,0) pipes east
            s.pipeMasks[1] = E; // (1,0) pipes east
            s.pipeMasks[2] = E; // (2,0) pipes east
            s.troopCounts[0] = 30; // seed head of chain
            s.troopOwners[0] = 1;
            return s;
        }

        // Tick 1: only cell 0 has troops → sends 12 east.
        let state = makeLineState();
        let out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[0]).toBe(18); // 30 − 12
        expect(out.troopCounts[1]).toBe(12); // received 12

        // Tick 2: cell 0 sends 12 (18→6); cell 1 receives 12 in newCounts
        // (now 24) and sends 12 east (24→12); cell 2 receives 12.
        const tick2Input: WorldState = {
            ...out,
            pipeMasks: state.pipeMasks,
        };
        out = resolveFlow(tick2Input, board, TEST_CONSTANTS);
        expect(out.troopCounts[0]).toBe(6); // 18 − 12
        expect(out.troopCounts[1]).toBe(12); // 12 received + 12 sent = net 12
        expect(out.troopCounts[2]).toBe(12); // received 12 from cell 1

        // Tick 3: cell 0 sends 6 (6→0); cell 1 receives 6 (12+6=18 in
        // newCounts) and sends 12 (18→6); cell 2 receives 12 (12+12=24 in
        // newCounts) and sends 12 (24→12); cell 3 receives 12.
        const tick3Input: WorldState = {
            ...out,
            pipeMasks: state.pipeMasks,
        };
        out = resolveFlow(tick3Input, board, TEST_CONSTANTS);
        expect(out.troopCounts[0]).toBe(0); // 6 − 6 (only 6 left)
        expect(out.troopCounts[1]).toBe(6); // 12 + 6 received − 12 sent
        expect(out.troopCounts[2]).toBe(12); // 12 + 12 received − 12 sent
        expect(out.troopCounts[3]).toBe(12); // received 12 from cell 2
    });
});

// ---------------------------------------------------------------------------
// Water-target rejection
// ---------------------------------------------------------------------------

describe('resolveFlow — water-target rejection', () => {
    it('flow into a water cell is a no-op (water impassable)', () => {
        // Hand-roll a board where destination is water.
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => ({
            x: i % size,
            y: Math.floor(i / size),
            elevation: 0,
            terrain: 'land' as const,
        }));
        const targetCell = cells[1];
        if (targetCell === undefined) {
            throw new Error('test setup: cells[1] missing');
        }
        cells[1] = { ...targetCell, terrain: 'water' };
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(size);
        setPipe(state, size, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
        expect(out.troopOwners[1]).toBe(0);
    });

    it('out-of-board destination is a no-op (bounds-checked at flow time)', () => {
        // Source at right edge piping east — destination would be off-board.
        const size = 8;
        const board = buildSmallBoard(size, []);
        const state = emptyState(size);
        const srcIdx = 0 * size + 7; // (7, 0)
        setPipe(state, size, 7, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        // No transfer to any cell (destination is off-board). Exclude the
        // source cell from the count (it had 30 to start).
        let nonZeroOffSource = 0;
        for (let i = 0; i < out.troopCounts.length; i++) {
            if (i === srcIdx) {
                continue;
            }
            if ((out.troopCounts[i] ?? 0) > 0) {
                nonZeroOffSource++;
            }
        }
        expect(nonZeroOffSource).toBe(0);
        // Source cell keeps its count: no transfer occurred (OOB
        // destination → no-op; Clarifications v1.6).
        expect(out.troopCounts[srcIdx]).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// Capacity clamp
// ---------------------------------------------------------------------------

describe('resolveFlow — capacity clamp', () => {
    it('destination never exceeds cellCapacity', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [0, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        // Pre-fill destination near cap; source has huge stack. Downhill
        // delta = −10 → rate 17 troops, clamped to the 1-troop headroom.
        state.troopCounts[1] = TEST_CONSTANTS.cellCapacity - 1;
        state.troopOwners[1] = 1;
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.cellCapacity);
    });

    it('capacity clamp truncates the addition, not the existing stack', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [0, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        // Destination exactly at cap.
        state.troopCounts[1] = TEST_CONSTANTS.cellCapacity;
        state.troopOwners[1] = 1;
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.cellCapacity);
    });
});

// ---------------------------------------------------------------------------
// Defensive branches
// ---------------------------------------------------------------------------

describe('resolveFlow — defensive branches', () => {
    it('skips cells where pipe mask is set but the cell has no troops', () => {
        // Pipe is set on an empty cell — nothing to flow.
        const board = buildSmallBoard(8, []);
        const state = emptyState(8);
        state.pipeMasks[1 * 8 + 1] = E;
        // No troops, no owner.
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1 * 8 + 2]).toBe(0); // east neighbor unaffected
    });

    it('skips cells where pipe mask is set but owner is 0 (no owner)', () => {
        const board = buildSmallBoard(8, []);
        const state = emptyState(8);
        state.pipeMasks[1 * 8 + 1] = E;
        state.troopCounts[1 * 8 + 1] = 30;
        state.troopOwners[1 * 8 + 1] = 0; // no owner despite troops
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1 * 8 + 2]).toBe(0);
    });

    it('flow honors flat slope (rate = perPipe)', () => {
        // Source and destination at same elevation → flat → perPipe = 12.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [5, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.flowRate);
    });
});

// ---------------------------------------------------------------------------
// Source depletion (Clarifications v1.6)
// ---------------------------------------------------------------------------

describe('resolveFlow — source depletion (Clarifications v1.6)', () => {
    it('source cell is decremented by the amount transferred', () => {
        // Downhill delta=−5 → rate 17 troops move; source 30 → 13.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(17); // destination gained 17
        expect(out.troopCounts[0]).toBe(13); // source lost 17
        expect(out.troopOwners[0]).toBe(1); // source still owned
    });

    it('source with fewer troops than the flow rate transfers only what it has', () => {
        // Source has 5 troops; the pipe rate is 17. Only 5 can move.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 5, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(5);
        expect(out.troopCounts[0]).toBe(0);
        expect(out.troopOwners[0]).toBe(1); // source emptied → owner preserved (v1.8)
    });

    it('source reaching 0 preserves its owner (Clarifications v1.8)', () => {
        // Source has exactly 17 troops; the pipe rate is 17. All move.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 17, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(17);
        expect(out.troopCounts[0]).toBe(0);
        expect(out.troopOwners[0]).toBe(1); // owner preserved even at 0 (v1.8)
    });

    it('reserves floor protects the source from depleting below the floor (FR-012)', () => {
        // Source has 30 troops with reserves = 8 (80%). Floor = ceil(30×8/10)
        // = 24, so only 30 − 24 = 6 can flow. The pipe rate is 17, but the
        // transfer is capped at 6 — the floor binds.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);
        state.reservesPct[0] = 8; // 80% reserved

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(6); // capped by the floor
        expect(out.troopCounts[0]).toBe(24); // floor preserved
        expect(out.troopOwners[0]).toBe(1);
    });

    it('reserves floor holds ALL troops when reserves exceed the stack', () => {
        // Source has 5 troops with reserves = 9 (90%). Floor = ceil(5×9/10)
        // = 5 → nothing can flow.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 5, 1);
        state.reservesPct[0] = 9;

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
        expect(out.troopCounts[0]).toBe(5);
        expect(out.troopOwners[0]).toBe(1);
    });

    it('multi-pipe source depletes across directions in N→E→S→W order', () => {
        // Source at (4,4) elevation 10, all neighbors elevation 5 (delta=−5).
        // perPipe = floor(12/4) = 3. rate = 3 + 1×5 = 8 per pipe.
        // Source has 30 troops with reserves = 1 (10%). The reserve floor
        // is recomputed per-transfer against the current count:
        //   N: srcCount=30, floor=ceil(30×1/10)=3, available=27,
        //      base=min(3,floor(27/4))=3, rate=8, send=8 → src=22
        //   E: srcCount=22, floor=ceil(22×1/10)=3, available=19,
        //      base=min(3,floor(19/3))=3, rate=8, send=8 → src=14
        //   S: srcCount=14, floor=ceil(14×1/10)=2, available=12,
        //      base=min(3,floor(12/2))=3, rate=8, send=8 → src=6
        //   W: srcCount=6, floor=ceil(6×1/10)=1, available=5,
        //      base=min(3,floor(5/1))=3, rate=8, send=5 → src=1
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => {
            const cx = i % size;
            const cy = Math.floor(i / size);
            const elev = cx === 4 && cy === 4 ? 10 : 5;
            return { x: cx, y: cy, elevation: elev, terrain: 'land' as const };
        });
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(8);
        setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);
        state.reservesPct[4 * 8 + 4] = 1; // 10% reserved

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * 8 + 4;
        const eIdx = 4 * 8 + 5;
        const sIdx = 5 * 8 + 4;
        const wIdx = 4 * 8 + 3;
        expect(out.troopCounts[nIdx]).toBe(8);
        expect(out.troopCounts[eIdx]).toBe(8);
        expect(out.troopCounts[sIdx]).toBe(8);
        expect(out.troopCounts[wIdx]).toBe(5); // only 5 left above floor
        expect(out.troopCounts[4 * 8 + 4]).toBe(1); // floor preserved
        expect(out.troopOwners[4 * 8 + 4]).toBe(1);
    });

    it('destination at capacity: source is NOT depleted (no transfer occurred)', () => {
        // Destination already at cap → headroom 0 → no transfer → source
        // keeps its count (Clarifications v1.6: only actual transfers
        // deduct from the source).
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        state.troopCounts[1] = TEST_CONSTANTS.cellCapacity; // dest full
        state.troopOwners[1] = 1;
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.cellCapacity);
        expect(out.troopCounts[0]).toBe(30); // source untouched
        expect(out.troopOwners[0]).toBe(1);
    });

    it('troop conservation: total board count is unchanged by flow', () => {
        // Two sources piping into two destinations; verify the total
        // troop count on the board is identical before and after flow.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        // Source A at (0,0) pipes E; source B at (1,1) pipes S.
        setPipe(state, 8, 0, 0, E, 20, 1);
        setPipe(state, 8, 1, 1, S, 15, 2);

        const before = Array.from(state.troopCounts).reduce((a, b) => a + b, 0);
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const after = Array.from(out.troopCounts).reduce((a, b) => a + b, 0);
        expect(after).toBe(before);
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('resolveFlow — determinism', () => {
    it('same input × 1000 calls → byte-identical output', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);

        const reference = resolveFlow(state, board, TEST_CONSTANTS);
        for (let i = 0; i < 1000; i++) {
            const next = resolveFlow(state, board, TEST_CONSTANTS);
            expect(Array.from(next.troopCounts)).toEqual(Array.from(reference.troopCounts));
            expect(Array.from(next.troopOwners)).toEqual(Array.from(reference.troopOwners));
        }
    });

    it('does not mutate input state arrays', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [5, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);
        const countsBefore = Array.from(state.troopCounts);
        const ownersBefore = Array.from(state.troopOwners);

        resolveFlow(state, board, TEST_CONSTANTS);

        expect(Array.from(state.troopCounts)).toEqual(countsBefore);
        expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
    });
});
