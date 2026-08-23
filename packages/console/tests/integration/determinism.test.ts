/**
 * Determinism integration test — Feature 005 (T090, SC-002).
 *
 * Re-runs the scripted 1000-tick scenario through the REAL pipeline
 * (tick NetEvent → reducer → PlayerAction → reducer → buildMapView)
 * and asserts the serialized frame array is byte-identical to the
 * committed golden fixture `tests/fixtures/golden-1000-tick.json`
 * (plus the final ConsoleState snapshot).
 *
 * Zero divergence is the spec bar: any intentional change to the
 * render pipeline requires regenerating the fixture via
 * `scripts/generate-determinism-golden.ts` and diff-reviewing it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  runDeterminismScenario,
  SCENARIO_TICKS,
  type ScenarioRun,
} from '../fixtures/determinism-scenario';

interface GoldenFixture {
  readonly meta: { readonly ticks: number; readonly boardSize: number; readonly tickMs: number };
  readonly frames: ScenarioRun['frames'];
  readonly finalState: ScenarioRun['finalState'];
}

const GOLDEN_PATH = resolve(__dirname, '..', 'fixtures', 'golden-1000-tick.json');

describe('determinism: 1000-tick scripted match (T090 / SC-002)', () => {
  const run = runDeterminismScenario();
  let golden: GoldenFixture;

  it('the golden fixture exists and covers 1000 ticks', () => {
    golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenFixture;
    expect(golden.meta.ticks).toBe(SCENARIO_TICKS);
    expect(golden.frames).toHaveLength(SCENARIO_TICKS);
  });

  it('every rendered frame matches the golden fixture byte-for-byte', () => {
    expect(run.frames.length).toBe(SCENARIO_TICKS);
    // Stringify once and compare whole arrays: a single divergent
    // byte anywhere fails (zero-divergence bar, not per-field).
    expect(JSON.stringify(run.frames)).toBe(JSON.stringify(golden.frames));
  });

  it('the final ConsoleState matches the golden fixture', () => {
    if (golden === undefined) {
      golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenFixture;
    }
    expect(JSON.stringify(run.finalState)).toBe(JSON.stringify(golden.finalState));
  });
});
