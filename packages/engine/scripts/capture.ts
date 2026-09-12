/**
 * Capture Script — Feature 022 (Developer Debugging Tools) + issue #74
 *
 * Headless match capture: generates a board from seed + settings,
 * replays scripted orders through the engine, and writes a fixture
 * JSON file with all metadata needed for deterministic replay.
 *
 * Usage:
 *   tsx packages/engine/scripts/capture.ts --seed 42 [--player-ids id1,id2] [--settings settings.json] [--orders orders.json] [--out fixture.json]
 *
 * Arguments:
 *   --seed <number>          PRNG seed (uint32). Required.
 *   --player-ids <csv>       Explicit canonical 12-character player ids
 *                            (2–4, comma-separated). Default:
 *                            PLAYER000001,PLAYER000002.
 *   --settings <path>        Path to a JSON file with GenerationSettings. Optional (uses defaults).
 *   --orders <path>          Path to a JSON file with [{tick, playerId, order}]. Optional (empty orders).
 *   --out <path>             Output fixture path. Default: replay-<timestamp>.json.
 *
 * Exit codes:
 *   0 — Success: fixture written.
 *   2 — Input error: missing/invalid argument, unreadable file, malformed
 *       JSON, non-canonical/duplicate/unknown-player identity.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRng, isPlayerId, parsePlayerId } from '@europa/core';
import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '@europa/terrain';
import { applyCommand } from '../src/applyCommand';
import { createWorld } from '../src/create';
import { ENGINE_API_VERSION, hashWorld, isTerminal, tick } from '../src/index';
import type { GenerationSettings, PlayerCount } from '../src/replay/types';
import type { MatchConfig, Order, PlayerId } from '../src/types';

/**
 * Deterministic canonical identities used when `--player-ids` is
 * omitted. Capture is an identity trust boundary: it always supplies
 * explicit, canonical 12-character IDs (issue #74) and never invents
 * numeric identities.
 */
const DEFAULT_PLAYER_ID_TEXT = 'PLAYER000001,PLAYER000002';

/**
 * Print an error and exit with the CLI's input-error code.
 *
 * @param message Human-readable failure description.
 * @returns Never returns (process exits).
 */
function fail(message: string): never {
    console.error(`Error: ${message}`);
    process.exit(2);
}

/**
 * Parse a non-negative integer CLI argument.
 *
 * @param value The raw argument.
 * @param flag The flag name (for diagnostics).
 * @returns The parsed integer.
 */
function parseIntegerArg(value: string, flag: string): number {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        fail(`${flag} expects an integer, got "${value}"`);
    }
    return parsed;
}

/**
 * Parse and validate the explicit player-id list.
 *
 * @param raw Comma-separated canonical ids.
 * @returns The validated IDs in the given order.
 * @throws Exits with code 2 on any non-canonical, duplicate, or wrong-count entry.
 */
function parsePlayerIdList(raw: string): PlayerId[] {
    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    if (parts.length < 2 || parts.length > 4) {
        fail(`--player-ids must contain 2–4 comma-separated ids (got ${String(parts.length)})`);
    }
    const ids: PlayerId[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
        if (!isPlayerId(part)) {
            fail(`--player-ids entry "${part}" is not a canonical 12-character player id`);
        }
        if (seen.has(part)) {
            fail(`--player-ids contains duplicate id "${part}"`);
        }
        seen.add(part);
        ids.push(parsePlayerId(part));
    }
    return ids;
}

/**
 * Narrow a number to the engine's legal player-count union.
 *
 * @param count The candidate count.
 * @returns The same value typed as `PlayerCount`.
 * @throws Exits with code 2 when out of range.
 */
function asPlayerCount(count: number): PlayerCount {
    if (count === 2 || count === 3 || count === 4) {
        return count;
    }
    fail(`player count must be 2, 3, or 4 (got ${String(count)})`);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CaptureArgs {
    readonly seed: number;
    readonly playerIds: PlayerId[];
    readonly settingsPath: string | null;
    readonly ordersPath: string | null;
    readonly outPath: string;
}

/**
 * Parse the capture CLI arguments.
 *
 * @param argv The raw `process.argv` array.
 * @returns Parsed, validated arguments.
 */
function parseArgs(argv: string[]): CaptureArgs {
    let seed: number | null = null;
    let playerIdsText = DEFAULT_PLAYER_ID_TEXT;
    let settingsPath: string | null = null;
    let ordersPath: string | null = null;
    let outPath: string | null = null;

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--seed' && next !== undefined) {
            seed = parseIntegerArg(next, '--seed');
            i++;
        } else if (arg === '--player-ids' && next !== undefined) {
            playerIdsText = next;
            i++;
        } else if (arg === '--settings' && next !== undefined) {
            settingsPath = next;
            i++;
        } else if (arg === '--orders' && next !== undefined) {
            ordersPath = next;
            i++;
        } else if (arg === '--out' && next !== undefined) {
            outPath = next;
            i++;
        }
    }

    if (seed === null) {
        fail('--seed <number> is required');
    }

    const timestamp = Date.now();
    return {
        seed,
        playerIds: parsePlayerIdList(playerIdsText),
        settingsPath,
        ordersPath,
        outPath: outPath ?? `replay-${String(timestamp)}.json`,
    };
}

// ---------------------------------------------------------------------------
// Input loading
// ---------------------------------------------------------------------------

/**
 * The minimal shape of one entry in a scripted-orders JSON file, before
 * validation. Fields are `unknown` so every access is checked.
 */
interface RawOrderEntry {
    readonly tick?: unknown;
    readonly playerId?: unknown;
    readonly order?: unknown;
}

/** The minimal shape of an order body, before validation. */
interface RawOrderBody {
    readonly player?: unknown;
}

/**
 * Load and validate a scripted-order file. Every order's `playerId`
 * (and its inner `order.player`) must be a registered canonical
 * identity; numeric, malformed, or unknown-player values fail closed.
 *
 * @param path Path to the orders JSON file.
 * @param registered The configured player-id set.
 * @returns Validated order records.
 */
function loadOrders(
    path: string,
    registered: ReadonlySet<string>,
): Array<{ readonly tick: number; readonly playerId: PlayerId; readonly order: Order }> {
    const raw = readFileSync(resolve(path), 'utf-8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        fail(`orders file "${path}" is not valid JSON`);
    }
    if (!Array.isArray(parsed)) {
        fail(`orders file "${path}" must contain a JSON array`);
    }
    return parsed.map((entry, index) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            fail(`orders[${String(index)}] must be an object`);
        }
        const record = entry as RawOrderEntry;
        const tick = record.tick;
        if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
            fail(`orders[${String(index)}].tick must be a non-negative integer`);
        }
        const playerId = record.playerId;
        if (!isPlayerId(playerId) || !registered.has(playerId)) {
            fail(`orders[${String(index)}].playerId must be one of the configured player ids`);
        }
        const orderValue = record.order;
        if (orderValue === null || typeof orderValue !== 'object' || Array.isArray(orderValue)) {
            fail(`orders[${String(index)}].order must be an object`);
        }
        const orderPlayer = (orderValue as RawOrderBody).player;
        if (!isPlayerId(orderPlayer) || !registered.has(orderPlayer)) {
            fail(`orders[${String(index)}].order.player must be one of the configured player ids`);
        }
        if (orderPlayer !== playerId) {
            fail(`orders[${String(index)}].playerId does not match orders[${String(index)}].order.player`);
        }
        return { tick, playerId, order: orderValue as Order };
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
    const args = parseArgs(process.argv);
    const registered = new Set<string>(args.playerIds);

    // Load terrain settings (optional).
    let terrainSettings: GenerationSettings = { ...DEFAULT_GENERATION_SETTINGS };
    if (args.settingsPath !== null) {
        const raw = readFileSync(resolve(args.settingsPath), 'utf-8');
        terrainSettings = JSON.parse(raw) as GenerationSettings;
    }

    // Load orders (optional).
    const orders = args.ordersPath === null ? [] : loadOrders(args.ordersPath, registered);

    const playerCount = asPlayerCount(args.playerIds.length);

    // Generate board.
    const rng = createRng(args.seed);
    const { board } = generateBoard({
        boardSize: 32,
        playerCount,
        seed: args.seed,
        rng,
        settings: terrainSettings,
    });

    // Create world and replay.
    const config: MatchConfig = {
        boardSize: 32,
        playerIds: args.playerIds,
        tickIntervalMs: 250,
        seed: args.seed,
        visibilityRadius: 6,
    };

    let world = createWorld(config, board);

    // Apply orders at their recorded ticks.
    const maxTick = orders.length > 0 ? Math.max(...orders.map((o) => o.tick)) + 1 : 0;

    for (let t = 0; t <= maxTick; t++) {
        const tickOrders = orders.filter((o) => o.tick === t);
        for (const { order } of tickOrders) {
            const result = applyCommand(world, order);
            world = result.world;
        }

        const tickResult = tick(world);
        world = tickResult.world;

        if (isTerminal(world) !== undefined) {
            break;
        }
    }

    const terminalTick = world.tick;
    const terminalResult = isTerminal(world) ?? null;
    const finalStateHash = hashWorld(world);

    // Build fixture.
    const fixture = {
        version: 1,
        seed: args.seed,
        settings: config,
        terrainSettings,
        playerCount,
        orders,
        terminalTick,
        terminalResult,
        finalStateHash,
        engineVersion: ENGINE_API_VERSION,
    };

    // Write fixture with 2-space indent (NFR-002).
    const outPath = resolve(args.outPath);
    writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf-8');
    console.log(`Captured fixture: ${outPath} (${String(terminalTick)} ticks, hash: ${finalStateHash})`);
}

main();
