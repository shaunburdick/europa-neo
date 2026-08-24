/**
 * Elevation Generator Tests — Feature 003
 *
 * Verifies FR-004 (180° point symmetry) and INV-5/6 (every cell
 * matches its 180° partner byte-for-byte). The elevation map is
 * the foundation: water, cities, and validation all read it.
 *
 * The symmetry test is the strictest in the package — it asserts
 * byte-for-byte equality across 1024 cells (32×32) for elevation
 * at the 180°-rotated partner.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { _enforcePointSymmetry, generateElevationMap } from '../../src/elevation';
import { engineSfc32 } from '../fixtures/seeds';

describe('elevation', () => {
  describe('_enforcePointSymmetry (FR-004)', () => {
    it('every cell matches its 180° partner byte-for-byte on a 32x32 buffer', () => {
      const width = 32;
      const elev = new Uint8Array(width * width);
      // Fill with non-trivial data (a simple gradient so symmetry
      // violations are easy to spot).
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
          elev[y * width + x] = (x * 7 + y * 13) & 0xff;
        }
      }
      _enforcePointSymmetry(elev, width);
      // Every cell must equal its 180° partner.
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
          const partnerY = width - 1 - y;
          const partnerX = width - 1 - x;
          const a = elev[y * width + x];
          const b = elev[partnerY * width + partnerX];
          expect(a).toBe(b);
        }
      }
    });

    it('output values remain in [0, 255] (no out-of-range writes)', () => {
      const width = 16;
      const elev = new Uint8Array(width * width);
      elev.fill(255);
      _enforcePointSymmetry(elev, width);
      for (let i = 0; i < elev.length; i++) {
        expect(elev[i]).toBeGreaterThanOrEqual(0);
        expect(elev[i]).toBeLessThanOrEqual(255);
      }
    });

    it('returns the same Uint8Array reference (in-place mutation)', () => {
      const width = 16;
      const elev = new Uint8Array(width * width);
      const result = _enforcePointSymmetry(elev, width);
      expect(result).toBe(elev);
    });

    it('handles a square board of any size from 8 to 128 (sanity)', () => {
      for (const size of [8, 16, 24, 32, 48, 64, 96, 128]) {
        const elev = new Uint8Array(size * size);
        // Fill with deterministic but varied data.
        for (let i = 0; i < elev.length; i++) {
          elev[i] = (i * 17 + 3) & 0xff;
        }
        _enforcePointSymmetry(elev, size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const partnerY = size - 1 - y;
            const partnerX = size - 1 - x;
            expect(elev[y * size + x]).toBe(elev[partnerY * size + partnerX]);
          }
        }
      }
    });
  });

  describe('generateElevationMap (FR-002 / FR-004)', () => {
    it('produces a Uint8Array of length width*height with values in [0, 255]', () => {
      const rng = engineSfc32(42);
      const elev = generateElevationMap(rng, 32, 32, DEFAULT_GENERATION_SETTINGS);
      expect(elev.length).toBe(32 * 32);
      for (let i = 0; i < elev.length; i++) {
        expect(Number.isInteger(elev[i])).toBe(true);
        expect(elev[i]).toBeGreaterThanOrEqual(0);
        expect(elev[i]).toBeLessThanOrEqual(255);
      }
    });

    it('output is 180° point-symmetric (FR-004)', () => {
      const rng = engineSfc32(0xc0ffee);
      const elev = generateElevationMap(rng, 32, 32, DEFAULT_GENERATION_SETTINGS);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const partnerY = 32 - 1 - y;
          const partnerX = 32 - 1 - x;
          expect(elev[y * 32 + x]).toBe(elev[partnerY * 32 + partnerX]);
        }
      }
    });

    it('is deterministic for a given (rng, width, height, settings)', () => {
      const elev1 = generateElevationMap(engineSfc32(42), 32, 32, DEFAULT_GENERATION_SETTINGS);
      const elev2 = generateElevationMap(engineSfc32(42), 32, 32, DEFAULT_GENERATION_SETTINGS);
      expect(elev1).toEqual(elev2);
    });

    it('different seeds produce different elevation fields (smoke)', () => {
      const elev1 = generateElevationMap(engineSfc32(1), 32, 32, DEFAULT_GENERATION_SETTINGS);
      const elev2 = generateElevationMap(engineSfc32(2), 32, 32, DEFAULT_GENERATION_SETTINGS);
      // At least 1% of cells must differ.
      let differences = 0;
      for (let i = 0; i < elev1.length; i++) {
        if (elev1[i] !== elev2[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(elev1.length * 0.01);
    });

    it('produces non-flat output (INV-14: elevation variance > 0)', () => {
      const elev = generateElevationMap(engineSfc32(42), 32, 32, DEFAULT_GENERATION_SETTINGS);
      let min = 255;
      let max = 0;
      for (let i = 0; i < elev.length; i++) {
        if (elev[i] < min) {
          min = elev[i];
        }
        if (elev[i] > max) {
          max = elev[i];
        }
      }
      // With 4 octaves of fBm noise, the range is typically 100+.
      expect(max - min).toBeGreaterThan(50);
    });
  });
});
