/**
 * City Band Geometry — Feature 003
 *
 * Per-player spawn band layout (US2 / FR-005). The bands partition
 * the map into non-overlapping regions, one per player, so each
 * player has a dedicated "territory" for city placement.
 *
 * **Geometry** (research.md §4):
 *
 *   - 2 players: two horizontal bands split at `height / 2`.
 *     Player 1 = top, Player 2 = bottom.
 *
 *   - 4 players: four quadrants split at `width / 2` and
 *     `height / 2`. Player 1 = top-left, Player 2 = top-right,
 *     Player 3 = bottom-left, Player 4 = bottom-right.
 *
 *   - 3 players: three horizontal bands; the middle band is
 *     self-symmetric (its 180° partner is itself). This is the
 *     cleanest way to ensure INV-9 (city symmetry) for 3-player
 *     games: player 2's cities mirror across the center to
 *     themselves, so the symmetry is satisfied trivially.
 *
 * The bands are inclusive on both ends (`xMin` and `xMax` are both
 * valid coords). The implementation is pure and integer-only.
 */

import { FOUR_PLAYER_COUNT, MIN_PLAYER_COUNT, THIRD_PLAYER_ID, THREE_PLAYER_COUNT } from './constants';

/**
 * Spawn band for a given player. A rectangular region of the map
 * defined by inclusive `xMin`, `xMax`, `yMin`, `yMax`.
 */
export interface Band {
    readonly xMin: number;
    readonly xMax: number;
    readonly yMin: number;
    readonly yMax: number;
}

/**
 * Compute the spawn band for a given player.
 *
 * @param slot        The 1-based dense numeric placement slot (1..4).
 *                    Never a canonical `PlayerId` — terrain is
 *                    identity-agnostic (issue #74, FR-011).
 * @param playerCount Number of players (2, 3, or 4).
 * @param width       Board width.
 * @param height      Board height.
 * @returns The inclusive rectangular band for this player.
 */
export function getPlayerBand(slot: number, playerCount: 2 | 3 | 4, width: number, height: number): Band {
    if (playerCount === MIN_PLAYER_COUNT) {
        // Two horizontal bands.
        const halfH = Math.floor(height / 2);
        if (slot === 1) {
            return { xMin: 0, xMax: width - 1, yMin: 0, yMax: halfH - 1 };
        }
        // slot === 2
        return { xMin: 0, xMax: width - 1, yMin: halfH, yMax: height - 1 };
    }
    if (playerCount === FOUR_PLAYER_COUNT) {
        // Four quadrants.
        const halfW = Math.floor(width / 2);
        const halfH = Math.floor(height / 2);
        switch (slot) {
            case 1:
                return { xMin: 0, xMax: halfW - 1, yMin: 0, yMax: halfH - 1 };
            case MIN_PLAYER_COUNT:
                return { xMin: halfW, xMax: width - 1, yMin: 0, yMax: halfH - 1 };
            case THREE_PLAYER_COUNT:
                return { xMin: 0, xMax: halfW - 1, yMin: halfH, yMax: height - 1 };
            case FOUR_PLAYER_COUNT:
                return { xMin: halfW, xMax: width - 1, yMin: halfH, yMax: height - 1 };
            default:
                // Unreachable (slot is 1..4).
                return { xMin: 0, xMax: width - 1, yMin: 0, yMax: height - 1 };
        }
    }
    // playerCount === 3: three horizontal bands.
    const thirdH = Math.floor(height / THREE_PLAYER_COUNT);
    if (slot === 1) {
        return { xMin: 0, xMax: width - 1, yMin: 0, yMax: thirdH - 1 };
    }
    if (slot === THIRD_PLAYER_ID) {
        return { xMin: 0, xMax: width - 1, yMin: height - thirdH, yMax: height - 1 };
    }
    // slot === 2 (middle band).
    return { xMin: 0, xMax: width - 1, yMin: thirdH, yMax: height - thirdH - 1 };
}
