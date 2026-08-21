/**
 * Index Barrel Tests — Feature 003
 *
 * Verifies that the public surface (`src/index.ts`) re-exports every
 * foundational symbol correctly. Phase 3 algorithm functions
 * (`generateBoard`, `validateBoard`, `hashBoard`, `assertBoardMatchesConfig`)
 * are forward-declared and throw on call; we verify they exist and
 * throw the expected sentinel error.
 */

import { describe, expect, it } from 'vitest';

import * as terrain from '../../src/index';

describe('terrain package barrel', () => {
  describe('foundational exports', () => {
    it('re-exports TERRAIN_CONSTANTS as an object with the expected shape', () => {
      expect(terrain.TERRAIN_CONSTANTS).toBeDefined();
      expect(terrain.TERRAIN_CONSTANTS.minElevation).toBe(0);
      expect(terrain.TERRAIN_CONSTANTS.maxElevation).toBe(255);
      expect(terrain.TERRAIN_CONSTANTS.minBoardSize).toBe(8);
      expect(terrain.TERRAIN_CONSTANTS.maxBoardSize).toBe(128);
      expect(terrain.TERRAIN_CONSTANTS.defaultSettings).toBeDefined();
      expect(terrain.TERRAIN_CONSTANTS.defaultSettings.waterRatio).toBe(0.1);
    });

    it('re-exports TERRAIN_API_VERSION as a string', () => {
      expect(typeof terrain.TERRAIN_API_VERSION).toBe('string');
      expect(terrain.TERRAIN_API_VERSION).toBe('0.1.0');
    });

    it('re-exports DEFAULT_GENERATION_SETTINGS', () => {
      expect(terrain.DEFAULT_GENERATION_SETTINGS).toBeDefined();
      expect(terrain.DEFAULT_GENERATION_SETTINGS.octaves).toBe(4);
      expect(terrain.DEFAULT_GENERATION_SETTINGS.symmetryStrategy).toBe('point');
    });

    it('re-exports GenerationError as a class', () => {
      expect(typeof terrain.GenerationError).toBe('function');
      const e = new terrain.GenerationError('test', {
        kind: 'invalid_request',
        attempts: 0,
        lastReport: null,
      });
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('GenerationError');
      expect(e.kind).toBe('invalid_request');
    });

    it('re-exports rng-adapter helpers', () => {
      expect(typeof terrain.deriveSubstream).toBe('function');
      expect(typeof terrain.mixSeed).toBe('function');
      // Spot-check a deterministic mixSeed call.
      expect(terrain.mixSeed(42, 0)).toBe(terrain.mixSeed(42, 0));
    });

    it('re-exports settings helpers', () => {
      expect(typeof terrain.resolveSettings).toBe('function');
      expect(typeof terrain.validateSettings).toBe('function');
      expect(terrain.resolveSettings({})).toEqual(terrain.DEFAULT_GENERATION_SETTINGS);
    });

    it('re-exports symmetry helpers', () => {
      expect(typeof terrain.rotate180).toBe('function');
      expect(typeof terrain.rotate180Index).toBe('function');
      expect(terrain.rotate180(0, 0, 4, 4)).toEqual({ x: 3, y: 3 });
    });
  });

  describe('Phase 3 forward declarations', () => {
    it('generateBoard exists and throws "not yet implemented"', () => {
      expect(typeof terrain.generateBoard).toBe('function');
      // Build a minimal request; it should throw because the function
      // is a forward declaration.
      const fakeReq = {
        boardSize: 32,
        playerCount: 2 as const,
        seed: 42,
        // `Rng` is callable; return a constant uint32.
        rng: () => 0,
        settings: terrain.DEFAULT_GENERATION_SETTINGS,
      };
      expect(() => terrain.generateBoard(fakeReq)).toThrow(/not yet implemented/);
    });

    it('assertBoardMatchesConfig exists and throws "not yet implemented"', () => {
      expect(typeof terrain.assertBoardMatchesConfig).toBe('function');
      const fakeBoard = {
        width: 32,
        height: 32,
        cells: [],
        cities: [],
      };
      const fakeConfig = {
        boardSize: 32,
        playerCount: 2 as const,
        tickIntervalMs: 250,
        seed: 42,
        visibilityRadius: 4,
      };
      expect(() => terrain.assertBoardMatchesConfig(fakeBoard, fakeConfig)).toThrow(
        /not yet implemented/,
      );
    });

    it('validateBoard exists and throws "not yet implemented"', () => {
      expect(typeof terrain.validateBoard).toBe('function');
      const fakeBoard = { width: 32, height: 32, cells: [], cities: [] };
      expect(() =>
        terrain.validateBoard(fakeBoard, terrain.DEFAULT_GENERATION_SETTINGS, 2),
      ).toThrow(/not yet implemented/);
    });

    it('hashBoard exists and throws "not yet implemented"', () => {
      expect(typeof terrain.hashBoard).toBe('function');
      const fakeBoard = { width: 32, height: 32, cells: [], cities: [] };
      expect(() => terrain.hashBoard(fakeBoard)).toThrow(/not yet implemented/);
    });

    it('_internal helpers exist and throw "not yet implemented"', () => {
      expect(typeof terrain._generateElevationMap).toBe('function');
      expect(typeof terrain._enforcePointSymmetry).toBe('function');
      expect(typeof terrain._extractWater).toBe('function');
      expect(typeof terrain._placeCities).toBe('function');

      const elev = new Uint8Array(32 * 32);
      const water = new Uint8Array(32 * 32);
      const rng = () => 0;

      expect(() =>
        terrain._generateElevationMap(rng, 32, 32, terrain.DEFAULT_GENERATION_SETTINGS),
      ).toThrow(/not yet implemented/);
      expect(() => terrain._enforcePointSymmetry(elev, 32)).toThrow(/not yet implemented/);
      expect(() => terrain._extractWater(elev, 32, 32, 0.1)).toThrow(/not yet implemented/);
      expect(() =>
        terrain._placeCities({
          elev,
          water,
          width: 32,
          height: 32,
          playerCount: 2,
          settings: terrain.DEFAULT_GENERATION_SETTINGS,
          rng,
        }),
      ).toThrow(/not yet implemented/);
    });
  });
});
