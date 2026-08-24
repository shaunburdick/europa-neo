/**
 * Terminal resolution unit tests — Feature 001, T047
 *
 * Covers FR-015 (elimination when troopsHeld === 0 && citiesOwned === 0),
 * FR-016 (surrender sets status immediately, forces inert thereafter),
 * `isTerminal` returns `undefined` for non-terminal states, returns
 * `MatchResult` once applicable, and terminal-once-frozen (further
 * `tick()` is a no-op returning same `MatchResult`).
 *
 * resolveTerminal is called directly with a hand-built Player array +
 * WorldState. The integration (surrender via applyCommand + tick
 * pipeline) is covered by the quickstart test.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { resolveTerminal } from '../../src/resolution/terminal';
import { isTerminal, tick } from '../../src/tick';
import type { Board, MatchConfig, Player, World, WorldState } from '../../src/types';
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

function buildWorld(size: number, board: Board, state: WorldState, players: readonly Player[]): World {
    return {
        config: {
            boardSize: size,
            playerCount: players.length as 2 | 3 | 4,
            tickIntervalMs: 250,
            seed: 1,
            visibilityRadius: CONSTANTS.visibilityRadiusDefault,
        } as MatchConfig,
        tick: 0,
        board,
        players,
        state,
        rngSeed: 1,
        rngState: new Uint32Array([1, 2, 3, 4]),
    };
}

describe('resolveTerminal — FR-015 elimination when zero troops AND zero cities', () => {
    it('emits EliminationEvent with reason no_troops_no_cities when player has no troops and no cities', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        // P1 has 100 troops → not eliminated.
        // P2 had 50 troops (per prevPlayers) but now has 0 → eliminated.
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 50 },
        ];
        const result = resolveTerminal(state, players, CONSTANTS, 0);
        expect(result.events.eliminations).toHaveLength(1);
        expect(result.events.eliminations[0]?.reason).toBe('no_troops_no_cities');
        expect(result.events.eliminations[0]?.player).toBe(2);
    });

    it('does NOT eliminate when player has troops', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 50);
        placeStack(state, size, 5, 3, 2, 30);
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 50 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 30 },
        ];
        const result = resolveTerminal(state, players, CONSTANTS, 0);
        expect(result.events.eliminations).toHaveLength(0);
        expect(result.terminal).toBeUndefined();
    });

    it('does NOT eliminate when player has cities (even with zero troops)', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100); // P1 has 100 troops
        state.cityOwners[3 * size + 3] = 2; // P2 owns a city at (3,3)
        // P2 had a city previously (citiesOwned=1) and now still has it.
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 50 },
        ];
        const result = resolveTerminal(state, players, CONSTANTS, 0);
        expect(result.events.eliminations).toHaveLength(0);
        expect(result.terminal).toBeUndefined();
    });

    it('marks player as eliminated in returned players', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 50 },
        ];
        // After tick: P2 lost its city and troops (e.g. via capture + combat).
        const state2 = emptyState(size);
        placeStack(state2, size, 3, 3, 1, 100);
        const result = resolveTerminal(state2, players, CONSTANTS, 1);
        const p2 = result.players.find((p) => p.id === 2);
        expect(p2?.status).toBe('eliminated');
    });
});

describe('resolveTerminal — terminal detection', () => {
    it('returns MatchResult win when only one player remains alive', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'eliminated', citiesOwned: 0, troopsHeld: 0 },
        ];
        const result = resolveTerminal(state, players, CONSTANTS, 0);
        expect(result.terminal).toBeDefined();
        expect(result.terminal?.kind).toBe('win');
        if (result.terminal?.kind === 'win') {
            expect(result.terminal.winner).toBe(1);
            expect(result.terminal.reason).toBe('last_standing');
        }
    });

    it('returns MatchResult draw when all players eliminated simultaneously (mutual_elimination)', () => {
        const size = 8;
        const _board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        // P1 had 50 troops previously, now 0. P2 had 30 previously, now 0.
        // Both eliminated.
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 1, troopsHeld: 50 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 30 },
        ];
        const result = resolveTerminal(state, players, CONSTANTS, 0);
        expect(result.terminal).toBeDefined();
        expect(result.terminal?.kind).toBe('draw');
        if (result.terminal?.kind === 'draw') {
            expect(result.terminal.reason).toBe('mutual_elimination');
        }
        // Both players eliminated.
        expect(result.events.eliminations).toHaveLength(2);
    });
});

describe('isTerminal', () => {
    it('returns undefined for non-terminal state', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 0, troopsHeld: 30 },
        ];
        const world = buildWorld(size, board, state, players);
        expect(isTerminal(world)).toBeUndefined();
    });

    it('returns MatchResult when state is terminal', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, []);
        const state = emptyState(size);
        placeStack(state, size, 3, 3, 1, 100);
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 0, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'eliminated', citiesOwned: 0, troopsHeld: 0 },
        ];
        const world = buildWorld(size, board, state, players);
        const r = isTerminal(world);
        expect(r).toBeDefined();
        expect(r?.kind).toBe('win');
    });
});

describe('applyCommand — surrender (FR-016)', () => {
    it('surrender marks player as eliminated immediately and emits EliminationEvent', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const world0 = buildWorld(size, board, emptyState(size), [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
        ]);
        const r = applyCommand(world0, { kind: 'surrender', player: 2 });
        expect(r.result.ok).toBe(true);
        const p2 = r.world.players.find((p) => p.id === 2);
        expect(p2?.status).toBe('eliminated');
    });

    it('surrender twice on the same player: rejected as already_surrendered', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const world0 = buildWorld(size, board, emptyState(size), [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
        ]);
        const r1 = applyCommand(world0, { kind: 'surrender', player: 2 });
        expect(r1.result.ok).toBe(true);
        const r2 = applyCommand(r1.world, { kind: 'surrender', player: 2 });
        expect(r2.result.ok).toBe(false);
        if (!r2.result.ok) {
            expect(r2.result.reason.kind).toBe('already_surrendered');
        }
    });
});

describe('tick — frozen-once-terminal', () => {
    it('tick() on a terminal world is a no-op returning the same MatchResult', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        // World with P2 eliminated → terminal.
        const state = emptyState(size);
        placeStack(state, size, 1, 1, 1, 100);
        state.cityOwners[1 * size + 1] = 1;
        state.cityOwners[6 * size + 6] = 2;
        const players: Player[] = [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 1, troopsHeld: 100 },
            { id: 2, displayName: 'P2', status: 'eliminated', citiesOwned: 1, troopsHeld: 0 },
        ];
        const world0 = buildWorld(size, board, state, players);

        // First tick: should detect terminal and return no-op.
        const r1 = tick(world0);
        expect(r1.terminal).toBeDefined();
        expect(r1.terminal?.kind).toBe('win');
        expect(r1.world.tick).toBe(0); // tick number unchanged.

        // Second tick: still terminal, still no-op.
        const r2 = tick(r1.world);
        expect(r2.terminal).toBeDefined();
        expect(r2.terminal?.kind).toBe('win');
        expect(r2.world.tick).toBe(0);
    });

    it('surrender then tick: opponent wins on next tick', () => {
        const size = 8;
        const board: Board = buildSmallBoard(size, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        let world = buildWorld(size, board, emptyState(size), [
            { id: 1, displayName: 'P1', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
            { id: 2, displayName: 'P2', status: 'alive', citiesOwned: 1, troopsHeld: 0 },
        ]);
        // Add cities to state.
        world.state.cityOwners[1 * size + 1] = 1;
        world.state.cityOwners[6 * size + 6] = 2;
        // Surrender P2.
        const r = applyCommand(world, { kind: 'surrender', player: 2 });
        world = r.world as World;

        // Tick: should detect terminal.
        const tickResult = tick(world);
        expect(tickResult.terminal).toBeDefined();
        expect(tickResult.terminal?.kind).toBe('win');
        if (tickResult.terminal?.kind === 'win') {
            expect(tickResult.terminal.winner).toBe(1);
        }
    });
});
