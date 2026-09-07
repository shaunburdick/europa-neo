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
import { tick } from '../../src/tick';
import type { MatchConfig, Order, PlayerId, World } from '../../src/types';
import { ENGINE_API_VERSION } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

/** A minimal 8x8 board with two cities (P1 and P2). */
const BOARD = buildSmallBoard(8, [
    [1, 1, 1],
    [6, 6, 2],
]);

/** Default match config for 8x8 board. */
const CONFIG: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
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
        playerCount: world.config.playerCount,
        orders,
        terminalTick,
        terminalResult: null,
        finalStateHash: hashWorld(world as Readonly<World>),
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
        const expectedHash = hashWorld(world as Readonly<World>);

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
            player: 1 as PlayerId,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        world = applyCommand(world, order).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world as Readonly<World>);

        // Build a fixture with that one order at tick 0.
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [{ tick: 0, playerId: 1 as PlayerId, order }], 1);

        const result = replayMatch(fixture, BOARD);
        expect(result.hash).toBe(expectedHash);
        expect(result.tickCount).toBe(1);
    });

    it('replays multiple orders at the same tick', () => {
        // Apply two orders at tick 0, then tick.
        let world = createWorld(CONFIG, BOARD);
        const order1: Order = {
            kind: 'setPipe',
            player: 1 as PlayerId,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        const order2: Order = {
            kind: 'setPipe',
            player: 2 as PlayerId,
            cell: { x: 6, y: 6 },
            direction: 'W',
        };
        world = applyCommand(world, order1).world;
        world = applyCommand(world, order2).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world as Readonly<World>);

        // Build a fixture with both orders at tick 0.
        const fixture = buildFixture(
            createWorld(CONFIG, BOARD),
            [
                { tick: 0, playerId: 1 as PlayerId, order: order1 },
                { tick: 0, playerId: 2 as PlayerId, order: order2 },
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
            player: 1 as PlayerId,
            cell: { x: 1, y: 1 },
            direction: 'E',
        };
        world = applyCommand(world, order1).world;
        world = tick(world).world;

        const order2: Order = {
            kind: 'setReserves',
            player: 1 as PlayerId,
            cell: { x: 1, y: 1 },
            percent: 5,
        };
        world = applyCommand(world, order2).world;
        world = tick(world).world;
        const expectedHash = hashWorld(world as Readonly<World>);

        const fixture = buildFixture(
            createWorld(CONFIG, BOARD),
            [
                { tick: 0, playerId: 1 as PlayerId, order: order1 },
                { tick: 1, playerId: 1 as PlayerId, order: order2 },
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
        expect(result.finalWorld).toBeDefined();
        expect((result.finalWorld as World).tick).toBe(5);
    });

    it('produces byte-identical results on repeated replays', () => {
        const fixture = buildFixture(createWorld(CONFIG, BOARD), [], 20);
        const result1 = replayMatch(fixture, BOARD);
        const result2 = replayMatch(fixture, BOARD);
        expect(result1.hash).toBe(result2.hash);
        expect(result1.hash).toBe(hashWorld(result1.finalWorld as Readonly<World>));
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
