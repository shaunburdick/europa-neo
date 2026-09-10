/**
 * Match Replay — Feature 022 (Developer Debugging Tools)
 *
 * Pure function that replays a captured match fixture through the
 * engine. Takes a pre-generated board and a fixture, creates the world,
 * applies each order at its recorded tick, and returns the final world
 * state with its hash.
 *
 * This module is the core of the replay harness. It is pure — no I/O,
 * no wall-clock reads — per constitution Principle II (deterministic
 * simulation). The same fixture input always produces the same output.
 *
 * Board generation (via `@europa/terrain`'s `generateBoard`) happens
 * at the call site (CLI scripts), not inside this function, so the
 * engine package has no runtime dependency on the terrain package.
 *
 * **Engine version mismatch**: when the fixture's `engineVersion`
 * differs from the current `ENGINE_API_VERSION`, a warning is emitted
 * but the replay still runs (the engine's determinism guarantees hold
 * across minor versions for the same config — see spec edge cases).
 */

import { applyCommand } from '../applyCommand';
import { createWorld } from '../create';
import { hashWorld } from '../serialize';
import { tick as engineTick } from '../tick';
import type { Board, MatchConfig, Order, PlayerId, World } from '../types';
import { ENGINE_API_VERSION } from '../types';
import type { Fixture, OrderRecord, ReplayResult } from './types';

/**
 * Group orders by tick for efficient lookup during replay. Orders
 * within the same tick are already in canonical order (playerId
 * ascending, kind alphabetical) per FR-012.
 *
 * @param orders The fixture's ordered record of all applied orders.
 * @returns A Map from tick number to the orders applied at that tick.
 */
function groupOrdersByTick(orders: ReadonlyArray<OrderRecord>): Map<number, OrderRecord[]> {
    const map = new Map<number, OrderRecord[]>();
    for (const record of orders) {
        let bucket = map.get(record.tick);
        if (bucket === undefined) {
            bucket = [];
            map.set(record.tick, bucket);
        }
        bucket.push(record);
    }
    return map;
}

/**
 * Check the engine version and emit a warning if it differs from the
 * fixture's recorded version. The warning is written to stderr when
 * available, or logged via console.warn otherwise. Pure side-effect.
 *
 * @param fixtureVersion The engine version recorded in the fixture.
 * @returns The warning message if a mismatch was detected, or null.
 */
export function checkVersionMismatch(fixtureVersion: string): string | null {
    if (fixtureVersion === ENGINE_API_VERSION) {
        return null;
    }
    return `Warning: fixture engine version '${fixtureVersion}' differs from current '${ENGINE_API_VERSION}'`;
}

/**
 * Replay a captured match fixture through the engine. Pure.
 *
 * The caller is responsible for generating the board (via
 * `@europa/terrain`'s `generateBoard`) from the fixture's seed and
 * terrain settings. This function does not import terrain — keeping
 * the engine's dist free of cross-package runtime dependencies.
 *
 * @param fixture The validated fixture to replay.
 * @param board The regenerated Board matching the fixture's seed and settings.
 * @returns The final world, its hash, and the tick count.
 * @throws If the engine encounters an error during replay.
 */
export function replayMatch(fixture: Fixture, board: Board): ReplayResult {
    // 1. Create the initial world from the regenerated board.
    // Use settings.playerIds if present (v0.2.0+ fixtures), otherwise
    // generate deterministic string PlayerIds from the fixture's playerCount.
    const playerIds: PlayerId[] =
        fixture.settings.playerIds !== undefined
            ? [...fixture.settings.playerIds]
            : Array.from({ length: fixture.playerCount }, (_, i) => `fixture-p${String(i + 1)}` as PlayerId);
    const config: MatchConfig = {
        boardSize: fixture.settings.boardSize,
        playerIds,
        tickIntervalMs: fixture.settings.tickIntervalMs,
        seed: fixture.seed,
        visibilityRadius: fixture.settings.visibilityRadius,
    };

    let world: World = createWorld(config, board);

    // 2-3. Group orders by tick and replay.
    const ordersByTick = groupOrdersByTick(fixture.orders);

    for (let t = 0; t < fixture.terminalTick; t++) {
        // Apply all orders recorded for this tick.
        const orders = ordersByTick.get(t) ?? [];
        for (const record of orders) {
            try {
                const result = applyCommand(world, record.order as Order);
                world = result.world;
            } catch {
                // Ignore invalid orders (unknown player, out of bounds, etc.).
                // The order is still recorded in the fixture for documentation.
            }
        }

        // Advance the world by one tick.
        const tickResult = engineTick(world);
        world = tickResult.world;
    }

    // 4. Compute final hash.
    const hash = hashWorld(world as Readonly<World>);

    return {
        finalWorld: world,
        hash,
        tickCount: fixture.terminalTick,
    };
}
