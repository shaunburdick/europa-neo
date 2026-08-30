/**
 * Unit tests — waiting-overlay headline resolution (feature 012 FR-005).
 *
 * Proves the precedence rule behind {@link resolveWaitingMessage}:
 *   1. an explicit `message` prop wins;
 *   2. `seatsFilled` + `capacity` derive the N-aware copy via
 *      `formatWaitingMessage`;
 *   3. legacy callers that pass neither fall back to the original
 *      single-opponent string.
 *
 * The component's DOM/announcer behavior is covered by the browser-mode
 * component + a11y suites (which exercise the legacy fallback path through
 * the real App); this node suite locks the pure resolution contract.
 */

import { describe, expect, test } from 'vitest';

import { resolveWaitingMessage, WAITING_FOR_OPPONENT_MESSAGE } from '../../../src/ui/waiting-overlay';

describe('resolveWaitingMessage (waiting-overlay headline precedence)', () => {
    test('explicit message prop wins over seat counts', () => {
        expect(resolveWaitingMessage({ message: 'Custom copy', seatsFilled: 1, capacity: 3 })).toBe('Custom copy');
    });

    test('seatsFilled + capacity derive the N-aware copy (singular)', () => {
        expect(resolveWaitingMessage({ seatsFilled: 2, capacity: 3 })).toBe('Waiting for 1 more player… (2/3)');
    });

    test('seatsFilled + capacity derive the N-aware copy (plural)', () => {
        expect(resolveWaitingMessage({ seatsFilled: 1, capacity: 4 })).toBe('Waiting for 3 more players… (1/4)');
    });

    test('legacy caller (no message, no seats) falls back to the single-opponent string', () => {
        expect(resolveWaitingMessage({})).toBe(WAITING_FOR_OPPONENT_MESSAGE);
    });

    test('only seatsFilled supplied (no capacity) falls back to legacy string', () => {
        expect(resolveWaitingMessage({ seatsFilled: 1 })).toBe(WAITING_FOR_OPPONENT_MESSAGE);
    });

    test('only capacity supplied (no seatsFilled) falls back to legacy string', () => {
        expect(resolveWaitingMessage({ capacity: 4 })).toBe(WAITING_FOR_OPPONENT_MESSAGE);
    });
});
