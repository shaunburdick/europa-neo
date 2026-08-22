/**
 * Mask Helper Tests — Feature 002 (Wave 5A)
 *
 * Basic smoke tests for the binary mask helpers in
 * `src/mask.ts`. These are foundational — every downstream
 * module (US1's `computeVisibleSet`, US2's redaction test,
 * the determinism test) depends on the mask contract. The
 * exhaustive tests (mask-union-of-non-overlapping-disks,
 * mask-allocation-zero-init invariants, etc.) land in Phase 3
 * alongside `visibleSet.ts`.
 *
 * Mirrors the engine's per-module test pattern: one test file
 * per source module, smoke tests here, full coverage in the
 * user's story phase.
 */

import { describe, expect, it } from 'vitest';

import { createMask, isVisible as isCellMarked, markVisible, unionMasks } from '../../src/mask';

describe('mask helpers', () => {
  describe('createMask', () => {
    it('returns a mask of the requested dimensions', () => {
      const m = createMask(8, 4);
      expect(m.width).toBe(8);
      expect(m.height).toBe(4);
      expect(m.data).toBeInstanceOf(Uint8Array);
      expect(m.data.length).toBe(32);
    });

    it('zero-initializes the buffer (no-memory rule)', () => {
      const m = createMask(4, 4);
      for (let i = 0; i < m.data.length; i++) {
        expect(m.data[i]).toBe(0);
      }
    });

    it('throws on non-positive width', () => {
      expect(() => createMask(0, 4)).toThrow(/width/);
      expect(() => createMask(-1, 4)).toThrow(/width/);
    });

    it('throws on non-positive height', () => {
      expect(() => createMask(4, 0)).toThrow(/height/);
      expect(() => createMask(4, -2)).toThrow(/height/);
    });

    it('throws on non-integer dimensions', () => {
      expect(() => createMask(1.5, 4)).toThrow(/width/);
      expect(() => createMask(4, 2.5)).toThrow(/height/);
    });
  });

  describe('markVisible / isCellMarked', () => {
    it('round-trips a single cell', () => {
      const m = createMask(4, 4);
      markVisible(m, 1, 2);
      expect(isCellMarked(m, 1, 2)).toBe(true);
      expect(isCellMarked(m, 0, 0)).toBe(false);
      expect(isCellMarked(m, 3, 3)).toBe(false);
    });

    it('is a no-op for out-of-bounds coords', () => {
      const m = createMask(4, 4);
      markVisible(m, -1, 0);
      markVisible(m, 4, 0);
      markVisible(m, 0, 4);
      // No throw, no mutation
      expect(m.data.every((b) => b === 0)).toBe(true);
    });

    it('isCellMarked returns false for out-of-bounds coords', () => {
      const m = createMask(4, 4);
      expect(isCellMarked(m, -1, 0)).toBe(false);
      expect(isCellMarked(m, 4, 0)).toBe(false);
      expect(isCellMarked(m, 0, -1)).toBe(false);
      expect(isCellMarked(m, 0, 4)).toBe(false);
    });
  });

  describe('unionMasks', () => {
    it('ORs two masks in place (disjoint case)', () => {
      const a = createMask(4, 4);
      const b = createMask(4, 4);
      markVisible(a, 0, 0);
      markVisible(a, 1, 1);
      markVisible(b, 2, 2);
      markVisible(b, 3, 3);
      unionMasks(a, b);
      expect(isCellMarked(a, 0, 0)).toBe(true);
      expect(isCellMarked(a, 1, 1)).toBe(true);
      expect(isCellMarked(a, 2, 2)).toBe(true);
      expect(isCellMarked(a, 3, 3)).toBe(true);
      expect(isCellMarked(a, 2, 0)).toBe(false);
    });

    it('ORs two masks in place (overlapping case)', () => {
      const a = createMask(4, 4);
      const b = createMask(4, 4);
      markVisible(a, 1, 1);
      markVisible(b, 1, 1);
      markVisible(b, 2, 2);
      unionMasks(a, b);
      expect(isCellMarked(a, 1, 1)).toBe(true);
      expect(isCellMarked(a, 2, 2)).toBe(true);
    });

    it('does not mutate the source', () => {
      const a = createMask(4, 4);
      const b = createMask(4, 4);
      markVisible(a, 0, 0);
      markVisible(b, 1, 1);
      unionMasks(a, b);
      // `b` should be unchanged
      expect(isCellMarked(b, 0, 0)).toBe(false);
      expect(isCellMarked(b, 1, 1)).toBe(true);
    });

    it('throws on dimension mismatch', () => {
      const a = createMask(4, 4);
      const b = createMask(4, 8);
      expect(() => unionMasks(a, b)).toThrow(/dimension mismatch/);
    });
  });
});
