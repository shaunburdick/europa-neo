/**
 * Flow resolution unit tests — Feature 001, T020 (rewritten for issue #30)
 *
 * Covers:
 *   - FR-007: elevation-gradient flow — exact per-tick rates for
 *     downhill (capped bonus), flat, and uphill (uncapped handicap,
 *     stall at Δ ≥ flowBase / flowSlopeStep)
 *   - US1 AC-5: a stalled uphill pipe remains laid and legal
 *   - FR-006: 4-way pipe support, exclusive mode
 *   - Water-target rejection (flow into water is a no-op)
 *   - Capacity clamp: destination never exceeds cellCapacity
 *   - Determinism: same input → same output
 *
 * resolveFlow is called directly with hand-built WorldState so the
 * tests exercise the pure resolution function in isolation.
 *
 * TEST_CONSTANTS uses the shipped gradient shape (flowBase=7,
 * flowSlopeStep=1, flowSlopeDeltaCap=5) so the exact-rate assertions
 * pin the PM-confirmed formula (R-1 asymmetric cap): downhill
 * `base + step × min(|Δ|, cap)`, flat `base`, uphill
 * `max(0, base − step × |Δ|)`.
 */

import { describe, expect, it } from 'vitest';
import type { EngineConstants } from '../../src/contracts/engine-api';
import { resolveFlow } from '../../src/resolution/flow';
import type { Board, WorldState } from '../../src/types';
import { buildBoardWithElevation, buildSmallBoard } from '../fixtures/board';

// Synthetic constants matching the shipped gradient shape so exact
// per-tick rates are observable and pinned to the R-1 formula.
const TEST_CONSTANTS: EngineConstants = {
    productionRate: 1,
    cityCapacity: 30,
    cellCapacity: 30,
    decayPerTick: 1,
    flowBase: 7,
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

describe('resolveFlow — FR-007 gradient slope rates', () => {
    it('downhill Δ=1 moves flowBase + step×1 = 8 troops', () => {
        // Source at elevation 5, destination east at elevation 4 (Δ = −1).
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [4, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1); // source full, pipes east

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(8);
        expect(out.troopOwners[1]).toBe(1);
    });

    it('downhill Δ=5 moves flowBase + step×5 = 12 troops', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [0, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(12);
    });

    it('downhill Δ=10 is capped at flowBase + step×cap = 12 troops', () => {
        // Δ = −10 exceeds flowSlopeDeltaCap = 5; the bonus is capped.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [0, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(12);
    });

    it('flat pipe moves flowBase = 7 troops', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(7);
    });

    it('uphill Δ=1 moves flowBase − step×1 = 6 troops', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [4, 0],
            [5, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(6);
    });

    it('uphill Δ=6 moves flowBase − step×6 = 1 troop', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [6, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(1);
    });

    it('uphill Δ=7 stalls (0 troops) and the pipe remains laid and legal (US1 AC-5)', () => {
        // Δ = +7 reaches the stall threshold flowBase / flowSlopeStep = 7.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [0, 0],
            [7, 0],
        ];
        const board: Board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(0);
        expect(out.troopOwners[1]).toBe(0);
        // Stall is a legal, persistent state: the pipe stays laid...
        expect(out.pipeMasks[0] & E).toBe(E);
        // ...and the source stack is untouched (US1: no source depletion
        // in the flow phase).
        expect(out.troopCounts[0]).toBe(30);
    });

    it('downhill > flat > uphill ordering holds for identical source stacks', () => {
        // Three boards; same pipe order (E); same source count. With the
        // gradient constants the ordering is strict: 12 > 7 > 0.
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
                [10, 0],
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

        expect(downDest).toBe(12);
        expect(flatDest).toBe(7);
        expect(upDest).toBe(0);
        expect(downDest).toBeGreaterThan(flatDest);
        expect(flatDest).toBeGreaterThan(upDest);
    });
});

describe('resolveFlow — FR-006 pipe support', () => {
    it('4-way pipe support: each direction moves independently', () => {
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
        // → Δ = −5 → 12 troops per direction.
        setPipe(state, 8, 4, 4, N | E | S | W, 30, 1);

        const out = resolveFlow(state, board, TEST_CONSTANTS);
        const nIdx = 3 * 8 + 4; // (4,3)
        const eIdx = 4 * 8 + 5; // (5,4)
        const sIdx = 5 * 8 + 4; // (4,5)
        const wIdx = 4 * 8 + 3; // (3,4)
        expect(out.troopCounts[nIdx]).toBe(12);
        expect(out.troopCounts[eIdx]).toBe(12);
        expect(out.troopCounts[sIdx]).toBe(12);
        expect(out.troopCounts[wIdx]).toBe(12);
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
        // Source cell itself still has its original count (no decrement).
        expect(out.troopCounts[srcIdx]).toBe(30);
    });
});

describe('resolveFlow — capacity clamp', () => {
    it('destination never exceeds cellCapacity', () => {
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [10, 0],
            [0, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        // Pre-fill destination near cap; source has huge stack. Downhill
        // Δ = −10 → 12 troops, clamped to the 1-troop headroom.
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

    it('flow honors flat slope (rate = flowBase)', () => {
        // Source and destination at same elevation → flat → flowBase = 7.
        const elevMap: ReadonlyArray<readonly [number, number]> = [
            [5, 0],
            [5, 0],
        ];
        const board = buildBoardWithElevation(8, elevMap, []);
        const state = emptyState(8);
        setPipe(state, 8, 0, 0, E, 30, 1);
        const out = resolveFlow(state, board, TEST_CONSTANTS);
        expect(out.troopCounts[1]).toBe(TEST_CONSTANTS.flowBase);
    });
});

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
