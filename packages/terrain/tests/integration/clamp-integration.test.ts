/**
 * Clamp Integration Test — Feature 003 (US3 / T047)
 *
 * End-to-end coverage of FR-008: caller passes deliberately
 * out-of-range `settings`; the generator must (1) clamp every
 * out-of-range numeric field and (2) surface the clamped values via
 * `TerrainGenerationResult.effectiveSettings` so callers can verify
 * what was actually used.
 *
 * The `effectiveSettings` field is the public proof that clamping
 * happened — without it, callers have no way to detect when the
 * generator "rewrote" their input. (Added in T046, PM-approved
 * additive change to `TerrainGenerationResult` and `MapStats`.)
 *
 * The "extreme clamping" test uses the prompt's `0.99` / `100` / `99`
 * values. After clamping that request lands on `waterRatio: 0.25` and
 * `citiesPerPlayer: 4`, which still generates on a 32×32 board, so the
 * test asserts the clamped `effectiveSettings`. The request carries
 * every field so it reaches clamping; a partial object fails shape
 * validation before any clamping runs.
 */

import { describe, expect, it } from 'vitest';
import {
    CITIES_PER_PLAYER_MAX,
    CITIES_PER_PLAYER_MIN,
    MAX_REGEN_ATTEMPTS_MAX,
    MIN_CITY_CITY_DISTANCE_MIN,
    MIN_CITY_WATER_DISTANCE_MIN,
    OCTAVES_MAX,
    ROUGHNESS_MIN,
    WATER_RATIO_MAX,
} from '../../src/clamp';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import type { GenerationSettings } from '../../src/contracts/terrain-types';
import { generateBoard } from '../../src/generate';
import { validateBoard } from '../../src/validate';
import { engineSfc32 } from '../fixtures/seeds';

describe('clamp integration (US3 / FR-008)', () => {
    describe('moderate out-of-range inputs (clamped but tractable)', () => {
        it('clamps maxRegenAttempts from 99 → 10 and still produces a valid Board', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                // All other fields at defaults (in range); only one
                // out-of-range field so the clamped Board is still tractable.
                maxRegenAttempts: 99, // above upper (10)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const result = generateBoard(req);

            // Clamped.
            expect(result.effectiveSettings.maxRegenAttempts).toBe(MAX_REGEN_ATTEMPTS_MAX);

            // Board is valid.
            expect(result.board.width).toBe(32);
            expect(result.board.height).toBe(32);
            expect(result.board.cities.length).toBe(req.playerCount * DEFAULT_GENERATION_SETTINGS.citiesPerPlayer);
            const report = validateBoard(result.board, result.effectiveSettings, req.playerCount);
            expect(report.valid).toBe(true);
        });

        it('clamps minCityWaterDistance from 0 → 1 and still produces a valid Board', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                minCityWaterDistance: 0, // below lower (1)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const result = generateBoard(req);

            expect(result.effectiveSettings.minCityWaterDistance).toBe(MIN_CITY_WATER_DISTANCE_MIN);
            const report = validateBoard(result.board, result.effectiveSettings, req.playerCount);
            expect(report.valid).toBe(true);
        });

        it('clamps minCityCityDistance from 1 → 2 and still produces a valid Board', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                minCityCityDistance: 1, // below lower (2)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const result = generateBoard(req);

            expect(result.effectiveSettings.minCityCityDistance).toBe(MIN_CITY_CITY_DISTANCE_MIN);
            const report = validateBoard(result.board, result.effectiveSettings, req.playerCount);
            expect(report.valid).toBe(true);
        });

        it('clamps roughness from -1 → 0.1 and still produces a valid Board', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                roughness: -1, // below lower (0.1)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const result = generateBoard(req);

            expect(result.effectiveSettings.roughness).toBe(ROUGHNESS_MIN);
            const report = validateBoard(result.board, result.effectiveSettings, req.playerCount);
            expect(report.valid).toBe(true);
        });
    });

    describe('extreme out-of-range inputs (FR-008 prompt example)', () => {
        it('waterRatio: 0.99, octaves: 100, citiesPerPlayer: 99 — effectiveSettings shows clamped values', () => {
            const outOfRange: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                waterRatio: 0.99, // above upper (0.25)
                roughness: -1, // below lower (0.1)
                octaves: 100, // above upper (6)
                citiesPerPlayer: 99, // above upper (4)
                symmetryStrategy: 'point',
                minCityWaterDistance: -1, // below lower (1)
                minCityCityDistance: 1, // below lower (2)
                maxRegenAttempts: 99, // above upper (10)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings: outOfRange,
            };
            // The request is complete and the clamped settings generate, so
            // any throw here is a real failure, not an accepted outcome.
            const result = generateBoard(req);
            expect(result.effectiveSettings.waterRatio).toBe(WATER_RATIO_MAX);
            expect(result.effectiveSettings.octaves).toBe(OCTAVES_MAX);
            expect(result.effectiveSettings.citiesPerPlayer).toBe(CITIES_PER_PLAYER_MAX);
            expect(result.effectiveSettings.maxRegenAttempts).toBe(MAX_REGEN_ATTEMPTS_MAX);
            expect(result.effectiveSettings.roughness).toBe(ROUGHNESS_MIN);
            expect(result.effectiveSettings.minCityWaterDistance).toBe(MIN_CITY_WATER_DISTANCE_MIN);
            expect(result.effectiveSettings.minCityCityDistance).toBe(MIN_CITY_CITY_DISTANCE_MIN);
        });
    });

    describe('idempotence (FR-008 spirit: same input → same effective output)', () => {
        it('effectiveSettings equals defaults when caller supplies defaults (no clamp)', () => {
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings: DEFAULT_GENERATION_SETTINGS,
            };
            const result = generateBoard(req);
            expect(result.effectiveSettings).toEqual(DEFAULT_GENERATION_SETTINGS);
        });

        it('partial in-range overrides pass through unchanged', () => {
            const partial: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                // waterRatio slightly higher than default (still in range)
                waterRatio: 0.12,
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings: partial,
            };
            const result = generateBoard(req);
            expect(result.effectiveSettings.waterRatio).toBe(0.12);
            // Untouched fields keep their default values.
            expect(result.effectiveSettings.roughness).toBe(DEFAULT_GENERATION_SETTINGS.roughness);
            expect(result.effectiveSettings.octaves).toBe(DEFAULT_GENERATION_SETTINGS.octaves);
        });

        it('determinism is preserved across clamped runs (same effectiveSettings → same Board)', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                maxRegenAttempts: 99, // above upper (10) — clamps to 10
            };
            const reqA = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const reqB = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const resultA = generateBoard(reqA);
            const resultB = generateBoard(reqB);
            expect(resultA.effectiveSettings).toEqual(resultB.effectiveSettings);
            expect(resultA.board).toEqual(resultB.board);
        });

        it('clamping does NOT mutate the input settings object', () => {
            const original: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                maxRegenAttempts: 99,
            };
            const snapshot = JSON.stringify(original);
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings: original,
            };
            generateBoard(req);
            expect(JSON.stringify(original)).toBe(snapshot);
        });
    });

    describe('citiesPerPlayer lower bound (US1 AC-2)', () => {
        it('citiesPerPlayer: 0 → 1 (US1 AC-2: every player has at least one starting city)', () => {
            const settings: GenerationSettings = {
                ...DEFAULT_GENERATION_SETTINGS,
                citiesPerPlayer: 0, // below lower (1)
            };
            const req = {
                boardSize: 32,
                playerCount: 2 as const,
                seed: 42,
                rng: engineSfc32(42),
                settings,
            };
            const result = generateBoard(req);
            // Clamped to 1.
            expect(result.effectiveSettings.citiesPerPlayer).toBe(CITIES_PER_PLAYER_MIN);
            // Board has exactly 1 city per player (2 players × 1 = 2).
            expect(result.board.cities.length).toBe(req.playerCount * CITIES_PER_PLAYER_MIN);
        });
    });
});
