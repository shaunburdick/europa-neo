/**
 * Clamp Unit Tests — Feature 003 (US3, T044)
 *
 * Boundary coverage for every `GenerationSettings` field's safe
 * range per `data-model.md` §2. For each field we exercise the
 * lower bound, the upper bound, one value below the lower bound,
 * one value above the upper bound, and one mid-range value. The
 * inclusive ends must be valid (i.e., `clamp(0.02, 0.02, 0.25)
 * === 0.02` — not silently rounded to a different value).
 *
 * **Note on test-reviewer discipline**: expected values are
 * hard-coded constants, not derived from the same logic as the
 * implementation. The tests state the contract, not the
 * implementation.
 */

import { describe, expect, it } from 'vitest';

import {
    CITIES_PER_PLAYER_MAX,
    CITIES_PER_PLAYER_MIN,
    clampCitiesPerPlayer,
    clampMaxRegenAttempts,
    clampMinCityCityDistance,
    clampMinCityWaterDistance,
    clampOctaves,
    clampRoughness,
    clampSettings,
    clampWaterRatio,
    MAX_REGEN_ATTEMPTS_MAX,
    MAX_REGEN_ATTEMPTS_MIN,
    MIN_CITY_CITY_DISTANCE_MAX,
    MIN_CITY_CITY_DISTANCE_MIN,
    MIN_CITY_WATER_DISTANCE_MAX,
    MIN_CITY_WATER_DISTANCE_MIN,
    OCTAVES_MAX,
    OCTAVES_MIN,
    ROUGHNESS_MAX,
    ROUGHNESS_MIN,
    WATER_RATIO_MAX,
    WATER_RATIO_MIN,
} from '../../src/clamp';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import type { GenerationSettings } from '../../src/contracts/terrain-types';

describe('clamp (US3 / FR-008)', () => {
    describe('clampWaterRatio', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampWaterRatio(0.1)).toBe(0.1);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampWaterRatio(WATER_RATIO_MIN)).toBe(WATER_RATIO_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampWaterRatio(WATER_RATIO_MAX)).toBe(WATER_RATIO_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampWaterRatio(0.0)).toBe(WATER_RATIO_MIN);
            expect(clampWaterRatio(-0.5)).toBe(WATER_RATIO_MIN);
            expect(clampWaterRatio(0.01)).toBe(WATER_RATIO_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampWaterRatio(0.99)).toBe(WATER_RATIO_MAX);
            expect(clampWaterRatio(1.0)).toBe(WATER_RATIO_MAX);
            expect(clampWaterRatio(0.3)).toBe(WATER_RATIO_MAX);
        });
    });

    describe('clampRoughness', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampRoughness(0.5)).toBe(0.5);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampRoughness(ROUGHNESS_MIN)).toBe(ROUGHNESS_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampRoughness(ROUGHNESS_MAX)).toBe(ROUGHNESS_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampRoughness(0.0)).toBe(ROUGHNESS_MIN);
            expect(clampRoughness(-1.0)).toBe(ROUGHNESS_MIN);
            expect(clampRoughness(0.05)).toBe(ROUGHNESS_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampRoughness(1.0)).toBe(ROUGHNESS_MAX);
            expect(clampRoughness(2.0)).toBe(ROUGHNESS_MAX);
            expect(clampRoughness(0.95)).toBe(ROUGHNESS_MAX);
        });
    });

    describe('clampOctaves', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampOctaves(4)).toBe(4);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampOctaves(OCTAVES_MIN)).toBe(OCTAVES_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampOctaves(OCTAVES_MAX)).toBe(OCTAVES_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampOctaves(0)).toBe(OCTAVES_MIN);
            expect(clampOctaves(-3)).toBe(OCTAVES_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampOctaves(7)).toBe(OCTAVES_MAX);
            expect(clampOctaves(100)).toBe(OCTAVES_MAX);
        });
        it('floors non-integer in-range values', () => {
            // 3.7 is in range; the floor-after-clamp behavior gives 3.
            expect(clampOctaves(3.7)).toBe(3);
        });
    });

    describe('clampCitiesPerPlayer', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampCitiesPerPlayer(2)).toBe(2);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampCitiesPerPlayer(CITIES_PER_PLAYER_MIN)).toBe(CITIES_PER_PLAYER_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampCitiesPerPlayer(CITIES_PER_PLAYER_MAX)).toBe(CITIES_PER_PLAYER_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampCitiesPerPlayer(0)).toBe(CITIES_PER_PLAYER_MIN);
            expect(clampCitiesPerPlayer(-1)).toBe(CITIES_PER_PLAYER_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampCitiesPerPlayer(5)).toBe(CITIES_PER_PLAYER_MAX);
            expect(clampCitiesPerPlayer(99)).toBe(CITIES_PER_PLAYER_MAX);
        });
    });

    describe('clampMinCityWaterDistance', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampMinCityWaterDistance(3)).toBe(3);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampMinCityWaterDistance(MIN_CITY_WATER_DISTANCE_MIN)).toBe(MIN_CITY_WATER_DISTANCE_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampMinCityWaterDistance(MIN_CITY_WATER_DISTANCE_MAX)).toBe(MIN_CITY_WATER_DISTANCE_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampMinCityWaterDistance(0)).toBe(MIN_CITY_WATER_DISTANCE_MIN);
            expect(clampMinCityWaterDistance(-2)).toBe(MIN_CITY_WATER_DISTANCE_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampMinCityWaterDistance(7)).toBe(MIN_CITY_WATER_DISTANCE_MAX);
            expect(clampMinCityWaterDistance(50)).toBe(MIN_CITY_WATER_DISTANCE_MAX);
        });
    });

    describe('clampMinCityCityDistance', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampMinCityCityDistance(5)).toBe(5);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampMinCityCityDistance(MIN_CITY_CITY_DISTANCE_MIN)).toBe(MIN_CITY_CITY_DISTANCE_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampMinCityCityDistance(MIN_CITY_CITY_DISTANCE_MAX)).toBe(MIN_CITY_CITY_DISTANCE_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            // minCityCityDistance lower bound is 2 (not 1) per data-model §2.
            expect(clampMinCityCityDistance(1)).toBe(MIN_CITY_CITY_DISTANCE_MIN);
            expect(clampMinCityCityDistance(0)).toBe(MIN_CITY_CITY_DISTANCE_MIN);
            expect(clampMinCityCityDistance(-3)).toBe(MIN_CITY_CITY_DISTANCE_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            expect(clampMinCityCityDistance(11)).toBe(MIN_CITY_CITY_DISTANCE_MAX);
            expect(clampMinCityCityDistance(100)).toBe(MIN_CITY_CITY_DISTANCE_MAX);
        });
    });

    describe('clampMaxRegenAttempts', () => {
        it('returns the value unchanged when in range (mid)', () => {
            expect(clampMaxRegenAttempts(5)).toBe(5);
        });
        it('returns the lower bound unchanged (inclusive end)', () => {
            expect(clampMaxRegenAttempts(MAX_REGEN_ATTEMPTS_MIN)).toBe(MAX_REGEN_ATTEMPTS_MIN);
        });
        it('returns the upper bound unchanged (inclusive end)', () => {
            expect(clampMaxRegenAttempts(MAX_REGEN_ATTEMPTS_MAX)).toBe(MAX_REGEN_ATTEMPTS_MAX);
        });
        it('clamps below the lower bound up to the lower bound', () => {
            expect(clampMaxRegenAttempts(0)).toBe(MAX_REGEN_ATTEMPTS_MIN);
            expect(clampMaxRegenAttempts(-2)).toBe(MAX_REGEN_ATTEMPTS_MIN);
        });
        it('clamps above the upper bound down to the upper bound', () => {
            // NOTE: maxRegenAttempts upper bound is 10 per data-model §2
            // (NOT 16 — the prompt's draft had [1, 16]; PM-mediated
            // correction committed in m0099–m0100).
            expect(clampMaxRegenAttempts(11)).toBe(MAX_REGEN_ATTEMPTS_MAX);
            expect(clampMaxRegenAttempts(16)).toBe(MAX_REGEN_ATTEMPTS_MAX);
            expect(clampMaxRegenAttempts(100)).toBe(MAX_REGEN_ATTEMPTS_MAX);
        });
    });

    describe('clampSettings (whole-object)', () => {
        it('returns the defaults unchanged when given DEFAULT_GENERATION_SETTINGS (idempotent)', () => {
            const out = clampSettings(DEFAULT_GENERATION_SETTINGS);
            expect(out).toEqual(DEFAULT_GENERATION_SETTINGS);
        });

        it('clamps every out-of-range field and passes symmetryStrategy through', () => {
            const bad: GenerationSettings = {
                waterRatio: 0.99, // above upper
                roughness: 0.05, // below lower
                octaves: 100, // above upper
                citiesPerPlayer: 99, // above upper
                symmetryStrategy: 'point', // not a numeric knob
                minCityWaterDistance: 0, // below lower
                minCityCityDistance: 1, // below lower (min is 2)
                maxRegenAttempts: 99, // above upper
            };
            const out = clampSettings(bad);
            expect(out.waterRatio).toBe(WATER_RATIO_MAX);
            expect(out.roughness).toBe(ROUGHNESS_MIN);
            expect(out.octaves).toBe(OCTAVES_MAX);
            expect(out.citiesPerPlayer).toBe(CITIES_PER_PLAYER_MAX);
            expect(out.symmetryStrategy).toBe('point');
            expect(out.minCityWaterDistance).toBe(MIN_CITY_WATER_DISTANCE_MIN);
            expect(out.minCityCityDistance).toBe(MIN_CITY_CITY_DISTANCE_MIN);
            expect(out.maxRegenAttempts).toBe(MAX_REGEN_ATTEMPTS_MAX);
        });

        it('clamps mixed-direction fields independently', () => {
            // waterRatio above, roughness below, octaves in range.
            const s: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                waterRatio: 0.99,
                roughness: -1.0,
                octaves: 3,
            };
            const out = clampSettings(s);
            expect(out.waterRatio).toBe(WATER_RATIO_MAX);
            expect(out.roughness).toBe(ROUGHNESS_MIN);
            expect(out.octaves).toBe(3);
        });

        it('does not mutate the input object', () => {
            const original: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                waterRatio: 0.99,
            };
            const snapshot = JSON.stringify(original);
            clampSettings(original);
            expect(JSON.stringify(original)).toBe(snapshot);
        });

        it('returns a NEW object reference (not the same reference)', () => {
            const original = DEFAULT_GENERATION_SETTINGS;
            const out = clampSettings(original);
            expect(out).not.toBe(original);
        });
    });
});
