/**
 * Contract Conformance Integration Test — Feature 003 (T048)
 *
 * Covers Q-T08 from `quickstart.md` and the engine ↔ terrain
 * conformance gate from `engine-to-terrain.ts`. Generates 1000
 * Boards using `goldenSeeds(1000)` and asserts every one of them
 * passes the terrain package's `assertBoardMatchesConfig` (mirrors
 * the engine-side check, used as a defensive layer by feature 006
 * matchmaking when loading a stored Board).
 *
 * If this test fails, the generator produced a Board the engine
 * cannot accept — a hard contract violation that blocks feature
 * 001's `createWorld` from consuming the terrain output.
 */

import type { MatchConfig } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import { assertBoardMatchesConfig } from '../../src/board';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

describe('contract conformance (Q-T08, engine ↔ terrain gate)', () => {
    // 1000-board loop exceeds the default 5s timeout under coverage
    // instrumentation on loaded CI runners (~2.3s locally, uncapped headroom).
    it('1000 generated Boards all pass assertBoardMatchesConfig', { timeout: 60_000 }, () => {
        const seeds = goldenSeeds(1000);
        for (const seed of seeds) {
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed,
                rng: engineSfc32(seed),
                settings: DEFAULT_GENERATION_SETTINGS,
            };
            const result = generateBoard(req);
            const config: MatchConfig = {
                boardSize: 32,
                playerCount: 2,
                tickIntervalMs: 250,
                seed,
                visibilityRadius: 2,
            };
            // Throws on failure; the expect never fires if it succeeds.
            expect(() => assertBoardMatchesConfig(result.board, config)).not.toThrow();
        }
    });
});
