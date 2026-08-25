/**
 * 3-Player Generation Integration Tests — Feature 003 / issue #2
 *
 * Full-pipeline regression sweep for the issue #2 fix: 3-player
 * `generateBoard` must produce a valid, point-symmetric board on
 * realistic seeds instead of exhausting all regeneration attempts.
 *
 * Before the fix, EVERY seed failed with
 * `GenerationError('attempts_exhausted')` because:
 *
 *   1. INV-9 rejected the self-symmetric middle-band player's
 *      same-owner mirror pairs, and
 *   2. an odd `citiesPerPlayer` made the required city count
 *      unreachable under 180° symmetry (parity impossibility).
 */

import type { CityPlacement } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { partnerPlayer } from '../../src/city-symmetry';
import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard, hashBoard } from '../../src/generate';
import { engineSfc32 } from '../fixtures/seeds';

/** Seeds swept per board size — enough coverage, sane runtime. */
const SEED_COUNT = 60;
const BOARD_SIZES = [32, 33] as const;

/**
 * Assert the full 3-player contract on a generated result:
 * count, per-player equality, and 180° ownership symmetry.
 */
function assertValid3pResult(result: ReturnType<typeof generateBoard>, boardSize: number, expectedCpp: number): void {
    const { board, effectiveSettings, startingCitiesByPlayer } = result;

    // The parity rule is surfaced honestly via effectiveSettings.
    expect(effectiveSettings.citiesPerPlayer).toBe(expectedCpp);

    // INV-7: exact total.
    const expectedTotal = 3 * expectedCpp;
    expect(board.cities.length).toBe(expectedTotal);

    // FR-005: per-player equality.
    const perPlayer = new Map<number, number>();
    for (const city of board.cities) {
        perPlayer.set(city.owner, (perPlayer.get(city.owner) ?? 0) + 1);
    }
    expect(perPlayer.size).toBe(3);
    for (const player of [1, 2, 3]) {
        expect(perPlayer.get(player)).toBe(expectedCpp);
    }

    // INV-9: every city's rotated partner exists with the correct
    // partner owner (self for the middle-band player 2).
    const lookup = new Map<string, CityPlacement>();
    for (const city of board.cities) {
        lookup.set(`${String(city.cell.x)},${String(city.cell.y)}`, city);
    }
    for (const city of board.cities) {
        const px = boardSize - 1 - city.cell.x;
        const py = boardSize - 1 - city.cell.y;
        const partner = lookup.get(`${String(px)},${String(py)}`);
        expect(partner, `missing partner for (${String(city.cell.x)},${String(city.cell.y)})`).toBeDefined();
        expect(partner?.owner).toBe(partnerPlayer(city.owner, 3));
    }

    // startingCitiesByPlayer mirrors the board exactly.
    for (const city of board.cities) {
        const list = startingCitiesByPlayer[city.owner];
        expect(list).toBeDefined();
        expect(
            list.some((c) => c.x === city.cell.x && c.y === city.cell.y),
            `startingCitiesByPlayer missing (${String(city.cell.x)},${String(city.cell.y)})`,
        ).toBe(true);
    }
}

describe('generateBoard: 3-player full pipeline (issue #2 regression)', () => {
    // 120 full 3p generations (60 seeds × 2 board sizes) can exceed the
    // default 5s timeout under coverage instrumentation on loaded CI runners.
    it(`succeeds across ${String(SEED_COUNT)} seeds × boards ${BOARD_SIZES.join('/')} with default settings`, {
        timeout: 30_000,
    }, () => {
        for (const size of BOARD_SIZES) {
            for (let seed = 1; seed <= SEED_COUNT; seed++) {
                const result = generateBoard({
                    boardSize: size,
                    playerCount: 3,
                    seed,
                    rng: engineSfc32(seed),
                    settings: DEFAULT_GENERATION_SETTINGS,
                });
                // Default cpp=1 normalizes up to the even value 2.
                assertValid3pResult(result, size, 2);
            }
        }
    });

    it('normalizes odd custom citiesPerPlayer (3 → 4) uniformly', () => {
        const settings = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 3 };
        for (const size of BOARD_SIZES) {
            const result = generateBoard({
                boardSize: size,
                playerCount: 3,
                seed: 7,
                rng: engineSfc32(7),
                settings,
            });
            assertValid3pResult(result, size, 4);
        }
    });

    it('is deterministic: same seed → identical board hash and effective seed', () => {
        for (const seed of [1, 42, 1248]) {
            const runA = generateBoard({
                boardSize: 32,
                playerCount: 3,
                seed,
                rng: engineSfc32(seed),
                settings: DEFAULT_GENERATION_SETTINGS,
            });
            const runB = generateBoard({
                boardSize: 32,
                playerCount: 3,
                seed,
                rng: engineSfc32(seed),
                settings: DEFAULT_GENERATION_SETTINGS,
            });
            expect(hashBoard(runA.board)).toBe(hashBoard(runB.board));
            expect(runA.effectiveSeed).toBe(runB.effectiveSeed);
        }
    });

    it('does NOT alter 2p/4p settings (normalization is 3p-only)', () => {
        for (const playerCount of [2, 4] as const) {
            const result = generateBoard({
                boardSize: 32,
                playerCount,
                seed: 7,
                rng: engineSfc32(7),
                settings: DEFAULT_GENERATION_SETTINGS,
            });
            expect(result.effectiveSettings.citiesPerPlayer).toBe(DEFAULT_GENERATION_SETTINGS.citiesPerPlayer);
            expect(result.board.cities.length).toBe(playerCount * DEFAULT_GENERATION_SETTINGS.citiesPerPlayer);
        }
    });

    it('keeps odd custom citiesPerPlayer unchanged for 4 players', () => {
        const settings = { ...DEFAULT_GENERATION_SETTINGS, citiesPerPlayer: 3 };
        const result = generateBoard({
            boardSize: 32,
            playerCount: 4,
            seed: 7,
            rng: engineSfc32(7),
            settings,
        });
        expect(result.effectiveSettings.citiesPerPlayer).toBe(3);
        expect(result.board.cities.length).toBe(12);
    });
});
