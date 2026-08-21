/**
 * Symmetry Helper Tests — Feature 003
 *
 * Verifies the round-trip and basic correctness of `rotate180` and
 * `rotate180Index`. The round-trip invariant
 * (`rotate180(rotate180(c)) === c`) is the foundation of FR-004's
 * 180° point-symmetry guarantee.
 */

import { describe, expect, it } from 'vitest';

import { rotate180, rotate180Index } from '../../src/symmetry';

describe('symmetry', () => {
  describe('rotate180', () => {
    it('maps (0, 0) to (width - 1, height - 1)', () => {
      const result = rotate180(0, 0, 32, 32);
      expect(result).toEqual({ x: 31, y: 31 });
    });

    it('maps the center cell to itself on an odd-sized board', () => {
      // 5x5 center is (2, 2); rotating 180° around the center keeps it.
      const result = rotate180(2, 2, 5, 5);
      expect(result).toEqual({ x: 2, y: 2 });
    });

    it('swaps opposite corners on an even-sized board', () => {
      // 4x4: (0, 0) ↔ (3, 3), (0, 3) ↔ (3, 0), etc.
      expect(rotate180(0, 0, 4, 4)).toEqual({ x: 3, y: 3 });
      expect(rotate180(3, 3, 4, 4)).toEqual({ x: 0, y: 0 });
      expect(rotate180(0, 3, 4, 4)).toEqual({ x: 3, y: 0 });
      expect(rotate180(3, 0, 4, 4)).toEqual({ x: 0, y: 3 });
    });

    it('round-trips for every cell on a 32x32 board', () => {
      const width = 32;
      const height = 32;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const once = rotate180(x, y, width, height);
          const twice = rotate180(once.x, once.y, width, height);
          expect(twice).toEqual({ x, y });
        }
      }
    });

    it('round-trips for every cell on a non-square (defensive) board', () => {
      // The generator never produces non-square boards, but the helper
      // should still behave correctly on arbitrary rects (used by the
      // engine in unrelated contexts, possibly).
      const width = 7;
      const height = 5;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const once = rotate180(x, y, width, height);
          const twice = rotate180(once.x, once.y, width, height);
          expect(twice).toEqual({ x, y });
        }
      }
    });
  });

  describe('rotate180Index', () => {
    it('round-trips for every cell on a 32x32 board', () => {
      const width = 32;
      const height = 32;
      for (let i = 0; i < width * height; i++) {
        const j = rotate180Index(i, width, height);
        const k = rotate180Index(j, width, height);
        expect(k).toBe(i);
      }
    });

    it('agrees with rotate180 when converted via divmod', () => {
      const width = 8;
      const height = 8;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const j = rotate180Index(i, width, height);
          // Convert back to coord.
          const jy = Math.floor(j / width);
          const jx = j % width;
          expect(rotate180(x, y, width, height)).toEqual({ x: jx, y: jy });
        }
      }
    });

    it('returns width * height - 1 - i for a square board (a useful identity)', () => {
      // On a square board, `rotate180Index(i, w, w) === w*w - 1 - i`.
      // This is a tested consequence of the formula; not used by
      // production code, but it's a nice sanity-check.
      const width = 16;
      const height = 16;
      for (let i = 0; i < width * height; i++) {
        expect(rotate180Index(i, width, height)).toBe(width * height - 1 - i);
      }
    });
  });
});
