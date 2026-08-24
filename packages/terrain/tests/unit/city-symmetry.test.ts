/**
 * City Symmetry Tests — Feature 003
 *
 * Verifies FR-004 / INV-9: the city placement is invariant under
 * 180° rotation. For each player, every city must have a partner
 * at the 180°-rotated coord owned by the appropriate opposite
 * player:
 *   - 2 players: P1 ↔ P2 (opposite).
 *   - 4 players: quadrant ↔ diagonally-opposite quadrant.
 *   - 3 players: P1 ↔ P3; P2 (middle band) is self-symmetric.
 */

import { describe, expect, it } from 'vitest';

import { enforceCitySymmetry } from '../../src/city-symmetry';

describe('enforceCitySymmetry (US2 / FR-004 / INV-9)', () => {
    describe('2 players: P1 ↔ P2', () => {
        it('every P1 city has a P2 city at the 180°-rotated coord', () => {
            const placed = [
                { cell: { x: 1, y: 1 }, owner: 1 as const },
                { cell: { x: 2, y: 2 }, owner: 1 as const },
            ];
            const out = enforceCitySymmetry(placed, 32, 32, 2);
            // The 180° partners of (1,1) and (2,2) on 32x32 are (30, 30) and (29, 29).
            // Both must be present and owned by player 2.
            expect(out.length).toBe(4);
            for (const city of out) {
                if (city.owner === 1) {
                    // Original
                    expect([
                        [1, 1],
                        [2, 2],
                    ]).toContainEqual([city.cell.x, city.cell.y]);
                } else {
                    // Mirror
                    expect([
                        [30, 30],
                        [29, 29],
                    ]).toContainEqual([city.cell.x, city.cell.y]);
                }
            }
        });
    });

    describe('4 players: quadrant ↔ diagonal-opposite', () => {
        it('P1 (top-left) ↔ P4 (bottom-right), P2 (top-right) ↔ P3 (bottom-left)', () => {
            const placed = [
                { cell: { x: 1, y: 1 }, owner: 1 as const },
                { cell: { x: 17, y: 1 }, owner: 2 as const },
                { cell: { x: 1, y: 17 }, owner: 3 as const },
                { cell: { x: 17, y: 17 }, owner: 4 as const },
            ];
            const out = enforceCitySymmetry(placed, 32, 32, 4);
            // Each cell's 180° partner is itself (since they're at the
            // centers of their quadrants). For 4-player symmetry, P1 ↔ P4
            // and P2 ↔ P3.
            // P1 (1, 1) → 180° = (30, 30), which is in P4's quadrant.
            // P4 (17, 17) → 180° = (14, 14), which is in P1's quadrant.
            // So the symmetry expects: P1 has (1, 1) and a partner (14, 14)
            // which would be assigned to P1 (since the partner of P4's cell).
            // Wait, let me re-think.
            // The function maps P1 → P4's opposite. So if P1 has cell A,
            // the function should add A' (180° of A) to the city list as
            // P4's city. But (1,1) is in P1's band; (30, 30) is in P4's
            // band. So if P1 has (1,1), we add (30, 30) as P4's city.
            // If P4 has (17, 17), we add (14, 14) as P1's city.
            // So the output is: P1: (1,1) and (14,14); P4: (17,17) and (30,30).
            // Similarly for P2/P3.
            // Total: 8 cities.
            expect(out.length).toBe(8);
            // Build a map by owner.
            const byOwner = new Map<number, Array<{ x: number; y: number }>>();
            for (const c of out) {
                const arr = byOwner.get(c.owner) ?? [];
                arr.push(c.cell);
                byOwner.set(c.owner, arr);
            }
            // P1 has (1,1) and (14,14).
            expect(byOwner.get(1)).toHaveLength(2);
            expect(byOwner.get(1)).toContainEqual({ x: 1, y: 1 });
            expect(byOwner.get(1)).toContainEqual({ x: 14, y: 14 });
            // P4 has (17,17) and (30,30).
            expect(byOwner.get(4)).toHaveLength(2);
            expect(byOwner.get(4)).toContainEqual({ x: 17, y: 17 });
            expect(byOwner.get(4)).toContainEqual({ x: 30, y: 30 });
        });
    });

    describe('3 players: P1 ↔ P3, P2 self-symmetric', () => {
        it('P2 (middle band) cities map to themselves under 180° rotation', () => {
            // For a 33x33 board, the middle band is y in [11, 21].
            // The 180° partner of (16, 16) is (16, 16) (center cell).
            // The 180° partner of (5, 16) is (27, 16) (also in middle band).
            const placed = [
                { cell: { x: 16, y: 16 }, owner: 2 as const },
                { cell: { x: 5, y: 16 }, owner: 2 as const },
            ];
            const out = enforceCitySymmetry(placed, 33, 33, 3);
            // (16, 16) is its own partner; (5, 16) → (27, 16) is also in
            // middle band. Both should be in the output as P2 cities.
            // Total: 3 cities (the 2 originals + the 27, 16 mirror).
            // Actually for the center cell, the mirror is itself, so it
            // doesn't add an extra. So 3 total: (16,16), (5,16), (27,16).
            expect(out.length).toBe(3);
            for (const c of out) {
                expect(c.owner).toBe(2);
            }
        });
    });
});
