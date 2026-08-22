/**
 * SC-001 Determinism Integration Test — Feature 003 (T049)
 *
 * Extended determinism test that asserts `hashBoard` byte-identity
 * over 10,000 different seeds (stronger than `T034`'s 1000 trials
 * and `quickstart.md` Q-T01's 1000). Each seed is run twice (with
 * two parallel sfc32 instances) and the hashes must match.
 *
 * Reported numbers feed the constitution Principle II determinism
 * gate: a 100% pass rate at this scale demonstrates the generator
 * is structurally deterministic, not "lucky" at the spec's 1000
 * threshold.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const SC_001_TRIALS = 10_000;

describe('SC-001 determinism at 10k seeds (10x spec)', () => {
  it(`${String(SC_001_TRIALS)} trials: same seed + same PRNG state → byte-identical Board`, {
    timeout: 60_000,
  }, () => {
    const seeds = goldenSeeds(SC_001_TRIALS);
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

  it(`${String(SC_001_TRIALS)} trials: distinct seeds produce distinct Board hashes (US2 acceptance scenario 2)`, {
    timeout: 60_000,
  }, () => {
    const seeds = goldenSeeds(SC_001_TRIALS);
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
    // We expect 100% distinct hashes (no 64-bit FNV-1a collisions at
    // this scale — ~2^-64 collision probability per pair).
    expect(hashes.size).toBe(SC_001_TRIALS);
  });
});
