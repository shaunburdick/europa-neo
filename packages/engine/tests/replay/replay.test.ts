/**
 * replayMatch tests — Feature 022 (Developer Debugging Tools)
 *
 * Covers:
 *   - Deterministic round-trip: create fixture → replay → same hash
 *   - Empty orders (match runs with no player input)
 *   - Single order at tick 0
 *   - Multiple orders at same tick
 *   - tickCount matches terminalTick
 *   - checkVersionMismatch helper
 *
 * Board generation is done via `@europa/terrain`'s `generateBoard` to
 * produce real boards for deterministic replay. Tests that need a
 * controlled board use the engine's `buildSmallBoard` fixture helper.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { createWorld } from '../../src/create';
import { checkVersionMismatch, replayMatch } from '../../src/replay/replay';
import type { Fixture, OrderRecord } from '../../src/replay/types';
import { hashWorld } from '../../src/serialize';
import { isTerminal, tick } from '../../src/tick';
import type { MatchConfig, Order, World } from '../../src/types';
import { ENGINE_API_VERSION } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { PLAYER_1, PLAYER_2, playerIds, UNKNOWN_PLAYER } from '../fixtures/ids';

/** A minimal 8x8 board with two cities (P1 and P2). */
const BOARD = buildSmallBoard(8, [
    [1, 1, 1],
    [6, 6, 2],
]);

/** Default match config for 8x8 board. */
const CONFIG: MatchConfig = {
    boardSize: 8,
    playerIds: playerIds(2),
    tickIntervalMs: 250,
    seed: 42,
    visibilityRadius: 6,
};

/**
 * Build a minimal fixture from a world state and order sequence.
 * This helper creates a fixture that captures the board, config,
 * orders, and the expected final hash.
 */
function buildFixture(
    world: World,
    orders: OrderRecord[],
    terminalTick: number,
    terrainSettings?: Fixture['terrainSettings'],
): Fixture {
    return {
        version: 1,
        seed: world.config.seed,
        settings: world.config,
        terrainSettings: terrainSettings ?? {
            waterRatio: 0.1,
            roughness: 0.5,
            octaves: 4,
            citiesPerPlayer: 1,
            symmetryStrategy: 'point',
            minCityWaterDistance: 3,
            minCityCityDistance: 5,
            maxRegenAttempts: 5,
            terrainSmoothing: 4,
        },
        playerCount: 2,
        orders,
        terminalTick,
        terminalResult: null,
        finalStateHash: hashWorld(world),
        engineVersion: ENGINE_API_VERSION,
    };
}

describe('replayMatch', () => {
    it('replays with empty orders and produces the correct hash', () => {
        // Create a world, tick it 10 times, record the hash.
        let world = createWorld(CONFIG, BOARD);
        for (let i = 0; i < 10; i++) {
            world = tick(world).world;
        }
        const expectedHash = hashWorld(world);

        // Build a fixture with empty orders for 10 ticks.
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [], 10);

        const result = replayMatch(fixture, BOARD);
        expect(result.hash).toBe(expectedHash);
        expect(result.tickCount).toBe(10);
    });

    it('replays a single order and produces the correct hash', () => {
        // Create a world, apply one order, tick once.
        let world = createWorld(CONFIG, BOARD);
        const order: Order = {
            kind: 'setPipe',
            player: PLAYER_1,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        world = applyCommand(world, order).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world);

        // Build a fixture with that one order at tick 0.
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [{ tick: 0, playerId: PLAYER_1, order }], 1);

        const result = replayMatch(fixture, BOARD);
        expect(result.hash).toBe(expectedHash);
        expect(result.tickCount).toBe(1);
    });

    it('replays multiple orders at the same tick', () => {
        // Apply two orders at tick 0, then tick.
        let world = createWorld(CONFIG, BOARD);
        const order1: Order = {
            kind: 'setPipe',
            player: PLAYER_1,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        const order2: Order = {
            kind: 'setPipe',
            player: PLAYER_2,
            cell: { x: 6, y: 6 },
            direction: 'W',
        };
        world = applyCommand(world, order1).world;
        world = applyCommand(world, order2).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world);

        // Build a fixture with both orders at tick 0.
        const fixture = buildFixture(
            createWorld(CONFIG, BOARD),
            [
                { tick: 0, playerId: PLAYER_1, order: order1 },
                { tick: 0, playerId: PLAYER_2, order: order2 },
            ],
            1,
        );

        const result = replayMatch(fixture, BOARD);
        expect(result.hash).toBe(expectedHash);
        expect(result.tickCount).toBe(1);
    });

    it('replays orders across multiple ticks', () => {
        // Apply order at tick 0, tick, apply another at tick 1, tick.
        let world = createWorld(CONFIG, BOARD);
        const order1: Order = {
            kind: 'setPipe',
            player: PLAYER_1,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        world = applyCommand(world, order1).world;
        world = tick(world).world;

        const order2: Order = {
            kind: 'setReserves',
            player: PLAYER_1,
            cell: { x: 1, y: 1 },
            percent: 5,
        };
        world = applyCommand(world, order2).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world);

        const fixture = buildFixture(
            createWorld(CONFIG, BOARD),
            [
                { tick: 0, playerId: PLAYER_1, order: order1 },
                { tick: 1, playerId: PLAYER_1, order: order2 },
            ],
            2,
        );

        const result = replayMatch(fixture, BOARD);
        expect(result.hash).toBe(expectedHash);
        expect(result.tickCount).toBe(2);
    });

    it('returns the final world in the result', () => {
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [], 5);
        const result = replayMatch(fixture, BOARD);
        // ReplayResult.finalWorld is non-optional — assert content directly.
        expect((result.finalWorld as World).tick).toBe(5);
    });

    it('produces byte-identical results on repeated replays', () => {
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [], 20);
        const result1 = replayMatch(fixture, BOARD);
        const result2 = replayMatch(fixture, BOARD);
        expect(result1.hash).toBe(result2.hash);
        expect(result1.hash).toBe(hashWorld(result1.finalWorld));
    });
});

describe('checkVersionMismatch', () => {
    it('returns null when versions match', () => {
        expect(checkVersionMismatch(ENGINE_API_VERSION)).toBeNull();
    });

    it('returns a warning message when versions differ', () => {
        const msg = checkVersionMismatch('0.0.999');
        expect(msg).toContain("fixture engine version '0.0.999'");
        expect(msg).toContain(`current '${ENGINE_API_VERSION}'`);
    });
});

describe('replayMatch — identity preservation through terminal state', () => {
    it('replays a surrender to a P1 win and preserves both explicit ids', () => {
        // Drive the reference world to a terminal state via surrender at
        // tick 0; the opponent (PLAYER_1) wins on the same tick.
        let reference = createWorld(CONFIG, BOARD);
        const surrender: Order = { kind: 'surrender', player: PLAYER_2 };
        reference = applyCommand(reference, surrender).world;
        reference = tick(reference).world;
        const terminal = isTerminal(reference);
        expect(terminal?.kind).toBe('win');
        const expectedHash = hashWorld(reference);

        const fixture: Fixture = {
            ...buildFixture(createWorld(CONFIG, BOARD), [], 1),
            orders: [{ tick: 0, playerId: PLAYER_2, order: surrender }],
            terminalResult: terminal ?? null,
            finalStateHash: expectedHash,
        };

        const result = replayMatch(fixture, BOARD);

        // Byte-identical outcome.
        expect(result.hash).toBe(expectedHash);

        // Explicit ids survive through the terminal state.
        expect(result.finalWorld.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);
        expect(result.finalWorld.players.map((p) => p.id)).toEqual([PLAYER_1, PLAYER_2]);
        expect(result.finalWorld.config.playerIds).toEqual([PLAYER_1, PLAYER_2]);

        const replayedTerminal = isTerminal(result.finalWorld);
        expect(replayedTerminal?.kind).toBe('win');
        if (replayedTerminal?.kind === 'win') {
            expect(replayedTerminal.winner).toBe(PLAYER_1);
        }
    });

    it('preserves a non-canonical placement-slot order through replay', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        // Slot 1 = PLAYER_2, slot 2 = PLAYER_1.
        const reversed: MatchConfig = { ...CONFIG, playerIds: [PLAYER_2, PLAYER_1] };
        const reference = createWorld(reversed, board);
        const fixture: Fixture = { ...buildFixture(reference, [], 3), settings: reversed };

        const result = replayMatch(fixture, board);
        expect(result.finalWorld.config.playerIds).toEqual([PLAYER_2, PLAYER_1]);
        expect(result.finalWorld.playerRegistry.ids).toEqual([PLAYER_1, PLAYER_2]);
    });
});

describe('replayMatch — fail-closed identity checks', () => {
    it('throws when playerCount disagrees with settings.playerIds.length', () => {
        const fixture: Fixture = { ...buildFixture(createWorld(CONFIG, BOARD), [], 1), playerCount: 3 };
        expect(() => replayMatch(fixture, BOARD)).toThrow(/playerCount/);
    });

    it('throws when an order references an unregistered player id', () => {
        const order: Order = {
            kind: 'setPipe',
            player: UNKNOWN_PLAYER,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        const fixture: Fixture = {
            ...buildFixture(createWorld(CONFIG, BOARD), [], 1),
            orders: [{ tick: 0, playerId: UNKNOWN_PLAYER, order }],
        };
        expect(() => replayMatch(fixture, BOARD)).toThrow(/outside settings.playerIds/);
    });
});
