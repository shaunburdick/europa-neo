/**
 * Engine session construction — Feature 006 (T028 support module)
 *
 * **Deviation note (documented per dispatch)**: T028's prose says the
 * matchmaker "constructs the engine session via
 * `createMatchSession({ config, terrain, displayNames })`", but the
 * engine package ships no such factory — its public surface is the
 * primitive lifecycle (`createWorld` / `applyCommand` / `tick` /
 * `isTerminal`). This module performs the same wrapping networking's
 * test fixture established as precedent
 * (`packages/networking/tests/fixtures/match.ts`): hold the current
 * `World` in a closure cell and thread it through `submit` →
 * `applyCommand` and `advance()` → `tick`, producing the contract's
 * `EngineSession` handle (networking's re-declaration, mirrored in
 * `contracts/match-types.ts`).
 *
 * Display names are deliberately NOT pushed into the engine: the
 * engine treats them as cosmetic-only ("set by feature 006"), and the
 * matchmaker's `SeatRecord`s are the source of truth for names —
 * results payloads read them from seats, not from the world.
 *
 * Runtime imports of `@europa/engine` live here (and only here for
 * session construction); `@europa/networking` remains type-only. The
 * workspace packages are declared dependencies and stay external in
 * the tsup bundle.
 *
 * Pure apart from the engine calls themselves: no clock reads, no
 * randomness — config and board arrive fully formed (constitution
 * Principle II).
 */

import type { Board, MatchConfig, Order, World } from '@europa/engine';
import { applyCommand, createWorld, ENGINE_CONSTANTS, isTerminal, tick } from '@europa/engine';
import type { EngineSession, MatchSettings } from '../contracts/match-types';

/**
 * Build the engine `MatchConfig` for a starting match: player-facing
 * settings plus the fresh uint32 seed and the engine-owned default
 * sensor radius (single tunable location:
 * `ENGINE_CONSTANTS.visibilityRadiusDefault`).
 *
 * @param settings - Validated match settings from the stored record.
 * @param seed - Fresh uint32 seed minted by the matchmaker at start.
 * @returns A frozen `MatchConfig` ready for `createWorld` and
 *   `registerMatch`.
 */
export function buildMatchConfig(settings: MatchSettings, seed: number): MatchConfig {
    return Object.freeze({
        boardSize: settings.boardSize,
        playerCount: settings.playerCount,
        tickIntervalMs: settings.tickIntervalMs,
        seed,
        visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
    });
}

/**
 * Wrap a freshly created engine `World` into the contract's
 * `EngineSession` interface:
 *
 *   - `world()`   read view of the current world
 *   - `submit(o)` apply an order (returns the engine's CommandResult)
 *   - `advance()` run one tick boundary (post-tick world + events +
 *                 optional terminal result)
 *   - `status()`  cheap terminal check
 *   - `close()`   no-op — sessions hold no external resources
 *
 * @param config - The frozen match config (must match the board).
 * @param board - The terrain-generated starting board.
 * @returns The session handle handed to `server.registerMatch`.
 */
export function buildEngineSession(config: MatchConfig, board: Board): EngineSession {
    let current: World = createWorld(config, board);

    return {
        world(): World {
            return current;
        },
        submit(order: Order) {
            const applied = applyCommand(current, order);
            current = applied.world;
            return applied.result;
        },
        advance() {
            const result = tick(current);
            current = result.world;
            // exactOptionalPropertyTypes: omit `terminal` rather than pass
            // an explicit undefined.
            if (result.terminal === undefined) {
                return { world: current, events: result.events };
            }
            return { world: current, events: result.events, terminal: result.terminal };
        },
        status() {
            return isTerminal(current);
        },
        close(): void {
            // In-memory session holds no external resources to release.
        },
    };
}
