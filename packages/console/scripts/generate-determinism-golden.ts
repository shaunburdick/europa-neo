/**
 * Golden-fixture generator — Feature 005 (T090).
 *
 * Regenerates `tests/fixtures/golden-1000-tick.json` from
 * {@link runDeterminismScenario}. Run after ANY intentional change to
 * the render pipeline, and diff-review the output: a change here is a
 * rendered-output change (SC-002 discipline).
 *
 * Usage: pnpm --filter @europa/console exec tsx scripts/generate-determinism-golden.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runDeterminismScenario } from '../tests/fixtures/determinism-scenario';

const OUT = resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'golden-1000-tick.json');

const run = runDeterminismScenario();
const payload = {
  meta: {
    ticks: run.frames.length,
    boardSize: 16,
    tickMs: 250,
    description:
      'Golden MapView snapshots for the 1000-tick scripted console scenario (SC-002). ' +
      'Regenerate with scripts/generate-determinism-golden.ts; diff-review every change.',
  },
  frames: run.frames,
  finalState: run.finalState,
};

writeFileSync(OUT, `${JSON.stringify(payload)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT} (${run.frames.length} frames)\n`);
