/**
 * RosterCard component tests — feature 023 (T-045 + T-048).
 *
 * Browser-mode component tests (real Chromium, real DOM) that verify
 * the RosterCard renders correctly in all key states:
 *
 *   - entries with correct handles and status text;
 *   - "(you)" indicator for the local player's own entry;
 *   - "Players online (N)" heading with the correct count;
 *   - "Players online (?)" heading when not connected;
 *   - "Presence unavailable" degraded state;
 *   - empty roster ("No players online.");
 *   - heading text derivation (T-048);
 *   - own-entry detection (T-048);
 *   - status display text derivation (T-048).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import type { RosterEntry } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import type { RosterState } from '../../../src/state/lobby-state';
import { RosterCard, rosterHeadingText, rosterStatusLabel } from '../../../src/ui/lobby-roster-card';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function rosterOf(players: ReadonlyArray<RosterEntry>, connected = true): RosterState {
    return {
        players,
        revision: connected ? 1 : null,
        connected,
    };
}

function entry(handle: string, status: RosterEntry['status'] = 'in_lobby'): RosterEntry {
    return { handle, status };
}

// ----------------------------------------------------------------------------
// T-048: Pure derivation tests (node-safe, no DOM)
// ----------------------------------------------------------------------------

describe('rosterStatusLabel (T-048)', () => {
    test('in_lobby maps to "In lobby"', () => {
        expect(rosterStatusLabel('in_lobby')).toBe('In lobby');
    });

    test('in_game maps to "In game"', () => {
        expect(rosterStatusLabel('in_game')).toBe('In game');
    });

    test('spectating maps to "Spectating"', () => {
        expect(rosterStatusLabel('spectating')).toBe('Spectating');
    });
});

describe('rosterHeadingText (T-048)', () => {
    test('connected with 3 players shows "Players online (3)"', () => {
        expect(
            rosterHeadingText({
                players: [entry('A'), entry('B'), entry('C')],
                revision: 1,
                connected: true,
            }),
        ).toBe('Players online (3)');
    });

    test('connected with 0 players shows "Players online (0)"', () => {
        expect(
            rosterHeadingText({
                players: [],
                revision: 1,
                connected: true,
            }),
        ).toBe('Players online (0)');
    });

    test('not connected shows "Players online (?)"', () => {
        expect(
            rosterHeadingText({
                players: [],
                revision: null,
                connected: false,
            }),
        ).toBe('Players online (?)');
    });
});

// ----------------------------------------------------------------------------
// T-045: Component render tests (browser DOM)
// ----------------------------------------------------------------------------

describe('RosterCard (component)', () => {
    test('renders entries with correct handles and status text', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby'), entry('Bob', 'in_game'), entry('Charlie', 'spectating')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        // All three handles visible.
        await expect.element(screen.getByText('Alice')).toBeVisible();
        await expect.element(screen.getByText('Bob')).toBeVisible();
        await expect.element(screen.getByText('Charlie')).toBeVisible();

        // Status labels visible (use .first() because each status text
        // appears twice: once in a visually-hidden span for screen readers
        // and once in a visible span for sighted users — a11y by design).
        await expect.element(screen.getByText('In lobby').first()).toBeVisible();
        await expect.element(screen.getByText('In game').first()).toBeVisible();
        await expect.element(screen.getByText('Spectating').first()).toBeVisible();
    });

    test('shows "(you)" for own entry', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby'), entry('Bob', 'in_game')]);
        const screen = await render(<RosterCard roster={roster} ownHandle="Alice" />);

        // "(you)" next to Alice.
        await expect.element(screen.getByText('(you)')).toBeVisible();
        // Bob's row has no "(you)".
        const youIndicators = screen.container.querySelectorAll('.europa-lobby__roster-you');
        expect(youIndicators).toHaveLength(1);
    });

    test('shows "Players online (N)" heading', async () => {
        const roster = rosterOf([entry('A'), entry('B'), entry('C')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        await expect.element(screen.getByText('Players online (3)')).toBeVisible();
    });

    test('shows "Players online (0)" for empty roster', async () => {
        const roster = rosterOf([]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        await expect.element(screen.getByText('Players online (0)')).toBeVisible();
        await expect.element(screen.getByText('No players online.')).toBeVisible();
    });

    test('shows "Presence unavailable" when not connected', async () => {
        const roster = rosterOf([], false);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        await expect.element(screen.getByText('Players online (?)')).toBeVisible();
        await expect.element(screen.getByText('Presence unavailable')).toBeVisible();
        await expect.element(screen.getByText('Presence data is not connected.')).toBeVisible();
    });

    test('handles empty roster gracefully', async () => {
        const roster = rosterOf([]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        await expect.element(screen.getByText('Players online (0)')).toBeVisible();
        await expect.element(screen.getByText('No players online.')).toBeVisible();
        // No list rendered.
        expect(screen.container.querySelector('[data-europa-roster-list]')).toBeNull();
    });

    test('ownHandle null shows no "(you)" indicator', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const youIndicators = screen.container.querySelectorAll('.europa-lobby__roster-you');
        expect(youIndicators).toHaveLength(0);
    });

    test('status dots have correct CSS classes', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby'), entry('Bob', 'in_game'), entry('Charlie', 'spectating')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const greenDot = screen.container.querySelector('.europa-lobby__roster-status-dot--in_lobby');
        expect(greenDot).not.toBeNull();

        const amberDot = screen.container.querySelector('.europa-lobby__roster-status-dot--in_game');
        expect(amberDot).not.toBeNull();

        const blueDot = screen.container.querySelector('.europa-lobby__roster-status-dot--spectating');
        expect(blueDot).not.toBeNull();
    });

    test('roster list has aria-label', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const list = screen.container.querySelector('ul');
        expect(list).not.toBeNull();
        expect(list?.getAttribute('aria-label')).toBe('Players online');
    });

    test('entries render as <li> elements', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby'), entry('Bob', 'in_game')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const items = screen.container.querySelectorAll('li');
        expect(items).toHaveLength(2);
    });
});
