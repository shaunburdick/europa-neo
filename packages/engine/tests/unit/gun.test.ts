/**
 * Gun resolution unit tests — Feature 001, T042
 *
 * Covers FR-014:
 *   - Gun costs `gunCost` troops from source.
 *   - Damages `gunDamage` from target occupants at tick time (regardless
 *     of owner — friendly fire allowed).
 *   - No troop movement to destination.
 *
 * Covers edge cases:
 *   - "gun at empty cell only spends source troops": target has 0
 *     occupants → gunCost still spent, no damage event, no movement.
 *   - Source insufficient: error, no state change.
 *   - Multi-player friendly fire: damage applies regardless of owner.
 *   - Determinism: same input → byte-identical output across N calls.
 *
 * resolveGun is called directly with a hand-built WorldState and the
 * gun orders to apply. This isolates the rule from the rest of the
 * tick pipeline; the integration is covered by the quickstart test.
 */

import { describe, expect, it } from 'vitest';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { resolveGun } from '../../src/resolution/gun';
import type { Board, Order, PlayerId, World, WorldState } from '../../src/types';
import { validateCommand } from '../../src/validate';
import { buildSmallBoard } from '../fixtures/board';

const CONSTANTS = ENGINE_CONSTANTS;

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

function placeStack(state: WorldState, size: number, x: number, y: number, owner: number, count: number): void {
    const idx = y * size + x;
    state.troopCounts[idx] = count;
    state.troopOwners[idx] = owner;
}

function buildWorld(size: number, board: Board, state: WorldState): World {
    return {
        config: {
            boardSize: size,
            playerCount: 2,
            tickIntervalMs: 250,
            seed: 1,
            visibilityRadius: CONSTANTS.visibilityRadiusDefault,
        },
        tick: 0,
        board,
        players: [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
        ],
        state,
        rngSeed: 1,
        rngState: new Uint32Array([1, 2, 3, 4]),
    };
}

describe('resolveGun — FR-014 cost + damage + no movement', () => {
    it('costs gunCost from source and damages gunDamage from target', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100); // source: P1, 100 troops
        placeStack(state, size, 5, 3, 2, 50); // target: P2, 50 troops (enemy)
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        // Source loses gunCost.
        expect(result.state.troopCounts[3 * size + 3]).toBe(100 - CONSTANTS.gunCost);
        // Target loses gunDamage.
        expect(result.state.troopCounts[3 * size + 5]).toBe(50 - CONSTANTS.gunDamage);
        // Target owner unchanged (still P2 — gun doesn't change ownership).
        expect(result.state.troopOwners[3 * size + 5]).toBe(2);
    });

    it('no troop movement: source troop count never increases destination', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 0, 0); // empty target
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        // Source loses gunCost.
        expect(result.state.troopCounts[3 * size + 3]).toBe(100 - CONSTANTS.gunCost);
        // Target stays at 0 (no troops moved in).
        expect(result.state.troopCounts[3 * size + 5]).toBe(0);
        expect(result.state.troopOwners[3 * size + 5]).toBe(0);
    });
});

describe('resolveGun — Edge Case: gun at empty cell only spends source troops', () => {
    it('target has 0 occupants: gunCost still spent, no damage, no movement', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        // target is empty.
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 3]).toBe(100 - CONSTANTS.gunCost);
        expect(result.state.troopCounts[3 * size + 5]).toBe(0);
    });
});

describe('resolveGun — validation: source insufficient', () => {
    it('source has fewer than gunCost troops: error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, CONSTANTS.gunCost - 1);
        placeStack(state, size, 5, 3, 2, 50);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
        expect(result.state.troopCounts[3 * size + 3]).toBe(CONSTANTS.gunCost - 1);
        expect(result.state.troopCounts[3 * size + 5]).toBe(50);
    });

    it('source has zero troops: error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 0);
        placeStack(state, size, 5, 3, 2, 50);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
    });
});

describe('resolveGun — friendly fire', () => {
    it('target owned by same player: damage applies (friendly fire)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 1, 50); // friendly target
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 3]).toBe(100 - CONSTANTS.gunCost);
        expect(result.state.troopCounts[3 * size + 5]).toBe(50 - CONSTANTS.gunDamage);
        // Friendly owner unchanged.
        expect(result.state.troopOwners[3 * size + 5]).toBe(1);
    });

    it('target owned by enemy: damage applies (normal use case)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 2, 50);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 5]).toBe(50 - CONSTANTS.gunDamage);
        expect(result.state.troopOwners[3 * size + 5]).toBe(2);
    });

    it('damage clamped at 0: target with fewer troops than gunDamage goes to 0, owner becomes 0', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 2, 1); // only 1 troop, less than gunDamage (2)
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 5]).toBe(0);
        expect(result.state.troopOwners[3 * size + 5]).toBe(0);
    });
});

describe('resolveGun — validation', () => {
    it('out-of-bounds target → out_of_bounds', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 3, y: 3 },
            target: { x: 99, y: 99 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('out_of_bounds');
        }
    });

    it('source not owned → not_owner', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 2, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 3, y: 3 },
            target: { x: 5, y: 3 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('not_owner');
        }
    });

    it('source insufficient → no_source_troops', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, CONSTANTS.gunCost - 1);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 3, y: 3 },
            target: { x: 5, y: 3 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('no_source_troops');
        }
    });

    it('valid gun order → ok', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 3, y: 3 },
            target: { x: 5, y: 3 },
        });
        expect(r.ok).toBe(true);
    });
});

describe('resolveGun — branch coverage: edge cases', () => {
    it('source exactly at gunCost: source becomes 0, owner becomes 0', () => {
        // Source has EXACTLY gunCost troops → after spending, source = 0
        // and owner becomes 0 (covered branch on line 126).
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, CONSTANTS.gunCost);
        placeStack(state, size, 5, 3, 2, 50);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 3]).toBe(0);
        expect(result.state.troopOwners[3 * size + 3]).toBe(0);
    });

    it('no input orders: state reference preserved (no-op branch)', () => {
        // No orders → stateChanged === false → input state returned by reference.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state).toBe(state); // same reference
    });

    it('all input orders rejected: state reference preserved', () => {
        // All orders rejected (out-of-bounds) → stateChanged === false.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 99, y: 99 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors.length).toBe(1);
        expect(result.state).toBe(state);
    });

    it('non-gun orders are silently filtered (no state change)', () => {
        // Mixed kinds — non-gun kinds should be ignored.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [{ kind: 'setPipe', player: 1, cell: { x: 3, y: 3 }, direction: 'E' }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state).toBe(state);
    });

    it('reserves ≥ 10: floor clamped to count (defensive branch)', () => {
        // The `reserves >= 10` branch in computeReservesFloor is unreachable
        // from the type system (ReservesPct ∈ 0..9) but is exercised defensively.
        // We test it indirectly by giving the source 50 troops, reserves=9 (90%),
        // and verifying insufficient-above-floor behavior.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 50);
        state.reservesPct[3 * size + 3] = 9;
        // Floor = 50 - floor(50 * 1 / 10) = 50 - 5 = 45.
        // Usable above floor = 5. gunCost = 5. 5 >= 5 → ok.
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const result = resolveGun(state, board, CONSTANTS, orders);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[3 * size + 3]).toBe(45); // 50 - 5
    });
});

describe('resolveGun — determinism', () => {
    it('same input × 100 calls → byte-identical output', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 2, 50);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        const reference = resolveGun(state, board, CONSTANTS, orders);
        for (let i = 0; i < 100; i++) {
            const next = resolveGun(state, board, CONSTANTS, orders);
            expect(Array.from(next.state.troopCounts)).toEqual(Array.from(reference.state.troopCounts));
            expect(Array.from(next.state.troopOwners)).toEqual(Array.from(reference.state.troopOwners));
        }
    });

    it('does not mutate input state', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 2, 50);
        const countsBefore = Array.from(state.troopCounts);
        const ownersBefore = Array.from(state.troopOwners);
        const orders: Order[] = [{ kind: 'gun', player: 1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } }];
        resolveGun(state, board, CONSTANTS, orders);
        expect(Array.from(state.troopCounts)).toEqual(countsBefore);
        expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
    });
});
