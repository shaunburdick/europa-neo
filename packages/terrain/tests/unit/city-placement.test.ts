/**
 * City Placement Tests — Feature 003
 *
 * Verifies the FR-005 / INV-7/8/10/11 invariants for `placeCitiesInBand`:
 *   - Every city is on a `land` cell (INV-8).
 *   - Every city has Chebyshev distance ≥ `minCityWaterDistance` to any
 *     water cell (INV-10).
 *   - Every pair of cities has Chebyshev distance ≥ `minCityCityDistance`
 *     (INV-11).
 *   - City count exactly `citiesPerPlayer` (INV-7).
 *   - Within a band, max-distance-from-center strategy is honored
 *     (cities are at the periphery of their band, not near the center).
 */

import { describe, expect, it } from 'vitest';
import { placeCitiesInBand } from '../../src/city-placement';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import type { GenerationSettings } from '../../src/contracts/terrain-types';
import { generateElevationMap } from '../../src/elevation';
import { extractWater } from '../../src/water';
import { engineSfc32 } from '../fixtures/seeds';

describe('placeCitiesInBand (US2 / FR-005)', () => {
  describe('basic city placement', () => {
    it('places exactly `citiesPerPlayer` cities for the given band', () => {
      const settings: GenerationSettings = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 2 };
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      // Top band (P1).
      const band = { xMin: 0, xMax: 31, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      expect(cities.length).toBe(2);
    });

    it('every city is on a land cell (INV-8)', () => {
      const settings = DEFAULT_GENERATION_SETTINGS;
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      const band = { xMin: 0, xMax: 31, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      for (const city of cities) {
        const idx = city.cell.y * 32 + city.cell.x;
        const cell = elev[idx];
        const waterMask = water[idx];
        // Cell must be land.
        expect(waterMask).toBe(0);
        // And have a valid elevation.
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(255);
      }
    });

    it('every city is within the band (xMin..xMax, yMin..yMax)', () => {
      const settings = DEFAULT_GENERATION_SETTINGS;
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      const band = { xMin: 0, xMax: 15, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      for (const city of cities) {
        expect(city.cell.x).toBeGreaterThanOrEqual(band.xMin);
        expect(city.cell.x).toBeLessThanOrEqual(band.xMax);
        expect(city.cell.y).toBeGreaterThanOrEqual(band.yMin);
        expect(city.cell.y).toBeLessThanOrEqual(band.yMax);
      }
    });
  });

  describe('INV-10: city-to-water Chebyshev distance', () => {
    it('every city has Chebyshev distance ≥ minCityWaterDistance to any water cell', () => {
      const settings = DEFAULT_GENERATION_SETTINGS;
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      const band = { xMin: 0, xMax: 31, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      // Build a set of water cell coords.
      const waterSet: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          if (water[y * 32 + x] === 1) {
            waterSet.push({ x, y });
          }
        }
      }
      for (const city of cities) {
        let bestD = Number.POSITIVE_INFINITY;
        for (const w of waterSet) {
          const d = Math.max(Math.abs(city.cell.x - w.x), Math.abs(city.cell.y - w.y));
          if (d < bestD) bestD = d;
        }
        expect(bestD).toBeGreaterThanOrEqual(settings.minCityWaterDistance);
      }
    });
  });

  describe('INV-11: city-to-city Chebyshev distance', () => {
    it('every pair of cities has Chebyshev distance ≥ minCityCityDistance', () => {
      const settings: GenerationSettings = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 3 };
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      const band = { xMin: 0, xMax: 31, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      for (let i = 0; i < cities.length; i++) {
        for (let j = i + 1; j < cities.length; j++) {
          const a = cities[i];
          const b = cities[j];
          if (!a || !b) continue;
          const d = Math.max(Math.abs(a.cell.x - b.cell.x), Math.abs(a.cell.y - b.cell.y));
          expect(d).toBeGreaterThanOrEqual(settings.minCityCityDistance);
        }
      }
    });
  });

  describe('periphery strategy (max distance from center)', () => {
    it('cities are at the periphery of the band, not the center', () => {
      const settings: GenerationSettings = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 1 };
      const elev = generateElevationMap(engineSfc32(42), 32, 32, settings);
      const water = extractWater(elev, 32, 32, settings.waterRatio);
      // 2-player top band: xMin=0, xMax=31, yMin=0, yMax=15.
      // Band center ≈ (15.5, 7.5).
      const band = { xMin: 0, xMax: 31, yMin: 0, yMax: 15 };
      const cities = placeCitiesInBand(elev, water, 32, 32, band, settings, engineSfc32(42));
      // The city should be at a high Chebyshev distance from the
      // band center. Max possible distance in this band is ~16
      // (from (0,0) to (15,7.5)). Average distance to a random
      // cell is much lower. We assert: distance ≥ 10 (at least
      // 60% of the max).
      const centerX = (band.xMin + band.xMax) / 2;
      const centerY = (band.yMin + band.yMax) / 2;
      for (const city of cities) {
        const d = Math.max(Math.abs(city.cell.x - centerX), Math.abs(city.cell.y - centerY));
        expect(d).toBeGreaterThanOrEqual(10);
      }
    });
  });
});
