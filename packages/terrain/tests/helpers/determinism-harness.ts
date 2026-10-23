/**
 * Determinism harness — Feature 003 (SC-001 / FR-006).
 *
 * Both determinism suites sample the same two properties over the golden
 * seed sequence at different trial counts: the same seed produces a
 * byte-identical board twice, and distinct seeds produce distinct board
 * hashes.
 */

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import type { TerrainGenerationRequest } from '../../src/contracts/terrain-types';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

/** Board shape and player count the determinism suites sample. */
const BOARD_SIZE = 32;
const PLAYER_COUNT = 2 as const;

/** Names of the determinism properties a run can violate. */
export type DeterminismInvariant = 'same-seed identity' | 'distinct-seed distinctness';

/** One invariant violation, with the seed that exposed it. */
export interface DeterminismFailure {
    readonly seed: number;
    readonly invariant: DeterminismInvariant;
    readonly detail: string;
}

/**
 * Generate each of `trials` golden seeds twice and return every violation
 * of same-seed identity or distinct-seed distinctness.
 *
 * @param trials Number of seeds to sample (200 in the base suite, 1000 in
 *               the SC-001 suite).
 * @returns All failures; an empty array means both properties held.
 */
export function findDeterminismFailures(trials: number): DeterminismFailure[] {
    const failures: DeterminismFailure[] = [];
    const firstSeedForHash = new Map<string, number>();
    for (const seed of goldenSeeds(trials)) {
        const a = generateBoard(makeRequest(seed));
        const b = generateBoard(makeRequest(seed));
        const hash = hashBoard(a.board);

        if (hashBoard(b.board) !== hash) {
            failures.push({
                seed,
                invariant: 'same-seed identity',
                detail: 'two runs of the same seed produced different board hashes',
            });
        }
        if (a.effectiveSeed !== b.effectiveSeed) {
            failures.push({
                seed,
                invariant: 'same-seed identity',
                detail: `effectiveSeed differs between runs (${String(a.effectiveSeed)} vs ${String(b.effectiveSeed)})`,
            });
        }

        const firstSeed = firstSeedForHash.get(hash);
        if (firstSeed === undefined) {
            firstSeedForHash.set(hash, seed);
        } else {
            failures.push({
                seed,
                invariant: 'distinct-seed distinctness',
                detail: `shares hash ${hash} with seed ${String(firstSeed)}`,
            });
        }
    }
    return failures;
}

/** Build the request both runs share. */
function makeRequest(seed: number): TerrainGenerationRequest {
    return {
        boardSize: BOARD_SIZE,
        playerCount: PLAYER_COUNT,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
    };
}
