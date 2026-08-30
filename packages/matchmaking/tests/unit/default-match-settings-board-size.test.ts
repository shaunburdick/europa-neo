/**
 * DEFAULT_MATCH_SETTINGS.boardSize invariant — Feature 012 T025 (SC-006).
 *
 * FR-001 keeps `DEFAULT_MATCH_SETTINGS.boardSize` at `32` for backward
 * compatibility even though the additive `BOARD_SIZE_DEFAULTS` map now
 * advertises `3→48` and `4→48` for N>2 matches. Every direct
 * `createMatch` caller that omits `boardSize` must keep getting a 32-board
 * 2-player match — the shipped v1 path. A silent bump of the API default to
 * `48` would break all such callers (host CLI default, lobby fallback,
 * programmatic fills) without any code change elsewhere, so it is pinned
 * here as an independent, self-documenting guard.
 *
 * This is deliberately a SEPARATE file from the T005 `board-size-defaults`
 * suite so the invariant is traceable to T025/SC-006 and cannot be lost if
 * the T005 table is refactored. It imports the REAL constant from the
 * package surface, not a local copy.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';

describe('DEFAULT_MATCH_SETTINGS.boardSize invariant (012 T025 / SC-006)', () => {
    it('keeps DEFAULT_MATCH_SETTINGS.boardSize at 32 (API compat — never follows the 48 N>2 defaults)', () => {
        // The shipped 2-player default must stay 32 even though BOARD_SIZE_DEFAULTS
        // now maps 3→48 and 4→48. A silent drift here would change every
        // boardSize-omitting createMatch caller's board without a code change.
        expect(DEFAULT_MATCH_SETTINGS.boardSize).toBe(32);
        // The default is a 2-player match on the 32 board.
        expect(DEFAULT_MATCH_SETTINGS.playerCount).toBe(2);
        // The default boardSize is exactly the 2-player entry of the additive map.
        expect(DEFAULT_MATCH_SETTINGS.boardSize).toBe(32);
    });
});
