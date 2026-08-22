/**
 * Determinism Integration Test — Feature 003
 *
 * SC-001 / FR-006 / US2 acceptance scenarios 1 & 2: same seed →
 * byte-identical Board; distinct seeds → distinct Boards.
 *
 * 1000 trials. For each seed, two parallel `Rng` instances are
 * constructed, `generateBoard` is called on each, and the results
 * are compared via `hashBoard`.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

describe('determinism (SC-001, FR-006, US2)', () => {
  it('1000 trials: same seed → byte-identical Board', () => {
    const seeds = goldenSeeds(1000);
    for (const seed of seeds) {
      const reqA = {
        boardSize: 32,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
      };
      const reqB = {
        boardSize: 32,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
      };
      const a = generateBoard(reqA);
      const b = generateBoard(reqB);
      expect(hashBoard(a.board)).toBe(hashBoard(b.board));
      expect(a.effectiveSeed).toBe(b.effectiveSeed);
    }
  });

  it('distinct seeds produce distinct Board hashes (US2 acceptance scenario 2)', () => {
    const seeds = goldenSeeds(100);
    const hashes = new Set<string>();
    for (const seed of seeds) {
      const req = {
        boardSize: 32,
        playerCount: 2 as const,
        seed,
        rng: engineSfc32(seed),
        settings: DEFAULT_GENERATION_SETTINGS,
      };
      const result = generateBoard(req);
      hashes.add(hashBoard(result.board));
    }
    // 100 distinct seeds should give 100 distinct Board hashes.
    // (Hash collision in 64-bit FNV-1a is ~2^-64, effectively zero.)
    expect(hashes.size).toBe(100);
  });
});
