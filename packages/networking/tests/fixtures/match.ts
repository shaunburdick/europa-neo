/**
 * Scripted Match Fixture — Feature 004
 *
 * Test-only builder for a real-engine match session wired into the
 * shape the networking layer consumes (the contract's `EngineSession`
 * from `contracts/network-api.ts`). Produces deterministic state:
 * flat all-land board, one home city + one troop stack per player at
 * fixed positions, fixed PRNG seed — so fog's `computePlayerView`
 * output is reproducible across runs (SC-001 protocol-level).
 *
 * **Engine adaptation note**: the engine package does not export a
 * `createMatchSession` factory (its public surface is the primitive
 * lifecycle: `createWorld`, `applyCommand`, `tick`, `isTerminal`).
 * The contract's `EngineSession` interface is exactly that primitive
 * surface in session form, so this fixture performs the wrapping
 * itself — same behavior Wave 6B's server wiring will get once the
 * engine grows a first-class factory (or matchmaking composes one).
 *
 * State discipline mirrors fog's `tests/fixtures/world.ts`: the
 * engine's functions are immutable-style (`applyCommand`/`tick`
 * return new worlds), so the session wrapper holds the *current*
 * world in a closure cell and threads it through.
 */

import {
    applyCommand,
    type Board,
    type Cell,
    type CityPlacement,
    createWorld,
    ENGINE_CONSTANTS,
    isTerminal,
    type MatchConfig,
    type Order,
    type PlayerId,
    tick,
    type World,
} from '@europa/engine';

import { generateSessionToken, toBranded } from '../../src/ids';
import type { EngineSession, MatchId, Server, SessionToken } from '../../src/types';

/** Minimum board size (mirrors the engine/fog fixture convention). */
const MIN_BOARD_SIZE = 8;

/** Default display names, indexed by seat order. */
const DEFAULT_DISPLAY_NAMES: readonly string[] = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

/** Home coordinates per player seat (deterministic corner placements). */
const HOME_COORDS: ReadonlyArray<readonly [x: number, y: number]> = [
    [1, 1],
    [-2, -2], // offsets from board size; resolved in buildScriptedBoard
    [-2, 1],
    [1, -2],
];

/** Troop count per scripted stack. */
const STACK_COUNT = 10;

// ----------------------------------------------------------------------------
// Board / world construction
// ----------------------------------------------------------------------------

/**
 * Resolve a home coordinate entry against the board size. Negative
 * entries are offsets from the far edge (`size + offset`).
 */
function resolveHome(size: number, entry: readonly [number, number]): { x: number; y: number } {
    const [hx, hy] = entry;
    const x = hx < 0 ? size + hx : hx;
    const y = hy < 0 ? size + hy : hy;
    return { x, y };
}

/**
 * Build a flat, all-land, elevation-0 board with one home city per
 * player at the deterministic corner positions.
 */
function buildScriptedBoard(size: number, playerCount: 2 | 3 | 4): Board {
    const cells: Cell[] = new Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            cells[y * size + x] = { x, y, elevation: 0, terrain: 'land' };
        }
    }

    const cities: CityPlacement[] = [];
    for (let seat = 1; seat <= playerCount; seat++) {
        const home = resolveHome(size, HOME_COORDS[seat - 1] as readonly [number, number]);
        cities.push({ cell: { x: home.x, y: home.y }, owner: seat as PlayerId });
    }

    return {
        width: size,
        height: size,
        cells: Object.freeze(cells),
        cities: Object.freeze(cities),
    };
}

/**
 * Place each player's opening troop stack adjacent to their home
 * city (offset +1 on x) so stacks never sit on city cells.
 */
function placeOpeningStacks(world: World, size: number, playerCount: 2 | 3 | 4): World {
    const counts = new Uint32Array(world.state.troopCounts);
    const owners = new Uint8Array(world.state.troopOwners);

    for (let seat = 1; seat <= playerCount; seat++) {
        const home = resolveHome(size, HOME_COORDS[seat - 1] as readonly [number, number]);
        const idx = home.y * size + (home.x + 1);
        counts[idx] = STACK_COUNT;
        owners[idx] = seat;
    }

    return {
        ...world.state,
        troopCounts: counts,
        troopOwners: owners,
    };
}

// ----------------------------------------------------------------------------
// EngineSession adapter over the engine primitives
// ----------------------------------------------------------------------------

/**
 * Wrap a fresh engine `World` into the contract's `EngineSession`
 * interface. The wrapper owns the current-world cell and threads it
 * through `submit` → `applyCommand` and `advance` → `tick`, matching
 * the contract's documented semantics:
 *
 *   - `world()`   read view of the current world
 *   - `submit(o)` stage an order (returns the engine's CommandResult)
 *   - `advance()` run one tick boundary (returns post-tick world +
 *                 events + optional terminal result)
 *   - `status()`  cheap terminal check
 *   - `close()`   no-op for the in-memory fixture
 */
function wrapEngineSession(world: World): EngineSession {
    let current: World = world;

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
            return { world: current, events: result.events, terminal: result.terminal };
        },
        status() {
            return isTerminal(current);
        },
        close(): void {
            // In-memory fixture holds no external resources to release.
        },
    };
}

// ----------------------------------------------------------------------------
// Public fixture API
// ----------------------------------------------------------------------------

/** Options for {@link scriptedMatch}; every field has a default. */
export interface ScriptedMatchOptions {
    /** Player count (2–4 per engine FR-019). Default `2`. */
    readonly playerCount?: 2 | 3 | 4;
    /** Square board dimension (≥ 8). Default `16`. */
    readonly boardSize?: number;
    /** Tick cadence in ms; lands in `MatchConfig.tickIntervalMs`. Default `250`. */
    readonly tickRateMs?: number;
    /** PRNG seed. Default `42` (the repo's conventional magic seed). */
    readonly seed?: number;
    /** Display names per seat; defaults to Alpha/Bravo/Charlie/Delta. */
    readonly displayNames?: readonly string[];
}

/** The four-tuple `registerMatch` + `attachPlayer` consume. */
export interface ScriptedMatch {
    readonly matchId: MatchId;
    readonly engineSession: EngineSession;
    readonly matchConfig: MatchConfig;
    readonly displayNames: readonly string[];
}

let scriptedMatchCounter = 0;

/**
 * Build a deterministic, real-engine scripted match.
 *
 * @param options See {@link ScriptedMatchOptions}.
 * @returns The match id, wrapped engine session, frozen config, and
 *          display names — ready for `server.registerMatch`.
 * @throws If `boardSize` is not an integer ≥ 8 or `playerCount`
 *         is outside 2..4.
 */
export function scriptedMatch(options: ScriptedMatchOptions = {}): ScriptedMatch {
    const playerCount = options.playerCount ?? 2;
    const boardSize = options.boardSize ?? 16;
    const tickRateMs = options.tickRateMs ?? 250;
    const seed = options.seed ?? 42;
    const displayNames = options.displayNames ?? DEFAULT_DISPLAY_NAMES.slice(0, playerCount);

    if (!Number.isInteger(boardSize) || boardSize < MIN_BOARD_SIZE) {
        throw new Error(`scriptedMatch: boardSize must be an integer ≥ ${MIN_BOARD_SIZE} (got ${String(boardSize)})`);
    }
    if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
        throw new Error(`scriptedMatch: playerCount must be 2, 3, or 4 (got ${String(playerCount)})`);
    }
    if (displayNames.length !== playerCount) {
        throw new Error(
            `scriptedMatch: displayNames length must equal playerCount (${String(playerCount)}, got ${String(displayNames.length)})`,
        );
    }

    scriptedMatchCounter += 1;
    const matchId = toBranded<MatchId>(`match-scripted-${String(scriptedMatchCounter).padStart(4, '0')}`);

    const matchConfig: MatchConfig = Object.freeze({
        boardSize,
        playerCount,
        tickIntervalMs: tickRateMs,
        seed,
        visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
    });

    const board = buildScriptedBoard(boardSize, playerCount);
    const baseWorld = createWorld(matchConfig, board);
    const world = { ...baseWorld, state: placeOpeningStacks(baseWorld, boardSize, playerCount) };

    return {
        matchId,
        engineSession: wrapEngineSession(world),
        matchConfig,
        displayNames,
    };
}

/**
 * Bind every seat of a scripted match on a `Server` via
 * `attachPlayer`, generating a v4 UUID token per seat when none is
 * supplied. Returns the tokens used (index = playerId − 1).
 *
 * @param server The (real or fake) networking `Server`.
 * @param match  A match built by {@link scriptedMatch}.
 * @param tokens Optional pre-generated tokens; when shorter than the
 *               player count or omitted, missing seats get generated
 *               tokens.
 */
export function attachPlayersForMatch(
    server: Server,
    match: ScriptedMatch,
    tokens?: readonly SessionToken[],
): readonly SessionToken[] {
    const used: SessionToken[] = [];
    for (let i = 0; i < match.matchConfig.playerCount; i++) {
        const provided = tokens?.[i];
        const token = provided ?? generateSessionToken();
        server.attachPlayer({
            matchId: match.matchId,
            playerId: (i + 1) as PlayerId,
            sessionToken: token,
        });
        used.push(token);
    }
    return used;
}
