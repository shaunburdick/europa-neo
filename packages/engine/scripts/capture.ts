/**
 * Capture Script — Feature 022 (Developer Debugging Tools)
 *
 * Headless match capture: generates a board from seed + settings,
 * replays scripted orders through the engine, and writes a fixture
 * JSON file with all metadata needed for deterministic replay.
 *
 * Usage:
 *   tsx packages/engine/scripts/capture.ts --seed 42 --settings settings.json --orders orders.json --out fixture.json
 *
 * Arguments:
 *   --seed <number>       PRNG seed (uint32). Required.
 *   --settings <path>     Path to a JSON file with GenerationSettings. Optional (uses defaults).
 *   --orders <path>       Path to a JSON file with [{tick, playerId, order}]. Optional (empty orders).
 *   --out <path>          Output fixture path. Default: replay-<timestamp>.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '../../terrain/src/index';
import { applyCommand } from '../src/applyCommand';
import { createWorld } from '../src/create';
import { ENGINE_API_VERSION, hashWorld, isTerminal, tick } from '../src/index';
import type { GenerationSettings } from '../src/replay/types';
import { createRng } from '../src/rng';
import type { MatchConfig, Order, PlayerId } from '../src/types';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
    seed: number;
    settingsPath: string | null;
    ordersPath: string | null;
    outPath: string;
} {
    let seed: number | null = null;
    let settingsPath: string | null = null;
    let ordersPath: string | null = null;
    let outPath: string | null = null;

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--seed' && next !== undefined) {
            seed = Number.parseInt(next, 10);
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

    if (seed === null || Number.isNaN(seed)) {
        console.error('Error: --seed <number> is required');
        process.exit(2);
    }

    const timestamp = Date.now();
    return {
        seed,
        settingsPath,
        ordersPath,
        outPath: outPath ?? `replay-${String(timestamp)}.json`,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
    const args = parseArgs(process.argv);

    // Load terrain settings (optional).
    let terrainSettings: GenerationSettings = { ...DEFAULT_GENERATION_SETTINGS };
    if (args.settingsPath !== null) {
        const raw = readFileSync(resolve(args.settingsPath), 'utf-8');
        terrainSettings = JSON.parse(raw) as GenerationSettings;
    }

    // Load orders (optional).
    let orders: Array<{ readonly tick: number; readonly playerId: PlayerId; readonly order: Order }> = [];
    if (args.ordersPath !== null) {
        const raw = readFileSync(resolve(args.ordersPath), 'utf-8');
        orders = JSON.parse(raw) as Array<{
            readonly tick: number;
            readonly playerId: PlayerId;
            readonly order: Order;
        }>;
    }

    // Generate board.
    const rng = createRng(args.seed);
    const { board } = generateBoard({
        boardSize: 32,
        playerCount: 2,
        seed: args.seed,
        rng,
        settings: terrainSettings,
    });

    // Create world and replay.
    const config: MatchConfig = {
        boardSize: 32,
        playerCount: 2,
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
        playerCount: config.playerCount,
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
