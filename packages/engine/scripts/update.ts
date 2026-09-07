/**
 * Replay Update Script — Feature 022 (Developer Debugging Tools)
 *
 * Replays a fixture and overwrites the `finalStateHash` field with
 * the engine's current output. Used to update baselines after
 * intentional engine behavior changes.
 *
 * Usage:
 *   tsx packages/engine/scripts/update.ts <fixture.json>
 *
 * Exit codes:
 *   0 — Success: fixture updated.
 *   2 — Input error: missing file, invalid JSON, missing fields.
 *
 * Output:
 *   Updated <old_hash> → <new_hash>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '@europa/terrain';
import { checkVersionMismatch, replayMatch } from '../src/replay/replay';
import type { Fixture } from '../src/replay/types';
import { validateFixture } from '../src/replay/validate';
import { createRng } from '../src/rng';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
    const fixturePath = process.argv[2];

    if (fixturePath === undefined || fixturePath === '') {
        console.error('Usage: tsx packages/engine/scripts/update.ts <fixture.json>');
        process.exit(2);
    }

    // 1. Read and parse fixture.
    let raw: string;
    try {
        raw = readFileSync(resolve(fixturePath), 'utf-8');
    } catch {
        console.error(`Error: cannot read file '${fixturePath}'`);
        process.exit(2);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        console.error(`Error: invalid JSON in '${fixturePath}'`);
        process.exit(2);
    }

    // 2. Validate fixture.
    let fixture: Fixture;
    try {
        fixture = validateFixture(parsed);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(2);
    }

    // 3. Version mismatch warning.
    const versionWarning = checkVersionMismatch(fixture.engineVersion);
    if (versionWarning !== null) {
        process.stderr.write(`${versionWarning}\n`);
    }

    // 4. Generate board from seed + terrain settings.
    const rng = createRng(fixture.seed);
    const terrainSettings = {
        ...DEFAULT_GENERATION_SETTINGS,
        ...fixture.terrainSettings,
    };
    const { board } = generateBoard({
        boardSize: fixture.settings.boardSize,
        playerCount: fixture.settings.playerCount as 2 | 3 | 4,
        seed: fixture.seed,
        rng,
        settings: terrainSettings,
    });

    // 5. Replay and update hash.
    try {
        const result = replayMatch(fixture, board);
        const oldHash = fixture.finalStateHash;

        // Build updated fixture with new hash.
        const updated = {
            version: fixture.version,
            seed: fixture.seed,
            settings: fixture.settings,
            terrainSettings: fixture.terrainSettings,
            playerCount: fixture.playerCount,
            orders: fixture.orders,
            terminalTick: fixture.terminalTick,
            terminalResult: fixture.terminalResult,
            finalStateHash: result.hash,
            engineVersion: fixture.engineVersion,
        };

        // Write back with 2-space indent (NFR-002).
        const outPath = resolve(fixturePath);
        writeFileSync(outPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8');
        console.log(`Updated ${oldHash} → ${result.hash}`);
        process.exit(0);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error during replay: ${message}`);
        process.exit(2);
    }
}

main();
