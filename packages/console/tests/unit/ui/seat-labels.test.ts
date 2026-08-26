/**
 * Seat-label derivation unit tests — feature 010 (T-016, FR-020).
 *
 * Pins the pure reconstruction of per-seat labels from the console
 * session: own-seat mapping, opponent queue ordering, spectator
 * all-seats mapping, unknown-name placeholders, and the render gate.
 */

import { describe, expect, it } from 'vitest';

import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleSession } from '../../../src/state/types';
import { deriveSeatLabels, hasVisibleLabels } from '../../../src/ui/seat-labels';

/** Session factory with overridable fields. */
function sessionOf(overrides: Partial<ConsoleSession>): ConsoleSession {
    return { ...INITIAL_CONSOLE_STATE.session, ...overrides };
}

describe('deriveSeatLabels (FR-020)', () => {
    it('returns an empty array before any naming data exists', () => {
        expect(deriveSeatLabels(INITIAL_CONSOLE_STATE.session)).toEqual([]);
    });

    it('maps seat 1 to the local player and seat 2 to the opponent for playerId 1', () => {
        const labels = deriveSeatLabels(sessionOf({ playerId: 1, displayName: 'Nova', opponents: ['Orion'] }));
        expect(labels).toEqual([
            { seat: 1, name: 'Nova', isLocal: true },
            { seat: 2, name: 'Orion', isLocal: false },
        ]);
    });

    it('keeps server seat order when the local player sits at seat 2', () => {
        const labels = deriveSeatLabels(sessionOf({ playerId: 2, displayName: 'Orion', opponents: ['Nova'] }));
        expect(labels).toEqual([
            { seat: 1, name: 'Nova', isLocal: false },
            { seat: 2, name: 'Orion', isLocal: true },
        ]);
    });

    it('reconstructs a middle seat correctly for three players', () => {
        const labels = deriveSeatLabels(
            sessionOf({ playerId: 2, displayName: 'Mid', opponents: ['First', 'Third'] }),
        );
        expect(labels).toEqual([
            { seat: 1, name: 'First', isLocal: false },
            { seat: 2, name: 'Mid', isLocal: true },
            { seat: 3, name: 'Third', isLocal: false },
        ]);
    });

    it('maps every seat from opponents for a spectator (no local seat)', () => {
        const labels = deriveSeatLabels(sessionOf({ playerId: null, displayName: '', opponents: ['Nova', 'Orion'] }));
        expect(labels).toEqual([
            { seat: 1, name: 'Nova', isLocal: false },
            { seat: 2, name: 'Orion', isLocal: false },
        ]);
    });

    it('renders null placeholders for empty names while keeping seat numbering', () => {
        const labels = deriveSeatLabels(sessionOf({ playerId: 1, displayName: '', opponents: [''] }));
        expect(labels).toEqual([
            { seat: 1, name: null, isLocal: true },
            { seat: 2, name: null, isLocal: false },
        ]);
        expect(hasVisibleLabels(labels)).toBe(false);
    });

    it('passes hostile-but-valid handles through verbatim (no sanitization)', () => {
        const labels = deriveSeatLabels(
            sessionOf({ playerId: 1, displayName: 'מִיכָאֵל \u202Ereversed', opponents: ['\u0645\u062D\u0645\u062F'] }),
        );
        expect(labels[0]?.name).toBe('מִיכָאֵל \u202Ereversed');
        expect(labels[1]?.name).toBe('\u0645\u062D\u0645\u062F');
    });
});

describe('hasVisibleLabels', () => {
    it('is false with no seats and true once any name exists', () => {
        expect(hasVisibleLabels([])).toBe(false);
        expect(hasVisibleLabels([{ seat: 1, name: null, isLocal: true }])).toBe(false);
        expect(hasVisibleLabels([{ seat: 1, name: 'Nova', isLocal: true }])).toBe(true);
    });
});
