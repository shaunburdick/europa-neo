/**
 * Participant presentation-order unit tests — issue #74.
 *
 * The console keys participants by canonical `PlayerId` but presents them
 * in the match's terrain placement-slot (seat) order — the order
 * `MatchConfig.playerIds` carries. The engine roster (`players`) arrives in
 * canonical UTF-16 registry order, which is unrelated to seat order. These
 * fixtures deliberately make the two disagree, so a naive
 * `players.map(...)` implementation cannot pass.
 */

import { describe, expect, it } from 'vitest';

import { humanHandleOf, orderParticipants } from '../../../src/state/participant-order';
import type { Player, PlayerId } from '../../../src/state/types';
import { TEST_PLAYER_1, TEST_PLAYER_2, TEST_PLAYER_3 } from '../../fixtures/player-view';

/**
 * Build a full engine-shaped roster entry.
 *
 * @param id Canonical identity.
 * @param displayName Server display name (equal to the raw ID = placeholder).
 * @returns A `Player` roster entry.
 */
function player(id: PlayerId, displayName: string): Player {
    return { id, displayName, status: 'alive', citiesOwned: 0, troopsHeld: 0 };
}

describe('orderParticipants', () => {
    it('orders by placement slot, not by roster array position', () => {
        // Placement slots deliberately reverse the roster's UTF-16 order:
        // seat 0 = TEST_PLAYER_2, seat 1 = TEST_PLAYER_1, while the engine
        // roster is [TEST_PLAYER_1, TEST_PLAYER_2]. A naive players.map(...)
        // returns [P1, P2] and fails this assertion.
        const slots: readonly PlayerId[] = [TEST_PLAYER_2, TEST_PLAYER_1];
        const roster = [player(TEST_PLAYER_1, 'Nova'), player(TEST_PLAYER_2, 'Orion')];

        expect(orderParticipants(slots, roster, null)).toEqual([
            { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
            { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
        ]);
    });

    it('marks the local viewer by canonical identity', () => {
        const slots: readonly PlayerId[] = [TEST_PLAYER_2, TEST_PLAYER_1];
        const roster = [player(TEST_PLAYER_1, 'Nova'), player(TEST_PLAYER_2, 'Orion')];

        const participants = orderParticipants(slots, roster, TEST_PLAYER_1);
        expect(participants.find((entry) => entry.isLocal)?.id).toBe(TEST_PLAYER_1);
        expect(participants.filter((entry) => entry.isLocal)).toHaveLength(1);
    });

    it('falls back to the canonical id (never a raw placeholder) for the label', () => {
        const roster = [player(TEST_PLAYER_1, TEST_PLAYER_1), player(TEST_PLAYER_2, '')];

        expect(orderParticipants([TEST_PLAYER_1, TEST_PLAYER_2], roster, null)).toEqual([
            { id: TEST_PLAYER_1, name: null, isLocal: false },
            { id: TEST_PLAYER_2, name: null, isLocal: false },
        ]);
    });

    it('appends roster players absent from the placement slots (defensive)', () => {
        const roster = [player(TEST_PLAYER_1, 'Nova'), player(TEST_PLAYER_3, 'Vega')];

        expect(orderParticipants([TEST_PLAYER_1], roster, null).map((entry) => entry.id)).toEqual([
            TEST_PLAYER_1,
            TEST_PLAYER_3,
        ]);
    });

    it('ignores placement slots with no matching roster entry', () => {
        const roster = [player(TEST_PLAYER_1, 'Nova')];

        expect(orderParticipants([TEST_PLAYER_2, TEST_PLAYER_1], roster, null).map((entry) => entry.id)).toEqual([
            TEST_PLAYER_1,
        ]);
    });
});

describe('humanHandleOf', () => {
    it('rejects the empty string and the raw-ID placeholder', () => {
        expect(humanHandleOf(player(TEST_PLAYER_1, ''))).toBeNull();
        expect(humanHandleOf(player(TEST_PLAYER_1, TEST_PLAYER_1))).toBeNull();
    });

    it('returns a real server handle', () => {
        expect(humanHandleOf(player(TEST_PLAYER_1, 'Nova'))).toBe('Nova');
    });
});
