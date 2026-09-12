/**
 * Seat-label derivation unit tests — feature 010 (T-016, FR-020) +
 * issue #74.
 *
 * Pins the pure mapping of server-keyed participants to presentation
 * rows: identity comes from `session.participants` (keyed by the
 * server-issued `PlayerId`), the seat number is presentation-only, and
 * the render gate reflects known participants (IDs are the fallback
 * label).
 */

import { describe, expect, it } from 'vitest';

import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleSession } from '../../../src/state/types';
import { deriveSeatLabels, hasVisibleLabels } from '../../../src/ui/seat-labels';
import { TEST_PLAYER_1, TEST_PLAYER_2, TEST_PLAYER_3 } from '../../fixtures/player-view';

/** Session factory with overridable fields. */
function sessionOf(overrides: Partial<ConsoleSession>): ConsoleSession {
    return { ...INITIAL_CONSOLE_STATE.session, ...overrides };
}

describe('deriveSeatLabels (FR-020)', () => {
    it('returns an empty array before any participants exist', () => {
        expect(deriveSeatLabels(INITIAL_CONSOLE_STATE.session)).toEqual([]);
    });

    it('maps the local participant and the opponent by server id', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: TEST_PLAYER_1,
                participants: [
                    { id: TEST_PLAYER_1, name: 'Nova', isLocal: true },
                    { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
                ],
            }),
        );
        expect(labels).toEqual([
            { id: TEST_PLAYER_1, seat: 1, name: 'Nova', isLocal: true },
            { id: TEST_PLAYER_2, seat: 2, name: 'Orion', isLocal: false },
        ]);
    });

    it('keeps placement order when the local participant sits second', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: TEST_PLAYER_2,
                participants: [
                    { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
                    { id: TEST_PLAYER_2, name: 'Orion', isLocal: true },
                ],
            }),
        );
        expect(labels).toEqual([
            { id: TEST_PLAYER_1, seat: 1, name: 'Nova', isLocal: false },
            { id: TEST_PLAYER_2, seat: 2, name: 'Orion', isLocal: true },
        ]);
    });

    it('keeps a middle participant for three players', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: TEST_PLAYER_2,
                participants: [
                    { id: TEST_PLAYER_1, name: 'First', isLocal: false },
                    { id: TEST_PLAYER_2, name: 'Mid', isLocal: true },
                    { id: TEST_PLAYER_3, name: 'Third', isLocal: false },
                ],
            }),
        );
        expect(labels).toEqual([
            { id: TEST_PLAYER_1, seat: 1, name: 'First', isLocal: false },
            { id: TEST_PLAYER_2, seat: 2, name: 'Mid', isLocal: true },
            { id: TEST_PLAYER_3, seat: 3, name: 'Third', isLocal: false },
        ]);
    });

    it('maps every participant for a spectator (no local seat)', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: null,
                participants: [
                    { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
                    { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
                ],
            }),
        );
        expect(labels).toEqual([
            { id: TEST_PLAYER_1, seat: 1, name: 'Nova', isLocal: false },
            { id: TEST_PLAYER_2, seat: 2, name: 'Orion', isLocal: false },
        ]);
    });

    it('renders null names (ID fallback at render) while keeping seat numbering', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: TEST_PLAYER_1,
                participants: [
                    { id: TEST_PLAYER_1, name: null, isLocal: true },
                    { id: TEST_PLAYER_2, name: null, isLocal: false },
                ],
            }),
        );
        expect(labels).toEqual([
            { id: TEST_PLAYER_1, seat: 1, name: null, isLocal: true },
            { id: TEST_PLAYER_2, seat: 2, name: null, isLocal: false },
        ]);
        // The canonical ID is always a usable fallback label.
        expect(hasVisibleLabels(labels)).toBe(true);
    });

    it('passes hostile-but-valid handles through verbatim (no sanitization)', () => {
        const labels = deriveSeatLabels(
            sessionOf({
                playerId: TEST_PLAYER_1,
                participants: [
                    { id: TEST_PLAYER_1, name: 'מִיכָאֵל \u202Ereversed', isLocal: true },
                    { id: TEST_PLAYER_2, name: '\u0645\u062D\u0645\u062F', isLocal: false },
                ],
            }),
        );
        expect(labels[0]?.name).toBe('מִיכָאֵל \u202Ereversed');
        expect(labels[1]?.name).toBe('\u0645\u062D\u0645\u062F');
    });
});

describe('hasVisibleLabels', () => {
    it('is false with no participants and true once any participant is known', () => {
        expect(hasVisibleLabels([])).toBe(false);
        expect(hasVisibleLabels([{ id: TEST_PLAYER_1, seat: 1, name: null, isLocal: true }])).toBe(true);
        expect(hasVisibleLabels([{ id: TEST_PLAYER_1, seat: 1, name: 'Nova', isLocal: true }])).toBe(true);
    });
});
