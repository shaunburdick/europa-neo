/**
 * Subcell parity test — Feature 005 (T064).
 *
 * The regression check for quickstart.md §11: every hand-curated
 * `(cursorPx, source, expectedTarget)` pair in
 * `tests/fixtures/original-subcell.json` must match the console's
 * `subcellToTargetCoord` output exactly. The fixture data points are
 * transcribed from the original Europa's DOCUMENTED behavior
 * (`europa-source/.../controls.html`: "moving the cursor into the red
 * subcell ... would throw paratroopers two units north and two units
 * east") plus systematic bin-boundary cases from the contract's
 * threshold rule — no original code was copied (AGENTS.md rule 5).
 *
 * Catches accidental drift in the subcell targeting math (spec US3
 * AC-1/AC-2, FR-005).
 */

import { describe, expect, test } from 'vitest';

import { subcellToTargetCoord } from '../../src/input/subcell';
import parityPairs from '../fixtures/original-subcell.json' with { type: 'json' };

describe('subcell parity vs the original (T064)', () => {
  test('every fixture pair matches subcellToTargetCoord', () => {
    expect(parityPairs.length).toBeGreaterThanOrEqual(20);
    for (const pair of parityPairs) {
      const target = subcellToTargetCoord(pair.source, pair.cursorPx);
      expect(`${target.x},${target.y}`, `fixture pair ${JSON.stringify(pair)} diverged`).toBe(
        `${pair.expectedTarget.x},${pair.expectedTarget.y}`,
      );
    }
  });

  test('the documented NE ring-2 example is present and exact', () => {
    // controls.html: red subcell toward top-right → 2 north, 2 east.
    const target = subcellToTargetCoord({ x: 10, y: 10 }, { x: 0.85, y: 0.15 });
    expect(target).toEqual({ x: 12, y: 8 });
  });
});
