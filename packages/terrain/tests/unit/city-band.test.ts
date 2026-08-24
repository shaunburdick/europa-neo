/**
 * City Band Geometry Tests — Feature 003
 *
 * Verifies the per-player spawn-band layout (T039). The band
 * geometry depends on the player count:
 *   - 2 players: two horizontal bands split at `height/2`.
 *   - 4 players: four quadrants at `width/2` and `height/2`.
 *   - 3 players: three horizontal bands; the middle band is
 *     self-symmetric (its 180° partner is itself).
 *
 * Every cell of the map must fall in exactly one band (the bands
 * form a partition of the map).
 */

import { describe, expect, it } from 'vitest';

import { getPlayerBand } from '../../src/city-band';

describe('city-band', () => {
    describe('2 players: two horizontal bands', () => {
        it('player 1 occupies the top half, player 2 the bottom half on 32x32', () => {
            const p1 = getPlayerBand(1, 2, 32, 32);
            const p2 = getPlayerBand(2, 2, 32, 32);
            // Top half: y in [0, 15] (16 rows), bottom half: y in [16, 31] (16 rows).
            expect(p1).toEqual({ xMin: 0, xMax: 31, yMin: 0, yMax: 15 });
            expect(p2).toEqual({ xMin: 0, xMax: 31, yMin: 16, yMax: 31 });
        });

        it('bands are equal-area (or differ by at most 1 row for odd heights)', () => {
            // 32x32 → 16 rows each.
            const p1 = getPlayerBand(1, 2, 32, 32);
            const p2 = getPlayerBand(2, 2, 32, 32);
            const p1Area = (p1.xMax - p1.xMin + 1) * (p1.yMax - p1.yMin + 1);
            const p2Area = (p2.xMax - p2.xMin + 1) * (p2.yMax - p2.yMin + 1);
            expect(Math.abs(p1Area - p2Area)).toBeLessThanOrEqual(32);
        });
    });

    describe('4 players: four quadrants', () => {
        it('each player gets a quadrant on 32x32', () => {
            const p1 = getPlayerBand(1, 4, 32, 32);
            const p2 = getPlayerBand(2, 4, 32, 32);
            const p3 = getPlayerBand(3, 4, 32, 32);
            const p4 = getPlayerBand(4, 4, 32, 32);
            // Player 1: top-left, Player 2: top-right, Player 3: bottom-left, Player 4: bottom-right.
            expect(p1).toEqual({ xMin: 0, xMax: 15, yMin: 0, yMax: 15 });
            expect(p2).toEqual({ xMin: 16, xMax: 31, yMin: 0, yMax: 15 });
            expect(p3).toEqual({ xMin: 0, xMax: 15, yMin: 16, yMax: 31 });
            expect(p4).toEqual({ xMin: 16, xMax: 31, yMin: 16, yMax: 31 });
        });

        it('quadrants are equal-area', () => {
            const bands = [1, 2, 3, 4].map((id) => getPlayerBand(id, 4, 32, 32));
            const areas = bands.map((b) => (b.xMax - b.xMin + 1) * (b.yMax - b.yMin + 1));
            const maxArea = Math.max(...areas);
            const minArea = Math.min(...areas);
            expect(maxArea - minArea).toBeLessThanOrEqual(16);
        });
    });

    describe('3 players: three horizontal bands, middle self-symmetric', () => {
        it('player 1 = top third, player 2 = middle third, player 3 = bottom third on 33x33 (odd)', () => {
            // 33 / 3 = 11 rows per band.
            const p1 = getPlayerBand(1, 3, 33, 33);
            const p2 = getPlayerBand(2, 3, 33, 33);
            const p3 = getPlayerBand(3, 3, 33, 33);
            expect(p1).toEqual({ xMin: 0, xMax: 32, yMin: 0, yMax: 10 });
            expect(p2).toEqual({ xMin: 0, xMax: 32, yMin: 11, yMax: 21 });
            expect(p3).toEqual({ xMin: 0, xMax: 32, yMin: 22, yMax: 32 });
        });

        it('middle band on 33x33 is self-symmetric (its 180° partner is itself)', () => {
            // For a 33x33 board, the center cell is (16, 16). The middle
            // band (y in [11, 21]) covers 11 rows; its 180° partner
            // would be y in [33-1-21, 33-1-11] = [11, 21] (same).
            // The band is self-symmetric.
            const p2 = getPlayerBand(2, 3, 33, 33);
            // For the band to be self-symmetric, every y in [yMin, yMax]
            // must have its partner (height-1-y) also in [yMin, yMax].
            for (let y = p2.yMin; y <= p2.yMax; y++) {
                const partnerY = 33 - 1 - y;
                expect(partnerY).toBeGreaterThanOrEqual(p2.yMin);
                expect(partnerY).toBeLessThanOrEqual(p2.yMax);
            }
        });
    });

    describe('partition property (every cell falls in exactly one band)', () => {
        it('2 players on 32x32: every cell is in band 1 or band 2 (not both)', () => {
            const p1 = getPlayerBand(1, 2, 32, 32);
            const p2 = getPlayerBand(2, 2, 32, 32);
            for (let y = 0; y < 32; y++) {
                for (let x = 0; x < 32; x++) {
                    const inP1 = x >= p1.xMin && x <= p1.xMax && y >= p1.yMin && y <= p1.yMax;
                    const inP2 = x >= p2.xMin && x <= p2.xMax && y >= p2.yMin && y <= p2.yMax;
                    expect(inP1 !== inP2).toBe(true); // XOR
                }
            }
        });

        it('4 players on 32x32: every cell is in exactly one band', () => {
            const bands = [1, 2, 3, 4].map((id) => getPlayerBand(id, 4, 32, 32));
            for (let y = 0; y < 32; y++) {
                for (let x = 0; x < 32; x++) {
                    const matches = bands.filter((b) => x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax);
                    expect(matches.length).toBe(1);
                }
            }
        });

        it('3 players on 33x33: every cell is in exactly one band', () => {
            const bands = [1, 2, 3].map((id) => getPlayerBand(id, 3, 33, 33));
            for (let y = 0; y < 33; y++) {
                for (let x = 0; x < 33; x++) {
                    const matches = bands.filter((b) => x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax);
                    expect(matches.length).toBe(1);
                }
            }
        });
    });
});
