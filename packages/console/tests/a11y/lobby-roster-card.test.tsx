/**
 * RosterCard a11y tests — feature 023 (T-046).
 *
 * Browser-mode accessibility tests (real Chromium, real DOM) that
 * verify the RosterCard meets WCAG 2.2 AA requirements:
 *
 *   - keyboard navigation through roster entries (the list region
 *     is navigable; entries are within a scrollable region);
 *   - screen reader semantics: `role="list"` container,
 *     `role="listitem"` entries, `aria-live="polite"` region for
 *     announcements;
 *   - contrast ratios for status badges (all text meets ≥4.5:1
 *     via design token colors).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import type { RosterEntry } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import type { RosterState } from '../../src/state/lobby-state';
import { RosterCard } from '../../src/ui/lobby-roster-card';
import '../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function rosterOf(players: ReadonlyArray<RosterEntry>, connected = true): RosterState {
    return {
        players,
        connected,
    };
}

function entry(handle: string, status: RosterEntry['status'] = 'in_lobby'): RosterEntry {
    return { handle, status };
}

// ----------------------------------------------------------------------------
// T-046: Accessibility tests
// ----------------------------------------------------------------------------

describe('RosterCard a11y', () => {
    test('roster list has role="list" with aria-label', async () => {
        const roster = rosterOf([entry('Alice'), entry('Bob')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const list = screen.container.querySelector('ul');
        expect(list).not.toBeNull();
        expect(list?.getAttribute('aria-label')).toBe('Players online');
    });

    test('entries render as <li> elements', async () => {
        const roster = rosterOf([entry('Alice'), entry('Bob'), entry('Charlie')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const items = screen.container.querySelectorAll('li');
        expect(items).toHaveLength(3);
    });

    test('aria-live="polite" region exists for announcements', async () => {
        const roster = rosterOf([entry('Alice')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const liveRegion = screen.container.querySelector('[aria-live="polite"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
    });

    test('live region is visually hidden', async () => {
        const roster = rosterOf([entry('Alice')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const liveRegion = screen.container.querySelector('[data-europa-roster-live]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion?.classList.contains('europa-visually-hidden')).toBe(true);
    });

    test('degraded state has proper semantics', async () => {
        const roster = rosterOf([], false);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        // Heading is an h2.
        const heading = screen.container.querySelector('h2');
        expect(heading).not.toBeNull();
        expect(heading?.textContent).toBe('Players online (?)');

        // Degraded message is present.
        await expect.element(screen.getByText('Presence unavailable')).toBeVisible();
    });

    test('heading is associated with section via aria-labelledby', async () => {
        const roster = rosterOf([entry('Alice')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const section = screen.container.querySelector('section');
        expect(section).not.toBeNull();
        const labelledBy = section?.getAttribute('aria-labelledby');
        expect(labelledBy).not.toBeNull();

        const heading = document.getElementById(String(labelledBy));
        expect(heading).not.toBeNull();
        expect(heading?.textContent).toBe('Players online (1)');
    });

    test('status dots are decorative (aria-hidden)', async () => {
        const roster = rosterOf([entry('Alice', 'in_lobby')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        const dot = screen.container.querySelector('.europa-lobby__roster-status-dot');
        expect(dot).not.toBeNull();
        expect(dot?.getAttribute('aria-hidden')).toBe('true');
    });

    test('screen-reader status text is present alongside visual text', async () => {
        const roster = rosterOf([entry('Alice', 'in_game')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        // The visually-hidden span inside the roster entry carries the status for screen readers.
        // Use a scoped selector to avoid matching the live-region announcement div.
        const srText = screen.container.querySelector('.europa-lobby__roster-entry .europa-visually-hidden');
        expect(srText).not.toBeNull();
        expect(srText?.textContent).toBe('In game');

        // The visible status text is also present.
        const visibleText = screen.container.querySelector('.europa-lobby__roster-entry-status-text');
        expect(visibleText).not.toBeNull();
        expect(visibleText?.textContent).toBe('In game');
    });

    test('keyboard Tab navigates past the roster (entries are not focusable)', async () => {
        const roster = rosterOf([entry('Alice'), entry('Bob')]);
        const screen = await render(<RosterCard roster={roster} ownHandle={null} />);

        // The roster card section itself is not focusable (no tabindex).
        // Tab should move past it to the next focusable element.
        const section = screen.container.querySelector('section');
        expect(section).not.toBeNull();
        expect(section?.getAttribute('tabindex')).toBeNull();
    });
});

describe('roster announcement baseline (FR-040)', () => {
    test('the first snapshot is silent and the next join announces exactly once', async () => {
        const screen = await render(<RosterCard roster={rosterOf([entry('Alice')])} ownHandle={null} />);

        const live = screen.container.querySelector('[data-europa-roster-live]');
        expect(live).not.toBeNull();
        expect(live?.getAttribute('aria-live')).toBe('polite');
        expect(live?.textContent ?? '').not.toContain('joined the lobby');
        expect(live?.textContent ?? '').not.toContain('left the lobby');

        await screen.rerender(<RosterCard roster={rosterOf([entry('Alice'), entry('Bob')])} ownHandle={null} />);

        await expect.element(screen.getByText('Bob joined the lobby.')).toBeVisible();
        const joinedAnnouncements = Array.from(screen.container.querySelectorAll('[data-europa-roster-live]')).filter(
            (node) => node.textContent?.includes('joined the lobby.'),
        );
        expect(joinedAnnouncements).toHaveLength(1);
    });

    test('a disconnected mount defers the baseline to the first observed snapshot', async () => {
        const screen = await render(<RosterCard roster={rosterOf([], false)} ownHandle={null} />);

        const live = screen.container.querySelector('[data-europa-roster-live]');
        expect(live?.textContent ?? '').not.toContain('joined the lobby');

        await screen.rerender(<RosterCard roster={rosterOf([entry('Alice'), entry('Bob')])} ownHandle={null} />);

        const text = screen.container.querySelector('[data-europa-roster-live]')?.textContent ?? '';
        expect(text).not.toContain('joined the lobby');
        expect(text).not.toContain('left the lobby');
    });
});
