/**
 * City-Count Parity Tests — Feature 003 / issue #2
 *
 * Verifies the 3-player parity rule: with point symmetry the middle
 * band is its own 180° partner, so `citiesPerPlayer` must be EVEN
 * for 3-player matches. Covers the three views of the rule:
 *
 *   - `normalizedCitiesPerPlayer` — the scalar source of truth.
 *   - `normalizeSettingsForPlayerCount` — the whole-settings view.
 *   - `resolveCityCount` — the total-count view.
 */

import { describe, expect, it } from 'vitest';
import { resolveCityCount } from '../../src/city-count';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { normalizedCitiesPerPlayer, normalizeSettingsForPlayerCount } from '../../src/settings';

describe('3-player citiesPerPlayer parity (issue #2)', () => {
    describe('normalizedCitiesPerPlayer', () => {
        it('rounds odd values UP to the next even number for 3 players', () => {
            expect(normalizedCitiesPerPlayer(1, 3)).toBe(2);
            expect(normalizedCitiesPerPlayer(3, 3)).toBe(4);
        });

        it('leaves even values unchanged for 3 players', () => {
            expect(normalizedCitiesPerPlayer(2, 3)).toBe(2);
            expect(normalizedCitiesPerPlayer(4, 3)).toBe(4);
        });

        it('passes any in-range value through for 2 players', () => {
            expect(normalizedCitiesPerPlayer(1, 2)).toBe(1);
            expect(normalizedCitiesPerPlayer(2, 2)).toBe(2);
            expect(normalizedCitiesPerPlayer(3, 2)).toBe(3);
            expect(normalizedCitiesPerPlayer(4, 2)).toBe(4);
        });

        it('passes any in-range value through for 4 players', () => {
            expect(normalizedCitiesPerPlayer(1, 4)).toBe(1);
            expect(normalizedCitiesPerPlayer(2, 4)).toBe(2);
            expect(normalizedCitiesPerPlayer(3, 4)).toBe(3);
            expect(normalizedCitiesPerPlayer(4, 4)).toBe(4);
        });
    });

    describe('normalizeSettingsForPlayerCount', () => {
        it('adjusts only citiesPerPlayer for 3 players and copies every other field', () => {
            const input = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 1 };
            const result = normalizeSettingsForPlayerCount(input, 3);
            expect(result.citiesPerPlayer).toBe(2);
            expect(result).toEqual({ ...input, citiesPerPlayer: 2 });
        });

        it('returns an equal copy (no mutation of the input) for 2 players', () => {
            const input = { ...DEFAULT_GENERATION_SETTINGS };
            const result = normalizeSettingsForPlayerCount(input, 2);
            expect(result).toEqual(input);
            expect(result).not.toBe(input);
        });

        it('returns an equal copy for 4 players', () => {
            const input = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 3 };
            const result = normalizeSettingsForPlayerCount(input, 4);
            expect(result.citiesPerPlayer).toBe(3);
        });
    });

    describe('resolveCityCount', () => {
        it('applies the parity rule to the total for 3 players', () => {
            // Odd cpp rounds up: effective 2 × 3 players = 6.
            expect(resolveCityCount({ citiesPerPlayer: 1 }, 3)).toBe(6);
            // Even cpp passes through: 2 × 3 = 6.
            expect(resolveCityCount({ citiesPerPlayer: 2 }, 3)).toBe(6);
            // Odd cpp 3 rounds up to 4: 4 × 3 = 12.
            expect(resolveCityCount({ citiesPerPlayer: 3 }, 3)).toBe(12);
        });

        it('keeps the plain product for 2 and 4 players', () => {
            expect(resolveCityCount({ citiesPerPlayer: 1 }, 2)).toBe(2);
            expect(resolveCityCount({ citiesPerPlayer: 2 }, 2)).toBe(4);
            expect(resolveCityCount({ citiesPerPlayer: 1 }, 4)).toBe(4);
            expect(resolveCityCount({ citiesPerPlayer: 3 }, 4)).toBe(12);
        });
    });
});
