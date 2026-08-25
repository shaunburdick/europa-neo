/**
 * Index Barrel Tests — Feature 003
 *
 * Verifies that the public surface (`src/index.ts`) re-exports every
 * foundational symbol correctly. Phase 3+4 algorithm functions
 * (`generateBoard`, `validateBoard`, `hashBoard`, `assertBoardMatchesConfig`,
 * city-placement, etc.) are fully implemented; we verify they exist
 * and can be invoked.
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

    describe('Phase 3+4 algorithm exports (US1 + US2)', () => {
        it('generateBoard is implemented and callable', () => {
            expect(typeof terrain.generateBoard).toBe('function');
        });

        it('assertBoardMatchesConfig is implemented and callable', () => {
            expect(typeof terrain.assertBoardMatchesConfig).toBe('function');
        });

        it('validateBoard is implemented and callable', () => {
            expect(typeof terrain.validateBoard).toBe('function');
        });

        it('hashBoard is implemented and callable', () => {
            expect(typeof terrain.hashBoard).toBe('function');
        });

        it('algorithm helpers are exposed', () => {
            expect(typeof terrain._enforcePointSymmetry).toBe('function');
            expect(typeof terrain._extractWater).toBe('function');
            expect(typeof terrain.getPlayerBand).toBe('function');
            expect(typeof terrain.placeCitiesInBand).toBe('function');
            expect(typeof terrain.enforceCitySymmetry).toBe('function');
            expect(typeof terrain.resolveCityCount).toBe('function');
            expect(typeof terrain.generateElevationMap).toBe('function');
            expect(typeof terrain.fbm).toBe('function');
            expect(typeof terrain.valueNoise).toBe('function');
            expect(typeof terrain.buildBoard).toBe('function');
            expect(typeof terrain.extractWater).toBe('function');
        });
    });
});
