/**
 * Settings Tests — Feature 003
 *
 * Verifies the merge behavior of `resolveSettings` and the
 * shape-validation behavior of `validateSettings`. Range clamping
 * is tested separately (`tests/unit/clamp.test.ts`, US3 / T044).
 */

import { describe, expect, it } from 'vitest';

import {
    DEFAULT_GENERATION_SETTINGS,
    GenerationError,
    type GenerationSettings,
} from '../../src/contracts/terrain-types';
import { resolveSettings, validateSettings } from '../../src/settings';

describe('settings', () => {
    describe('resolveSettings', () => {
        it('returns a complete settings object identical to defaults when given {}', () => {
            const result = resolveSettings({});
            expect(result).toEqual(DEFAULT_GENERATION_SETTINGS);
        });

        it('fills in only the missing fields when one is overridden', () => {
            const result = resolveSettings({ waterRatio: 0.2 });
            expect(result.waterRatio).toBe(0.2);
            expect(result.roughness).toBe(DEFAULT_GENERATION_SETTINGS.roughness);
            expect(result.octaves).toBe(DEFAULT_GENERATION_SETTINGS.octaves);
            expect(result.citiesPerPlayer).toBe(DEFAULT_GENERATION_SETTINGS.citiesPerPlayer);
            expect(result.symmetryStrategy).toBe(DEFAULT_GENERATION_SETTINGS.symmetryStrategy);
            expect(result.minCityWaterDistance).toBe(DEFAULT_GENERATION_SETTINGS.minCityWaterDistance);
            expect(result.minCityCityDistance).toBe(DEFAULT_GENERATION_SETTINGS.minCityCityDistance);
            expect(result.maxRegenAttempts).toBe(DEFAULT_GENERATION_SETTINGS.maxRegenAttempts);
        });

        it('overrides every field when given a fully-populated partial', () => {
            const full: GenerationSettings = {
                waterRatio: 0.05,
                roughness: 0.3,
                octaves: 2,
                citiesPerPlayer: 3,
                symmetryStrategy: 'point',
                minCityWaterDistance: 1,
                minCityCityDistance: 2,
                maxRegenAttempts: 10,
                terrainSmoothing: 2,
            };
            // `resolveSettings` accepts `Partial<GenerationSettings>`, so a
            // fully-populated value passes the type check.
            const result = resolveSettings(full);
            expect(result).toEqual(full);
        });

        it('falls back to the default terrainSmoothing when omitted', () => {
            const result = resolveSettings({ waterRatio: 0.2 });
            expect(result.terrainSmoothing).toBe(DEFAULT_GENERATION_SETTINGS.terrainSmoothing);
        });

        it('overrides terrainSmoothing when supplied', () => {
            const result = resolveSettings({ terrainSmoothing: 0 });
            expect(result.terrainSmoothing).toBe(0);
        });

        it('treats explicit undefined as "use the default"', () => {
            // `Partial<GenerationSettings>` allows `undefined` per the index
            // signature's permissive typing under `exactOptionalPropertyTypes`;
            // the `??` fallback ensures we still resolve to defaults.
            const result = resolveSettings({ waterRatio: undefined });
            expect(result.waterRatio).toBe(DEFAULT_GENERATION_SETTINGS.waterRatio);
        });
    });

    describe('validateSettings', () => {
        it('passes on the default settings', () => {
            expect(() => validateSettings(DEFAULT_GENERATION_SETTINGS)).not.toThrow();
        });

        it('throws GenerationError(invalid_request) on non-integer octaves', () => {
            const bad: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                octaves: 3.5,
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
            try {
                validateSettings(bad);
            } catch (err) {
                expect(err).toBeInstanceOf(GenerationError);
                if (err instanceof GenerationError) {
                    expect(err.kind).toBe('invalid_request');
                    expect(err.message).toMatch(/octaves/);
                }
            }
        });

        it('throws on non-integer citiesPerPlayer', () => {
            const bad: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                citiesPerPlayer: 1.5,
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
        });

        it('throws on non-integer terrainSmoothing', () => {
            const bad: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                terrainSmoothing: 2.5,
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
            try {
                validateSettings(bad);
            } catch (err) {
                expect(err).toBeInstanceOf(GenerationError);
                if (err instanceof GenerationError) {
                    expect(err.kind).toBe('invalid_request');
                    expect(err.message).toMatch(/terrainSmoothing/);
                }
            }
        });

        it('accepts in-range integer terrainSmoothing values (0 and 8)', () => {
            expect(() => validateSettings({ ...DEFAULT_GENERATION_SETTINGS, terrainSmoothing: 0 })).not.toThrow();
            expect(() => validateSettings({ ...DEFAULT_GENERATION_SETTINGS, terrainSmoothing: 8 })).not.toThrow();
        });

        it('throws on NaN waterRatio', () => {
            const bad: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                waterRatio: Number.NaN,
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
        });

        it('throws on Infinity roughness', () => {
            const bad: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                roughness: Number.POSITIVE_INFINITY,
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
        });

        it('throws on unknown symmetryStrategy', () => {
            // Bypass the type system to assert runtime validation catches a
            // bogus value.
            const bad = {
                ...DEFAULT_GENERATION_SETTINGS,
                symmetryStrategy: 'mirror' as unknown as 'point',
            };
            expect(() => validateSettings(bad)).toThrow(GenerationError);
            try {
                validateSettings(bad);
            } catch (err) {
                if (err instanceof GenerationError) {
                    expect(err.message).toMatch(/symmetryStrategy/);
                }
            }
        });

        it('does NOT clamp — range violations are tolerated by validateSettings', () => {
            // Range clamping is `clampSettings`'s job (US3). validateSettings
            // only checks shape (integer? finite? union member?). This test
            // pins the boundary.
            const outOfRange: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                waterRatio: 0.99, // outside [0.02, 0.25] safe range
                octaves: 100, // outside [1, 6] safe range
            };
            expect(() => validateSettings(outOfRange)).not.toThrow();
        });
    });
});
