/**
 * Range Helper Tests — Feature 002 (Wave 5A)
 *
 * Basic smoke tests for the Chebyshev range helpers in
 * `src/range.ts`. The full coverage (multi-viewer union, edge
 * clipping at every corner, integer-only math) lands in
 * Phase 3 alongside `visibleSet.ts` and the Q-F01 / Q-F08
 * quickstart tests.
 */

import { describe, expect, it } from 'vitest';

import { chebyshevDisk, chebyshevDistance } from '../../src/range';

describe('chebyshevDistance', () => {
  it('returns 0 for the same cell', () => {
    expect(chebyshevDistance(5, 5, 5, 5)).toBe(0);
  });

  it('is the max of |dx| and |dy|', () => {
    expect(chebyshevDistance(0, 0, 3, 0)).toBe(3);
    expect(chebyshevDistance(0, 0, 0, 3)).toBe(3);
    expect(chebyshevDistance(0, 0, 3, 4)).toBe(4);
    expect(chebyshevDistance(0, 0, 4, 3)).toBe(4);
  });

  it('is symmetric', () => {
    expect(chebyshevDistance(2, 5, 8, 1)).toBe(chebyshevDistance(8, 1, 2, 5));
    expect(chebyshevDistance(10, 10, 0, 0)).toBe(chebyshevDistance(0, 0, 10, 10));
  });

  it('handles negative-direction differences (always non-negative)', () => {
    expect(chebyshevDistance(8, 8, 2, 5)).toBe(6);
    expect(chebyshevDistance(2, 5, 8, 8)).toBe(6);
  });
});

describe('chebyshevDisk', () => {
  it('radius 0 returns exactly the center cell', () => {
    const disk = chebyshevDisk({ x: 5, y: 5 }, 0, 16, 16);
    expect(disk).toEqual([{ x: 5, y: 5 }]);
  });

  it('radius 1 returns 9 cells (3×3 square) at the center of a 16×16 board', () => {
    const disk = chebyshevDisk({ x: 8, y: 8 }, 1, 16, 16);
    expect(disk.length).toBe(9);
    // Row-major order: y outer, x inner
    expect(disk[0]).toEqual({ x: 7, y: 7 });
    expect(disk[1]).toEqual({ x: 8, y: 7 });
    expect(disk[2]).toEqual({ x: 9, y: 7 });
    expect(disk[3]).toEqual({ x: 7, y: 8 });
    expect(disk[4]).toEqual({ x: 8, y: 8 });
    expect(disk[5]).toEqual({ x: 9, y: 8 });
    expect(disk[6]).toEqual({ x: 7, y: 9 });
    expect(disk[7]).toEqual({ x: 8, y: 9 });
    expect(disk[8]).toEqual({ x: 9, y: 9 });
  });

  it('radius 2 returns 25 cells (5×5 square)', () => {
    const disk = chebyshevDisk({ x: 8, y: 8 }, 2, 16, 16);
    expect(disk.length).toBe(25);
  });

  it('clips out-of-bounds cells at the left/top edge', () => {
    // Center (1, 1), radius 2 — would be a 5×5 square from (-1, -1)
    // to (3, 3); should clip to (0, 0)..(3, 3) = 16 cells.
    const disk = chebyshevDisk({ x: 1, y: 1 }, 2, 16, 16);
    expect(disk.length).toBe(16);
    expect(disk[0]).toEqual({ x: 0, y: 0 });
  });

  it('clips out-of-bounds cells at the right/bottom edge', () => {
    // Center (14, 14) on 16×16, radius 2 — 5×5 square from (12, 12)
    // to (16, 16); should clip to (12, 12)..(15, 15) = 16 cells.
    const disk = chebyshevDisk({ x: 14, y: 14 }, 2, 16, 16);
    expect(disk.length).toBe(16);
    expect(disk[0]).toEqual({ x: 12, y: 12 });
    expect(disk[15]).toEqual({ x: 15, y: 15 });
  });

  it('viewer at (0, 0) with radius 1 produces 4 cells (clip from 9)', () => {
    // The corner clip test — Q-F08.
    const disk = chebyshevDisk({ x: 0, y: 0 }, 1, 16, 16);
    expect(disk.length).toBe(4);
    expect(disk).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('viewer at (15, 15) on 16×16 with radius 1 produces 4 cells', () => {
    const disk = chebyshevDisk({ x: 15, y: 15 }, 1, 16, 16);
    expect(disk.length).toBe(4);
    expect(disk).toEqual([
      { x: 14, y: 14 },
      { x: 15, y: 14 },
      { x: 14, y: 15 },
      { x: 15, y: 15 },
    ]);
  });

  it('throws on negative radius', () => {
    expect(() => chebyshevDisk({ x: 5, y: 5 }, -1, 16, 16)).toThrow(/r/);
  });

  it('throws on non-positive board dimensions', () => {
    expect(() => chebyshevDisk({ x: 5, y: 5 }, 1, 0, 16)).toThrow(/width/);
    expect(() => chebyshevDisk({ x: 5, y: 5 }, 1, 16, 0)).toThrow(/height/);
    expect(() => chebyshevDisk({ x: 5, y: 5 }, 1, 16, -1)).toThrow(/height/);
  });

  it('returns row-major order (y outer, x inner)', () => {
    // Three rows × three columns; assert the order is y=0, x=0,1,2
    // then y=1, x=0,1,2 then y=2, x=0,1,2.
    const disk = chebyshevDisk({ x: 1, y: 1 }, 1, 3, 3);
    expect(disk).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it('is deterministic (same inputs produce same array)', () => {
    const a = chebyshevDisk({ x: 8, y: 8 }, 3, 16, 16);
    const b = chebyshevDisk({ x: 8, y: 8 }, 3, 16, 16);
    expect(a).toEqual(b);
  });
});
