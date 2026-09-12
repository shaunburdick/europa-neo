/**
 * Replay Run Script — Feature 022 (Developer Debugging Tools)
 *
 * Replays a captured fixture through the engine and compares the
 * final state hash against the stored baseline. Exits with code 0
 * on PASS, 1 on FAIL, 2 on input error.
 *
 * Usage:
 *   tsx packages/engine/scripts/run.ts <fixture.json>
 *
 * Exit codes:
 *   0 — PASS: computed hash matches the fixture's stored hash.
 *   1 — FAIL: computed hash differs from the fixture's stored hash.
 *   2 — Input error: missing file, invalid JSON, missing fields.
 *
 * Output format (CI-friendly):
 *   PASS <tickCount> ticks
 *   FAIL expected <hash> got <actual>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRng } from '@europa/core';
import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '@europa/terrain';
import { checkVersionMismatch, replayMatch } from '../src/replay/replay';
import type { Fixture } from '../src/replay/types';
import { validateFixture } from '../src/replay/validate';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
    const fixturePath = process.argv[2];

    if (fixturePath === undefined || fixturePath === '') {
        console.error('Usage: tsx packages/engine/scripts/run.ts <fixture.json>');
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
        playerCount: fixture.settings.playerIds.length as 2 | 3 | 4,
        seed: fixture.seed,
        rng,
        settings: terrainSettings,
    });

    // 5. Replay and compare hash.
    try {
        const result = replayMatch(fixture, board);

        if (result.hash === fixture.finalStateHash) {
            console.log(`PASS ${String(result.tickCount)} ticks`);
            process.exit(0);
        } else {
            console.log(`FAIL expected ${fixture.finalStateHash} got ${result.hash}`);
            process.exit(1);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error during replay: ${message}`);
        process.exit(2);
    }
}

main();
