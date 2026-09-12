/**
 * Participant strip component SMOKE tests — feature 010 (T-016).
 *
 * Render-level verification of the HUD strip only (comprehensive
 * component/a11y coverage is T-018's contract). Pins:
 *
 *   - nothing renders before naming data exists;
 *   - per-seat labels with `<bdi>` isolation on every server name;
 *   - the local seat's "(you)" marker and distinct accessible labels;
 *   - handles are preferred labels and unknown names use a neutral
 *     fallback rather than exposing transport credentials.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleSession } from '../../../src/state/types';
import { ParticipantStrip } from '../../../src/ui/participants';
import '../../../src/styles/index.css';
import { TEST_PLAYER_1, TEST_PLAYER_2 } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
});

/** Session factory with overridable fields. */
function sessionOf(overrides: Partial<ConsoleSession>): ConsoleSession {
    return { ...INITIAL_CONSOLE_STATE.session, ...overrides };
}

describe('ParticipantStrip (smoke)', () => {
    test('renders nothing while no names are known', async () => {
        const screen = await render(<ParticipantStrip session={INITIAL_CONSOLE_STATE.session} />);
        expect(screen.container.querySelector('[data-europa-participants]')).toBeNull();
    });

    test('labels each seat with its server handle and marks the local seat', async () => {
        const session = sessionOf({
            playerId: TEST_PLAYER_2,
            participants: [
                { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
                { id: TEST_PLAYER_2, name: 'Orion', isLocal: true },
            ],
        });
        const screen = await render(<ParticipantStrip session={session} />);
        const region = screen.container.querySelector('[data-europa-participants]');
        expect(region).not.toBeNull();
        expect(region?.getAttribute('aria-label')).toBe('Match participants');
        const seats = screen.container.querySelectorAll('[data-europa-seat]');
        expect(seats).toHaveLength(2);
        expect(seats[0]?.textContent).toContain('Seat 1:');
        expect(seats[0]?.textContent).toContain('Nova');
        expect(seats[1]?.textContent).toContain('Seat 2:');
        expect(seats[1]?.textContent).toContain('Orion');
        expect(seats[1]?.textContent).toContain('(you)');
        expect(seats[0]?.textContent).not.toContain('(you)');
    });

    test('every server-provided name is bidi-isolated inside <bdi>', async () => {
        const session = sessionOf({
            playerId: null,
            participants: [
                { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
                { id: TEST_PLAYER_2, name: 'מִיכָאֵל', isLocal: false },
            ],
        });
        const screen = await render(<ParticipantStrip session={session} />);
        const isolated = screen.container.querySelectorAll('bdi');
        expect(isolated).toHaveLength(2);
        expect(isolated[0]?.textContent).toBe('Nova');
        expect(isolated[1]?.textContent).toBe('מִיכָאֵל');
    });

    test('uses the authoritative identity for seat placement and an ID fallback when unnamed', async () => {
        const session = sessionOf({
            playerId: TEST_PLAYER_2,
            participants: [
                { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
                { id: TEST_PLAYER_2, name: null, isLocal: true },
            ],
        });
        const screen = await render(<ParticipantStrip session={session} />);
        const seats = screen.container.querySelectorAll('[data-europa-seat]');
        expect(seats[0]?.textContent).toContain('Nova');
        expect(seats[0]?.textContent).not.toContain('(you)');
        // The unnamed local participant falls back to the canonical ID.
        expect(seats[1]?.textContent).toContain(TEST_PLAYER_2);
        expect(seats[1]?.textContent).toContain('(you)');
        // Identity is exposed as a data attribute, keyed by ID not seat.
        expect(seats[1]?.getAttribute('data-europa-player-id')).toBe(TEST_PLAYER_2);
    });
});
