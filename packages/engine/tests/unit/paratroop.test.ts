/**
 * Paratroop resolution unit tests — Feature 001, T041
 *
 * Covers FR-013:
 *   - Cost is 2:1 (paratrooper drops N troops at cost 2N from source).
 *   - Range ≤ 2 Chebyshev.
 *   - Clears destination pipes on landing.
 *   - Enemy-held targets resolve as an attack: 1:1 attrition, owner
 *     written only when the garrison is eliminated, a CombatEvent per
 *     landing.
 *
 * Covers edge cases:
 *   - "paratroop into water fails validation" — rejected by validateCommand.
 *   - "reserves > count holds all" — paratroop respects reserves invariant
 *     (source must have ≥ 2 × N troops net of reserves floor; landing
 *     target inherits the troop count without affecting reserves).
 *   - Source insufficient: error, no state change.
 *   - Range too far: error.
 *
 * Also covers determinism: same input → byte-identical output across 100 calls.
 *
 * The `paratroopCost` constant (ENGINE_CONSTANTS.paratroopCost = 10) is
 * interpreted as N — the number of paratroopers dropped per order.
 * Source loses 2 × N (= 20), target gains N (= 10). This matches the
 * FR-013 "2:1 cost ratio" rule exactly.
 *
 * resolveParatroop is called directly with a hand-built WorldState
 * and the paratroop orders to apply. This isolates the rule from the
 * rest of the tick pipeline; the integration is covered by the
 * quickstart test.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import { createPlayerRegistry } from '../../src/playerRegistry';
import { resolveParatroop } from '../../src/resolution/paratroop';
import { tick } from '../../src/tick';
import type { Board, MatchConfig, Order, World, WorldState } from '../../src/types';
import { validateCommand } from '../../src/validate';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, PLAYER_2, playerIds, TEST_REGISTRY as REGISTRY } from '../fixtures/ids';

const CONSTANTS = ENGINE_CONSTANTS;
// N (paratroopers dropped per order) = ENGINE_CONSTANTS.paratroopCost.
const N = CONSTANTS.paratroopCost;
const TWO_N = N * 2;

/** Row-major cell index (matches placeStack helper convention). */
function idx(size: number, x: number, y: number): number {
    return y * size + x;
}

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

function placeStack(
    state: WorldState,
    size: number,
    x: number,
    y: number,
    owner: number,
    count: number,
    pipes = 0,
): void {
    const i = idx(size, x, y);
    state.troopCounts[i] = count;
    state.troopOwners[i] = owner;
    state.pipeMasks[i] = pipes;
}

function buildWorld(size: number, board: Board, state: WorldState): World {
    return {
        config: {
            boardSize: size,
            playerIds: playerIds(2),
            tickIntervalMs: 250,
            seed: 1,
            visibilityRadius: CONSTANTS.visibilityRadiusDefault,
        },
        tick: 0,
        board,
        players: [
            { id: PLAYER_1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
            { id: PLAYER_2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 0 },
        ],
        state,
        rngSeed: 1,
        rngState: new Uint32Array([1, 2, 3, 4]),
        playerRegistry: createPlayerRegistry(playerIds(2)),
    };
}

describe('resolveParatroop — FR-013 2:1 cost + landing + range', () => {
    it('drops N paratroopers at cost 2N from source (2:1 ratio)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
        expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(N);
        expect(result.state.troopOwners[idx(size, 3, 4)]).toBe(1);
    });

    it('range Chebyshev distance 2 (3,3)→(5,3): allowed', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 5, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
        expect(result.state.troopCounts[idx(size, 5, 3)]).toBe(N);
    });

    it('range Chebyshev distance 0 (source == target): net effect -N, capped at cellCapacity', () => {
        // Use 30 troops (cellCapacity) so the cap doesn't truncate the result.
        // Net: 30 - 2N + N = 30 - N = 20.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 30);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(30 - TWO_N + N);
    });

    it('clears destination pipeMasks (FR-013)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 0, 0, 0x0f);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.pipeMasks[idx(size, 4, 3)]).toBe(0);
    });

    it('does not clear source pipeMasks', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100, 0x02);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.state.pipeMasks[idx(size, 3, 3)]).toBe(0x02);
    });
});

describe('resolveParatroop — validation: paratroop into water fails validation', () => {
    it('target is water: paratroop is rejected and produces no state change', () => {
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => ({
            x: i % size,
            y: Math.floor(i / size),
            elevation: 0,
            terrain: 'land' as const,
        }));
        cells[idx(size, 3, 4)] = {
            ...(cells[idx(size, 3, 4)] ?? { x: 0, y: 0, elevation: 0, terrain: 'land' as const }),
            terrain: 'water',
        };
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('water_target');
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
        expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(0);
    });
});

describe('resolveParatroop — validation: source insufficient', () => {
    it('source has fewer than 2N troops: error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, TWO_N - 1);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(TWO_N - 1);
        expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(0);
    });

    it('source has zero troops: error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 0);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('no_source_troops');
    });
});

describe('resolveParatroop — validation: range too far', () => {
    it('Chebyshev distance 3 (3,3)→(6,3): error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 6, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('paratroop_range');
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
    });

    it('diagonal Chebyshev distance 3 (3,3)→(6,6): error', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 6, y: 6 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('paratroop_range');
    });
});

describe('resolveParatroop — validation: not-owner', () => {
    it('source not owned by player: error, no state change', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 2, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.reason.kind).toBe('not_owner');
    });
});

describe('resolveParatroop — Edge Case: reserves > count holds all', () => {
    it('paratroop respects reserves invariant: source stays above reserves floor', () => {
        // Source has 100 troops, reserves=9 (90%) → floor ≈ 90.
        // Spending 2N = 20 would bring count to 80, below the floor of 90.
        // Implementation rejects as insufficient.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        state.reservesPct[idx(size, 3, 3)] = 9;
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100);
    });

    it('paratroop allowed when source has plenty above reserves floor', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 200);
        state.reservesPct[idx(size, 3, 3)] = 9;
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(200 - TWO_N);
    });
});

describe('resolveParatroop — branch coverage: edge cases', () => {
    it('source exactly at 2N troops: source becomes 0, owner becomes 0', () => {
        // Source has EXACTLY 2N troops → after spending, source = 0 and
        // owner becomes 0 (covered branch on line 127 of paratroop.ts).
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, TWO_N);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(0);
        expect(result.state.troopOwners[idx(size, 3, 3)]).toBe(0);
        expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(N);
    });

    it('no input orders: state reference preserved (no-op branch)', () => {
        // No paratroop orders → stateChanged === false → input returned by reference.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state).toBe(state);
    });

    it('all input orders rejected: state reference preserved', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 99, y: 99 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors.length).toBe(1);
        expect(result.state).toBe(state);
    });

    it('non-paratroop orders are silently filtered (no state change)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const orders: Order[] = [{ kind: 'setPipe', player: PLAYER_1, cell: { x: 3, y: 3 }, direction: 'E' }];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state).toBe(state);
    });

    it('target at cellCapacity: paratroop clamped (caps to cellCapacity)', () => {
        // Target already at cellCapacity (30) → adding N would exceed → clamp.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 3, 4, 0, CONSTANTS.cellCapacity);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 3, y: 4 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        // Target clamped at cellCapacity.
        expect(result.state.troopCounts[idx(size, 3, 4)]).toBe(CONSTANTS.cellCapacity);
    });
});

describe('resolveParatroop — determinism', () => {
    it('same input × 100 calls → byte-identical output', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 0, 0, 0x0f);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const reference = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        for (let i = 0; i < 100; i++) {
            const next = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
            expect(Array.from(next.state.troopCounts)).toEqual(Array.from(reference.state.troopCounts));
            expect(Array.from(next.state.troopOwners)).toEqual(Array.from(reference.state.troopOwners));
            expect(Array.from(next.state.pipeMasks)).toEqual(Array.from(reference.state.pipeMasks));
        }
    });

    it('does not mutate input state', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 0, 0, 0x0f);
        const countsBefore = Array.from(state.troopCounts);
        const ownersBefore = Array.from(state.troopOwners);
        const pipesBefore = Array.from(state.pipeMasks);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(Array.from(state.troopCounts)).toEqual(countsBefore);
        expect(Array.from(state.troopOwners)).toEqual(ownersBefore);
        expect(Array.from(state.pipeMasks)).toEqual(pipesBefore);
    });
});

describe('validateCommand — OrderParatroop validation', () => {
    it('out-of-bounds target → out_of_bounds error', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 99, y: 99 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('out_of_bounds');
        }
    });

    it('water target → water_target error', () => {
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => ({
            x: i % size,
            y: Math.floor(i / size),
            elevation: 0,
            terrain: 'land' as const,
        }));
        cells[idx(size, 3, 4)] = {
            ...(cells[idx(size, 3, 4)] ?? { x: 0, y: 0, elevation: 0, terrain: 'land' as const }),
            terrain: 'water',
        };
        const board: Board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([]),
        });
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 3, y: 4 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('water_target');
        }
    });

    it('source not owned → not_owner error', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 2, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 3, y: 4 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('not_owner');
        }
    });

    it('source insufficient troops → no_source_troops error', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, TWO_N - 1);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 3, y: 4 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('no_source_troops');
        }
    });

    it('Chebyshev distance > 2 → paratroop_range error', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 6, y: 6 },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason.kind).toBe('paratroop_range');
        }
    });

    it('valid range + owned + has troops → ok', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const world = buildWorld(size, board, state);
        const r = validateCommand(world, {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 3, y: 3 },
            target: { x: 5, y: 3 },
        });
        expect(r.ok).toBe(true);
    });
});

describe('resolveParatroop — enemy-landing attack (AC-19, data-model §11)', () => {
    it('win (N > G): attacker occupies with min(N - G, cellCapacity), pipes cleared', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, 5, 0x0f);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(N - 5);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(1);
        expect(result.state.pipeMasks[idx(size, 4, 3)]).toBe(0);
        expect(result.events.combat).toHaveLength(1);
    });

    it('win clamps the surviving force to cellCapacity (FR-011 / v1.5)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, 2);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const tight: typeof CONSTANTS = { ...CONSTANTS, cellCapacity: 4 };
        const result = resolveParatroop(state, board, tight, orders, REGISTRY, 0);
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(4);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(1);
    });

    it('loss (G > N): owner is NOT written, garrison keeps G - N, pipes still cleared', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, 15, 0x0f);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 7);
        expect(result.errors).toEqual([]);
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(15 - N);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(2);
        expect(result.state.pipeMasks[idx(size, 4, 3)]).toBe(0);
        expect(result.events.combat).toHaveLength(1);
        expect(result.events.combat[0]).toMatchObject({
            tick: 7,
            attacker: PLAYER_1,
            defender: PLAYER_2,
            attackerTotal: N,
            defenderTotal: 15,
            attackerLoss: N,
            defenderLoss: N,
            winner: PLAYER_2,
        });
    });

    it('tie (N = G): mutual annihilation → count 0, owner 0, winner "tie"', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, N);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(0);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(0);
        expect(result.state.pipeMasks[idx(size, 4, 3)]).toBe(0);
        expect(result.events.combat[0]).toMatchObject({
            attackerTotal: N,
            defenderTotal: N,
            attackerLoss: N,
            defenderLoss: N,
            winner: 'tie',
        });
    });

    it('enemy-owned but empty target (v1.8 owner preservation): occupied without a fight', () => {
        // Flow depletion leaves the owner byte intact at count 0, so a
        // cell can be enemy-owned yet empty.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, 0);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(N);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(1);
        expect(result.events.combat[0]).toMatchObject({
            defenderTotal: 0,
            attackerLoss: 0,
            defenderLoss: 0,
            winner: PLAYER_1,
        });
    });

    it('sequential landings resolve against what the previous landing left (FR-017)', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        placeStack(state, size, 5, 3, 1, 100);
        placeStack(state, size, 4, 3, 2, 15);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_1, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
            { kind: 'paratroop', player: PLAYER_1, source: { x: 5, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.errors).toEqual([]);
        // Landing 1 leaves the garrison at 5; landing 2 (10 vs 5) wins with 5.
        expect(result.state.troopCounts[idx(size, 4, 3)]).toBe(N - 5);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(1);
        expect(result.state.troopCounts[idx(size, 3, 3)]).toBe(100 - TWO_N);
        expect(result.state.troopCounts[idx(size, 5, 3)]).toBe(100 - TWO_N);
        expect(result.events.combat).toHaveLength(2);
        expect(result.events.combat[0]).toMatchObject({ attackerTotal: N, defenderTotal: 15, winner: PLAYER_2 });
        expect(result.events.combat[1]).toMatchObject({ attackerTotal: N, defenderTotal: 5, winner: PLAYER_1 });
    });

    it('landing player is always the event attacker, even with the higher owner byte (plan §2 decision 4)', () => {
        // Flow combat labels events by lower owner byte; a landing keeps
        // the initiating force as attacker.
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 2, 100);
        placeStack(state, size, 4, 3, 1, 15);
        const orders: Order[] = [
            { kind: 'paratroop', player: PLAYER_2, source: { x: 3, y: 3 }, target: { x: 4, y: 3 } },
        ];
        const result = resolveParatroop(state, board, CONSTANTS, orders, REGISTRY, 0);
        expect(result.state.troopOwners[idx(size, 4, 3)]).toBe(1);
        expect(result.events.combat[0]).toMatchObject({
            attacker: PLAYER_2,
            defender: PLAYER_1,
            winner: PLAYER_1,
        });
    });
});

describe('tick pipeline — paratroop landing on an enemy city (AC-19, AC-20, FR-023)', () => {
    const TICK_CFG: MatchConfig = {
        boardSize: 8,
        playerIds: playerIds(2),
        tickIntervalMs: 250,
        seed: 1,
        visibilityRadius: CONSTANTS.visibilityRadiusDefault,
    };

    function enemyCityWorld(garrison: number): World {
        const world = createWorld(
            TICK_CFG,
            buildSmallBoard(8, [
                [1, 1, 1],
                [3, 3, 2],
            ]),
        );
        world.state.troopCounts[idx(8, 1, 1)] = 100;
        world.state.troopOwners[idx(8, 1, 1)] = 1;
        world.state.troopCounts[idx(8, 3, 3)] = garrison;
        world.state.troopOwners[idx(8, 3, 3)] = 2;
        return world;
    }

    function landOnEnemyCity(garrison: number) {
        const staged = applyCommand(enemyCityWorld(garrison), {
            kind: 'paratroop',
            player: PLAYER_1,
            source: { x: 1, y: 1 },
            target: { x: 3, y: 3 },
        });
        expect(staged.result.ok).toBe(true);
        return tick(staged.world);
    }

    it('win: garrison eliminated, attacker occupies, city transfers in the same tick (AC-20)', () => {
        const result = landOnEnemyCity(5);
        const target = idx(8, 3, 3);
        // Phase 1 production grows the sub-cap garrison by productionRate
        // before the landing resolves.
        const garrisonAtLanding = 5 + CONSTANTS.productionRate;
        expect(result.world.state.troopCounts[target]).toBe(N - garrisonAtLanding);
        expect(result.world.state.troopOwners[target]).toBe(1);
        expect(result.world.state.cityOwners[target]).toBe(1);
        expect(result.events.captures).toHaveLength(1);
        expect(result.events.captures[0]).toMatchObject({
            fromOwner: PLAYER_2,
            toOwner: PLAYER_1,
            isCity: true,
        });
        expect(result.events.combat).toHaveLength(1);
        expect(result.events.combat[0]).toMatchObject({
            attacker: PLAYER_1,
            defender: PLAYER_2,
            attackerTotal: N,
            defenderTotal: garrisonAtLanding,
            attackerLoss: garrisonAtLanding,
            defenderLoss: garrisonAtLanding,
            winner: PLAYER_1,
        });
    });

    it('loss: garrison keeps cell and city; the order lands in appliedOrders, not errors (AC-19, AC-20, FR-023)', () => {
        // A saturated city (at cityCapacity) gains no production, so the
        // garrison at landing time is exactly what we inject.
        const garrison = CONSTANTS.cityCapacity;
        const result = landOnEnemyCity(garrison);
        const target = idx(8, 3, 3);
        expect(result.world.state.troopCounts[target]).toBe(garrison - N);
        expect(result.world.state.troopOwners[target]).toBe(2);
        expect(result.world.state.cityOwners[target]).toBe(2);
        expect(result.events.captures).toEqual([]);
        expect(result.events.combat).toHaveLength(1);
        expect(result.events.combat[0]).toMatchObject({
            tick: 0,
            attackerTotal: N,
            defenderTotal: garrison,
            attackerLoss: N,
            defenderLoss: N,
            winner: PLAYER_2,
        });
        expect(result.world.state.troopCounts[idx(8, 1, 1)]).toBe(100 - TWO_N);
        expect(result.events.errors).toEqual([]);
        expect(result.events.appliedOrders).toHaveLength(1);
        expect(result.events.appliedOrders[0]?.order.kind).toBe('paratroop');
        expect(result.events.appliedOrders[0]?.result.ok).toBe(true);
    });
});
